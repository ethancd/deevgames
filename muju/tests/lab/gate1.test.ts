// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { phaseEndAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import { defaultUpkeepAction } from '../../src/game/upkeep';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { createGateBot, workSlice, type GateBudgets, type Searcher } from '../../lab/ai/gate1-bot';
import {
  cellIndex, schedule, seatSeedFor, seedFor, summarize,
  AMENDMENT, FULL_PAIRS, MIN_DISTINCT_FRACTION, SEEDS, type Entry, type Mode,
} from '../../lab/ai/gate1-report';
import { loadGate1Book, gate1StartState, scheduleOpenings } from '../../lab/ai/gate1-openings';
import { adoptedProtocol, mergeRow, parseArgs, resolvedConfigs, runTask } from '../../lab/ai/gate1';
import { runShardGames, type RowIdentity } from '../../lab/ai/gate1-shard';
import { DEFAULT_MATCH_OPTIONS, type GameRecord } from '../../lab/harness/types';

let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });
const book = loadGate1Book();
const openings = scheduleOpenings(book);
const openingIds = book.openings.map(o => o.id);
const initial = () => gate1StartState(book.openings[0], 0);
const bands = JSON.parse(readFileSync('lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json', 'utf8'));
/** Small enough to keep the suite quick; the row's budgets come from a calibration. */
const TEST_BUDGETS: GateBudgets = { hard: 400, medium: 200 };

/** One synthetic game per scheduled task, each with its own distinct game hash. */
function synthetic(mode: Mode): Entry[] {
  return schedule(mode, openings).map(task => ({
    task, identityHash: 'identity',
    gameSha256: createHash('sha256').update(task.id).digest('hex'),
    record: {
      ...({} as GameRecord), rulesVersion: 'muju-phasing-1', seed: task.seed, handicap: task.handicap,
      winner: task.hardSeat, completedTurns: 20, winType: 'home-checkmate',
      options: { ...DEFAULT_MATCH_OPTIONS }, anomalies: [], invariantViolation: null,
      adjudicated: false, inactivityDraw: false,
      players: Object.fromEntries((['white', 'black'] as const).map(seat => [seat, {
        bot: seat === task.hardSeat ? 'aiv2-hard' : task.opponent, illegalActions: 0, unitsPlaced: 10,
      }])) as GameRecord['players'],
    },
  }));
}

describe('allocation and reporting', () => {
  it('fixes 16 pilot and 768 full games, one distinct dev opening per pair', () => {
    expect(AMENDMENT).toBe('A3');
    expect(SEEDS).toEqual({ full: 20260960, pilot: 20260961 });
    expect(FULL_PAIRS).toBe(48);
    expect(schedule('pilot', openings)).toHaveLength(16);
    const full = schedule('full', openings);
    expect(full).toHaveLength(768);
    expect(new Set(full.map(t => t.id)).size).toBe(768);
    for (let i = 0; i < full.length; i += 2) {
      expect(full[i].seed).toBe(full[i + 1].seed);
      expect(full[i].pairId).toBe(full[i + 1].pairId);
      expect(full[i].openingId).toBe(full[i + 1].openingId); // a pair mirrors seats, not positions
      expect([full[i].hardSeat, full[i + 1].hardSeat]).toEqual(['white', 'black']);
    }
    expect(new Set(full.map(t => t.seed)).size).toBe(384);
    // A3 §1: every pair of a cell starts from its own opening, taken in file order.
    for (const opponent of ['Rush', 'Expand', 'Balanced', 'aiv2-medium']) for (const handicap of [0, 3]) {
      const cell = full.filter(t => t.opponent === opponent && t.handicap === handicap);
      expect(cell.map(t => t.openingId)).toEqual(openingIds.flatMap(id => [id, id]));
    }
    expect(schedule('pilot', openings).some(t => full.some(f => f.seed === t.seed))).toBe(false);
    // A row can never be scheduled against a book that is too small or repeats a row.
    expect(() => schedule('full', openings.slice(0, 47))).toThrow();
    expect(() => schedule('full', openings.map(() => openings[0]))).toThrow();
    // Nor against one whose rows carry no start-position hash: a game is keyed
    // by the POSITION it starts from, so an unhashed opening cannot be played.
    expect(() => schedule('full', openings.map(o => ({ id: o.id, starts: {} })))).toThrow(/start-position hash/);
    // Every task names the start hash its opening reaches at ITS handicap.
    for (const task of full) expect(task.startSha256).toBe(book.startSha256(task.openingId, task.handicap));
  });

  it('derives every seed from (row seed, cell, pair) alone, so shard layout cannot move one', () => {
    const full = schedule('full', openings);
    for (const task of full) {
      expect(task.seed).toBe(seedFor('full', task.opponent, task.handicap, task.pair));
      // Constant in the seat by design: a pair is a seat MIRROR of one position.
      // The harness splits the pair seed per seat itself (`runner.ts`).
      expect(seatSeedFor('full', task.opponent, task.handicap, task.pair, 'white'))
        .not.toBe(seatSeedFor('full', task.opponent, task.handicap, task.pair, 'black'));
    }
    expect(seedFor('full', 'Rush', 0, 0)).not.toBe(seedFor('pilot', 'Rush', 0, 0));
    expect(cellIndex('Rush', 0)).toBe(0);
    expect(cellIndex('aiv2-medium', 3)).toBe(7);
    expect(() => seedFor('full', 'Rush', 0, FULL_PAIRS)).toThrow();
  });

  it('passes A3 full evidence with unchanged A1 acceptance and never passes a pilot', () => {
    const full = summarize(synthetic('full'), 'full', 'identity', bands, openings);
    expect(full.errors).toEqual([]);
    expect(full.gate1).toBe('passed');
    expect(full.amendment).toBe('A3');
    expect(full.invalidCells).toEqual([]);
    expect(full.rows.every(r => r.strengthMet)).toBe(true);
    expect(full.rows.every(r => r.distinctGames === r.games && r.distinctPairs === r.pairs)).toBe(true);
    expect(summarize(synthetic('pilot'), 'pilot', 'identity', bands, openings).gate1).toBe('pilot-ineligible');
    expect(adoptedProtocol().amendment).toMatchObject({
      id: 'A3', commit: 'a0551c8c274bfdebb32ca309e49fd7a98657de73',
      sha256: '8242433d727638abf41b1006b9fcff645564200b92eadc9bbc887eb2b72f60f4',
    });
  });

  it('reports a Rush loss without gating strength, but gates every other opponent and handicap', () => {
    const entries = synthetic('full');
    for (const e of entries.filter(e => e.task.opponent === 'Rush')) {
      e.record.winner = e.task.hardSeat === 'white' ? 'black' : 'white';
    }
    const report = summarize(entries, 'full', 'identity', bands, openings);
    expect(report.gate1).toBe('passed');
    expect(report.rows.filter(r => r.opponent === 'Rush').every(r => !r.strengthGated && !r.strengthMet)).toBe(true);
    for (const opponent of ['Expand', 'Balanced', 'aiv2-medium']) for (const handicap of [0, 3]) {
      const failed = structuredClone(entries);
      for (const e of failed.filter(e => e.task.opponent === opponent && e.task.handicap === handicap)) e.record.winner = null;
      expect(summarize(failed, 'full', 'identity', bands, openings).gate1).toBe('failed');
    }
  });

  it('requires an interval excluding zero, not only a positive score', () => {
    const entries = synthetic('full');
    const cell = entries.filter(e => e.task.opponent === 'Expand' && e.task.handicap === 0);
    cell.forEach((e, i) => { if (i >= 50) e.record.winner = e.task.hardSeat === 'white' ? 'black' : 'white'; });
    const report = summarize(entries, 'full', 'identity', bands, openings);
    const row = report.rows.find(r => r.opponent === 'Expand' && r.handicap === 0)!;
    expect(row.elo.muRaw).toBeGreaterThan(0.5);
    expect(row.elo.eloLo).toBeLessThan(0);
    expect(report.gate1).toBe('failed');
  });

  it.each(['Rush', 'Expand', 'Balanced', 'aiv2-medium'])('requires a purchase after ten completed turns vs %s', opponent => {
    const entries = synthetic('full');
    const game = entries.find(e => e.task.opponent === opponent && e.task.hardSeat === 'black')!;
    game.record.players.black.unitsPlaced = 0;
    game.record.completedTurns = 10;
    expect(summarize(entries, 'full', 'identity', bands, openings).gate1).toBe('passed');
    game.record.completedTurns = 11;
    const failed = summarize(entries, 'full', 'identity', bands, openings);
    expect(failed.gate1).toBe('failed');
    expect(failed.rows.flatMap(r => r.mustBuyFailures)).toEqual([game.task.id]);
    game.record.players.black.unitsPlaced = 1;
    expect(summarize(entries, 'full', 'identity', bands, openings).gate1).toBe('passed');
  });

  it('keeps the historical zero-buy failure visible but rejects A1/A2 evidence as an A3 row', () => {
    const entries = readFileSync('lab/ai/results/t2b-gate1-pilot-2026-09-19/games.jsonl', 'utf8')
      .trim().split('\n').map(line => JSON.parse(line)) as Entry[];
    const report = summarize(entries, 'pilot', entries[0].identityHash, bands, openings);
    expect(report.gate1).toBe('invalid');
    expect(report.criteriaMet).toBe(false);
    // Those games were played from the canonical initial position with no opening
    // and no game hash, so they fail the schedule AND the effective-sample rule.
    expect(report.errors.filter(e => e.startsWith('Schedule mismatch ')).length).toBe(entries.length);
    expect(report.errors.filter(e => e.startsWith('Missing game hash ')).length).toBe(entries.length);
    expect(report.rows.flatMap(r => r.mustBuyFailures)).toEqual(['Rush-h0-p0-black']);
  });

  it.each(['purchases', 'inactivity', 'adjudication'])('still gates Rush %s behavior', field => {
    const entries = synthetic('full');
    for (const e of entries.filter(e => e.task.opponent === 'Rush' && e.task.handicap === 3)) {
      if (field === 'purchases') e.record.players[e.task.hardSeat].unitsPlaced = 1;
      if (field === 'inactivity') e.record.inactivityDraw = true;
      if (field === 'adjudication') e.record.adjudicated = true;
    }
    expect(summarize(entries, 'full', 'identity', bands, openings).gate1).toBe('failed');
  });

  it.each(['missing', 'duplicate', 'identity', 'seed', 'seat', 'illegal', 'invariant', 'anomaly', 'turns', 'buys', 'hash'] as const)
  ('voids a row with %s evidence', kind => {
    const entries = synthetic('pilot');
    if (kind === 'missing') entries.pop();
    if (kind === 'duplicate') entries.push(entries[0]);
    if (kind === 'identity') entries[0].identityHash = 'other';
    if (kind === 'seed') entries[0].record.seed++;
    if (kind === 'seat') entries[0].record.players.white.bot = 'aiv2-medium';
    if (kind === 'illegal') entries[0].record.players.black.illegalActions++;
    if (kind === 'invariant') entries[0].record.invariantViolation = 'bad';
    if (kind === 'turns') entries[0].record.completedTurns = NaN;
    if (kind === 'buys') entries[0].record.players.white.unitsPlaced = -1;
    if (kind === 'anomaly') entries[0].record.anomalies.push('no-op');
    if (kind === 'hash') entries[0].gameSha256 = 'not-a-hash';
    expect(summarize(entries, 'pilot', 'identity', bands, openings).gate1).toBe('invalid');
  });

  it('checks purchase, inactivity, adjudication and score per handicap, not pooled', () => {
    const entries = synthetic('full');
    for (const e of entries.filter(e => e.task.opponent === 'Rush' && e.task.handicap === 3)) {
      e.record.players[e.task.hardSeat].unitsPlaced = 0;
      e.record.inactivityDraw = true; e.record.winner = null; e.record.adjudicated = true;
    }
    const rows = summarize(entries, 'full', 'identity', bands, openings).rows;
    expect(rows[0].behavioralBandsMet).toBe(true);
    expect(rows[1].behavioralBandsMet).toBe(false);
    expect(rows[1].strengthMet).toBe(false);
    expect(rows[1].adjudicationMet).toBe(false);
    expect(rows[1].elo.n).toBe(48); // Distinct pair, not game, is the sampling unit.
    expect(rows[6].behavioralBandsMet).toBeNull();
  });

  it('rejects ambiguous CLI options, demands a calibration for a run and refuses any other book', () => {
    const ok = ['--out', 'x', '--calibration', 'c.json'];
    expect(parseArgs(['--plan']).mode).toBe('pilot'); // a plan may be printed without a calibration
    expect(parseArgs(ok).calibration).toBe('c.json');
    for (const args of [[], ['--mode', 'wall'], ['--out'], ['--plan', '--plan'], ['--pairs', '2'],
      ['--out', 'x'], [...ok, '--calibration', 'd.json'], [...ok, '--book']]) {
      expect(() => parseArgs(args)).toThrow();
    }
    expect(parseArgs([...ok, '--book', 'lab/hard-ai/ladder/openings/p1-val.jsonl']).book)
      .toBe('lab/hard-ai/ladder/openings/p1-val.jsonl'); // parsed, then refused by the loader
    expect(() => loadGate1Book('lab/hard-ai/ladder/openings/p1-val.jsonl')).toThrow(/p1-dev\.jsonl only/);
  });

  it('parses the shard, merge and accept-calibration options, and refuses nonsense combinations', () => {
    const full = ['--mode', 'full', '--out', 'x', '--calibration', 'c.json'];
    expect(parseArgs(full).shard).toEqual({ index: 1, count: 1 });
    expect(parseArgs([...full, '--shard', '3/8']).shard).toEqual({ index: 3, count: 8 });
    expect(parseArgs(full).acceptLoadedCalibration).toBe(false);
    expect(parseArgs([...full, '--accept-loaded-calibration']).acceptLoadedCalibration).toBe(true);
    expect(parseArgs(['--merge', 'dir', '--mode', 'full']).merge).toBe('dir');
    for (const args of [
      [...full, '--shard', '9/8'], [...full, '--shard', '0/8'], [...full, '--shard', '8'],
      [...full, '--shard', '1/0'], [...full, '--shard'],
      ['--mode', 'pilot', '--out', 'x', '--calibration', 'c.json', '--shard', '2/2'], // a pilot is one process
      ['--merge', 'dir', '--out', 'x'], ['--merge', 'dir', '--plan'], ['--merge'],
    ]) {
      expect(() => parseArgs(args), args.join(' ')).toThrow();
    }
  });
});

/**
 * The frozen dev book holds 48 ids and 47 start positions, so a full cell holds
 * at most 47 independent pairs. The report has to SAY so, and has to count the
 * transposing pair once when the engines play it the same way twice.
 */
describe('transposing openings in a row (A3 §1 + §2)', () => {
  const [A, B] = ['p1-g5-s245', 'p1-g3-s3'];

  it('states the book\'s 47-of-48 in the report header', () => {
    const report = summarize(synthetic('full'), 'full', 'identity', bands, openings);
    expect(report.bookStartPositions.openings).toBe(48);
    for (const h of report.bookStartPositions.perHandicap) {
      expect(h.distinctStartPositions).toBe(47);
      expect(h.collisions).toEqual([{ sha256: book.startSha256(A, h.handicap), openingIds: [A, B] }]);
    }
    expect(report.bookStartPositions.note).toMatch(/h0 47\/48, h3 47\/48/);
    expect(report.bookStartPositions.note).toContain(`{${A} = ${B}}`);
    // Every cell plays 48 pairs from 47 positions; nothing is dropped.
    for (const row of report.rows) {
      expect(row.pairs).toBe(48);
      expect(row.plannedStartPositions).toBe(47);
    }
  });

  it('counts the transposing pair once when the two games come out identical', () => {
    const entries = synthetic('full');
    const cell = entries.filter(e => e.task.opponent === 'aiv2-medium' && e.task.handicap === 0);
    const a = cell.filter(e => e.task.openingId === A), b = cell.filter(e => e.task.openingId === B);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(a[0].task.startSha256).toBe(b[0].task.startSha256); // one position, two ids
    // A deterministic engine at a fixed budget plays one position one way, so
    // the two pairs are one game record twice. `gate1-trace.ts` now hashes them
    // the same; the id-keyed digest it replaced could not.
    for (const seat of ['white', 'black'] as const) {
      const from = a.find(e => e.task.hardSeat === seat)!, onto = b.find(e => e.task.hardSeat === seat)!;
      onto.gameSha256 = from.gameSha256;
      onto.record.winner = from.record.winner;
    }
    const row = summarize(entries, 'full', 'identity', bands, openings)
      .rows.find(r => r.opponent === 'aiv2-medium' && r.handicap === 0)!;
    expect(row.games).toBe(96);
    expect(row.openings).toBe(48);            // 48 book rows were played
    expect(row.distinctStartPositions).toBe(47); // from 47 positions
    expect(row.distinctGames).toBe(94);       // two of the games were the same game
    expect(row.distinctPairs).toBe(47);       // and two of the pairs were the same pair
    expect(row.effectiveN).toBe(47);
    expect(row.elo.n).toBe(47);               // the interval is computed over 47
    // 94/96 is still comfortably above the 90% floor, so the cell stays valid:
    // a book with one transposition is usable, it is just not 48 wide.
    expect(row.cellValid).toBe(true);
  });
});

describe('effective sample size (preregistration A3 §2)', () => {
  /** Replays one cell's games onto `count` of its entries, as A2's medium cells were. */
  function replicate(entries: Entry[], opponent: string, handicap: number, count: number) {
    const cell = entries.filter(e => e.task.opponent === opponent && e.task.handicap === handicap);
    const [white, black] = [cell[0].gameSha256, cell[1].gameSha256];
    cell.slice(0, count).forEach((e, i) => { e.gameSha256 = i % 2 ? black : white; });
    return cell;
  }

  it('marks a replicated cell INVALID, and an INVALID gating cell can neither pass nor fail', () => {
    const entries = synthetic('full');
    replicate(entries, 'Balanced', 0, 96); // one pair, 48 times: A2's failure mode exactly
    const report = summarize(entries, 'full', 'identity', bands, openings);
    const row = report.rows.find(r => r.opponent === 'Balanced' && r.handicap === 0)!;
    expect(row.games).toBe(96);
    expect(row.distinctGames).toBe(2);
    expect(row.distinctPairs).toBe(1);
    expect(row.cellValid).toBe(false);
    expect(row.strengthMet).toBeNull(); // not measured: neither a pass nor a failure
    expect(report.invalidGatingCells).toEqual(['Balanced-h0']);
    expect(report.criteriaMet).toBe(false);
    expect(report.gate1).toBe('not-measured');
    expect(report.errors).toEqual([]); // the evidence is sound; it just carries no information
  });

  it('never narrows an interval with replication: n counts distinct pairs', () => {
    const clean = summarize(synthetic('full'), 'full', 'identity', bands, openings)
      .rows.find(r => r.opponent === 'Balanced' && r.handicap === 3)!;
    const entries = synthetic('full');
    replicate(entries, 'Balanced', 3, 96);
    const replicated = summarize(entries, 'full', 'identity', bands, openings)
      .rows.find(r => r.opponent === 'Balanced' && r.handicap === 3)!;
    expect(clean.elo.n).toBe(48);
    expect(replicated.elo.n).toBe(1);
    expect(replicated.elo.eloLo).toBeLessThanOrEqual(clean.elo.eloLo);
  });

  it('holds a cell valid at exactly the 90% threshold and invalid one game below it', () => {
    expect(MIN_DISTINCT_FRACTION).toBe(0.9);
    for (const [duplicates, valid] of [[9, true], [10, false]] as const) {
      const entries = synthetic('full');
      const cell = entries.filter(e => e.task.opponent === 'Expand' && e.task.handicap === 0);
      for (let i = 1; i <= duplicates; i++) cell[i].gameSha256 = cell[0].gameSha256;
      const row = summarize(entries, 'full', 'identity', bands, openings)
        .rows.find(r => r.opponent === 'Expand' && r.handicap === 0)!;
      expect(row.distinctGames).toBe(96 - duplicates);
      expect(row.cellValid).toBe(valid);
    }
  });

  it('still fails a row whose behaviour is wrong, even where a cell is INVALID', () => {
    const entries = synthetic('full');
    replicate(entries, 'Balanced', 0, 96);
    for (const e of entries.filter(e => e.task.opponent === 'Expand' && e.task.handicap === 3)) {
      e.record.players[e.task.hardSeat].unitsPlaced = 0;
      e.record.completedTurns = 30;
    }
    const report = summarize(entries, 'full', 'identity', bands, openings);
    expect(report.gate1).toBe('failed'); // a real failure outranks a missing measurement
    expect(report.invalidGatingCells).toEqual(['Balanced-h0']);
  });
});

describe('fixed-work adapter', () => {
  function fake() {
    const requests: number[] = [], deadlines: number[] = [];
    const engine: Searcher = {
      setSeed() {}, setTacticalSolver() {},
      setConfig(c) { requests.push(c.fixedWork!); },
      async findBestAction(state, deadline) {
        deadlines.push(deadline!);
        return { plan: { actions: [state.upkeepPending ? defaultUpkeepAction(state) : phaseEndAction(state)], score: 0 },
          nodesSearched: 0, timeMs: 999999, depth: 0,
          debug: { planCount: 1, topPlans: [], config: {
            mctsIterations: 1200, mctsTimeLimit: 3000, beamWidth: 50, outputPlans: 20, tacticalDepth: 2,
          } } };
      },
    };
    return { engine, requests, deadlines };
  }
  it('shares allowance across phases, reserves Prepare, and never calls wall mode on exhaustion', async () => {
    const f = fake(), seat = createGateBot('hard', solver, 7, () => f.engine);
    seat.bot.onGameStart('black', 1);
    let state = initial();
    const first = await seat.bot.nextAction(state, 'black');
    state = applyAction(state, first!);
    expect(state.turn.phase).toBe('place');
    await seat.bot.nextAction(state, 'black');
    expect(f.requests).toEqual([1, 3]); // No phase reset to 7.
    for (let i = 0; i < 10; i++) await seat.bot.nextAction(state, 'black');
    expect(f.requests.reduce((a, b) => a + b, 0)).toBe(7);
    expect(f.requests.every(n => n > 0)).toBe(true);
    expect(f.deadlines.every(n => n === Infinity)).toBe(true);
    expect(seat.decisions.at(-1)?.stopReason).toBe('allowance-completion');
    state.turn.turnNumber++;
    await seat.bot.nextAction(state, 'black');
    expect(f.requests.at(-1)).toBe(3); // Actual next turn resets the allowance.
  });
  it('allocates upkeep before interpreting the phase and rejects invalid budgets or states', async () => {
    const state = initial();
    state.upkeepPending = true;
    expect(workSlice(state, 12)).toBe(4);
    for (const n of [0, -1, 1.5, Infinity]) expect(() => createGateBot('hard', solver, n as number)).toThrow();
    const seat = createGateBot('hard', solver, TEST_BUDGETS.hard);
    seat.bot.onGameStart('black', 1);
    state.ruleset = 'standard';
    await expect(seat.bot.nextAction(state, 'black')).rejects.toThrow('Phasing');
  });
  it.each(['empty', 'illegal', 'throw', 'deadline'] as const)('fails closed on %s engine output', async kind => {
    const f = fake();
    f.engine.findBestAction = async () => {
      if (kind === 'throw') throw new Error('engine crashed');
      return { plan: { actions: kind === 'empty' ? [] : [{ type: 'END_PLACE_PHASE' }], score: 0 },
        nodesSearched: 0, timeMs: 0, depth: 0,
        debug: { planCount: 0, topPlans: [], config: { mctsIterations: 0, mctsTimeLimit: 0, beamWidth: 0, outputPlans: 0, tacticalDepth: 0 } },
        ...(kind === 'deadline' ? { stats: { iterations: 0, candidates: 0, simulations: 0, evaluations: 0,
          tacticalNodes: 0, turnBoundaries: 0, elapsedMs: 0, stopReason: 'deadline', backend: 'wasm' } as const } : {}) };
    };
    const seat = createGateBot('hard', solver, 7, () => f.engine);
    seat.bot.onGameStart('black', 1);
    await expect(seat.bot.nextAction(initial(), 'black')).rejects.toThrow();
  });
  it('repeats a real full game with identical fixed-work actions and obeys turn limits', async () => {
    const configs = await resolvedConfigs(solver, TEST_BUDGETS, book.openings[0]);
    const task = schedule('pilot', openings)[0];
    const a = await runTask(task, solver, 'test', configs, 'test', TEST_BUDGETS, book);
    const b = await runTask(task, solver, 'test', configs, 'test', TEST_BUDGETS, book);
    expect(a.gameSha256).toBe(b.gameSha256);
    expect(a.record.winner).toBe(b.record.winner);
    expect(a.record.anomalies).toEqual([]);
    expect(a.record.invariantViolation).toBeNull();
    expect(a.record.adjudicated).toBe(false);
    const turns = new Map<number, number>();
    for (const row of a.telemetry.hard) turns.set(row.turn, (turns.get(row.turn) ?? 0) + row.requested);
    expect([...turns.values()].every(n => n <= TEST_BUDGETS.hard)).toBe(true);
    expect(a.telemetry.hard.some(d => d.phase === 'place' && d.requested > 0)).toBe(true);
    expect(a.record.players[task.hardSeat].unitsPlaced).toBeGreaterThan(0);
  }, 180000);
});

/**
 * A3 §4: "Any randomness an engine or bot uses must be derived from the recorded
 * pair seed; a test must show two different pair seeds can produce different
 * games from the same opening, and the same seed reproduces."
 *
 * What these tests record. The harness derives every bot's rng from the pair
 * seed (`runner.ts`: `mulberry32(deriveSeed(seed, seat))`) and hands the engine
 * seats `engine.setSeed(deriveSeed(seed, seat))`. Against a SCRIPTED opponent
 * that seed reaches the game and changes it. Against `aiv2-medium` it does not:
 * at a fixed work budget `AIEngineV2` is fully deterministic given the position,
 * so four different pair seeds produce one identical game. That is stated
 * plainly here rather than papered over — and it is why A3 §1 exists, since in
 * an engine-vs-engine cell the openings are the ONLY source of independence.
 */
describe('seed plumbing (preregistration A3 §4)', () => {
  const run = async (opponent: 'Rush' | 'aiv2-medium', patch: Record<string, unknown>) => {
    const configs = await resolvedConfigs(solver, TEST_BUDGETS, book.openings[0]);
    const base = schedule('pilot', openings)
      .find(t => t.opponent === opponent && t.handicap === 0 && t.hardSeat === 'white')!;
    const result = await runTask({ ...base, ...patch } as typeof base, solver, 'seed', configs, 'seed', TEST_BUDGETS, book);
    expect(result.startSha256).toBe((patch.startSha256 as string | undefined) ?? base.startSha256);
    return result.gameSha256;
  };
  /** Moving a task to another opening moves its start hash with it; `runTask`
   * re-derives the hash from the position and refuses a task that lies. */
  const fromOpening = (index: number) => ({
    openingIndex: index, openingId: openingIds[index], startSha256: book.startSha256(openingIds[index], 0),
  });

  it('reproduces bit-identically from the same pair seed, and a scripted opponent follows the seed', async () => {
    const base = schedule('pilot', openings).find(t => t.opponent === 'Rush' && t.handicap === 0 && t.hardSeat === 'white')!;
    const first = await run('Rush', {});
    expect(await run('Rush', {})).toBe(first);
    const others = [await run('Rush', { seed: base.seed + 1 }), await run('Rush', { seed: base.seed + 12345 })];
    expect(others).not.toContain(first);
    expect(new Set([first, ...others]).size).toBe(3);
  }, 180000);

  it('is deterministic given the position when both seats are engines, so openings carry the independence', async () => {
    const base = schedule('pilot', openings)
      .find(t => t.opponent === 'aiv2-medium' && t.handicap === 0 && t.hardSeat === 'white')!;
    const first = await run('aiv2-medium', {});
    for (const seed of [base.seed, base.seed + 1, base.seed + 12345]) {
      expect(await run('aiv2-medium', { seed })).toBe(first); // V2 ignores the seed at fixed work
    }
    const byOpening = new Set<string>();
    for (let i = 0; i < 4; i++) byOpening.add(await run('aiv2-medium', fromOpening(i)));
    expect(byOpening.size).toBe(4); // distinct POSITIONS still give distinct games
  }, 300000);

  /**
   * And the other half of that sentence. The dev book's two transposing ids
   * reach ONE position, so a deterministic engine plays one game from them —
   * which is the replication the id-keyed digest could not see. This is the
   * defect measured end to end, with the real engines, rather than argued.
   */
  it('plays ONE game from the two ids that reach one position, and hashes it once', async () => {
    const a = openingIds.indexOf('p1-g5-s245'), b = openingIds.indexOf('p1-g3-s3');
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(book.startSha256(openingIds[a], 0)).toBe(book.startSha256(openingIds[b], 0));
    const [gameA, gameB] = [await run('aiv2-medium', fromOpening(a)), await run('aiv2-medium', fromOpening(b))];
    expect(gameB).toBe(gameA);
    // Two games, one hash: the cell holds 48 pairs and 47 distinct ones.
    expect(await run('aiv2-medium', fromOpening(0))).not.toBe(gameA);
  }, 300000);
});

/**
 * The whole sharded path end to end, with the games stubbed: eight processes
 * write their own files, `--merge` checks that they are eight pieces of ONE row
 * and produces the summary, and the calibration concession the row was run under
 * arrives in the report header rather than staying in a log.
 */
describe('a sharded row merges into one summary', () => {
  const identity: RowIdentity = {
    identityHash: 'identity', mode: 'full', seed: SEEDS.full,
    calibrationSha256: 'calib', sourceIdentitySha256: 'sources', openingsDigest: 'book',
  };
  const acceptedCalibration = {
    path: 'C/calibration.json', sha256: 'calib', accepted: true,
    acceptedReasons: ['1-minute load average at start was 3.2, above the 1.5 an "otherwise idle" machine may carry'],
  };

  async function runRow(shards: number, out: string) {
    const games = new Map(synthetic('full').map(e => [e.task.id, e]));
    for (let index = 1; index <= shards; index++) {
      await runShardGames({
        out, shard: { index, count: shards }, tasks: schedule('full', openings), identity,
        manifestExtras: { mode: 'full', calibration: acceptedCalibration },
        play: async task => games.get(task.id) as unknown as Record<string, unknown>,
      });
    }
  }

  it('produces the same verdict as one process would, and names the concession', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gate1-row-'));
    await runRow(8, out);
    // The mode comes from the shards' own identity; a --mode that disagrees throws.
    const merged = mergeRow(out, undefined, book, bands);
    expect(merged.mode).toBe('full');
    expect(() => mergeRow(out, 'pilot', book, bands)).toThrow(/holds a full row, not a pilot one/);
    const single = summarize(synthetic('full'), 'full', 'identity', bands, openings,
      { calibration: acceptedCalibration, shards: 8 });
    expect(merged.errors).toEqual([]);
    expect(merged.gate1).toBe('passed');
    expect(merged.games).toBe(768);
    expect(merged.shards).toBe(8);
    expect(merged.calibration).toEqual(acceptedCalibration);
    expect(merged.calibration?.acceptedReasons?.[0]).toMatch(/otherwise idle/);
    expect(merged.rows).toEqual(single.rows);
    expect(JSON.parse(readFileSync(`${out}/summary.json`, 'utf8')).gate1).toBe('passed');
    const manifest = JSON.parse(readFileSync(`${out}/merged-manifest.json`, 'utf8'));
    expect(manifest).toMatchObject({ games: 768, expectedGames: 768, gate1: 'passed', identity });
    expect(manifest.shards).toHaveLength(8);
    expect(manifest.bookStartPositions.perHandicap[0].distinctStartPositions).toBe(47);
  }, 120000);

  it('refuses to summarize a row that is one shard short', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gate1-row-'));
    const games = new Map(synthetic('full').map(e => [e.task.id, e]));
    for (let index = 1; index <= 3; index++) { // 3 of 4
      await runShardGames({ out, shard: { index, count: 4 }, tasks: schedule('full', openings), identity,
        play: async task => games.get(task.id) as unknown as Record<string, unknown> });
    }
    expect(() => mergeRow(out, 'full', book, bands)).toThrow(/Missing shard manifests: 4\/4/);
    expect(parseArgs(['--merge', 'dir']).modeExplicit).toBe(false);
    expect(parseArgs(['--merge', 'dir', '--mode', 'full']).modeExplicit).toBe(true);
  }, 120000);
});
