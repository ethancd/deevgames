// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { phaseEndAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import { defaultUpkeepAction } from '../../src/game/upkeep';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import type { GameState } from '../../src/game/types';
import {
  PREPARE_RESERVE_DIVISOR, createGateBot, prepareReserve, segmentsAfter, turnWorkRequest,
  type GateBudgets, type Searcher,
} from '../../lab/ai/gate1-bot';
import {
  cellIndex, schedule, seatSeedFor, seedFor, summarize,
  AMENDMENT, DISTINCTNESS_READING, FULL_PAIRS, MIN_DISTINCT_FRACTION, RULES_VERSION, SEEDS, VOID_PILOT_SEEDS,
  type Entry, type Mode,
} from '../../lab/ai/gate1-report';
import { BANDS_PATH, SUPERSEDED_BANDS_PATH } from '../../lab/ai/gate1-sources';
import { WorkMeter } from '../../lab/ai/gate1-work';
import { loadGate1Book, gate1StartState, scheduleOpenings } from '../../lab/ai/gate1-openings';
import { ROW_START_FILE, adoptedProtocol, loadBands, mergeRow, parseArgs, resolvedConfigs, rowFirstStartedAt, runTask } from '../../lab/ai/gate1';
import { patchShardManifest, runShardGames, shardStem, type RowIdentity, type ShardSpec } from '../../lab/ai/gate1-shard';
import { DEFAULT_MATCH_OPTIONS, type GameRecord } from '../../lab/harness/types';

let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });
const book = loadGate1Book();
const openings = scheduleOpenings(book);
const openingIds = book.openings.map(o => o.id);
const initial = () => gate1StartState(book.openings[0], 0);
/** The bands A4 re-froze under the 20-ply clock; the p1 ones are refused by path. */
const bands = JSON.parse(readFileSync(BANDS_PATH, 'utf8'));
/** One meter for the whole suite, exactly as a row installs one for the whole row. */
const meter = new WorkMeter();
beforeAll(() => { meter.install(); });
afterAll(() => { meter.uninstall(); });
/** What gate1.ts stamps once a shard has finished clean; a merge requires it. */
const finishShard = (out: string, shard: ShardSpec) => patchShardManifest(out, shard, { status: 'complete' });
/** These fixtures pin a synthetic source identity, so the merge re-hash agrees. */
const MERGE = { sourceIdentity: () => 'sources' };
/** Small enough to keep the suite quick; the row's budgets come from a calibration. */
const TEST_BUDGETS: GateBudgets = { hard: 400, medium: 200 };

/** One synthetic game per scheduled task, each with its own distinct game hash. */
function synthetic(mode: Mode): Entry[] {
  return schedule(mode, openings).map(task => ({
    task, identityHash: 'identity',
    gameSha256: createHash('sha256').update(task.id).digest('hex'),
    record: {
      ...({} as GameRecord), rulesVersion: RULES_VERSION, seed: task.seed, handicap: task.handicap,
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
    expect(SEEDS).toEqual({ full: 20260960, pilot: 20260962 });
    // A3 §5 named 20260961. It was consumed by the pilot under muju-phasing-1 and
    // A4 voided that population, so it is recorded as void rather than reused.
    expect(VOID_PILOT_SEEDS).toEqual([20260961]);
    expect(SEEDS.pilot).not.toBe(VOID_PILOT_SEEDS[0]);
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
    const protocol = adoptedProtocol();
    expect(protocol.amendment).toMatchObject({
      id: 'A3', commit: 'a0551c8c274bfdebb32ca309e49fd7a98657de73',
      sha256: '8242433d727638abf41b1006b9fcff645564200b92eadc9bbc887eb2b72f60f4',
    });
    // A4 is the operative text and is pinned too, so the half of the
    // preregistration that is actually in force cannot be rewritten unnoticed.
    expect(protocol.rulesAmendment).toMatchObject({ id: 'A4', rulesVersion: RULES_VERSION });
    expect(protocol.document).toContain('A4 — 2026-09-19: rules revision `muju-phasing-2`');
    expect(full.rulesVersion).toBe(RULES_VERSION);
    expect(full.distinctnessReading).toBe(DISTINCTNESS_READING);
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
    expect(parseArgs(full).acceptCalibration).toEqual([]);
    // Each concession is its own kind, accepted and stamped separately: the single
    // --accept-loaded-calibration switch could not say WHICH was being made.
    expect(parseArgs([...full, '--accept-calibration=load']).acceptCalibration).toEqual(['load']);
    expect(parseArgs([...full, '--accept-calibration=age,sources']).acceptCalibration).toEqual(['age', 'sources']);
    expect(parseArgs([...full, '--accept-calibration', 'machine']).acceptCalibration).toEqual(['machine']);
    expect(() => parseArgs([...full, '--accept-loaded-calibration']))
      .toThrow(/one switch over four unrelated concessions/);
    expect(parseArgs(['--mode', 'pilot', '--out', 'x', '--calibration', 'c.json', '--provisional-calibration'])
      .provisionalCalibration).toBe(true);
    expect(parseArgs(['--merge', 'dir', '--mode', 'full']).merge).toBe('dir');
    for (const args of [
      [...full, '--shard', '9/8'], [...full, '--shard', '0/8'], [...full, '--shard', '8'],
      [...full, '--shard', '1/0'], [...full, '--shard'],
      ['--mode', 'pilot', '--out', 'x', '--calibration', 'c.json', '--shard', '2/2'], // a pilot is one process
      ['--merge', 'dir', '--out', 'x'], ['--merge', 'dir', '--plan'], ['--merge'],
      [...full, '--accept-calibration=nonsense'], [...full, '--accept-calibration=load,load'],
      [...full, '--accept-calibration='], [...full, '--accept-calibration'],
      [...full, '--accept-calibration=load', '--accept-calibration=age'],
      // A FULL row may never be measured against an admittedly provisional budget.
      [...full, '--provisional-calibration'],
      ['--merge', 'dir', '--accept-calibration=load'], ['--merge', 'dir', '--provisional-calibration'],
    ]) {
      expect(() => parseArgs(args), args.join(' ')).toThrow();
    }
  });

  /**
   * A1's behaviour condition reads the frozen purchase/inactivity bands, and A4
   * changed the inactivity clock underneath them. The p1 bands allow a draw rate up
   * to 0.866 where the re-frozen p2 bands allow 0.726, so a row read against the old
   * ones is judged against a population the rules no longer produce — and judged
   * more leniently, which is the direction that matters.
   */
  it('reads the bands re-frozen under the 20-ply clock and refuses the superseded ones', () => {
    expect(BANDS_PATH).toBe('lab/harness/results/p2-scripted-2026-09-19/sanity-bands.json');
    expect(SUPERSEDED_BANDS_PATH).toBe('lab/harness/results/p1-scripted-2026-09-18/sanity-bands.json');
    expect(bands.rulesVersion).toBe(RULES_VERSION);
    const superseded = JSON.parse(readFileSync(SUPERSEDED_BANDS_PATH, 'utf8'));
    expect(superseded.rulesVersion).toBe('muju-phasing-1');
    // The old ceiling really is looser, so this is not a formality.
    expect(superseded.inactivityDrawRate[1]).toBeGreaterThan(bands.inactivityDrawRate[1]);
    // A summary computed against them is INVALID, not merely noted.
    const wrong = summarize(synthetic('full'), 'full', 'identity', superseded, openings);
    expect(wrong.gate1).toBe('invalid');
    expect(wrong.errors.some(e => /Wrong rules identity in frozen bands/.test(e))).toBe(true);
    // And the runner refuses before a game: by path, by hash and by the file's own
    // revision, because each catches a different way of being wrong.
    const references = adoptedProtocol().references;
    const hashes = { [BANDS_PATH]: references.bands.sha256 };
    expect(loadBands(references, hashes).rulesVersion).toBe(RULES_VERSION);
    expect(() => loadBands({ ...references, bands: { ...references.bands, path: SUPERSEDED_BANDS_PATH } }, hashes))
      .toThrow(/pins the bands at/);
    expect(() => loadBands(references, { [BANDS_PATH]: 'b'.repeat(64) })).toThrow(/Frozen band hash mismatch/);
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
    // Duplicated WITHIN one seat, because the key is (hardSeat, gameSha256): the
    // same sequence from the White seat and from the Black seat is two experiments
    // (DISTINCTNESS_READING), so replicating across seats is not replication.
    for (const [duplicates, valid] of [[9, true], [10, false]] as const) {
      const entries = synthetic('full');
      const cell = entries.filter(e => e.task.opponent === 'Expand' && e.task.handicap === 0
        && e.task.hardSeat === 'white');
      for (let i = 1; i <= duplicates; i++) cell[i].gameSha256 = cell[0].gameSha256;
      const row = summarize(entries, 'full', 'identity', bands, openings)
        .rows.find(r => r.opponent === 'Expand' && r.handicap === 0)!;
      expect(row.distinctGames).toBe(96 - duplicates);
      expect(row.cellValid).toBe(valid);
    }
  });

  /**
   * THE READING OF A3 §2, pinned on the case that separates the two readings.
   *
   * A cell where every pair's two seat-mirrored games produce the SAME action
   * sequence holds 48 sequences and 96 experiments. Keyed on the action hash alone
   * it is 48/96 = 50% distinct and INVALID — every cleanly mirrored cell of every
   * row would be, by construction, and the gate would never measure anything.
   * Keyed on (hardSeat, sequence) it is 96/96 and VALID, and if those games are
   * all draws the cell is then a real, measured FAILURE of the strength condition
   * rather than an absence of information. `strengthMet === false`, not `null`.
   */
  it('reads a seat-mirrored cell of identical drawn sequences as VALID and FAILED, not invalid', () => {
    const entries = synthetic('full');
    const cell = entries.filter(e => e.task.opponent === 'Balanced' && e.task.handicap === 0);
    for (const pairId of new Set(cell.map(e => e.task.pairId))) {
      const pair = cell.filter(e => e.task.pairId === pairId);
      expect(pair).toHaveLength(2);
      pair[1].gameSha256 = pair[0].gameSha256; // one sequence, two seats
      for (const e of pair) e.record.winner = null; // and it is a draw
    }
    const report = summarize(entries, 'full', 'identity', bands, openings);
    const row = report.rows.find(r => r.opponent === 'Balanced' && r.handicap === 0)!;
    expect(row.games).toBe(96);
    expect(row.distinctGames).toBe(96);          // 96 experiments, seat-keyed
    expect(row.distinctGameSequences).toBe(48);  // 48 sequences, reported alongside
    expect(row.cellValid).toBe(true);
    expect(row.strengthMet).toBe(false);         // measured and failed, not unmeasured
    expect(row.strengthMet).not.toBeNull();
    expect(report.invalidGatingCells).toEqual([]);
    expect(report.gate1).toBe('failed');
    expect(report.distinctnessReading).toContain('(hardSeat, gameSha256)');
    // The pair-level count is untouched, so A2's real failure mode still bites.
    expect(row.distinctPairs).toBe(48);
  });

  /**
   * LATER CONVERGENCE, report-only. Two games of one cell and one seat assignment
   * that hand off in the same position are playing one line from there on, however
   * different their openings were — which is most of what A3 §1's 48 openings were
   * bought for. A3 sets no threshold, so this reports and gates nothing.
   */
  it('reports games that converge on a shared hand-off position, with the earliest ply', () => {
    const entries = synthetic('full');
    const cell = entries.filter(e => e.task.opponent === 'Expand' && e.task.handicap === 3);
    const shared = 'c'.repeat(64);
    const whites = cell.filter(e => e.task.hardSeat === 'white');
    const blacks = cell.filter(e => e.task.hardSeat === 'black');
    // Two White-seat games meet at the same position, at plies 19 and 25.
    whites[0].boundaries = [{ ply: 7, digest: 'a'.repeat(64) }, { ply: 19, digest: shared }];
    whites[1].boundaries = [{ ply: 25, digest: shared }];
    // A Black-seat game passes through it too, which is NOT a convergence with the
    // White ones: the two seats meeting there are two engines, not one repeated.
    blacks[0].boundaries = [{ ply: 11, digest: shared }];
    const report = summarize(entries, 'full', 'identity', bands, openings);
    const row = report.rows.find(r => r.opponent === 'Expand' && r.handicap === 3)!;
    expect(row.laterConvergence.totalConvergences).toBe(1);
    expect(row.laterConvergence.convergedGames).toBe(2);
    expect(row.laterConvergence.gamesWithBoundaries).toBe(3);
    const only = row.laterConvergence.convergences[0];
    expect(only).toMatchObject({ hardSeat: 'white', digest: shared, earliestPly: 19 });
    expect(only.games.map(g => g.id)).toEqual([whites[0].task.id, whites[1].task.id]);
    // It stays out of every verdict.
    expect(row.cellValid).toBe(true);
    expect(report.gate1).toBe('passed');
    expect(report.laterConvergence.totalConvergences).toBe(1);
    expect(report.laterConvergence.note).toContain('Report-only');
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

/**
 * ADAPTER FIDELITY. The calibration measures the SHIPPED whole-turn loop — one
 * allowance per own turn, one search returning a multi-action plan, that plan
 * replayed, a fresh search only when it runs out or stops replaying legally
 * (`src/hooks/useAI.ts`, `src/ai/worker/handler.ts` `mode: 'turn'`) — and records
 * about two to three searches per turn. The row's adapter used to re-search EVERY
 * action on `floor(remaining / (actionsRemaining + 3))`, about a seventh of the
 * turn, and charge the full slice whether the search used it or not: a correctly
 * calibrated TOTAL spent at 15-35% of shipped depth per DECISION, unequally
 * between two arms whose plans are not the same length.
 *
 * These tests pin the loop it follows now, and the last one pins it against the
 * real engines rather than against a stub.
 */
describe('fixed-work adapter follows the shipped whole-turn loop', () => {
  /** A stub engine that spends no metered work, so the charge is the floor of 1. */
  function fake(plan?: (state: GameState) => unknown[]) {
    const requests: number[] = [], deadlines: number[] = [];
    const engine: Searcher = {
      setSeed() {}, setTacticalSolver() {},
      setConfig(c) { requests.push(c.fixedWork!); },
      async findBestAction(state, deadline) {
        deadlines.push(deadline!);
        const actions = plan ? plan(state)
          : [state.upkeepPending ? defaultUpkeepAction(state) : phaseEndAction(state)];
        return { plan: { actions: actions as never, score: 0 },
          nodesSearched: 0, timeMs: 999999, depth: 0,
          debug: { planCount: 1, topPlans: [], config: {
            mctsIterations: 1200, mctsTimeLimit: 3000, beamWidth: 50, outputPlans: 20, tacticalDepth: 2,
          } } };
      },
    };
    return { engine, requests, deadlines };
  }

  it('funds Act with everything but the Prepare reserve, and Prepare with the whole remainder', async () => {
    expect(PREPARE_RESERVE_DIVISOR).toBe(8);
    const budget = 80, floorPerSegment = budget / PREPARE_RESERVE_DIVISOR; // 10
    const f = fake(), seat = createGateBot('hard', solver, budget, { meter, factory: () => f.engine });
    seat.bot.onGameStart('black', 1);
    let state = initial();
    expect(state.turn.phase).toBe('action');
    expect(segmentsAfter(state)).toBe(2);                       // upkeep, then Prepare
    expect(prepareReserve(state, budget)).toBe(2 * floorPerSegment);
    const first = await seat.bot.nextAction(state, 'black');
    // THREE QUARTERS of the turn, not a seventh. The hook gives its first search
    // the whole clock; the reserve is the one stated departure from it.
    expect(f.requests).toEqual([budget - 2 * floorPerSegment]);
    expect(f.requests[0] / budget).toBeGreaterThan(0.7);
    state = applyAction(state, first!);
    expect(state.turn.phase).toBe('place');
    await seat.bot.nextAction(state, 'black');
    // Prepare is the last segment of the turn, so it asks for everything left —
    // nothing is stranded — and the charge was what the search SPENT (1 unit here),
    // never the 60 it was allowed.
    expect(segmentsAfter(state)).toBe(0);
    expect(f.requests[1]).toBe(budget - 1);
    expect(seat.decisions.filter(d => d.kind === 'search').map(d => d.spent)).toEqual([1, 1]);
    expect(f.deadlines.every(n => n === Infinity)).toBe(true);
    // A new own turn refills the allowance; nothing inside a turn does.
    state.turn.turnNumber++;
    await seat.bot.nextAction(state, 'black');
    expect(f.requests.at(-1)).toBe(budget);
  });

  it('never exceeds the turn allowance in SPENT work, and finishes the segment when it runs out', async () => {
    // A tiny budget so the allowance is exhausted in a few calls.
    const f = fake(), seat = createGateBot('hard', solver, 3, { meter, factory: () => f.engine });
    seat.bot.onGameStart('black', 1);
    const state = initial();
    for (let i = 0; i < 6; i++) await seat.bot.nextAction(state, 'black');
    expect(seat.decisions.reduce((a, d) => a + d.spent, 0)).toBeLessThanOrEqual(3);
    // Wall mode (fixedWork = 0) is never requested: the segment is finished with
    // the canonical default instead.
    expect(f.requests.every(n => n > 0)).toBe(true);
    expect(seat.decisions.at(-1)).toMatchObject({ kind: 'allowance-completion', stopReason: 'allowance-completion' });
  });

  it('replays a plan instead of re-searching, and drops an invalid suffix the way the hook does', async () => {
    // A plan whose first action is legal and whose second is not: END_ACTION_PHASE
    // twice. The hook keeps the dispatched prefix and drops the rest.
    const f = fake(state => [phaseEndAction(state), { type: 'END_ACTION_PHASE' }]);
    const seat = createGateBot('hard', solver, 800, { meter, factory: () => f.engine });
    seat.bot.onGameStart('black', 1);
    let state = initial();
    const first = await seat.bot.nextAction(state, 'black');
    expect(f.requests).toHaveLength(1);
    expect(seat.invalidSuffixes()).toBe(0);
    state = applyAction(state, first!);
    // The queued second action no longer replays, so it is dropped and counted, and
    // a fresh search funds the rest of the turn.
    await seat.bot.nextAction(state, 'black');
    expect(seat.invalidSuffixes()).toBe(1);
    expect(f.requests).toHaveLength(2);
    expect(seat.decisions.map(d => d.kind)).toEqual(['search', 'search']);
  });

  it('reserves by hand-off segment, not by remaining action', () => {
    const act = initial();
    expect(act.turn.phase).toBe('action');
    const upkeep = { ...initial(), upkeepPending: true };
    expect(segmentsAfter(upkeep)).toBe(1);
    expect(turnWorkRequest(upkeep, 800, 800)).toBe(800 - 100);
    expect(turnWorkRequest(act, 800, 800)).toBe(800 - 200);
    // The reserve is a FLOOR per following segment, so it does not shrink with the
    // number of actions left — which is what made the old seventh-of-a-turn slice.
    const fewer = { ...act, turn: { ...act.turn, actionsRemaining: 1 } };
    expect(turnWorkRequest(fewer, 800, 800)).toBe(turnWorkRequest(act, 800, 800));
    // An exhausted allowance asks for nothing at all, so wall mode is never entered.
    expect(turnWorkRequest(act, 0, 800)).toBe(0);
    expect(turnWorkRequest(act, 1, 800)).toBe(1);
  });

  it('rejects invalid budgets, a missing meter and a non-Phasing seat', async () => {
    for (const n of [0, -1, 1.5, Infinity]) {
      expect(() => createGateBot('hard', solver, n as number, { meter })).toThrow();
    }
    expect(() => createGateBot('hard', solver, 400, { meter: undefined as never }))
      .toThrow(/requires the row work meter/);
    const state = initial();
    const seat = createGateBot('hard', solver, TEST_BUDGETS.hard, { meter });
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
    const seat = createGateBot('hard', solver, 7, { meter, factory: () => f.engine });
    seat.bot.onGameStart('black', 1);
    await expect(seat.bot.nextAction(initial(), 'black')).rejects.toThrow();
  });

  it('repeats a real full game, spends at most its allowance, and paces like the shipped loop', async () => {
    const configs = await resolvedConfigs(solver, TEST_BUDGETS, book.openings[0], meter);
    const task = schedule('pilot', openings)[0];
    const a = await runTask(task, solver, 'test', configs, 'test', TEST_BUDGETS, book, meter);
    const b = await runTask(task, solver, 'test', configs, 'test', TEST_BUDGETS, book, meter);
    expect(a.gameSha256).toBe(b.gameSha256);
    expect(a.record.winner).toBe(b.record.winner);
    expect(a.record.anomalies).toEqual([]);
    expect(a.record.invariantViolation).toBeNull();
    expect(a.record.adjudicated).toBe(false);
    // THE INVARIANT THAT MATTERS, and the one the old adapter could only reach by
    // charging for work it had not done: a turn never SPENDS more than its
    // allowance. Requested may exceed it across a turn, because a search that
    // finishes early hands the rest back — exactly as the hook hands back clock.
    const spentPerTurn = new Map<number, number>();
    const searchesPerTurn = new Map<number, number>();
    for (const row of a.telemetry.hard) {
      spentPerTurn.set(row.turn, (spentPerTurn.get(row.turn) ?? 0) + row.spent);
      if (row.kind === 'search') searchesPerTurn.set(row.turn, (searchesPerTurn.get(row.turn) ?? 0) + 1);
    }
    expect([...spentPerTurn.values()].every(n => n <= TEST_BUDGETS.hard)).toBe(true);
    // PLAN REPLAY, on the real planner: most dispatched actions come out of a plan
    // that was already paid for, so a turn holds a handful of searches rather than
    // one per action.
    const searches = a.telemetry.hard.filter(d => d.kind === 'search');
    const replays = a.telemetry.hard.filter(d => d.kind === 'replay');
    expect(searches.length).toBeGreaterThan(0);
    expect(replays.length).toBeGreaterThan(0);
    expect(searches.length).toBeLessThan(a.telemetry.hard.length);
    // The first search of a turn really does get most of the turn, not a seventh.
    const firstOfTurn = searches.filter((d, i) => i === 0 || searches[i - 1].turn !== d.turn);
    expect(Math.max(...firstOfTurn.map(d => d.requested)) / TEST_BUDGETS.hard).toBeGreaterThan(0.5);
    // Prepare is still funded and the seat still buys.
    expect(a.telemetry.hard.some(d => d.phase === 'place' && d.kind === 'search' && d.requested > 0)).toBe(true);
    expect(a.record.players[task.hardSeat].unitsPlaced).toBeGreaterThan(0);
    // And the hand-off positions are recorded for the convergence report.
    expect(a.boundaries.length).toBeGreaterThan(0);
    for (const boundary of a.boundaries) {
      expect(boundary.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(boundary.ply).toBeGreaterThan(0);
    }
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
    const configs = await resolvedConfigs(solver, TEST_BUDGETS, book.openings[0], meter);
    const base = schedule('pilot', openings)
      .find(t => t.opponent === opponent && t.handicap === 0 && t.hardSeat === 'white')!;
    const result = await runTask({ ...base, ...patch } as typeof base, solver, 'seed', configs, 'seed', TEST_BUDGETS, book, meter);
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
  /** What one shard stamps: its OWN concessions, attributed to itself. */
  const calibrationFor = (shard: ShardSpec, kinds: string[], reasons: string[]) => ({
    path: 'C/calibration.json', sha256: 'calib', accepted: kinds.length > 0,
    acceptedKinds: kinds, acceptedReasons: reasons,
    acceptedByShard: kinds.length ? [{ shard: shardStem(shard), kinds, reasons }] : [],
    budgets: { hard: 53155, medium: 9000 },
    searchesPerTurnInCalibration: { hard: 3, medium: 2 },
    provisional: false, freshnessMeasuredFrom: '2026-09-19T00:00:00.000Z',
  });
  const LOADED = '[load] 1-minute load average at start was 3.2, above the 1.5 an "otherwise idle" machine may carry';
  const OTHER_MACHINE = '[machine] measured on elsewhere, not on this host';

  /**
   * Eight shards, and only TWO of them make a concession — shard 3 accepts a loaded
   * calibration, shard 7 accepts one measured on another machine. That is the shape
   * of the defect: reading shard 1's manifest and calling it the row's provenance
   * reported this row as clean.
   */
  async function runRow(shards: number, out: string) {
    const games = new Map(synthetic('full').map(e => [e.task.id, e]));
    for (let index = 1; index <= shards; index++) {
      const shard = { index, count: shards };
      const kinds = index === 3 ? ['load'] : index === 7 ? ['machine'] : [];
      const reasons = index === 3 ? [LOADED] : index === 7 ? [OTHER_MACHINE] : [];
      await runShardGames({
        out, shard, tasks: schedule('full', openings), identity,
        manifestExtras: { mode: 'full', calibration: calibrationFor(shard, kinds, reasons) },
        play: async task => games.get(task.id) as unknown as Record<string, unknown>,
      });
      finishShard(out, shard);
    }
  }

  /**
   * A row's calibration age is ONE number for the whole row. Whichever shard
   * reaches the directory first writes `row-start.json` with O_EXCL; every later
   * shard reads that instant instead of its own clock, so eight shards that queue
   * behind two heavy slots over two days still share one freshness reading and one
   * set of concessions. A truncated file is fatal rather than silently re-dated.
   */
  it('fixes the row freshness instant at the first shard to reach the directory', () => {
    const out = mkdtempSync(join(tmpdir(), 'gate1-rowstart-'));
    const first = rowFirstStartedAt(out, () => new Date('2026-09-19T01:00:00.000Z'));
    expect(first).toBe('2026-09-19T01:00:00.000Z');
    const aDayLater = rowFirstStartedAt(out, () => new Date('2026-09-20T09:00:00.000Z'));
    expect(aDayLater).toBe(first);
    expect(JSON.parse(readFileSync(`${out}/${ROW_START_FILE}`, 'utf8')).firstStartedAt).toBe(first);
    writeFileSync(`${out}/${ROW_START_FILE}`, '{"schema":"muju-gate1-row-start-v1"}');
    expect(() => rowFirstStartedAt(out, () => new Date('2026-09-20T09:00:00.000Z')))
      .toThrow(/no usable firstStartedAt/);
  });

  it('produces the same verdict as one process would, and names the concession', async () => {
    const out = mkdtempSync(join(tmpdir(), 'gate1-row-'));
    await runRow(8, out);
    // The mode comes from the shards' own identity; a --mode that disagrees throws.
    const merged = mergeRow(out, undefined, book, bands, MERGE);
    expect(merged.mode).toBe('full');
    expect(() => mergeRow(out, 'pilot', book, bands, MERGE)).toThrow(/holds a full row, not a pilot one/);
    expect(merged.errors).toEqual([]);
    expect(merged.gate1).toBe('passed');
    expect(merged.games).toBe(768);
    expect(merged.shards).toBe(8);
    // THE UNION, ATTRIBUTED. Shard 1 ran clean; the row did not.
    expect(merged.calibration?.accepted).toBe(true);
    expect(merged.calibration?.acceptedKinds?.slice().sort()).toEqual(['load', 'machine']);
    expect(merged.calibration?.acceptedReasons?.slice().sort()).toEqual([LOADED, OTHER_MACHINE].sort());
    expect(merged.calibration?.acceptedByShard).toEqual([
      { shard: 'shard-3-of-8', kinds: ['load'], reasons: [LOADED] },
      { shard: 'shard-7-of-8', kinds: ['machine'], reasons: [OTHER_MACHINE] },
    ]);
    // The per-turn budget and both searches-per-turn figures reach the header.
    expect(merged.pacing.perTurnWorkBudget).toEqual({ hard: 53155, medium: 9000 });
    expect(merged.pacing.searchesPerTurnInCalibration).toEqual({ hard: 3, medium: 2 });
    const single = summarize(synthetic('full'), 'full', 'identity', bands, openings,
      { calibration: merged.calibration ?? undefined, shards: 8 });
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
      finishShard(out, { index, count: 4 });
    }
    expect(() => mergeRow(out, 'full', book, bands, MERGE)).toThrow(/Missing shard manifests: 4\/4/);
    expect(parseArgs(['--merge', 'dir']).modeExplicit).toBe(false);
    expect(parseArgs(['--merge', 'dir', '--mode', 'full']).modeExplicit).toBe(true);
  }, 120000);
});
