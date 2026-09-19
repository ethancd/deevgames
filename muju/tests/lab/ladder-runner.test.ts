// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  DEFAULT_OVERRUN_TOLERANCE_SPEC,
  OVERRUN_RATE_VOID_THRESHOLD,
  assertNoDuplicateGames,
  awaitShardsSettled,
  buildManifest,
  buildSchedule,
  canonicalGameDigest,
  computeDistinctGames,
  computeMetrics,
  describeSettle,
  failuresForManifest,
  independenceWarning,
  openingCapacity,
  openingCapacityRefusal,
  openingsIndependent,
  openingsUsed,
  overrunRateVoidReasons,
  pairIndependenceRefusal,
  parseArgs,
  selectOpenings,
  parseOverrunTolerance,
  planResume,
  resumeIdentityMismatches,
  runLadder,
  summaryMarkdown,
  toleranceMsFor,
  type CliArgs,
  type RunMetrics,
} from '../../lab/hard-ai/ladder/run';
import { DEFAULT_MIN_PAIRS } from '../../lab/hard-ai/ladder/sprt';
import { resolveEngine } from '../../lab/hard-ai/ladder/engines';
import { playGame } from '../../lab/harness/runner';
import { buildPairs, pairIdFor, expandPair } from '../../lab/hard-ai/ladder/pairing';
import {
  INITIAL_OPENING,
  applyOpening,
  loadOpenings,
  parseOpenings,
  validateOpenings,
  initialStateFor,
  withOpeningRules,
  type OpeningAction,
  type OpeningSpec,
} from '../../lab/hard-ai/ladder/openings';
import {
  LADDER_RULES_VERSION,
  P1_OPENING_ID_RE,
  applyLadderOpening,
  assertOpeningsRuleset,
  initialStateForRules,
  openingRuleset,
  rulesetForRevision,
  validateLadderOpenings,
} from '../../lab/hard-ai/ladder/ruleset';
import {
  FALLBACK_KINDS,
  describeFallbacks,
  emptyFallbackCounts,
  fallbackCountsDelta,
  fallbackTotal,
  ladderFallbackCounts,
  noteLadderFallback,
  resetLadderFallbackCounts,
  type FallbackCounts,
} from '../../lab/hard-ai/ladder/fallbacks';
import { gate0VoidReasons } from '../../lab/hard-ai/ladder/run';
import { getElementGraph, setElementGraph } from '../../src/game/elements';
import { legalActions } from '../../lab/harness/legal';
import { replayFileName, writeShardStatus, type FailureRow, type GameRow, type PairRow, type ShardStatus } from '../../lab/hard-ai/ladder/worker';
import type { GameRecord, MatchOptions, PlayerGameStats } from '../../lab/harness/types';
import { DEFAULT_MATCH_OPTIONS } from '../../lab/harness/types';
import type { GameState, PlayerId } from '../../src/game/types';
import { applyAction } from '../../src/ai/simulate';

// ---------------------------------------------------------------- fixtures

function stats(
  bot: string,
  decisionMs: number,
  turnMs?: number[],
  hardTiming?: PlayerGameStats['hardTiming'],
): PlayerGameStats {
  return {
    bot,
    finalResources: 0, resourcesGained: 0, resourcesSpent: 0, finalMaterial: 0,
    unitsPlaced: 0, promotions: 0, tierUsage: { 1: 0, 2: 0, 3: 0, 4: 0 },
    elementPurchased: {}, unitsLost: 0, unitsKilled: 0, illegalActions: 0,
    plies: 1, decisionMs, turnsTaken: turnMs ? turnMs.length : 1,
    ...(turnMs ? { turnMs } : {}),
    ...(hardTiming ? { hardTiming } : {}),
  };
}

function gameRow(o: {
  pairId: string;
  orientation: 'A-white' | 'B-white';
  handicap: number;
  winner: PlayerId | null;
  whiteMs: number;
  blackMs: number;
  anomalies?: string[];
  whiteTurnMs?: number[];
  blackTurnMs?: number[];
  hardTiming?: GameRecord['hardTiming'];
  /** E1.5: per-SEAT adapter counters, as `lab/harness/runner.ts` records them. */
  whiteSeatTiming?: PlayerGameStats['hardTiming'];
  blackSeatTiming?: PlayerGameStats['hardTiming'];
  /** Per-seat illegal-action counts (Gate 0 item 6 vetoes any). */
  whiteIllegalActions?: number;
  /** Gate 0 item 6's six fallback counts. Omitted = a CLEAN row, which is what
   * `worker.ts` writes for a run with no fallback; pass `null` for a row
   * recorded before the field existed. */
  fallbacks?: FallbackCounts | null;
}): GameRow {
  const options: MatchOptions = { ...DEFAULT_MATCH_OPTIONS, blackCrystalHandicap: o.handicap };
  const record: GameRecord = {
    schema: 'muju-lab-game-v3',
    engineHash: 'x', runId: 'r', experiment: null, seed: 1,
    startedAt: '1970-01-01T00:00:00.000Z', durationMs: 10, options,
    winner: o.winner, winType: o.winner === null ? 'draw' : 'elimination',
    turns: 1, plies: 2, firstBlood: null,
    rulesVersion: LADDER_RULES_VERSION,
    players: {
      white: { ...stats('w', o.whiteMs, o.whiteTurnMs, o.whiteSeatTiming), illegalActions: o.whiteIllegalActions ?? 0 },
      black: stats('b', o.blackMs, o.blackTurnMs, o.blackSeatTiming),
    },
    incomeCurve: [], round90Exhaustion: null, purchases: [], promotionEvents: [],
    placedAndAttackedKills: 0, materialCurve: [], invariantViolation: null,
    anomalies: o.anomalies ?? [], handicap: o.handicap,
    ...(o.hardTiming ? { hardTiming: o.hardTiming } : {}),
  };
  return {
    ...record,
    pairId: o.pairId,
    orientation: o.orientation,
    opening: 'initial',
    ...(o.fallbacks === null ? {} : { fallbacks: o.fallbacks ?? emptyFallbackCounts() }),
  };
}

function pairRow(pairId: string, pairIndex: number, handicap: number, scoreA: number): PairRow {
  return { pairIndex, pairId, opening: 'initial', seed: 1, handicap, scoreA, aWhiteWinType: 'elimination', bWhiteWinType: 'elimination' };
}

function baseArgs(over: Partial<CliArgs> = {}): CliArgs {
  return {
    a: 'A', b: 'B',
    work: { mode: 'fixed', units: 1 },
    handicaps: [0, 3], pairs: 2, seed: 7, shards: 1,
    sprt: null, legality: 'as-shipped', out: path.join(os.tmpdir(), 'muju-ladder-unused'),
    openingsPath: null, openingsSha256: null, openings: [INITIAL_OPENING],
    openingsSkip: null, openingsSelectedIds: null,
    replays: true, resume: false, argv: [],
    allowInitialOnly: false, allowOpeningReuse: false,
    overrunTolerance: parseOverrunTolerance(DEFAULT_OVERRUN_TOLERANCE_SPEC),
    ...over,
  };
}

function tmpDir(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `muju-ladder-${tag}-`));
}

/**
 * Derives `n` genuinely legal opening actions by walking the real legal sets
 * from the canonical initial position, converting each to the file-portable
 * square-referencing form.
 */
function legalOpeningActions(n: number, handicap = 0): OpeningAction[] {
  return legalActionsFrom(initialStateFor({ blackCrystalHandicap: handicap }), n);
}

/**
 * The same, from the canonical PHASING initial state — what a current ladder
 * run's openings have to be, because `lab/harness/runner.ts` refuses a
 * non-Phasing `initialState` and `ladder/ruleset.ts` refuses a non-P1 id. The
 * Standard version above stays, because the historical books it describes are
 * still replayed by `ladder/openings.ts`.
 */
function legalPhasingOpeningActions(n: number, handicap = 0): OpeningAction[] {
  return legalActionsFrom(initialStateForRules('phasing', { blackCrystalHandicap: handicap }), n);
}

function legalActionsFrom(start: GameState, n: number): OpeningAction[] {
  let state = start;
  const out: OpeningAction[] = [];
  for (let i = 0; i < n; i++) {
    const legal = legalActions(state, state.turn.currentPlayer);
    expect(legal.length).toBeGreaterThan(0);
    const pick = legal.find(a => a.type === 'MOVE') ?? legal.find(a => a.type === 'BUY_UNIT') ?? legal[0];
    if (pick.type === 'MOVE') {
      const unit = state.board.units.find(u => u.id === pick.unitId)!;
      out.push({ type: 'MOVE', from: { ...unit.position }, to: pick.to });
    } else if (pick.type === 'BUY_UNIT') {
      out.push({ type: 'BUY_UNIT', definitionId: pick.definitionId, position: pick.position });
    } else if (pick.type === 'END_PLACE_PHASE' || pick.type === 'END_ACTION_PHASE') {
      out.push({ type: pick.type });
    } else {
      throw new Error(`test fixture: unexpected legal action ${pick.type}`);
    }
    state = applyAction(state, pick);
  }
  return out;
}

/**
 * A 16-row P1 (PHASING) book on disk, taken from the frozen `p1-dev.jsonl`.
 *
 * These tests used `openings/e0-openings.jsonl` as their stand-in for "a book",
 * and a Phasing run refuses it: an E0 Standard id may never be relabelled as
 * Phasing (`ladder/ruleset.ts#assertOpeningsRuleset`). Every count the
 * expectations are written around — 16 openings, capacity 32 at two handicaps,
 * 14 after `--openings-skip 2` — is the E0 book's SIZE, not anything about its
 * contents, so a 16-row subset of the P1 dev book keeps them all and changes
 * only the ids.
 */
function writeP1Book(dir: string, rows = 16): { path: string; ids: string[] } {
  const source = fs.readFileSync('lab/hard-ai/ladder/openings/p1-dev.jsonl', 'utf8').trim().split('\n').slice(0, rows);
  const file = path.join(dir, 'p1-book.jsonl');
  fs.writeFileSync(file, source.join('\n') + '\n');
  return { path: file, ids: source.map(l => (JSON.parse(l) as OpeningSpec).id) };
}

// ---------------------------------------------------------------- pairId

describe('lab/hard-ai/ladder/pairing pairId', () => {
  it('spells pairId as "<openingId>:<handicap>:<pairIndex>" and keeps it identical across both orientations of a pair', () => {
    const pairs = buildPairs(4, 11, [0, 3], ['initial']);
    expect(pairs.map(p => p.pairId)).toEqual(['initial:0:0', 'initial:3:1', 'initial:0:2', 'initial:3:3']);
    for (const p of pairs) {
      expect(p.pairId).toBe(pairIdFor(p.openingId, p.handicap, p.pairIndex));
      const [gA, gB] = expandPair(p);
      expect(gA.pairId).toBe(p.pairId);
      expect(gB.pairId).toBe(p.pairId);
      expect(gA.orientation).toBe('A-white');
      expect(gB.orientation).toBe('B-white');
      // Same opening and same seed on both sides; only the seats change.
      expect(gA.openingId).toBe(gB.openingId);
      expect(gA.seed).toBe(gB.seed);
      expect(gA.white).toBe(gB.black);
    }
  });

  it('cycles handicaps fastest and openings once per handicap sweep, so every (opening, handicap) cell is scheduled', () => {
    const pairs = buildPairs(8, 3, [0, 3], ['o1', 'o2']);
    expect(pairs.map(p => p.pairId)).toEqual([
      'o1:0:0', 'o1:3:1', 'o2:0:2', 'o2:3:3', 'o1:0:4', 'o1:3:5', 'o2:0:6', 'o2:3:7',
    ]);
    const cells = new Set(pairs.map(p => `${p.openingId}/${p.handicap}`));
    expect(cells.size).toBe(4);
    expect(new Set(pairs.map(p => p.pairId)).size).toBe(8); // pair ids are unique
  });
});

// ---------------------------------------------------------------- openings

describe('lab/hard-ai/ladder/openings', () => {
  it('REJECTS an opening id outside /^[A-Za-z0-9_-]{1,64}$/, so an id can never steer a replay path', () => {
    // The E0 verifier ran a file with this id and the run wrote its replay
    // files two directories ABOVE `--out`: `replayFileName` only rewrites ":",
    // and `path.join(replaysDir, "../../escaped-A-white.json")` escapes.
    expect(() => parseOpenings('{"id":"../../escaped","actions":[]}\n', 'f.jsonl')).toThrow(
      /opening id "\.\.\/\.\.\/escaped" must match \/\^\[A-Za-z0-9_-\]\{1,64\}\$\//,
    );
    expect(() => parseOpenings('{"id":"a/b","actions":[]}\n', 'f.jsonl')).toThrow(/must match/);
    expect(() => parseOpenings('{"id":"..","actions":[]}\n', 'f.jsonl')).toThrow(/must match/);
    expect(() => parseOpenings('{"id":"a b","actions":[]}\n', 'f.jsonl')).toThrow(/must match/);
    expect(() => parseOpenings(`{"id":"${'x'.repeat(65)}","actions":[]}\n`, 'f.jsonl')).toThrow(/must match/);
    // The forms the ladder actually uses stay legal.
    expect(parseOpenings(`{"id":"initial","actions":[]}\n{"id":"open-12_B","actions":[]}\n{"id":"${'x'.repeat(64)}","actions":[]}\n`, 'f.jsonl').map(o => o.id))
      .toEqual(['initial', 'open-12_B', 'x'.repeat(64)]);
  });

  it('parses {id, actions} rows and rejects the {id, state} form, duplicate ids and ids containing ":"', () => {
    const parsed = parseOpenings('{"id":"a","actions":[]}\n\n{"id":"b","actions":[{"type":"END_PLACE_PHASE"}]}\n', 'f.jsonl');
    expect(parsed.map(o => o.id)).toEqual(['a', 'b']);
    expect(parsed[1].actions).toHaveLength(1);

    expect(() => parseOpenings('{"id":"a","state":{}}\n', 'f.jsonl')).toThrow(/\{id, state\} form is not supported/);
    expect(() => parseOpenings('{"id":"a","actions":[]}\n{"id":"a","actions":[]}\n', 'f.jsonl')).toThrow(/duplicate opening id/);
    expect(() => parseOpenings('{"id":"a:b","actions":[]}\n', 'f.jsonl')).toThrow(/must not contain ":"/);
    expect(() => parseOpenings('{"id":"a"}\n', 'f.jsonl')).toThrow(/"actions" must be an array/);
    expect(() => parseOpenings('{"id":"a","actions":[{"type":"MOVE","unitId":"u1","to":{"x":1,"y":1}}]}\n', 'f.jsonl')).toThrow(/MOVE needs integer \{from\} and \{to\} squares/);
    expect(() => parseOpenings('{"id":"a","actions":[{"type":"RESIGN"}]}\n', 'f.jsonl')).toThrow(/RESIGN is not an opening action/);
    expect(() => parseOpenings('not json\n', 'f.jsonl')).toThrow(/not valid JSON/);
    expect(() => parseOpenings('\n', 'f.jsonl')).toThrow(/contains no openings/);
  });

  it('accepts an opening that is legal-by-replay and reaches a position different from the initial one', () => {
    const opening: OpeningSpec = { id: 'two-moves', actions: legalOpeningActions(2) };
    const state = applyOpening(opening);
    expect(state).not.toEqual(initialStateFor());
    expect(state.phase).not.toBe('victory');
    expect(() => validateOpenings([opening], [0, 3])).not.toThrow();
  });

  it('REJECTS an illegal opening rather than manufacturing an unreachable position', () => {
    // A unit teleporting across the board: the square is occupied by a real
    // unit, so the reference resolves, but the rules refuse the move.
    const state = initialStateFor();
    const someUnit = state.board.units.find(u => u.owner === 'white')!;
    const illegal: OpeningSpec = {
      id: 'teleport',
      actions: [{ type: 'MOVE', from: { ...someUnit.position }, to: { x: 9 - someUnit.position.x, y: 9 - someUnit.position.y } }],
    };
    expect(() => applyOpening(illegal)).toThrow(/illegal for (white|black) in this position/);
    expect(() => validateOpenings([illegal], [0])).toThrow(/legal-by-replay/);

    // A reference to an empty square is refused before the rules are consulted.
    const ghost: OpeningSpec = { id: 'ghost', actions: [{ type: 'MOVE', from: { x: 4, y: 4 }, to: { x: 4, y: 5 } }] };
    expect(() => applyOpening(ghost)).toThrow(/no unit stands on/);
  });

  it('loadOpenings hashes the file it read, so the manifest can pin the exact openings used', () => {
    const dir = tmpDir('openings');
    const file = path.join(dir, 'o.jsonl');
    fs.writeFileSync(file, '{"id":"a","actions":[]}\n');
    const loaded = loadOpenings(file);
    expect(loaded.openings.map(o => o.id)).toEqual(['a']);
    expect(loaded.sha256).toMatch(/^[0-9a-f]{64}$/);
    fs.writeFileSync(file, '{"id":"a","actions":[]}\n{"id":"b","actions":[]}\n');
    expect(loadOpenings(file).sha256).not.toBe(loaded.sha256);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // The message moved from `ladder/openings.ts`'s "openings: at handicap 0: ..."
  // to `openings/phasing.ts`'s own, because a current run is validated under
  // PHASING (`validateLadderOpenings`). Rewritten from the canonical Phasing
  // engine: the P1 replayer names the opening, the action index and the refusal.
  it('parseArgs rejects an openings file whose opening is not legal-by-replay, before any game is played', () => {
    const dir = tmpDir('bad-openings');
    const file = path.join(dir, 'bad.jsonl');
    // White's fire_1 starts on (1,0); (9,9) is the far corner, so the square
    // resolves and the RULES refuse the move — a legality failure, not a
    // missing-unit one.
    fs.writeFileSync(file, '{"id":"p1-bad","actions":[{"type":"MOVE","from":{"x":1,"y":0},"to":{"x":9,"y":9}}]}\n');
    expect(() =>
      parseArgs(['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '1', '--seed', '1', '--out', dir, '--openings', file]),
    ).toThrow(/P1 opening p1-bad action 0: illegal action/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /**
   * THE RULESET GUARD. Standard and Phasing share every action type, so the
   * first plies of a Standard opening often replay without complaint into a
   * Phasing state — and the position that comes out is one no game of either
   * rule set ever reached, measured as though it were evidence. A relabelled
   * id is therefore refused STRUCTURALLY, before any game is played, and the
   * refusal names the ids so the mistake is obvious.
   */
  it('REFUSES a historical Standard opening id in a Phasing run, rather than replaying it under the wrong rules', () => {
    const e0 = loadOpenings('lab/hard-ai/ladder/openings/e0-openings.jsonl').openings;
    expect(openingRuleset(e0[0])).toBe('standard');
    expect(() => validateLadderOpenings(e0, [0])).toThrow(/are not phasing openings/);
    expect(() => validateLadderOpenings(e0, [0])).toThrow(/may not be relabelled as Phasing/);
    expect(() => validateLadderOpenings(e0, [0])).toThrow(new RegExp(`rules revision ${LADDER_RULES_VERSION}`));
    // WHY THE ID IS THE ONLY GUARD THERE CAN BE. Renaming a Standard row to a P1
    // id does not make the replay fail: the two rule sets share every action
    // type, and a short opening of plain MOVEs reaches the very same board under
    // both. What it DOES produce is a position whose `ruleset` is Phasing — so
    // every turn after the opening resolves under different rules than the book
    // was generated against — and nothing in the replay itself can notice.
    const relabelled = applyLadderOpening({ ...e0[0], id: `p1-${e0[0].id}` });
    expect(relabelled.ruleset).toBe('phasing');
    expect(applyOpening(e0[0]).ruleset).toBe('standard');
    expect(() => assertOpeningsRuleset([e0[0]], 'phasing')).toThrow(/are not phasing openings/);
    // ...and a P1 row is accepted.
    const p1 = loadOpenings('lab/hard-ai/ladder/openings/p1-dev.jsonl').openings.slice(0, 2);
    for (const o of p1) expect(o.id).toMatch(P1_OPENING_ID_RE);
    expect(openingRuleset(p1[0])).toBe('phasing');
    expect(() => validateLadderOpenings(p1, [0, 3])).not.toThrow();
    expect(applyLadderOpening(p1[0]).ruleset).toBe('phasing');
    // A zero-action row is rules-neutral: it names no action to reinterpret.
    expect(openingRuleset(INITIAL_OPENING)).toBe('either');
    expect(() => assertOpeningsRuleset([INITIAL_OPENING], 'phasing')).not.toThrow();
    expect(() => validateLadderOpenings([INITIAL_OPENING], [0, 3])).not.toThrow();
    // And the revision mapping a replay is reconstructed through: absent means
    // Standard (every archived row), the P1 string means Phasing, anything else
    // is refused rather than guessed.
    expect(rulesetForRevision(undefined, 'x')).toBe('standard');
    expect(rulesetForRevision(LADDER_RULES_VERSION, 'x')).toBe('phasing');
    expect(() => rulesetForRevision('muju-online-9', 'x')).toThrow(/unknown rulesVersion/);
  });
});

// --------------------------------------------------- harness per-turn timing

describe('lab/harness/runner per-turn records', () => {
  it('records one wall-clock entry per turn per seat, in turn order, summing to that seat\'s decisionMs', { timeout: 60_000 }, async () => {
    const work = { mode: 'fixed' as const, units: 1 };
    const engine = resolveEngine('Rush');
    const { record } = await playGame({
      bots: { white: engine.createBot(work), black: engine.createBot(work) },
      seed: 11,
      engineHash: 'test',
      runId: 'turn-ms',
      options: { ...DEFAULT_MATCH_OPTIONS, checkInvariants: true },
    });
    for (const seat of ['white', 'black'] as const) {
      const s = record.players[seat];
      // One entry per TURN, not per decision: several plies fold into one turn.
      expect(s.turnMs).toBeDefined();
      expect(s.turnMs).toHaveLength(s.turnsTaken!);
      expect(s.turnMs!.every(ms => Number.isFinite(ms) && ms >= 0)).toBe(true);
      // The sum is the existing per-seat total, so the new field cannot drift
      // from the one the ladder already reports.
      expect(s.turnMs!.reduce((x, y) => x + y, 0)).toBe(s.decisionMs);
      expect(s.plies).toBeGreaterThanOrEqual(s.turnsTaken!);
    }
    expect(record.players.white.turnsTaken).toBeGreaterThan(1);
  });
});

// ------------------------------------------- metrics: timing and sequential

describe('lab/hard-ai/ladder/run computeMetrics per-engine timing (AMENDMENTS-PENDING A4)', () => {
  const hardTiming = (over: Partial<NonNullable<GameRecord['hardTiming']>> = {}): GameRecord['hardTiming'] => ({
    turns: 4, searches: 6, reSearches: 2, totalSearchMs: 300, totalAdapterMs: 360,
    overruns: 1, maxTurnMs: 300, budgetExhausted: 1,
    // A10/A16 additions, carried per game by `worker.ts#hardTimingDelta`.
    emptyPlans: 0, abortedSearches: 4, firstSearchAborted: 1, ...over,
  });

  const args = baseArgs({ a: 'hard@lab', b: 'Rush', pairs: 1, handicaps: [0], work: { mode: 'wall', ms: 100 } });
  const [pair] = buildSchedule(args);
  // A plays white in the A-white game and black in the B-white game, so its
  // per-turn records are the white array of one game and the black array of
  // the other: 8 turns in all, two of them over the 100 ms allowance.
  const games = [
    gameRow({
      pairId: pair.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 360, blackMs: 4,
      whiteTurnMs: [10, 20, 30, 300], blackTurnMs: [1, 1, 1, 1], hardTiming: hardTiming(),
    }),
    gameRow({
      pairId: pair.pairId, orientation: 'B-white', handicap: 0, winner: 'black', whiteMs: 4, blackMs: 460,
      whiteTurnMs: [1, 1, 1, 1], blackTurnMs: [10, 20, 30, 400], hardTiming: hardTiming({ maxTurnMs: 400 }),
    }),
  ];
  const pairs = [pairRow(pair.pairId, pair.pairIndex, 0, 1)];

  it('reads p95TurnMs, maxTurnMs and overruns off the per-turn records of the seat each engine played', () => {
    const m = computeMetrics(args, games, pairs);
    expect(m.timing.a.turns).toBe(8);
    expect(m.timing.a.maxTurnMs).toBe(400);
    // Nearest rank: ceil(0.95 × 8) = 8, i.e. the largest of the eight turns.
    expect(m.timing.a.p95TurnMs).toBe(400);
    // 300 ms and 400 ms, against wall:100 plus the frozen 10 ms tolerance.
    expect(m.timing.a.toleranceMs).toBe(10);
    expect(m.timing.a.overAllowance).toBe(2);
    expect(m.timing.a.overruns).toBe(2);
    expect(m.timing.b.turns).toBe(8);
    expect(m.timing.b.maxTurnMs).toBe(1);
    expect(m.timing.b.p95TurnMs).toBe(1);
    expect(m.timing.b.overAllowance).toBe(0);
    expect(m.timing.b.overruns).toBe(0);
  });

  it('attributes budgetExhausted and reSearches to the run\'s only hard@ arm, and to neither when both are hard@', () => {
    const m = computeMetrics(args, games, pairs);
    expect(m.timing.a.reSearches).toBe(4); // 2 per game, both games
    expect(m.timing.a.budgetExhausted).toBe(2);
    // `hardBotTiming()` is process-wide, so a scripted arm gets no share of it.
    expect(m.timing.b.reSearches).toBeNull();
    expect(m.timing.b.budgetExhausted).toBeNull();
    // Two hard arms share one process-wide counter, which cannot be split.
    const both = computeMetrics(baseArgs({ ...args, b: 'hard@desktop' }), games, pairs);
    expect(both.timing.a.reSearches).toBeNull();
    expect(both.timing.b.reSearches).toBeNull();
  });

  /**
   * AMENDMENTS-DECIDED A16. E1.1's artifacts could not say how many searches
   * the A11 deadline cut — the reviewer had to infer it from turn times. The
   * adapter counts it, `worker.ts` folds it into each game, and the row reports
   * it per arm with its denominator.
   */
  it('reports abortedSearches, abortRate, firstSearchAborted and emptyPlans for the sole hard@ arm', () => {
    const m = computeMetrics(args, games, pairs);
    expect(m.timing.a.searches).toBe(12); // 6 per game, both games
    expect(m.timing.a.abortedSearches).toBe(8);
    expect(m.timing.a.abortRate).toBeCloseTo(8 / 12, 10);
    expect(m.timing.a.firstSearchAborted).toBe(2); // one per game
    expect(m.timing.a.emptyPlans).toBe(0);
    // Process-wide counters: a scripted arm owns none of them.
    expect(m.timing.b.abortedSearches).toBeNull();
    expect(m.timing.b.abortRate).toBeNull();
    expect(m.timing.b.firstSearchAborted).toBeNull();
  });

  it('reports an absent A16 counter as unknown, never as zero', () => {
    // Games recorded before A16 carry `budgetExhausted` but no
    // `abortedSearches`; reporting 0 would read as "the deadline never bit".
    const older = games.map(g => {
      const full = hardTiming() as NonNullable<GameRecord['hardTiming']>;
      const legacy: NonNullable<GameRecord['hardTiming']> = {
        turns: full.turns, searches: full.searches, reSearches: full.reSearches,
        totalSearchMs: full.totalSearchMs, totalAdapterMs: full.totalAdapterMs,
        overruns: full.overruns, maxTurnMs: full.maxTurnMs, budgetExhausted: full.budgetExhausted,
      };
      return { ...g, hardTiming: legacy };
    });
    const m = computeMetrics(args, older, pairs);
    expect(m.timing.a.budgetExhausted).toBe(2);
    expect(m.timing.a.abortedSearches).toBeNull();
    expect(m.timing.a.abortRate).toBeNull();
    expect(m.timing.a.firstSearchAborted).toBeNull();
    expect(m.timing.a.emptyPlans).toBeNull();
  });

  /**
   * E1.5, the prerequisite E1.4 §5 names. The process-wide counters cannot be
   * split between two `hard@` seats, so the A16 columns of a Hard-vs-Hard row
   * used to read `n/a` — including `firstSearchAborted`, which is the very
   * statistic the calibration patch is retained or rejected on. Each bot now
   * owns its counters, `lab/harness/runner.ts` writes them into
   * `PlayerGameStats.hardTiming`, and the metric prefers them.
   */
  describe('per-seat attribution in a Hard-vs-Hard row', () => {
    const seat = (over: Partial<NonNullable<PlayerGameStats['hardTiming']>> = {}): PlayerGameStats['hardTiming'] => ({
      turns: 4, searches: 5, reSearches: 1, totalSearchMs: 200, totalAdapterMs: 240,
      overruns: 0, maxTurnMs: 100, budgetExhausted: 0, emptyPlans: 0,
      abortedSearches: 0, firstSearchAborted: 0, ...over,
    });
    // A = the calibration arm: its first search finishes on the work rung.
    // B = the champion: cold, so its first search is deadline-cut every game.
    const calibSeat = (): PlayerGameStats['hardTiming'] => seat({ abortedSearches: 1, firstSearchAborted: 0 });
    const coldSeat = (): PlayerGameStats['hardTiming'] => seat({ abortedSearches: 3, firstSearchAborted: 1, budgetExhausted: 2 });
    const hvhArgs = baseArgs({
      a: 'hard@ablate:calib', b: 'hard@desktop', pairs: 1, handicaps: [0], work: { mode: 'wall', ms: 100 },
    });
    const [hvhPair] = buildSchedule(hvhArgs);
    // A is white in the A-white game and black in the B-white game.
    const hvhGames = [
      gameRow({
        pairId: hvhPair.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 240, blackMs: 240,
        whiteTurnMs: [10, 20], blackTurnMs: [10, 20],
        whiteSeatTiming: calibSeat(), blackSeatTiming: coldSeat(),
      }),
      gameRow({
        pairId: hvhPair.pairId, orientation: 'B-white', handicap: 0, winner: 'black', whiteMs: 240, blackMs: 240,
        whiteTurnMs: [10, 20], blackTurnMs: [10, 20],
        whiteSeatTiming: coldSeat(), blackSeatTiming: calibSeat(),
      }),
    ];
    const hvhPairs = [pairRow(hvhPair.pairId, hvhPair.pairIndex, 0, 1)];

    it('attributes the A16 counters to each arm instead of reporting n/a', () => {
      const m = computeMetrics(hvhArgs, hvhGames, hvhPairs);
      // Two games each, per seat.
      expect(m.timing.a.searches).toBe(10);
      expect(m.timing.b.searches).toBe(10);
      expect(m.timing.a.abortedSearches).toBe(2);
      expect(m.timing.b.abortedSearches).toBe(6);
      expect(m.timing.a.firstSearchAborted).toBe(0);
      expect(m.timing.b.firstSearchAborted).toBe(2);
      expect(m.timing.a.abortRate).toBeCloseTo(2 / 10, 10);
      expect(m.timing.b.abortRate).toBeCloseTo(6 / 10, 10);
      expect(m.timing.a.budgetExhausted).toBe(0);
      expect(m.timing.b.budgetExhausted).toBe(4);
      expect(m.timing.a.reSearches).toBe(2);
      expect(m.timing.b.reSearches).toBe(2);
      expect(m.timing.a.emptyPlans).toBe(0);
      expect(m.timing.b.emptyPlans).toBe(0);
    });

    it('still reports nothing for an arm that kept no counters', () => {
      // Only the white seat carries per-seat counters, and A is white in the
      // first game and black in the second — so A is known and B is not.
      const oneSided = [
        gameRow({
          pairId: hvhPair.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 240, blackMs: 240,
          whiteTurnMs: [10, 20], blackTurnMs: [10, 20], whiteSeatTiming: calibSeat(),
        }),
      ];
      const m = computeMetrics(hvhArgs, oneSided, []);
      expect(m.timing.a.abortedSearches).toBe(1);
      expect(m.timing.b.abortedSearches).toBeNull();
      expect(m.timing.b.firstSearchAborted).toBeNull();
      expect(m.timing.b.searches).toBeNull();
    });

    it('prefers per-seat counters over the process-wide fallback for a sole hard@ arm', () => {
      // One `hard@` arm and a scripted one, with BOTH sources present: the
      // per-seat numbers win, because they are the ones that cannot be wrong
      // about who owned them.
      const soleArgs = baseArgs({ a: 'hard@lab', b: 'Rush', pairs: 1, handicaps: [0], work: { mode: 'wall', ms: 100 } });
      const [solePair] = buildSchedule(soleArgs);
      const withBoth = [
        gameRow({
          pairId: solePair.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 240, blackMs: 4,
          whiteTurnMs: [10, 20], blackTurnMs: [1, 1],
          whiteSeatTiming: seat({ searches: 7, abortedSearches: 2, firstSearchAborted: 1 }),
          hardTiming: {
            turns: 4, searches: 99, reSearches: 9, totalSearchMs: 1, totalAdapterMs: 1,
            overruns: 0, maxTurnMs: 0, budgetExhausted: 9, emptyPlans: 9,
            abortedSearches: 99, firstSearchAborted: 9,
          },
        }),
      ];
      const m = computeMetrics(soleArgs, withBoth, []);
      expect(m.timing.a.searches).toBe(7);
      expect(m.timing.a.abortedSearches).toBe(2);
      expect(m.timing.a.firstSearchAborted).toBe(1);
      expect(m.timing.b.searches).toBeNull();
    });
  });

  it('survives a campaign-sized run: a spread over every sample throws past ~125k arguments', () => {
    // `--pairs 1500` is a planned row (MILESTONES M-rows); at ~50 turns a seat
    // per game that is ~150,000 per-turn samples for one engine, and
    // `Math.max(...samples)` on that many arguments is a RangeError, thrown
    // AFTER every game has been played — losing metrics.json, sprt.json,
    // elo.json and summary.md for the whole campaign.
    const many = 130_000;
    const whiteTurnMs = Array.from({ length: many }, (_, i) => (i === many - 1 ? 7 : 1));
    const big = [
      gameRow({
        pairId: pair.pairId, orientation: 'A-white', handicap: 0, winner: 'white',
        whiteMs: many + 6, blackMs: 1, whiteTurnMs, blackTurnMs: [1],
      }),
    ];
    const m = computeMetrics(args, big, []);
    expect(m.timing.a.turns).toBe(many);
    expect(m.timing.a.maxTurnMs).toBe(7);
    expect(m.timing.a.p95TurnMs).toBe(1);
  });

  it('counts no overrun in fixed-work mode, which has no clock to overrun', () => {
    const m = computeMetrics(baseArgs({ ...args, work: { mode: 'fixed', units: 400_000 } }), games, pairs);
    expect(m.timing.a.overAllowance).toBe(0);
    expect(m.timing.a.overruns).toBe(0);
    expect(m.timing.a.toleranceMs).toBeNull();
    expect(m.timing.a.maxTurnMs).toBe(400);
  });

  it('seatMirrored is true only when every pair the run PLAYED completed in BOTH orientations with no failures', () => {
    expect(computeMetrics(args, games, pairs).seatMirrored).toBe(true);
    expect(computeMetrics(args, games, pairs).bothSeatsPlayed).toBe(true);
    // A pair that was never launched (an SPRT stop, say) is not half-played;
    // `pairsCompleted` and `status` are what report a short schedule.
    const twoPairs = baseArgs({ ...args, pairs: 2 });
    expect(computeMetrics(twoPairs, games, pairs).seatMirrored).toBe(true);
    expect(computeMetrics(twoPairs, games, pairs).pairsCompleted).toBe(1);
    expect(computeMetrics(twoPairs, games, pairs).status).toBe('incomplete');
    // One orientation missing: `bothSeatsPlayed` still passes (it only asks
    // whether each seat was played somewhere), `seatMirrored` does not.
    const half = computeMetrics(args, [games[0]], []);
    expect(half.bothSeatsPlayed).toBe(false);
    expect(half.seatMirrored).toBe(false);
    // Every game present, but a failure row means a game was replayed or lost.
    const failed = computeMetrics(args, games, pairs, [
      { pairId: pair.pairId, orientation: 'B-white', opening: 'initial', handicap: 0, seed: 1, shardIndex: 0, error: 'boom', stackTail: '', at: '' },
    ]);
    expect(failed.seatMirrored).toBe(false);
  });
});

/**
 * Critique C8 and C13 (`docs/hard-ai/e3/E3.2-ROW-REPORT.md` §5): two wall:3000
 * rows shared the box and the load each GAME met was never recorded, so the
 * rung distributions and units/ms columns of one row are not comparable with
 * another's. `manifest.loadavg` is one sample, taken before the first game of a
 * run that lasted two hours.
 */
describe('lab/hard-ai/ladder/run per-game box load (critique C8 / C13)', () => {
  const args = baseArgs({ pairs: 1, handicaps: [0] });

  it('averages every loadAvgStart and loadAvgEnd in games.jsonl into metrics.loadAvgMean', () => {
    const pairId = pairIdFor('initial', 0, 0);
    const withLoad = (row: GameRow, start: number, end: number): GameRow => ({ ...row, loadAvgStart: start, loadAvgEnd: end });
    const games = [
      withLoad(gameRow({ pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1 }), 2, 4),
      withLoad(gameRow({ pairId, orientation: 'B-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1 }), 6, 8),
    ];
    const metrics = computeMetrics(args, games, [pairRow(pairId, 0, 0, 1)]);
    expect(metrics.loadAvgMean).toBeCloseTo(5, 10); // (2 + 4 + 6 + 8) / 4
    expect(summaryMarkdown(metrics)).toContain('- loadAvgMean (1-min, per game, start and end): 5.00');
  });

  it('reports a run whose rows predate the fields as NULL, never as an idle box', () => {
    const pairId = pairIdFor('initial', 0, 0);
    const games = [
      gameRow({ pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1 }),
      gameRow({ pairId, orientation: 'B-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1 }),
    ];
    const metrics = computeMetrics(args, games, [pairRow(pairId, 0, 0, 1)]);
    expect(metrics.loadAvgMean).toBeNull();
    expect(summaryMarkdown(metrics)).toContain('not recorded (run predates the per-game samples)');
    // A half-instrumented merge (one old shard, one new) averages what it has.
    const mixed = [games[0], { ...games[1], loadAvgStart: 3, loadAvgEnd: 5 }];
    expect(computeMetrics(args, mixed, [pairRow(pairId, 0, 0, 1)]).loadAvgMean).toBeCloseTo(4, 10);
  });

  it('writes both samples on every real game row, and the run mean into metrics.json', { timeout: 60_000 }, async () => {
    const out = tmpDir('e2e-loadavg');
    try {
      const args2 = baseArgs({ a: 'Rush', b: 'Rush', pairs: 1, handicaps: [0], seed: 5, shards: 1, out });
      const result = await runLadder(args2);
      expect(result.status).toBe('complete');

      const games = fs.readFileSync(path.join(out, 'games.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as GameRow);
      expect(games).toHaveLength(2);
      const samples: number[] = [];
      for (const g of games) {
        expect(typeof g.loadAvgStart).toBe('number');
        expect(typeof g.loadAvgEnd).toBe('number');
        expect(Number.isFinite(g.loadAvgStart!)).toBe(true);
        expect(Number.isFinite(g.loadAvgEnd!)).toBe(true);
        expect(g.loadAvgStart!).toBeGreaterThanOrEqual(0);
        expect(g.loadAvgEnd!).toBeGreaterThanOrEqual(0);
        samples.push(g.loadAvgStart!, g.loadAvgEnd!);
      }
      const metrics = JSON.parse(fs.readFileSync(path.join(out, 'metrics.json'), 'utf8')) as RunMetrics;
      expect(metrics.loadAvgMean).toBeCloseTo(samples.reduce((a, b) => a + b, 0) / samples.length, 10);
      expect(fs.readFileSync(path.join(out, 'summary.md'), 'utf8')).toContain('- loadAvgMean (1-min, per game, start and end): ');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('lab/hard-ai/ladder/run computeMetrics sequential SPRT', () => {
  const params = { elo0: 0, elo1: 50, alpha: 0.05, beta: 0.05 };
  const args = baseArgs({ pairs: 30, handicaps: [0], sprt: params });
  const schedule = buildSchedule(args);
  // A sweeps the first 23 pairs and is swept in the last 7. In pairIndex order
  // the sequential test crosses the upper bound at pair 23; the batch test over
  // all 30 pairs never decides, and the reversed order would not decide either.
  const scores = schedule.map((_, i) => (i < 23 ? 2 : 0));
  const pairs = schedule.map((p, i) => pairRow(p.pairId, p.pairIndex, p.handicap, scores[i]));

  it('checks pairs in pairIndex order, not in the order the shards happened to merge them', () => {
    const m = computeMetrics(args, [], [...pairs].reverse());
    expect(m.sprtSequential).not.toBeNull();
    expect(m.sprtSequential!.decision).toBe('H1');
    expect(m.sprtSequential!.decidedAtPair).toBe(23);
    expect(m.sprtSequential!.trace).toHaveLength(23);
    expect(m.sprtSequential!.minPairs).toBe(DEFAULT_MIN_PAIRS);
  });

  it('metrics.decision comes from the SEQUENTIAL test while metrics.sprt keeps the batch statistic', () => {
    const m = computeMetrics(args, [], pairs);
    expect(m.sprt!.decision).toBe('continue'); // batch over all 30 pairs
    expect(m.decision).toBe('H1'); // sequential, decided at pair 23
  });

  it('a voided run (adjudication > 1%) voids the sequential decision too', () => {
    const adjudicated = schedule.slice(0, 1).map(p =>
      ({ ...gameRow({ pairId: p.pairId, orientation: 'A-white' as const, handicap: 0, winner: 'white' as const, whiteMs: 1, blackMs: 1 }), winType: 'adjudication' as const }));
    const m = computeMetrics(args, adjudicated, pairs);
    expect(m.voided).toBe(true);
    expect(m.decision).toBe('void');
  });

  it('reports nothing sequential when no --sprt was requested', () => {
    expect(computeMetrics(baseArgs({ pairs: 30, handicaps: [0] }), [], pairs).sprtSequential).toBeNull();
  });
});

// ---------------------------------------------------------------- CLI

describe('lab/hard-ai/ladder/run parseArgs', () => {
  it('defaults to the initial opening with replays on and resume off', () => {
    const args = parseArgs(['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '1', '--seed', '1', '--out', 'lab/results/x']);
    expect(args.openings).toEqual([INITIAL_OPENING]);
    expect(args.openingsPath).toBeNull();
    expect(args.replays).toBe(true);
    expect(args.resume).toBe(false);
    expect(buildSchedule(args)[0].pairId).toBe('initial:0:0');
  });

  it('honours --replays off and --resume', () => {
    const args = parseArgs(['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '1', '--seed', '1', '--out', 'lab/results/x', '--replays', 'off', '--resume']);
    expect(args.replays).toBe(false);
    expect(args.resume).toBe(true);
  });

  it('REJECTS --profile instead of recording a flag that never had an effect, and points at the hard@<label> engines', () => {
    expect(() =>
      parseArgs(['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '1', '--seed', '1', '--out', 'lab/results/x', '--profile', 'phone']),
    ).toThrow(/--profile is not a run-level knob.*hard@phone.*hard@mobile/s);
  });
});

// ------------------------------------------------- CLI: strict --sprt/numbers

const CLI_BASE = ['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '1', '--seed', '1', '--out', 'lab/results/x'];

/** `CLI_BASE` with one flag's value replaced. */
function cliWith(flag: string, value: string): string[] {
  const argv = [...CLI_BASE];
  argv[argv.indexOf(flag) + 1] = value;
  return argv;
}

describe('lab/hard-ai/ladder/run parseArgs strictness', () => {
  it('REJECTS the M19 phone row --sprt 0,0,0.05,0.05 at parse time, naming AMENDMENTS-DECIDED.md A1', () => {
    // Parse time, so the run cannot burn hours of engine time on a test whose
    // hypotheses can never separate (`sprt.ts#validateSprtParams`).
    expect(() => parseArgs([...CLI_BASE, '--sprt', '0,0,0.05,0.05'])).toThrow(/elo0 and elo1 must differ/);
    expect(() => parseArgs([...CLI_BASE, '--sprt', '0,0,0.05,0.05'])).toThrow(/docs\/hard-ai\/e0\/AMENDMENTS-DECIDED\.md A1/);
  });

  it('REJECTS every other parameter set the statistic cannot run on, and accepts A1\'s two proposals', () => {
    expect(() => parseArgs([...CLI_BASE, '--sprt', '0,50,0,0.05'])).toThrow(/alpha must lie in \(0, 1\)/);
    expect(() => parseArgs([...CLI_BASE, '--sprt', '0,50,0.6,0.5'])).toThrow(/alpha \+ beta must be below 1/);
    expect(() => parseArgs([...CLI_BASE, '--sprt', '50,0,0.05,0.05'])).toThrow(/must be greater than/);
    expect(() => parseArgs([...CLI_BASE, '--sprt', '0,50,0.05'])).toThrow(/expected elo0,elo1,alpha,beta/);
    expect(() => parseArgs([...CLI_BASE, '--sprt', 'a,b,c,d'])).toThrow(/expected elo0,elo1,alpha,beta/);
    // A1 option (a), non-inferiority, and option (b), superiority.
    expect(parseArgs([...CLI_BASE, '--sprt', '-25,0,0.05,0.05']).sprt).toEqual({ elo0: -25, elo1: 0, alpha: 0.05, beta: 0.05 });
    expect(parseArgs([...CLI_BASE, '--sprt', '0,50,0.05,0.05']).sprt).toEqual({ elo0: 0, elo1: 50, alpha: 0.05, beta: 0.05 });
  });

  it('REJECTS non-numeric or non-positive --pairs, --seed and --shards instead of scheduling NaN pairs', () => {
    expect(() => parseArgs(cliWith('--pairs', 'eight'))).toThrow(/--pairs "eight".*positive integer/s);
    expect(() => parseArgs(cliWith('--pairs', '0'))).toThrow(/--pairs "0".*positive integer/s);
    expect(() => parseArgs(cliWith('--pairs', '-3'))).toThrow(/positive integer/);
    expect(() => parseArgs(cliWith('--pairs', '2.5'))).toThrow(/positive integer/);
    expect(() => parseArgs(cliWith('--seed', 'abc'))).toThrow(/--seed "abc".*finite integer/s);
    expect(() => parseArgs(cliWith('--seed', '1.5'))).toThrow(/finite integer/);
    expect(() => parseArgs([...CLI_BASE, '--shards', 'two'])).toThrow(/--shards "two".*positive integer/s);
    expect(() => parseArgs([...CLI_BASE, '--shards', '0'])).toThrow(/positive integer/);
    // Negative seeds are legitimate; zero is too.
    expect(parseArgs(cliWith('--seed', '-7')).seed).toBe(-7);
    expect(parseArgs([...CLI_BASE, '--shards', '2']).shards).toBe(2);
    expect(parseArgs(CLI_BASE).shards).toBe(1);
  });
});

// ------------------------------------------------------- resume identity

describe('lab/hard-ai/ladder/run resume identity', () => {
  it('REFUSES to resume into an --out whose manifest describes a different experiment, and names every differing field', () => {
    const args = baseArgs({ pairs: 4, seed: 5, resume: true, openingsSha256: 'abc' });
    const prior = buildManifest(args, buildSchedule(args), []);
    expect(resumeIdentityMismatches(args, prior)).toEqual([]);

    const changed = [
      { field: 'a', over: { a: 'Other' } as Partial<CliArgs> },
      { field: 'b', over: { b: 'Other' } as Partial<CliArgs> },
      { field: 'work', over: { work: { mode: 'wall', ms: 100 } } as Partial<CliArgs> },
      { field: 'seed', over: { seed: 6 } as Partial<CliArgs> },
      { field: 'pairs', over: { pairs: 8 } as Partial<CliArgs> },
      { field: 'handicaps', over: { handicaps: [0] } as Partial<CliArgs> },
      { field: 'legality', over: { legality: 'strict' } as Partial<CliArgs> },
      { field: 'openings.sha256', over: { openingsSha256: 'def' } as Partial<CliArgs> },
      { field: 'openings.ids', over: { openings: [{ id: 'other', actions: [] }] } as Partial<CliArgs> },
    ];
    for (const { field, over } of changed) {
      const mismatches = resumeIdentityMismatches(baseArgs({ pairs: 4, seed: 5, resume: true, openingsSha256: 'abc', ...over }), prior);
      expect(mismatches.join(' | ')).toContain(field);
      expect(mismatches).toHaveLength(1);
    }
  });

  it('runLadder refuses the resume before it touches a single game, and says what differs', { timeout: 60_000 }, async () => {
    const dir = tmpDir('resume-identity');
    const args = parseArgs(['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '1', '--seed', '1', '--out', dir]);
    await runLadder(args);
    const before = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8');

    const other = parseArgs(['--a', 'Rush', '--b', 'Random', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '2', '--seed', '1', '--out', dir, '--resume']);
    await expect(runLadder(other)).rejects.toThrow(/refusing to --resume.*\bb\b.*pairs/s);
    // Nothing about the completed run was overwritten.
    expect(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).toBe(before);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------- resume

describe('lab/hard-ai/ladder/run resume', () => {
  const args = baseArgs({ pairs: 4, handicaps: [0, 3], seed: 5 });
  const schedule = buildSchedule(args);

  it('skips pairs that already have a pair row and replays the rest', () => {
    const done = schedule.slice(0, 2);
    const priorPairs = done.map((p, i) => pairRow(p.pairId, p.pairIndex, p.handicap, i === 0 ? 2 : 1));
    const priorGames = done.flatMap(p => [
      gameRow({ pairId: p.pairId, orientation: 'A-white', handicap: p.handicap, winner: 'white', whiteMs: 1, blackMs: 1 }),
      gameRow({ pairId: p.pairId, orientation: 'B-white', handicap: p.handicap, winner: 'white', whiteMs: 1, blackMs: 1 }),
    ]);
    const plan = planResume(schedule, priorGames, priorPairs);
    expect(plan.completedPairIds.sort()).toEqual(done.map(p => p.pairId).sort());
    expect(plan.keptGames).toHaveLength(4);
    expect(plan.droppedGames).toBe(0);
  });

  it('drops the orphan game of a half-played pair so replaying that pair cannot duplicate it', () => {
    const [p0, p1] = schedule;
    const priorPairs = [pairRow(p0.pairId, p0.pairIndex, p0.handicap, 2)];
    const priorGames = [
      gameRow({ pairId: p0.pairId, orientation: 'A-white', handicap: p0.handicap, winner: 'white', whiteMs: 1, blackMs: 1 }),
      gameRow({ pairId: p0.pairId, orientation: 'B-white', handicap: p0.handicap, winner: 'white', whiteMs: 1, blackMs: 1 }),
      // p1's A-white game finished; its B-white game threw, so p1 has no pair row.
      gameRow({ pairId: p1.pairId, orientation: 'A-white', handicap: p1.handicap, winner: 'white', whiteMs: 1, blackMs: 1 }),
    ];
    const plan = planResume(schedule, priorGames, priorPairs);
    expect(plan.completedPairIds).toEqual([p0.pairId]);
    expect(plan.keptGames.map(g => g.pairId)).toEqual([p0.pairId, p0.pairId]);
    expect(plan.droppedGames).toBe(1);
  });

  it('ignores prior rows for pairs this run does not schedule', () => {
    const plan = planResume(schedule, [gameRow({ pairId: 'initial:0:99', orientation: 'A-white', handicap: 0, winner: null, whiteMs: 1, blackMs: 1 })], [pairRow('initial:0:99', 99, 0, 1)]);
    expect(plan.completedPairIds).toEqual([]);
    expect(plan.keptGames).toEqual([]);
    expect(plan.keptPairs).toEqual([]);
  });

  it('assertNoDuplicateGames names the offending pairId+orientation instead of double-counting it', () => {
    const dupe = gameRow({ pairId: 'initial:0:0', orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1 });
    expect(() => assertNoDuplicateGames([dupe])).not.toThrow();
    expect(() => assertNoDuplicateGames([dupe, dupe])).toThrow(/duplicate pairId\+orientation.*initial:0:0\/A-white x2/s);
  });
});

// ---------------------------------------------------------------- metrics

describe('lab/hard-ai/ladder/run computeMetrics', () => {
  it('attributes a game to its own pair and seat even when an earlier game is missing', () => {
    // Schedule: pair 0 (handicap 0), pair 1 (handicap 3); two games each. The
    // B-white game of pair 0 is missing (it failed), so POSITIONAL attribution
    // (game i -> pair i>>1, orientation i%2) would shift every later game onto
    // the wrong pair AND the wrong seat.
    const args = baseArgs();
    const [p0, p1] = buildSchedule(args);
    const games = [
      gameRow({ pairId: p0.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 100, blackMs: 10 }),
      gameRow({ pairId: p1.pairId, orientation: 'A-white', handicap: 3, winner: 'white', whiteMs: 100, blackMs: 10 }),
      gameRow({ pairId: p1.pairId, orientation: 'B-white', handicap: 3, winner: 'black', whiteMs: 10, blackMs: 100 }),
    ];
    const pairs = [pairRow(p1.pairId, p1.pairIndex, 3, 2)];
    const metrics = computeMetrics(args, games, pairs);

    // A sat white twice and black once, always spending 100 ms/turn.
    expect(metrics.meanTurnMs.a).toBeCloseTo(100, 9);
    expect(metrics.meanTurnMs.b).toBeCloseTo(10, 9);
    // A won all three games it appears in.
    expect([metrics.wins, metrics.draws, metrics.losses]).toEqual([3, 0, 0]);
    expect(metrics.games).toBe(3);
    expect(metrics.gamesScheduled).toBe(4);
    expect(metrics.missingGames).toBe(1);
    expect(metrics.unattributedGames).toBe(0);
    expect(metrics.pairsCompleted).toBe(1);
    expect(metrics.status).toBe('incomplete');
  });

  it('reports per-handicap strata with their own W/D/L, pair counts and Elo', () => {
    const args = baseArgs({ pairs: 4, handicaps: [0, 3] });
    const schedule = buildSchedule(args);
    const games = schedule.flatMap(p => [
      // A wins every game at handicap 0 and loses every game at handicap 3.
      gameRow({ pairId: p.pairId, orientation: 'A-white', handicap: p.handicap, winner: p.handicap === 0 ? 'white' : 'black', whiteMs: 1, blackMs: 1 }),
      gameRow({ pairId: p.pairId, orientation: 'B-white', handicap: p.handicap, winner: p.handicap === 0 ? 'black' : 'white', whiteMs: 1, blackMs: 1 }),
    ]);
    const pairs = schedule.map(p => pairRow(p.pairId, p.pairIndex, p.handicap, p.handicap === 0 ? 2 : 0));
    const metrics = computeMetrics(args, games, pairs);

    expect(metrics.strata.map(s => s.handicap)).toEqual([0, 3]);
    const [h0, h3] = metrics.strata;
    expect([h0.pairs, h0.pairsScheduled, h0.games]).toEqual([2, 2, 4]);
    expect([h0.wins, h0.draws, h0.losses]).toEqual([4, 0, 0]);
    expect(h0.score).toBeCloseTo(1, 9);
    // E0.3: `n` counts PAIRS (pair-aware estimate); `games` is 2n.
    expect([h0.elo?.n, h0.elo?.games]).toEqual([2, 4]);
    expect([h3.wins, h3.draws, h3.losses]).toEqual([0, 0, 4]);
    expect(h3.score).toBeCloseTo(0, 9);
    expect([h3.elo?.n, h3.elo?.games]).toEqual([2, 4]);
    // The strata disagree completely, so the pooled estimate sits between them.
    expect(metrics.elo).toBeCloseTo(0, 6);
    expect(metrics.status).toBe('complete');
  });

  it('counts a game row the schedule cannot explain instead of silently dropping it', () => {
    const args = baseArgs({ pairs: 1, handicaps: [0] });
    const metrics = computeMetrics(args, [gameRow({ pairId: 'ghost:0:7', orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1 })], []);
    expect(metrics.unattributedGames).toBe(1);
    expect(metrics.status).toBe('incomplete');
  });

  it('folds replica-divergence, timing and other anomalies into the metrics', () => {
    const args = baseArgs({ pairs: 1, handicaps: [0] });
    const [p0] = buildSchedule(args);
    const games = [
      gameRow({
        pairId: p0.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1,
        anomalies: ['hard-replica-divergence', 'hard-replica-divergence', 'search overran its deadline by 40ms', 'ply-cap 8000 hit'],
      }),
    ];
    const metrics = computeMetrics(args, games, []);
    expect(metrics.replicaDivergences).toBe(2);
    expect(metrics.timingAnomalies).toBe(1);
    expect(metrics.anomalyCounts['hard-replica-divergence']).toBe(2);
    expect(metrics.anomalyCounts.timing).toBe(1);
    expect(metrics.anomalyCounts['ply-cap']).toBe(1);
  });

  it('refuses to call a run complete while a scheduled game has no row, whatever the pair rows claim', () => {
    // The exact shape a resume over a clipped artifact directory produces: the
    // pair row survives, one of its two game rows does not. `failures === 0`,
    // `pairsCompleted === scheduled` and `unattributedGames === 0` all hold, so
    // status must be decided by `missingGames` or it reports a lie.
    const args = baseArgs({ pairs: 1, handicaps: [0] });
    const [p0] = buildSchedule(args);
    const games = [gameRow({ pairId: p0.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 10, blackMs: 10 })];
    const metrics = computeMetrics(args, games, [pairRow(p0.pairId, p0.pairIndex, 0, 1)]);
    expect(metrics.failures).toBe(0);
    expect(metrics.pairsCompleted).toBe(1);
    expect(metrics.unattributedGames).toBe(0);
    expect(metrics.games).toBe(1);
    expect(metrics.gamesScheduled).toBe(2);
    expect(metrics.missingGames).toBe(1);
    expect(metrics.status).toBe('incomplete');
  });

  it('marks a run with failure rows incomplete', () => {
    const args = baseArgs({ pairs: 1, handicaps: [0] });
    const [p0] = buildSchedule(args);
    const metrics = computeMetrics(args, [], [], [
      { pairId: p0.pairId, orientation: 'B-white', opening: 'initial', handicap: 0, seed: 1, shardIndex: 0, error: 'boom', stackTail: 'Error: boom', at: '1970-01-01T00:00:00.000Z' },
    ]);
    expect(metrics.failures).toBe(1);
    expect(metrics.status).toBe('incomplete');
  });
});

// ---------------------------------------------------------------- end-to-end

describe('lab/hard-ai/ladder/run end to end', () => {
  it('plays a 1-pair Rush vs Rush run with replays on, then resumes it without replaying anything', { timeout: 60_000 }, async () => {
    const out = tmpDir('e2e');
    try {
      const args = baseArgs({ a: 'Rush', b: 'Rush', pairs: 1, handicaps: [0], seed: 1, shards: 1, out, argv: ['--a', 'Rush'] });
      const result = await runLadder(args);

      expect(result.status).toBe('complete');
      expect(result.failures).toEqual([]);
      expect(result.metrics.games).toBe(2);
      expect(result.metrics.pairsCompleted).toBe(1);
      expect(result.metrics.bothSeatsPlayed).toBe(true);

      const games = fs.readFileSync(path.join(out, 'games.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as GameRow);
      expect(games.map(g => g.pairId)).toEqual(['initial:0:0', 'initial:0:0']);
      expect(games.map(g => g.orientation)).toEqual(['A-white', 'B-white']);
      expect(games.every(g => g.opening === 'initial')).toBe(true);
      // Replays on by default, one file per game, named by pairId + orientation.
      for (const g of games) {
        expect(g.replayPath).toBeTruthy();
        const replay = JSON.parse(fs.readFileSync(path.join(out, g.replayPath!), 'utf8')) as { schema: string; steps: unknown[] };
        expect(replay.schema).toBe('muju-lab-replay-v2');
        expect(replay.steps.length).toBeGreaterThan(1);
      }

      // The manifest is finalized with everything needed to re-run this exactly.
      const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as Record<string, unknown>;
      expect(manifest.status).toBe('complete');
      expect(manifest.argv).toEqual(['--a', 'Rush']);
      expect(typeof manifest.gitDirty).toBe('boolean');
      expect(manifest.node).toBe(process.version);
      expect(Array.isArray(manifest.loadavg)).toBe(true);
      expect((manifest.schedule as Array<{ pairId: string }>).map(p => p.pairId)).toEqual(['initial:0:0']);
      expect(manifest.finishedAt).toBeTruthy();
      expect(fs.existsSync(path.join(out, '.shards'))).toBe(false); // cleared only because the run completed

      // Resume: the pair is already done, so nothing is replayed and no row duplicates.
      const resumed = await runLadder({ ...args, resume: true });
      expect(resumed.status).toBe('complete');
      expect(resumed.metrics.games).toBe(2);
      expect(resumed.metrics.resumed).toBe(true);
      const afterGames = fs.readFileSync(path.join(out, 'games.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as GameRow);
      expect(afterGames).toHaveLength(2);
      expect(new Set(afterGames.map(g => `${g.pairId}/${g.orientation}`)).size).toBe(2);
      expect(() => assertNoDuplicateGames(afterGames)).not.toThrow();
      const resumedManifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as { resumedPairIds: string[] };
      expect(resumedManifest.resumedPairIds).toEqual(['initial:0:0']);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('plays both orientations of a pair from the same opening, and the opening travels with each replay', { timeout: 60_000 }, async () => {
    const out = tmpDir('e2e-openings');
    try {
      const file = path.join(out, 'openings.jsonl');
      // A PHASING opening with a P1 id: the harness refuses a Standard start
      // position and `ladder/ruleset.ts` refuses a non-P1 id.
      const actions = legalPhasingOpeningActions(2);
      fs.writeFileSync(file, JSON.stringify({ id: 'p1-o1', actions }) + '\n');
      const loaded = loadOpenings(file);
      const args = baseArgs({
        a: 'Rush', b: 'Rush', pairs: 1, handicaps: [0], seed: 3, shards: 1, out,
        openings: loaded.openings, openingsPath: file, openingsSha256: loaded.sha256,
      });
      const result = await runLadder(args);
      expect(result.status).toBe('complete');

      const games = fs.readFileSync(path.join(out, 'games.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as GameRow);
      expect(games.map(g => g.pairId)).toEqual(['p1-o1:0:0', 'p1-o1:0:0']);
      expect(games.map(g => g.orientation)).toEqual(['A-white', 'B-white']);
      expect(games.every(g => g.opening === 'p1-o1')).toBe(true);
      // Every current row carries the rule set it was played under and a clean
      // fallback vector (Gate 0 item 6), and the run is therefore not void.
      expect(games.every(g => g.rulesVersion === LADDER_RULES_VERSION)).toBe(true);
      for (const g of games) {
        expect(g.fallbacks).toEqual(emptyFallbackCounts());
      }
      expect(result.metrics.fallbacksRecorded).toBe(true);
      expect(result.metrics.fallbackTotal).toBe(0);
      expect(result.metrics.voided).toBe(false);

      const replays = games.map(g => JSON.parse(fs.readFileSync(path.join(out, g.replayPath!), 'utf8')) as {
        opening: OpeningSpec;
        steps: Array<{ units: Array<{ o: string; d: string; x: number; y: number }> }>;
      });
      expect(replays[0].opening).toEqual({ id: 'p1-o1', actions });
      expect(replays[1].opening).toEqual(replays[0].opening);
      // Both orientations really did start from the same position.
      expect(replays[0].steps[0].units).toEqual(replays[1].steps[0].units);

      const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as {
        openings: { sha256: string; ids: string[] };
        rules: { rulesVersion: string };
      };
      expect(manifest.openings.sha256).toBe(loaded.sha256);
      expect(manifest.openings.ids).toEqual(['p1-o1']);
      expect(manifest.rules.rulesVersion).toBe(LADDER_RULES_VERSION);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('writes a summary.md whose openings line lists the ids the run PLAYED, not the pool it drew from', { timeout: 60_000 }, async () => {
    const out = tmpDir('e2e-summary-openings');
    try {
      // Two openings in the pool, one pair at one handicap: the schedule
      // reaches `o0` and never reaches `o1` (`openingsUsed`). Before this fix
      // `summary.md` listed both and said "used 1 of 2" above them, which is
      // how E3.2's rows #1 and #2 printed 32 ids beside "used 16 of 32"
      // (`docs/hard-ai/e3/E3.2-ROW-REPORT.md` §10.5).
      const file = path.join(out, 'openings.jsonl');
      fs.writeFileSync(
        file,
        [
          JSON.stringify({ id: 'p1-o0', actions: legalPhasingOpeningActions(2) }),
          JSON.stringify({ id: 'p1-o1', actions: legalPhasingOpeningActions(4) }),
        ].join('\n') + '\n',
      );
      const loaded = loadOpenings(file);
      const args = baseArgs({
        a: 'Rush', b: 'Rush', pairs: 1, handicaps: [0], seed: 11, shards: 1, out,
        openings: loaded.openings, openingsPath: file, openingsSha256: loaded.sha256,
      });
      const result = await runLadder(args);
      expect(result.status).toBe('complete');
      expect(result.metrics.openingsUsed).toEqual(['p1-o0']);
      expect(result.metrics.openings).toEqual(['p1-o0', 'p1-o1']);

      const summary = fs.readFileSync(path.join(out, 'summary.md'), 'utf8');
      const line = summary.split('\n').find(l => l.startsWith('- openings:'))!;
      expect(line).toBeDefined();
      expect(line).toContain('used 1 of 2 — p1-o0 (sha256 ' + loaded.sha256.slice(0, 12) + ')');
      expect(line).not.toContain('p1-o1');
      // The unplayed pool id is still on disk where resume and the manifest
      // need it, so nothing was lost by not printing it.
      const metrics = JSON.parse(fs.readFileSync(path.join(out, 'metrics.json'), 'utf8')) as RunMetrics;
      expect(metrics.openings).toEqual(['p1-o0', 'p1-o1']);
      expect(metrics.openingsUsed).toEqual(['p1-o0']);
      const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as {
        openings: { ids: string[]; used: string[] };
      };
      expect(manifest.openings.ids).toEqual(['p1-o0', 'p1-o1']);
      expect(manifest.openings.used).toEqual(['p1-o0']);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('records failed games and keeps the artifacts instead of losing the run, then --resume finishes it without duplicates', { timeout: 60_000 }, async () => {
    const out = tmpDir('e2e-fail');
    try {
      // `b` names no engine, so every game throws inside the shard.
      const broken = baseArgs({ a: 'Rush', b: 'no-such-engine', pairs: 2, handicaps: [0], seed: 2, shards: 1, out });
      const failed = await runLadder(broken);

      expect(failed.status).toBe('incomplete');
      expect(failed.failures).toHaveLength(4); // 2 pairs x 2 orientations
      expect(failed.failures[0].error).toMatch(/unknown engine/);
      expect(failed.failures.map(f => f.pairId).sort()).toEqual(['initial:0:0', 'initial:0:0', 'initial:0:1', 'initial:0:1']);
      expect(fs.readFileSync(path.join(out, 'failures.jsonl'), 'utf8').trim().split('\n')).toHaveLength(4);
      // Forensics are kept, not swept up, when a run does not complete.
      expect(fs.existsSync(path.join(out, '.shards'))).toBe(true);
      const failedManifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as { status: string; counts: { failures: number; completedPairs: number } };
      expect(failedManifest.status).toBe('incomplete');
      expect(failedManifest.counts.failures).toBe(4);
      expect(failedManifest.counts.completedPairs).toBe(0);
      expect(JSON.parse(fs.readFileSync(path.join(out, 'metrics.json'), 'utf8')).status).toBe('incomplete');

      // Correcting the engine name and resuming is REFUSED: those rows belong
      // to a different experiment, whatever their state (see the resume
      // identity block above). A rerun of the repaired row needs a fresh --out.
      await expect(runLadder({ ...broken, b: 'Rush', resume: true })).rejects.toThrow(/refusing to --resume.*\bb\b/s);
      expect(JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')).b).toBe('no-such-engine');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('replays exactly the pairs a previous attempt left unfinished, keeping the superseded failure log', { timeout: 60_000 }, async () => {
    const out = tmpDir('e2e-clip');
    try {
      const args = baseArgs({ a: 'Rush', b: 'Rush', pairs: 2, handicaps: [0], seed: 2, shards: 1, out });
      const first = await runLadder(args);
      expect(first.status).toBe('complete');

      // Clip the artifacts to exactly what an attempt that died on the second
      // pair leaves behind: the first pair complete, the second pair's rows
      // gone, and a failure row for it. The experiment's identity is untouched,
      // which is what makes this a legitimate resume.
      const [, p1] = buildSchedule(args);
      const keep = (rows: string[]): string => rows.filter(l => !l.includes(p1.pairId)).join('\n') + '\n';
      fs.writeFileSync(path.join(out, 'games.jsonl'), keep(fs.readFileSync(path.join(out, 'games.jsonl'), 'utf8').trim().split('\n')));
      fs.writeFileSync(path.join(out, 'pairs.jsonl'), keep(fs.readFileSync(path.join(out, 'pairs.jsonl'), 'utf8').trim().split('\n')));
      const failure: FailureRow = {
        pairId: p1.pairId, orientation: 'B-white', opening: 'initial', handicap: 0, seed: p1.seed,
        shardIndex: 0, error: 'killed', stackTail: '', at: '1970-01-01T00:00:00.000Z',
      };
      fs.writeFileSync(path.join(out, 'failures.jsonl'), JSON.stringify(failure) + '\n');

      const resumed = await runLadder({ ...args, resume: true });
      expect(resumed.status).toBe('complete');
      expect(resumed.metrics.games).toBe(4);
      expect(resumed.metrics.pairsCompleted).toBe(2);
      expect(resumed.metrics.failures).toBe(0);
      expect(resumed.metrics.seatMirrored).toBe(true);
      const games = fs.readFileSync(path.join(out, 'games.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as GameRow);
      expect(() => assertNoDuplicateGames(games)).not.toThrow();
      expect(new Set(games.map(g => `${g.pairId}/${g.orientation}`)).size).toBe(4);
      // The superseded failure row survives the resume.
      expect(fs.readFileSync(path.join(out, 'failures-superseded.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------------- SPRT early stop

describe('lab/hard-ai/ladder/run sequential SPRT stop', () => {
  it('stops launching new pairs once the sequential test decides, and calls the short run complete', { timeout: 120_000 }, async () => {
    const out = tmpDir('sprt-stop');
    try {
      // Rush sweeps Random, so the upper bound is crossed well inside 40 pairs.
      // One shard, so the contiguous prefix the test checks advances with every
      // pair (see the note below about shard slices).
      const args = baseArgs({
        a: 'Rush', b: 'Random', pairs: 40, handicaps: [0], seed: 5, shards: 1, replays: false,
        sprt: { elo0: 0, elo1: 50, alpha: 0.05, beta: 0.05 }, out,
      });
      const result = await runLadder(args);

      expect(result.metrics.decision).toBe('H1');
      expect(result.metrics.sprtSequential!.decidedAtPair).toBe(23);
      // Pairs after the decision were not played: the point of stopping.
      expect(result.metrics.pairsCompleted).toBeLessThan(40);
      expect(result.metrics.pairsCompleted).toBeGreaterThanOrEqual(23);
      // Every pair it DID play is complete in both orientations, and a run
      // stopped by its own stopping rule is not a broken run.
      expect(result.metrics.games).toBe(result.metrics.pairsCompleted * 2);
      expect(result.metrics.seatMirrored).toBe(true);
      expect(result.status).toBe('complete');

      const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as {
        sprtStop: { decision: string; decidedAtPair: number; earlyStop: boolean; signalledAtPair: number; pairsPlayedBeyondDecision: number };
      };
      expect(manifest.sprtStop.earlyStop).toBe(true);
      expect(manifest.sprtStop.signalledAtPair).toBe(23);
      expect(manifest.sprtStop.decision).toBe('H1');

      const sprtJson = JSON.parse(fs.readFileSync(path.join(out, 'sprt.json'), 'utf8')) as {
        sequential: { decision: string; decidedAtPair: number; trace: Array<{ n: number; llr: number }> };
        batch: { decision: string };
      };
      expect(sprtJson.sequential.decidedAtPair).toBe(23);
      expect(sprtJson.sequential.trace).toHaveLength(23);
      expect(sprtJson.batch.decision).toBeDefined();
      expect(fs.readFileSync(path.join(out, 'summary.md'), 'utf8')).toMatch(/SPRT \(sequential, pairIndex order/);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------- durability under a kill

describe('lab/hard-ai/ladder/worker durability', () => {
  it('has every finished game on disk BEFORE the shard exits, so a killed shard keeps what it played', { timeout: 60_000 }, async () => {
    const out = tmpDir('kill-shard');
    try {
      const worker = path.resolve(import.meta.dirname, '../../lab/hard-ai/ladder/worker.ts');
      const child = spawn(process.execPath, [
        '--import', 'tsx', worker,
        '--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1',
        '--handicaps', '0', '--seed', '9', '--pairs', '30',
        '--shard-index', '0', '--shard-count', '1', '--out', out,
      ], { cwd: path.resolve(import.meta.dirname, '../..'), stdio: ['ignore', 'ignore', 'pipe'] });
      const gamesFile = path.join(out, 'games-0.jsonl');
      const rowsOnDisk = (): string[] => (fs.existsSync(gamesFile) ? fs.readFileSync(gamesFile, 'utf8').split('\n').filter(Boolean) : []);

      // Wait for two games' rows to land while the shard is STILL RUNNING.
      const deadline = Date.now() + 45_000;
      while (rowsOnDisk().length < 2 && Date.now() < deadline && child.exitCode === null) {
        await new Promise(r => setTimeout(r, 100));
      }
      expect(child.exitCode).toBeNull(); // the shard has not exited: nothing flushed it for us
      const whileRunning = rowsOnDisk();
      expect(whileRunning.length).toBeGreaterThanOrEqual(2);

      child.kill('SIGKILL');
      await new Promise<void>(resolve => child.on('exit', () => resolve()));

      const afterKill = rowsOnDisk();
      expect(afterKill.length).toBeGreaterThanOrEqual(whileRunning.length);
      const parsed = afterKill.map(l => JSON.parse(l) as GameRow);
      expect(parsed.every(g => g.pairId.startsWith('initial:0:'))).toBe(true);
      expect(new Set(parsed.map(g => `${g.pairId}/${g.orientation}`)).size).toBe(parsed.length);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------- a dead shard's siblings

describe('lab/hard-ai/ladder/run with a shard that dies outright', () => {
  it('merges everything the SURVIVING shards finished instead of reporting zero games', { timeout: 120_000 }, async () => {
    const out = tmpDir('e2e-dead-shard');
    try {
      const args = baseArgs({ a: 'Rush', b: 'Rush', pairs: 12, handicaps: [0], seed: 4, shards: 2, out, replays: false });
      const running = runLadder(args);

      // SIGKILL shard 1 the moment it announces itself, so it dies with shard 0
      // still playing — the case that used to discard shard 0's completed games.
      const statusFile = path.join(out, '.shards', 'status-1.json');
      const deadline = Date.now() + 60_000;
      let killedPid = 0;
      while (killedPid === 0 && Date.now() < deadline) {
        if (fs.existsSync(statusFile)) {
          const status = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as { pid: number };
          process.kill(status.pid, 'SIGKILL');
          killedPid = status.pid;
          break;
        }
        await new Promise(r => setTimeout(r, 25));
      }
      expect(killedPid).toBeGreaterThan(0);

      const result = await running;
      expect(result.status).toBe('incomplete');

      const games = fs.readFileSync(path.join(out, 'games.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as GameRow);
      const pairs = fs.readFileSync(path.join(out, 'pairs.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as PairRow);
      // Shard 0 owns pairs 0..5 and had to be allowed to finish them.
      const survivorPairIds = buildSchedule(args).slice(0, 6).map(p => p.pairId);
      expect(pairs.map(p => p.pairId).sort()).toEqual([...survivorPairIds].sort());
      expect(games.length).toBeGreaterThanOrEqual(12);
      for (const pairId of survivorPairIds) {
        expect(games.filter(g => g.pairId === pairId).map(g => g.orientation).sort()).toEqual(['A-white', 'B-white']);
      }
      expect(() => assertNoDuplicateGames(games)).not.toThrow();

      // Nothing the shards wrote is left behind, and the manifest counts what was merged.
      const shardGames = fs.readFileSync(path.join(out, '.shards', 'games-0.jsonl'), 'utf8').split('\n').filter(Boolean);
      expect(games.length).toBeGreaterThanOrEqual(shardGames.length);
      const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')) as {
        status: string;
        counts: { games: number; completedPairs: number };
        error: string | null;
      };
      expect(manifest.status).toBe('incomplete');
      expect(manifest.counts.games).toBe(games.length);
      expect(manifest.counts.completedPairs).toBe(6);
      expect(manifest.error).toContain('shard 1');
      expect(result.metrics.games).toBe(games.length);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------- settling shards by hand

describe('lab/hard-ai/ladder/run awaitShardsSettled', () => {
  const status = (shardIndex: number, pid: number, done: boolean): ShardStatus => ({
    shardIndex, pid, startedAt: '1970-01-01T00:00:00.000Z', done,
    pairsPlanned: 3, pairsCompleted: done ? 3 : 1, games: done ? 6 : 2, failures: 0,
    finishedAt: done ? '1970-01-01T00:00:01.000Z' : null,
  });

  it('waits for a working shard and settles a dead one, so the merge that follows reads finished files', async () => {
    const dir = tmpDir('settle');
    try {
      writeShardStatus(dir, status(0, 111, false)); // alive, still playing
      writeShardStatus(dir, status(1, 222, false)); // killed: pid gone, never said done
      let polls = 0;
      const report = await awaitShardsSettled(dir, 2, {
        pollMs: 5,
        startupGraceMs: 10_000,
        isAlive: pid => {
          if (pid === 222) return false;
          // Shard 0 finishes on the third poll; until then it must be waited for.
          if (++polls >= 3) writeShardStatus(dir, status(0, 111, true));
          return true;
        },
      });
      expect(report.finished).toEqual([0]);
      expect(report.died).toEqual([1]);
      expect(report.missing).toEqual([]);
      expect(report.stillRunning).toEqual([]);
      expect(polls).toBeGreaterThanOrEqual(3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives up on a shard that never published a status, and reports an abandoned shard instead of pretending it merged', async () => {
    const dir = tmpDir('settle-missing');
    try {
      writeShardStatus(dir, status(1, 333, false));
      const report = await awaitShardsSettled(dir, 2, { pollMs: 1, startupGraceMs: 0, timeoutMs: 30, isAlive: () => true });
      expect(report.missing).toEqual([0]); // never started
      expect(report.stillRunning).toEqual([1]); // alive past the ceiling
      expect(describeSettle(report)).toContain('ABANDONED');
      expect(describeSettle({ ...report, stillRunning: [] })).toContain('Every shard file was merged');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('lab/hard-ai/ladder/run failuresForManifest', () => {
  it('reads failures.jsonl when the run died before the merge, instead of reporting none', () => {
    const dir = tmpDir('failures-manifest');
    try {
      const failuresPath = path.join(dir, 'failures.jsonl');
      const row: FailureRow = {
        pairId: 'initial:0:0', orientation: 'A-white', opening: 'initial', handicap: 0, seed: 1,
        shardIndex: 0, error: 'boom', stackTail: 'Error: boom', at: '1970-01-01T00:00:00.000Z',
      };
      fs.writeFileSync(failuresPath, JSON.stringify(row) + '\n' + JSON.stringify({ ...row, orientation: 'B-white' }) + '\n');
      expect(failuresForManifest(null, failuresPath)).toHaveLength(2);
      expect(failuresForManifest([row], failuresPath)).toEqual([row]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ------------------------------------------------- portable replay filenames

describe('lab/hard-ai/ladder/worker replayFileName', () => {
  it('keeps ":" out of the filename while the pairId keeps it', () => {
    const name = replayFileName(pairIdFor('opA', 3, 7), 'A-white');
    expect(name).not.toContain(':');
    expect(name).toBe('opA_3_7-A-white.json');
    // Still one file per game: the rewrite cannot merge two different pairIds.
    expect(replayFileName(pairIdFor('opA', 3, 7), 'B-white')).not.toBe(name);
    expect(replayFileName(pairIdFor('opA_3', 7, 0), 'A-white')).not.toBe(name);
  });
});

// ------------------------------------------------- openings own their rules

describe('lab/hard-ai/ladder/openings rules scope', () => {
  it('replays an opening under the rules it was given, not under whatever the last game left installed', () => {
    setElementGraph('none'); // as a previous game's finally-block might have left it
    try {
      const seen: string[] = [];
      const result = withOpeningRules({ elementGraph: 'dual-triangle' }, () => {
        seen.push(getElementGraph());
        return 42;
      });
      expect(result).toBe(42);
      expect(seen).toEqual(['dual-triangle']); // the replay saw ITS rules
      expect(getElementGraph()).toBe('double-thick'); // and restored the shipped default
    } finally {
      setElementGraph('double-thick');
    }
  });

  it('applyOpening installs the shipped defaults for a caller that names no rules', () => {
    setElementGraph('none');
    try {
      const state = applyOpening({ id: 'o', actions: legalOpeningActions(2) });
      expect(state.board.units.length).toBeGreaterThan(0);
      expect(getElementGraph()).toBe('double-thick');
    } finally {
      setElementGraph('double-thick');
    }
  });
});

// ------------------------------------------------- pair independence (P1)

/**
 * E0-PILOT-REPORT §7 P1: `pilot-h0` scheduled two pairs with different seeds
 * (213810451, 473919198) and played the identical game in both orientations.
 * Two engine arms are deterministic given position and budget and the hard
 * adapter's engine discards its seed (`src/ai/hard/engine.ts:215-217`), so
 * without `--openings` the seed reaches nothing and the pairs are copies.
 */
describe('lab/hard-ai/ladder/run pair independence', () => {
  const ENGINE_CLI = [
    '--a', 'hard@lab', '--b', 'aiv2-hard', '--work', 'wall:3000',
    '--handicaps', '0', '--pairs', '2', '--seed', '1', '--out', 'lab/results/unused',
  ];

  it('REFUSES two engine arms over more than one pair without --openings, citing the no-op seed and the pilot', () => {
    expect(() => parseArgs(ENGINE_CLI)).toThrow(/refusing 2 pairs of hard@lab vs aiv2-hard without --openings/);
    expect(() => parseArgs(ENGINE_CLI)).toThrow(/src\/ai\/hard\/engine\.ts:215-217/);
    expect(() => parseArgs(ENGINE_CLI)).toThrow(/E0-PILOT-REPORT\.md §7 P1/);
    expect(() => parseArgs(ENGINE_CLI)).toThrow(/--allow-initial-only/);
  });

  it('runs under --allow-initial-only and records openingsIndependent: false with a one-line warning', () => {
    const args = parseArgs([...ENGINE_CLI, '--allow-initial-only']);
    expect(args.allowInitialOnly).toBe(true);
    expect(openingsIndependent(args)).toBe(false);
    const warning = independenceWarning(args);
    expect(warning).toMatch(/openingsIndependent: false/);
    expect(warning).toMatch(/descriptive only/);
    expect(warning?.split('\n')).toHaveLength(1);

    const metrics = computeMetrics(args, [], []);
    expect(metrics.openingsIndependent).toBe(false);
    expect(metrics.independenceWarning).toBe(warning);
    const manifest = buildManifest(args, buildSchedule(args), []);
    expect(manifest.openingsIndependent).toBe(false);
    expect(manifest.independenceWarning).toBe(warning);
    expect(summaryMarkdown(metrics)).toContain('- openingsIndependent: false');
    expect(summaryMarkdown(metrics)).toContain('**WARNING**');
  });

  it('refuses nothing when the schedule has an independence source, or cannot have the fault', () => {
    // One scripted arm: its RNG is seeded per pair, which is the calib control.
    expect(pairIndependenceRefusal({ a: 'hard@lab', b: 'Rush', pairs: 8, openingsPath: null })).toBeNull();
    // One pair has nothing to duplicate.
    expect(pairIndependenceRefusal({ a: 'hard@lab', b: 'aiv2-hard', pairs: 1, openingsPath: null })).toBeNull();
    // An openings book gives the pairs distinct starting positions.
    expect(pairIndependenceRefusal({ a: 'hard@lab', b: 'aiv2-hard', pairs: 50, openingsPath: '/tmp/book.jsonl' })).toBeNull();
    const scripted = { a: 'hard@lab', b: 'Rush', pairs: 8, openingsPath: null, openings: [INITIAL_OPENING], handicaps: [0], allowOpeningReuse: false };
    expect(openingsIndependent(scripted)).toBe(true);
    expect(independenceWarning(scripted)).toBeNull();
  });

  it('runLadder refuses a hand-built CliArgs too, before it creates the run directory', async () => {
    const out = path.join(os.tmpdir(), `muju-ladder-refused-${process.pid}`);
    fs.rmSync(out, { recursive: true, force: true });
    await expect(runLadder(baseArgs({ a: 'hard@lab', b: 'aiv2-hard', pairs: 2, handicaps: [0], out }))).rejects.toThrow(
      /refusing 2 pairs/,
    );
    expect(fs.existsSync(out)).toBe(false);
  });
});

// ------------------------------------------------- distinct games (P1 check)

describe('lab/hard-ai/ladder/run distinctGames', () => {
  const args = baseArgs({ a: 'hard@lab', b: 'aiv2-hard', pairs: 2, handicaps: [0], allowInitialOnly: true });

  /** A replay whose unit ids embed a timestamp and a random suffix, as the real ones do. */
  function replay(tag: string, toX: number): { steps: unknown[] } {
    const unitId = `white_water_1_${Date.now()}_${tag}`;
    return {
      steps: [
        { ply: 0, turn: 1, player: 'white', phase: 'place', actionsRemaining: 2, action: null, units: [], cells: [0], res: {} },
        {
          ply: 1, turn: 1, player: 'white', phase: 'action', actionsRemaining: 1,
          action: { type: 'MOVE', unitId, to: { x: toX, y: 0 } },
          units: [{ o: 'white', d: 'water_1', x: toX, y: 0, dmg: 0 }], cells: [0], res: {},
        },
      ],
    };
  }

  function runWithReplays(dir: string, plays: Array<{ tag: string; toX: number }>): GameRow[] {
    const schedule = buildSchedule(args);
    fs.mkdirSync(path.join(dir, 'replays'), { recursive: true });
    return schedule.map((pair, i) => {
      const file = replayFileName(pair.pairId, 'A-white');
      fs.writeFileSync(path.join(dir, 'replays', file), JSON.stringify(replay(plays[i].tag, plays[i].toX)) + '\n');
      const row = gameRow({ pairId: pair.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1 });
      return { ...row, replayPath: path.posix.join('replays', file) };
    });
  }

  it('counts two replays of the same game as ONE distinct game, unit ids and their timestamps notwithstanding', () => {
    const out = tmpDir('distinct-same');
    try {
      const games = runWithReplays(out, [{ tag: 'aaaaa', toX: 2 }, { tag: 'zzzzz', toX: 2 }]);
      const distinct = computeDistinctGames({ ...args, out }, games);
      expect(distinct['A-white']).toBe(1);
      expect(distinct.ofPairs).toBe(2);
      expect(distinct.source).toBe('replay');
      expect(distinct.duplicates).toBe(true);

      const metrics = computeMetrics({ ...args, out }, games, []);
      expect(metrics.distinctGames['A-white']).toBe(1);
      expect(summaryMarkdown(metrics)).toContain('DUPLICATE OPENINGS');
      expect(summaryMarkdown(metrics)).toContain('distinctGames: A-white 1, B-white 0 of 2 pair(s)');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('counts two different games as two, and says nothing about duplicates', () => {
    const out = tmpDir('distinct-diff');
    try {
      const games = runWithReplays(out, [{ tag: 'aaaaa', toX: 2 }, { tag: 'zzzzz', toX: 3 }]);
      const distinct = computeDistinctGames({ ...args, out }, games);
      expect(distinct['A-white']).toBe(2);
      expect(distinct.duplicates).toBe(false);
      expect(summaryMarkdown(computeMetrics({ ...args, out }, games, []))).not.toContain('DUPLICATE OPENINGS');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('falls back to the games.jsonl tuple when there is no replay to read, and says which it used', () => {
    const schedule = buildSchedule(args);
    const games = schedule.map(p => gameRow({ pairId: p.pairId, orientation: 'A-white', handicap: 0, winner: 'white', whiteMs: 1, blackMs: 1 }));
    const distinct = computeDistinctGames({ ...args, replays: false }, games);
    expect(distinct.source).toBe('game-row');
    // Both fixture rows carry the same turns/plies/winType tuple.
    expect(distinct['A-white']).toBe(1);
    expect(distinct.duplicates).toBe(true);
    expect(summaryMarkdown(computeMetrics({ ...args, replays: false }, games, []))).toContain('turns/plies/winType tuple');
  });

  it('digests the moves, not the unit ids: the same play under different ids is one digest', () => {
    const steps = replay('aaaaa', 2).steps as Parameters<typeof canonicalGameDigest>[0];
    const other = replay('bbbbb', 2).steps as Parameters<typeof canonicalGameDigest>[0];
    expect(canonicalGameDigest(steps)).toBe(canonicalGameDigest(other));
    expect(canonicalGameDigest(steps)).not.toBe(canonicalGameDigest(replay('aaaaa', 3).steps as Parameters<typeof canonicalGameDigest>[0]));
  });
});

// ------------------------------------------------- overrun tolerance (P2, frozen by A14)

describe('lab/hard-ai/ladder/run overrun tolerance', () => {
  it('parses the three spec forms and refuses anything else', () => {
    expect(parseOverrunTolerance('10ms')).toEqual({ spec: '10ms', ms: 10, pct: 0, frozen: true });
    expect(parseOverrunTolerance('1%')).toEqual({ spec: '1%', ms: 0, pct: 1, frozen: true });
    expect(parseOverrunTolerance('max(10ms,1%)')).toEqual({ spec: 'max(10ms,1%)', ms: 10, pct: 1, frozen: true });
    expect(parseOverrunTolerance('max(1%, 10ms)').ms).toBe(10);
    expect(() => parseOverrunTolerance('10')).toThrow(/expected <ms>ms/);
    expect(() => parseOverrunTolerance('max(10ms,20ms)')).toThrow(/expected <ms>ms/);
    expect(() => parseOverrunTolerance('max(10ms)')).toThrow(/expected <ms>ms/);
    expect(() => parseOverrunTolerance('')).toThrow(/expected <ms>ms/);
  });

  it('resolves to the larger of the flat and the proportional part, and to nothing in fixed-work mode', () => {
    const t = parseOverrunTolerance('max(10ms,1%)');
    expect(toleranceMsFor(t, 3000)).toBe(30); // 1% of 3000 beats 10 ms
    expect(toleranceMsFor(t, 500)).toBe(10); // 1% of 500 does not
    expect(toleranceMsFor(t, null)).toBeNull();
  });

  it('defaults to the FROZEN max(10ms,1%) and honours --overrun-tolerance', () => {
    const cli = ['--a', 'Rush', '--b', 'Rush', '--work', 'wall:3000', '--handicaps', '0', '--pairs', '2', '--seed', '1', '--out', 'lab/results/unused'];
    expect(parseArgs(cli).overrunTolerance).toEqual({ spec: DEFAULT_OVERRUN_TOLERANCE_SPEC, ms: 10, pct: 1, frozen: true });
    expect(parseArgs([...cli, '--overrun-tolerance', '0ms']).overrunTolerance).toEqual({ spec: '0ms', ms: 0, pct: 0, frozen: true });
    expect(() => parseArgs([...cli, '--overrun-tolerance', 'soon'])).toThrow(/--overrun-tolerance "soon"/);
  });

  /**
   * The pilot's two cases (E0-PILOT-REPORT §7 P2): `aiv2-hard` landed 1-8 ms
   * past a 3000 ms budget on 44 of 44 turns; `hard@lab`'s worst turn was 4701
   * ms, 1.57x the same budget. Only the second is a responsiveness problem.
   */
  it('separates a few ms past the allowance from 1.57x it, and reports both counts', () => {
    const args = baseArgs({ a: 'aiv2-hard', b: 'hard@lab', pairs: 1, handicaps: [0], work: { mode: 'wall', ms: 3000 } });
    const [pair] = buildSchedule(args);
    const games = [
      gameRow({
        pairId: pair.pairId, orientation: 'A-white', handicap: 0, winner: 'white',
        whiteMs: 3005, blackMs: 4701, whiteTurnMs: [3005], blackTurnMs: [4701],
      }),
    ];
    const m = computeMetrics(args, games, []);
    expect(m.timing.a.toleranceMs).toBe(30);
    expect(m.timing.a.overAllowance).toBe(1); // 5 ms past 3000
    expect(m.timing.a.overruns).toBe(0); // inside the frozen tolerance
    expect(m.timing.b.overAllowance).toBe(1);
    expect(m.timing.b.overruns).toBe(1); // 1701 ms past it
    expect(m.overrunTolerance.frozen).toBe(true);

    // The value is frozen but re-derivable: a zero tolerance restores the raw count.
    const raw = computeMetrics({ ...args, overrunTolerance: parseOverrunTolerance('0ms') }, games, []);
    expect(raw.timing.a.overruns).toBe(1);
    expect(raw.timing.b.overruns).toBe(1);
  });

  it('prints the tolerance as frozen, citing AMENDMENTS-DECIDED A14, with every column', () => {
    const args = baseArgs({ a: 'aiv2-hard', b: 'hard@lab', pairs: 1, handicaps: [0], work: { mode: 'wall', ms: 3000 } });
    const summary = summaryMarkdown(computeMetrics(args, [], []));
    expect(summary).toContain('Tolerance: max(10ms,1%), frozen (AMENDMENTS-DECIDED A14)');
    expect(summary).not.toContain('AMENDMENTS-PENDING A14');
    expect(summary).toContain('| engine | turns | p95TurnMs | maxTurnMs | overAllowance | overruns | overrunRate | budgetExhausted | reSearches |');
  });
});

// ------------------------------------------------- summary Elo line

describe('lab/hard-ai/ladder/run summary Elo line', () => {
  function metricsOverPairScores(scores: readonly number[]): RunMetrics {
    const args = baseArgs({ pairs: scores.length, handicaps: [0] });
    const schedule = buildSchedule(args);
    return computeMetrics(args, [], schedule.map((p, i) => pairRow(p.pairId, p.pairIndex, 0, scores[i])));
  }

  it('marks a degenerate, regularized sample as descriptive only and prints n as pairs AND games', () => {
    const m = metricsOverPairScores([2, 2]); // the pilot's h0: every pair a clean sweep
    expect(m.eloDetail?.degenerate).toBe(true);
    expect(m.eloDetail?.regularized).toBe(true);
    const line = summaryMarkdown(m).split('\n').find(l => l.startsWith('- Elo (A vs B):'));
    expect(line).toContain('n = 2 pairs / 4 games');
    expect(line).toContain('(degenerate sample, regularized - descriptive only)');
  });

  it('prints no marker for a sample with real pair variance', () => {
    const m = metricsOverPairScores([2, 1, 0, 1, 2, 0]);
    expect(m.eloDetail?.degenerate).toBe(false);
    const line = summaryMarkdown(m).split('\n').find(l => l.startsWith('- Elo (A vs B):'));
    expect(line).toContain('n = 6 pairs / 12 games');
    expect(line).not.toContain('descriptive only');
  });
});

// ------------------------------------------------- manifest identity

describe('lab/hard-ai/ladder/run manifest baseline identity (E0.1)', () => {
  it('carries the four E0.1 tree hashes beside git and gitDirty', () => {
    const args = baseArgs({ a: 'Rush', b: 'Rush', pairs: 1, handicaps: [0] });
    const manifest = buildManifest(args, buildSchedule(args), []);
    const hashes = [manifest.baseline.ai, manifest.baseline.game, manifest.baseline.wasm, manifest.baseline.deps];
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Four hashes over four different inputs: none of them is a copy of another.
    expect(new Set(hashes).size).toBe(4);
    // The wasm hash is the same one the manifest already reported on its own.
    expect(manifest.baseline.wasm).toBe(manifest.wasmSha256);
    expect(manifest.git === null || /^[0-9a-f]{40}$/.test(manifest.git)).toBe(true);
    expect(typeof manifest.gitDirty === 'boolean' || manifest.gitDirty === null).toBe(true);
  });
});

// ------------------------------------------------- overrun-rate void (A14)

/**
 * AMENDMENTS-DECIDED A14: the tolerance is frozen at `max(10 ms, 1%)` and a
 * violation is not a footnote — each arm reports `overrunRate = overruns /
 * turns` and a rate ABOVE 5% for either arm voids the comparison row, exactly
 * as an adjudication rate above 1% already does.
 */
describe('lab/hard-ai/ladder/run overrun-rate void (A14)', () => {
  const WALL = { mode: 'wall', ms: 100 } as const; // tolerance = max(10ms, 1ms) = 10 ms, so > 110 ms overruns

  /** One pair, one A-white game: A's turns are the white array, B's the black one. */
  function metricsFor(aTurns: number[], bTurns: number[], over: Partial<CliArgs> = {}): RunMetrics {
    const args = baseArgs({ a: 'A', b: 'B', pairs: 1, handicaps: [0], work: WALL, ...over });
    const [pair] = buildSchedule(args);
    const games = [
      gameRow({
        pairId: pair.pairId, orientation: 'A-white', handicap: 0, winner: 'white',
        whiteMs: 1, blackMs: 1, whiteTurnMs: aTurns, blackTurnMs: bTurns,
      }),
    ];
    return computeMetrics(args, games, [pairRow(pair.pairId, pair.pairIndex, 0, 1)]);
  }

  /** `n` on-time turns plus `overruns` turns past the allowance + tolerance. */
  function turns(n: number, overruns: number): number[] {
    return [...Array<number>(n - overruns).fill(10), ...Array<number>(overruns).fill(999)];
  }

  it('computes overrunRate as overruns / turns for each arm', () => {
    const m = metricsFor(turns(8, 2), turns(4, 0));
    expect(m.timing.a.turns).toBe(8);
    expect(m.timing.a.overruns).toBe(2);
    expect(m.timing.a.overrunRate).toBe(0.25);
    expect(m.timing.b.overrunRate).toBe(0);
    // An arm with no per-turn record has no rate to report, rather than a zero.
    expect(metricsFor(turns(4, 0), []).timing.b.overrunRate).toBeNull();
  });

  it('VOIDS the run above 5%, naming the arm and the rate in metrics and summary.md', () => {
    const m = metricsFor(turns(19, 1), turns(19, 0)); // 1/19 = 5.26%
    expect(m.timing.a.overrunRate).toBeCloseTo(1 / 19, 12);
    expect(m.voided).toBe(true);
    expect(m.voidReason).toMatch(/timing\.a\.overrunRate 5\.26% \(1\/19 turns\) for arm a = A/);
    expect(m.voidReason).toMatch(/AMENDMENTS-DECIDED A14/);
    // No SPRT was requested, and the row is still VOID rather than silently null.
    expect(m.sprtSequential).toBeNull();
    expect(m.decision).toBe('void');
    const summary = summaryMarkdown(m);
    expect(summary).toContain('- **VOID** ');
    expect(summary).toContain('timing.a.overrunRate 5.26%');
    expect(summary).toContain('| A | 19 | 999 | 999 | 1 | 1 | 5.26% |');
  });

  it('does NOT void at exactly 5%: the bar is strictly above the threshold', () => {
    const m = metricsFor(turns(20, 1), turns(20, 0)); // 1/20 = 5% exactly
    expect(m.timing.a.overrunRate).toBe(OVERRUN_RATE_VOID_THRESHOLD);
    expect(m.voided).toBe(false);
    expect(m.voidReason).toBeNull();
    expect(m.decision).toBeNull();
    expect(overrunRateVoidReasons('A', 'B', m.timing)).toEqual([]);
  });

  it('reports no rate and can never void in fixed-work mode, which has no clock to overrun', () => {
    const m = metricsFor(turns(19, 19), turns(19, 19), { work: { mode: 'fixed', units: 1 } });
    expect(m.timing.a.overAllowance).toBe(0);
    expect(m.timing.a.overruns).toBe(0);
    expect(m.timing.a.overrunRate).toBeNull();
    expect(m.timing.b.overrunRate).toBeNull();
    expect(m.voided).toBe(false);
    expect(m.voidReason).toBeNull();
  });

  it('records an adjudication void the same way, and voids the decision with no SPRT', () => {
    const args = baseArgs({ a: 'A', b: 'B', pairs: 1, handicaps: [0] });
    const [pair] = buildSchedule(args);
    const adjudicated = {
      ...gameRow({ pairId: pair.pairId, orientation: 'A-white' as const, handicap: 0, winner: 'white' as const, whiteMs: 1, blackMs: 1 }),
      winType: 'adjudication' as const,
    };
    const m = computeMetrics(args, [adjudicated], []);
    expect(m.voided).toBe(true);
    expect(m.voidReason).toMatch(/adjudicationRate 100\.00% exceeds 1% \(SU addendum 2\)/);
    expect(m.decision).toBe('void');
    expect(summaryMarkdown(m)).toContain('**VOIDED** (> 1%, SU addendum 2)');
  });

  it('leaves the manifest void fields null until the run finishes', () => {
    const manifest = buildManifest(baseArgs({ a: 'Rush', b: 'Rush', pairs: 1, handicaps: [0] }), [], []);
    expect(manifest.status).toBe('running');
    expect(manifest.voided).toBeNull();
    expect(manifest.voidReason).toBeNull();
  });
});

// ------------------------------------------------- opening capacity (A15)

/**
 * AMENDMENTS-DECIDED A15: the independent cells of an engine-vs-engine schedule
 * are the (opening, handicap) pairs — `buildPairs` cycles handicaps fastest and
 * advances the opening once per sweep — so a run of more pairs than cells
 * replays a cell with nothing but a fresh seed, and neither engine reads the
 * seed (P1).
 */
describe('lab/hard-ai/ladder/run opening capacity guard (A15)', () => {
  // 16 rows of the frozen P1 dev book (see `writeP1Book`): the same size as the
  // E0 Standard book these counts were written around, which a Phasing run
  // refuses.
  const dir = tmpDir('capacity-book');
  const BOOK = writeP1Book(dir).path;
  const cli = (pairs: number, ...extra: string[]): string[] => [
    '--a', 'hard@lab', '--b', 'aiv2-hard', '--work', 'wall:3000',
    '--handicaps', '0,3', '--pairs', String(pairs), '--seed', '1',
    '--out', 'lab/results/unused', '--openings', BOOK, ...extra,
  ];

  it('REFUSES more pairs than openings x handicaps, citing P1 and the opt-out', () => {
    expect(() => parseArgs(cli(40))).toThrow(/refusing 40 pairs of hard@lab vs aiv2-hard over 16 opening\(s\) x 2 handicap\(s\) = 32/);
    expect(() => parseArgs(cli(40))).toThrow(/E0-PILOT-REPORT\.md §7 P1/);
    expect(() => parseArgs(cli(40))).toThrow(/src\/ai\/hard\/engine\.ts:215-217/);
    expect(() => parseArgs(cli(40))).toThrow(/--allow-opening-reuse/);
  });

  it('allows EXACTLY capacity, and records the pairs as independent', () => {
    const args = parseArgs(cli(32));
    expect(openingCapacity(args)).toBe(32);
    expect(openingCapacityRefusal(args)).toBeNull();
    expect(openingsIndependent(args)).toBe(true);
    expect(independenceWarning(args)).toBeNull();
  });

  it('runs under --allow-opening-reuse and records openingsIndependent: false with a one-line warning', () => {
    const args = parseArgs(cli(40, '--allow-opening-reuse'));
    expect(args.allowOpeningReuse).toBe(true);
    expect(openingsIndependent(args)).toBe(false);
    const warning = independenceWarning(args);
    expect(warning).toMatch(/openingsIndependent: false/);
    expect(warning).toMatch(/8 pair\(s\) replay a cell already scheduled/);
    expect(warning).toMatch(/descriptive only/);
    expect(warning?.split('\n')).toHaveLength(1);

    const metrics = computeMetrics(args, [], []);
    expect(metrics.openingsIndependent).toBe(false);
    expect(metrics.independenceWarning).toBe(warning);
    const manifest = buildManifest(args, [], []);
    expect(manifest.openingsIndependent).toBe(false);
    expect(manifest.independenceWarning).toBe(warning);
    expect(summaryMarkdown(metrics)).toContain('- openingsIndependent: false');
    expect(summaryMarkdown(metrics)).toContain('**WARNING**');
  });

  it('exempts a scripted arm, whose RNG IS seeded per pair, and the no-openings case', () => {
    const scripted = { a: 'Rush', b: 'Random', pairs: 99, openingsPath: BOOK, openings: [INITIAL_OPENING], handicaps: [0] };
    expect(openingCapacityRefusal(scripted)).toBeNull();
    expect(openingCapacityRefusal({ ...scripted, a: 'hard@lab' })).toBeNull(); // still one scripted arm
    // The no-openings schedule is `pairIndependenceRefusal`'s, with its own flag.
    expect(openingCapacityRefusal({ a: 'hard@lab', b: 'aiv2-hard', pairs: 99, openingsPath: null, openings: [INITIAL_OPENING], handicaps: [0] })).toBeNull();
    // ...and that refusal and its opt-out are untouched.
    const initialOnly = ['--a', 'hard@lab', '--b', 'aiv2-hard', '--work', 'wall:3000', '--handicaps', '0', '--pairs', '4', '--seed', '1', '--out', 'lab/results/unused'];
    expect(() => parseArgs(initialOnly)).toThrow(/without --openings/);
    expect(parseArgs([...initialOnly, '--allow-initial-only']).allowOpeningReuse).toBe(false);
  });

  it('counts each handicap once, so a hand-built duplicate cannot inflate the capacity', () => {
    const args = baseArgs({ handicaps: [0, 3, 0], openings: [INITIAL_OPENING, INITIAL_OPENING, INITIAL_OPENING] });
    expect(openingCapacity(args)).toBe(6);
  });

  /**
   * `pairing.ts#buildPairs` cycles the handicap list AS GIVEN, so `0,0` plays
   * every (opening, handicap) cell twice while `openingCapacity` — which counts
   * DISTINCT handicaps — sees nothing wrong. Refused at parse time instead.
   */
  it('REFUSES a repeated --handicaps entry, naming the value and A15', () => {
    const cli = (handicaps: string): string[] => [
      '--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', handicaps,
      '--pairs', '4', '--seed', '1', '--out', 'lab/results/unused',
    ];
    expect(() => parseArgs(cli('0,0'))).toThrow(/invalid --handicaps "0,0": 0 listed more than once/);
    expect(() => parseArgs(cli('0,0'))).toThrow(/AMENDMENTS-DECIDED A15; E0-PILOT-REPORT §7 P1/);
    expect(() => parseArgs(cli('0,3,0'))).toThrow(/invalid --handicaps "0,3,0": 0 listed more than once/);
    expect(() => parseArgs(cli('3,0,3,0'))).toThrow(/3, 0 listed more than once/);
    // The schedules that were always legal still parse.
    expect(parseArgs(cli('0,3')).handicaps).toEqual([0, 3]);
    expect(parseArgs(cli('0')).handicaps).toEqual([0]);
  });
});

// ------------------------------------------------- openings selection (A15)

describe('lab/hard-ai/ladder/run openings selection', () => {
  const dir = tmpDir('selection-book');
  const written = writeP1Book(dir);
  const BOOK = written.path;
  const FILE_IDS = written.ids;
  const [FIRST_ID, SECOND_ID] = FILE_IDS;
  const SIXTH_ID = FILE_IDS[5];
  const spec = (id: string): OpeningSpec => ({ id, actions: [] });
  const book = FILE_IDS.map(spec);

  it('drops the first n openings in FILE order, and keeps --openings-ids in the order named', () => {
    expect(selectOpenings(book, { skip: 2, ids: null }).map(o => o.id)).toEqual(FILE_IDS.slice(2));
    expect(selectOpenings(book, { skip: 0, ids: null }).map(o => o.id)).toEqual(FILE_IDS);
    expect(selectOpenings(book, { skip: null, ids: [SIXTH_ID, FIRST_ID] }).map(o => o.id)).toEqual([SIXTH_ID, FIRST_ID]);
    expect(selectOpenings(book, { skip: null, ids: null }).map(o => o.id)).toEqual(FILE_IDS);
  });

  it('refuses an unknown id, a repeated id, both flags at once, and a skip that empties the file', () => {
    expect(() => selectOpenings(book, { skip: null, ids: ['nope'] })).toThrow(/names "nope", which the openings file does not hold/);
    expect(() => selectOpenings(book, { skip: null, ids: [FIRST_ID, FIRST_ID] })).toThrow(/twice/);
    expect(() => selectOpenings(book, { skip: 1, ids: [FIRST_ID] })).toThrow(/mutually exclusive/);
    expect(() => selectOpenings(book, { skip: 16, ids: null })).toThrow(/drops every opening/);
  });

  it('parses --openings-skip and records it in the manifest, metrics and summary', () => {
    const args = parseArgs(['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '2', '--seed', '1', '--out', 'lab/results/unused', '--openings', BOOK, '--openings-skip', '2']);
    expect(args.openingsSkip).toBe(2);
    expect(args.openingsSelectedIds).toBeNull();
    expect(args.openings.map(o => o.id)).toEqual(FILE_IDS.slice(2));
    const manifest = buildManifest(args, [], []);
    expect(manifest.openings.ids).toEqual(FILE_IDS.slice(2));
    expect(manifest.openings.count).toBe(14);
    expect(manifest.openings.skip).toBe(2);
    expect(manifest.openings.selectedIds).toBeNull();
    // The sha256 is still the FILE's: the book did not change, the selection did.
    expect(manifest.openings.sha256).toBe(args.openingsSha256);
    const metrics = computeMetrics(args, [], []);
    expect(metrics.openingsSkip).toBe(2);
    expect(metrics.openings).toEqual(FILE_IDS.slice(2));
    expect(summaryMarkdown(metrics)).toContain('--openings-skip 2');
  });

  it('parses --openings-ids in the order given', () => {
    const args = parseArgs(['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '2', '--seed', '1', '--out', 'lab/results/unused', '--openings', BOOK, '--openings-ids', `${SIXTH_ID}, ${FIRST_ID}`]);
    expect(args.openingsSelectedIds).toEqual([SIXTH_ID, FIRST_ID]);
    expect(args.openings.map(o => o.id)).toEqual([SIXTH_ID, FIRST_ID]);
    expect(buildManifest(args, [], []).openings.selectedIds).toEqual([SIXTH_ID, FIRST_ID]);
    expect(computeMetrics(args, [], []).openingsSelectedIds).toEqual([SIXTH_ID, FIRST_ID]);
    expect(summaryMarkdown(computeMetrics(args, [], []))).toContain(`--openings-ids ${SIXTH_ID},${FIRST_ID}`);
  });

  it('refuses either flag without --openings, and both together', () => {
    const noBook = ['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '2', '--seed', '1', '--out', 'lab/results/unused'];
    expect(() => parseArgs([...noBook, '--openings-skip', '1'])).toThrow(/--openings-skip selects from an openings file/);
    expect(() => parseArgs([...noBook, '--openings-ids', FIRST_ID])).toThrow(/--openings-ids selects from an openings file/);
    expect(() => parseArgs([...noBook, '--openings', BOOK, '--openings-skip', '1', '--openings-ids', FIRST_ID])).toThrow(/mutually exclusive/);
    expect(() => parseArgs([...noBook, '--openings', BOOK, '--openings-skip', '-1'])).toThrow(/expected a non-negative integer/);
  });

  it('selects BEFORE the legal-by-replay validation: a skipped row is never replayed', () => {
    const dir = tmpDir('openings-skip');
    try {
      const file = path.join(dir, 'book.jsonl');
      const rows = [
        { id: 'p1-bad-row', actions: [{ type: 'MOVE', from: { x: 4, y: 4 }, to: { x: 4, y: 5 } }] },
        ...fs.readFileSync(BOOK, 'utf8').trim().split('\n').slice(0, 2).map(l => JSON.parse(l) as unknown),
      ];
      fs.writeFileSync(file, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
      const cli = ['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '2', '--seed', '1', '--out', dir, '--openings', file];
      expect(() => parseArgs(cli)).toThrow(/no unit stands on \(4, 4\)/);
      expect(parseArgs([...cli, '--openings-skip', '1']).openings.map(o => o.id)).toEqual([FIRST_ID, SECOND_ID]);
      expect(parseArgs([...cli, '--openings-ids', SECOND_ID]).openings.map(o => o.id)).toEqual([SECOND_ID]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('selects BEFORE the capacity guard, so the guard counts the openings the run will use', () => {
    const engineCli = (pairs: number, ...extra: string[]): string[] => [
      '--a', 'hard@lab', '--b', 'aiv2-hard', '--work', 'wall:3000', '--handicaps', '0',
      '--pairs', String(pairs), '--seed', '1', '--out', 'lab/results/unused', '--openings', BOOK, ...extra,
    ];
    // 16 openings would allow 16 pairs; skipping 2 leaves 14, and the guard says so.
    expect(parseArgs(engineCli(14, '--openings-skip', '2')).openings).toHaveLength(14);
    expect(() => parseArgs(engineCli(15, '--openings-skip', '2'))).toThrow(/over 14 opening\(s\) x 1 handicap\(s\) = 14/);
  });

  it('refuses a --resume whose selection differs, through the openings.ids comparison', () => {
    const base = ['--a', 'Rush', '--b', 'Rush', '--work', 'fixed:1', '--handicaps', '0', '--pairs', '2', '--seed', '1', '--out', 'lab/results/unused', '--openings', BOOK];
    const prior = buildManifest(parseArgs(base), [], []);
    expect(resumeIdentityMismatches(parseArgs(base), prior)).toEqual([]);
    const mismatches = resumeIdentityMismatches(parseArgs([...base, '--openings-skip', '2']), prior);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toMatch(/^openings\.ids: /);
    // A different --openings-ids selection is refused by the same comparison.
    expect(resumeIdentityMismatches(parseArgs([...base, '--openings-ids', `${FIRST_ID},${SECOND_ID}`]), prior)).toHaveLength(1);
  });
});

// ------------------------------------------------- openings used (A15)

/**
 * `args.openings` is the POOL; the schedule only reaches the front of it when
 * there are fewer pairs than `pool x handicaps`. E1.1 is the case that showed
 * it: 16 pairs over a 14-opening pool at two handicaps reach 8 openings, and
 * reporting 14 as "the openings this run used" overstates its variety.
 */
describe('lab/hard-ai/ladder/run openingsUsed', () => {
  const pool = Array.from({ length: 14 }, (_, i) => ({ id: `o${i}`, actions: [] }) as OpeningSpec);
  const args = baseArgs({
    a: 'A', b: 'B', pairs: 16, handicaps: [0, 3], openings: pool,
    openingsPath: '/tmp/book.jsonl', openingsSha256: 'f'.repeat(64), openingsSkip: 2,
  });

  it('lists the ids the schedule reaches, in first-use order, and nothing it never plays', () => {
    const used = openingsUsed(args);
    expect(used).toEqual(['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7']);
    // Exactly the openings the schedule names, with no repeats.
    expect(new Set(buildSchedule(args).map(p => p.openingId))).toEqual(new Set(used));
    // A schedule long enough to sweep the pool uses all of it.
    expect(openingsUsed({ ...args, pairs: 28 })).toHaveLength(14);
    // ...and one pair reaches exactly one opening.
    expect(openingsUsed({ ...args, pairs: 1 })).toEqual(['o0']);
  });

  it('records it in metrics and the manifest while `openings` stays the pool resume compares', () => {
    const metrics = computeMetrics(args, [], []);
    expect(metrics.openingsUsed).toEqual(['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7']);
    expect(metrics.openings).toHaveLength(14); // the pool, unchanged
    const manifest = buildManifest(args, buildSchedule(args), []);
    expect(manifest.openings.used).toEqual(metrics.openingsUsed);
    expect(manifest.openings.ids).toEqual(metrics.openings);
    expect(manifest.openings.count).toBe(14);
    // Resume identity still keys on the POOL: `used` is a report, not an identity.
    expect(resumeIdentityMismatches(args, manifest)).toEqual([]);
    expect(resumeIdentityMismatches({ ...args, pairs: 4 }, manifest).some(m => m.startsWith('openings.ids'))).toBe(false);
  });

  it('prints `used N of M` on the summary openings line and lists the USED ids, not the pool', () => {
    // E3.2-ROW-REPORT.md §10.5: rows #1 and #2 printed "used 16 of 32" and then
    // all 32 POOL ids, so a reader of `summary.md` alone over-counted the
    // independence width by a factor of two. The count and the list must agree.
    const line = summaryMarkdown(computeMetrics(args, [], [])).split('\n').find(l => l.startsWith('- openings:'))!;
    expect(line).toBeDefined();
    expect(line).toContain('- openings: used 8 of 14 — o0, o1, o2, o3, o4, o5, o6, o7 (sha256 ffffffffffff)');
    // The five pool ids the 16-pair schedule never reaches are not listed.
    for (const id of ['o8', 'o9', 'o10', 'o11', 'o12', 'o13']) expect(line).not.toContain(`${id},`);
    expect(line.split(' — ')[1].split(' (')[0].split(', ')).toEqual(computeMetrics(args, [], []).openingsUsed);
    // A schedule that sweeps the pool lists all of it, and the counts match.
    const swept = summaryMarkdown(computeMetrics({ ...args, pairs: 28 }, [], [])).split('\n').find(l => l.startsWith('- openings:'))!;
    expect(swept).toContain('- openings: used 14 of 14 — o0, ');
    expect(swept).toContain('o13 (sha256');
  });
});

// -------------------------------------- Gate 0 item 6: engine fallbacks VOID

/**
 * `docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md` Gate 0 item 6:
 *
 *   In every ladder game: 0 illegal actions, 0 replica divergences, 0 engine
 *   fallbacks (packError, engineError, divergence, invalidSuffix, emptyPlan,
 *   workerError). A fallback means the game was partly V2 vs V2.
 *
 * A correctness VETO, not a rate: one fallback is one turn of the row played by
 * an engine other than the one the row's name claims, so the bar is zero.
 *
 * The Hard engine cannot play Phasing yet (its rules replica is being ported),
 * so the counters cannot be exercised end to end through `hard@*` here. They
 * are exercised the two ways that ARE available: a unit test that injects the
 * counts a game recorded (below), and the scripted/`aiv2` end-to-end runs above,
 * which record a clean vector on every row.
 */
describe('lab/hard-ai/ladder/run engine fallbacks (Gate 0 item 6)', () => {
  type RowOver = Partial<Parameters<typeof gameRow>[0]>;
  function metricsWith(rows: RowOver[]): RunMetrics {
    const args = baseArgs({ a: 'A', b: 'B', pairs: 1, handicaps: [0] });
    const [pair] = buildSchedule(args);
    const games = rows.map(r =>
      gameRow({ pairId: pair.pairId, orientation: 'A-white' as const, handicap: 0, winner: 'white' as const, whiteMs: 1, blackMs: 1, ...r }),
    );
    return computeMetrics(args, games, [pairRow(pair.pairId, pair.pairIndex, 0, 1)]);
  }

  it('sums the six kinds per run and reports a clean row as measured zero, not as unknown', () => {
    const m = metricsWith([{}, {}]);
    expect(m.fallbacks).toEqual(emptyFallbackCounts());
    expect(m.fallbackTotal).toBe(0);
    expect(m.fallbacksRecorded).toBe(true);
    expect(m.voided).toBe(false);
    expect(m.voidReason).toBeNull();
    const summary = summaryMarkdown(m);
    expect(summary).toContain('- engine fallbacks (Gate 0 item 6, must be 0): 0 total');
    for (const kind of FALLBACK_KINDS) expect(summary).toContain(`${kind} 0`);
  });

  it('VOIDS the row on ANY fallback, names the kind, and sums across games', () => {
    const m = metricsWith([
      { fallbacks: { ...emptyFallbackCounts(), packError: 1, emptyPlan: 2 } },
      { fallbacks: { ...emptyFallbackCounts(), emptyPlan: 3, workerError: 1 } },
    ]);
    expect(m.fallbacks.packError).toBe(1);
    expect(m.fallbacks.emptyPlan).toBe(5);
    expect(m.fallbacks.workerError).toBe(1);
    expect(m.fallbackTotal).toBe(7);
    expect(m.voided).toBe(true);
    expect(m.voidReason).toMatch(/engine fallbacks 7 \(packError=1, emptyPlan=5, workerError=1\)/);
    expect(m.voidReason).toMatch(/Gate 0 item 6/);
    expect(m.voidReason).toMatch(/partly V2 vs V2/);
    expect(m.decision).toBe('void');
    const summary = summaryMarkdown(m);
    expect(summary).toContain('- **VOID** ');
    expect(summary).toContain('7 total — packError=1, emptyPlan=5, workerError=1');
    expect(summary).toContain('packError 1, engineError 0, divergence 0, invalidSuffix 0, emptyPlan 5, workerError 1');
  });

  it('VOIDS on one fallback of every single kind, so no kind is silently exempt', () => {
    for (const kind of FALLBACK_KINDS) {
      const m = metricsWith([{ fallbacks: { ...emptyFallbackCounts(), [kind]: 1 } }]);
      expect(m.fallbackTotal, kind).toBe(1);
      expect(m.voided, kind).toBe(true);
      expect(m.voidReason, kind).toContain(`${kind}=1`);
    }
  });

  it('VOIDS on an illegal action and on a replica divergence, which the same clause vetoes', () => {
    const illegal = metricsWith([{ whiteIllegalActions: 1 }]);
    expect(illegal.illegalActions).toBe(1);
    expect(illegal.voided).toBe(true);
    expect(illegal.voidReason).toMatch(/illegalActions 1 exceeds the 0 the preregistration requires/);

    const diverged = metricsWith([{ anomalies: ['hard-replica-divergence'] }]);
    expect(diverged.replicaDivergences).toBe(1);
    expect(diverged.voided).toBe(true);
    expect(diverged.voidReason).toMatch(/replicaDivergences 1 exceeds the 0/);
    expect(diverged.voidReason).toMatch(/fell back to the V2 path/);
  });

  /**
   * The registry the ladder-side adapters report through, and the
   * snapshot-and-subtract `worker.ts` does around every game. The counters are
   * process-wide and monotonic (like `hardBotDivergences()` and the browser's
   * `__mujuHardDiag`), because games run sequentially inside a shard.
   */
  it('deltas the process-wide registry per game, and sums rather than merges the sources', () => {
    resetLadderFallbackCounts();
    try {
      expect(ladderFallbackCounts()).toEqual(emptyFallbackCounts());
      const before = ladderFallbackCounts();
      noteLadderFallback('emptyPlan');
      noteLadderFallback('emptyPlan');
      noteLadderFallback('workerError');
      const afterFirstGame = ladderFallbackCounts();
      const first = fallbackCountsDelta(afterFirstGame, before);
      expect(first.emptyPlan).toBe(2);
      expect(first.workerError).toBe(1);
      expect(first.packError).toBe(0);
      // The next game's delta starts from where the last one ended, so nothing
      // is double-counted and nothing is lost.
      noteLadderFallback('packError');
      const second = fallbackCountsDelta(ladderFallbackCounts(), afterFirstGame);
      expect(second).toEqual({ ...emptyFallbackCounts(), packError: 1 });
      // `worker.ts` adds the hard adapter's own divergence and empty-plan counts
      // to the registry delta rather than replacing them: an empty plan on a v2
      // seat and one on a hard seat are two different turns that fell back.
      const combined = { ...second };
      combined.divergence += 3;
      combined.emptyPlan += 1;
      expect(fallbackTotal(combined)).toBe(5);
      expect(describeFallbacks(combined)).toBe('packError=1, divergence=3, emptyPlan=1');
      expect(describeFallbacks(emptyFallbackCounts())).toBe('');
      expect(fallbackTotal(undefined)).toBe(0);
    } finally {
      resetLadderFallbackCounts();
    }
  });

  it('VOIDS a run whose rows never recorded the counters, rather than passing the gate on six absent zeros', () => {
    const m = metricsWith([{ fallbacks: null }]);
    expect(m.fallbacksRecorded).toBe(false);
    expect(m.fallbackTotal).toBe(0);
    expect(m.voided).toBe(true);
    expect(m.voidReason).toMatch(/engine fallbacks were NOT recorded by any game in this run/);
    expect(summaryMarkdown(m)).toContain('NOT RECORDED');
    // An EMPTY run is not void for this reason: there is no game to have
    // recorded anything, and `status`/`pairsCompleted` already say so.
    expect(gate0VoidReasons({ illegalActions: 0, replicaDivergences: 0, fallbacks: emptyFallbackCounts(), recorded: false, games: 0 })).toEqual([]);
  });
});
