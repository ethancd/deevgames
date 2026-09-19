// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { SearchBudget } from '../../src/ai/runtime';
import { aiTurnBudgetMs } from '../../src/ai/turnTime';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import {
  CALIBRATION_AMENDMENT, CALIBRATION_OPENINGS, CALIBRATION_OVERRIDES, CALIBRATION_OWN_THREAD_LOAD,
  CALIBRATION_SCHEMA, DEFAULT_CALIBRATION, GAME_STAGES, LoadSampler,
  MAX_CALIBRATION_AGE_MS, MAX_CALIBRATION_LOAD1, MAX_CALIBRATION_LOAD5, MIN_CALIBRATION_MAX_TURNS,
  OWN_TURN_BUCKETS, QUICK_ALLOWANCE_MS, WEIGHTING_DISAGREEMENT, WorkMeter,
  bucketOf, loadCalibration, machineIdentity, median, parseArgs, parseCalibrationOverrides, sampleEngine,
  stageOf, summarizeSamples, weightingComparison, type CalibrationOverride, type TurnSample,
} from '../../lab/ai/gate1-calibrate';
import { HANDICAPS, gate1StartState, loadGate1Book } from '../../lab/ai/gate1-openings';

let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });
const book = loadGate1Book();

const HOST = machineIdentity();
const NOW = Date.parse('2026-09-19T12:00:00.000Z');
const FRESH = new Date(NOW - 60_000).toISOString();
const SOURCES = 'f'.repeat(64);

function engine(medianWork: number, overrides: Record<string, unknown> = {}) {
  return {
    allowanceMs: medianWork === 9000 ? 3000 : 10000, pace: 'quick', ownTurns: 900, games: 96,
    coverage: { openings: CALIBRATION_OPENINGS, handicaps: [...HANDICAPS], games: 96,
      maxOwnTurnsInAGame: 30, minOwnTurnsInAGame: 6 },
    // `medianSearchesPerTurn` is required: it is the number the report prints next
    // to the ROW's own searches per turn, and without it the row cannot show that
    // its fixed-work adapter paces like the loop the budget was measured on.
    overall: { ownTurns: 900, medianWorkPerTurn: medianWork, medianSearchesPerTurn: 3 },
    stages: Object.fromEntries(GAME_STAGES.map(s => [s, { ownTurns: 300, medianWorkPerTurn: medianWork }])),
    ownTurnBuckets: Object.fromEntries(OWN_TURN_BUCKETS.map(b => [b.id, { ownTurns: 300, medianWorkPerTurn: medianWork }])),
    weighting: { turnWeightedMedian: medianWork, gameWeightedMedian: medianWork, flagged: false },
    ...overrides,
  };
}

/** Per-game-boundary load evidence, which a v3 manifest may not omit. */
const boundaryLoad = (maxLoad5 = 0.8) => ({
  samples: 96,
  load1: { max: 1.1, mean: 0.7 },
  load5: { max: maxLoad5, mean: Math.min(maxLoad5, 0.6) },
  load15: { max: 0.9, mean: 0.5 },
  heavySlotHoldersSeen: [],
});

/** A complete, clean A3 calibration: this host, idle, fresh, this source tree. */
const manifest = (overrides: Record<string, unknown> = {}) => ({
  schema: CALIBRATION_SCHEMA, amendment: CALIBRATION_AMENDMENT,
  machine: { ...HOST },
  load: { load1AtStart: 0.4, load1AtEnd: 0.6, start: [0.4, 0.5, 0.6], end: [0.6, 0.6, 0.6],
    cpuCount: HOST.cpuCount, boundaries: boundaryLoad() },
  startedAt: FRESH, finishedAt: FRESH,
  sourceIdentity: { sha256: SOURCES, files: 400 },
  book: { path: 'lab/hard-ai/ladder/openings/p1-dev.jsonl', sha256: 'x' },
  options: { openings: CALIBRATION_OPENINGS, handicaps: [...HANDICAPS], maxTurns: 60, turnsPerEngine: 0, seed: 1 },
  engines: { hard: engine(53155), medium: engine(9000) },
  budgets: { hard: 53155, medium: 9000 },
  ...overrides,
});

function write(value: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'gate1-calib-'));
  const path = join(dir, 'calibration.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
}
const load = (value: unknown, options: Parameters<typeof loadCalibration>[1] = {}) =>
  loadCalibration(write(value), { now: NOW, machine: HOST, sourceIdentitySha256: SOURCES, ...options });
/** Accept every kind at once, for the cases that are about something else. */
const ALL: CalibrationOverride[] = [...CALIBRATION_OVERRIDES];

describe('work meter', () => {
  it('counts exactly the units a fixed-work search is allowed to spend', async () => {
    // `fixedWork` caps the SAME counter the meter reads, so a work-bound search
    // must consume precisely its budget. This is what makes a median measured
    // in WALL mode usable as a fixed-work budget (A3 §3).
    const state = gate1StartState(book.openings[0], 0);
    for (const requested of [200, 900]) {
      const spent = await WorkMeter.around(async meter => {
        const engine = new AIEngineV2('hard');
        engine.setSeed(1); engine.setTacticalSolver(solver);
        engine.setConfig({ fixedWork: requested });
        const result = await engine.findBestAction(state, Infinity);
        expect(result.stats?.stopReason).toBe('work');
        return meter.read();
      });
      expect(spent).toBe(requested);
    }
  });

  it('restores the prototype afterwards and refuses to nest', async () => {
    const before = SearchBudget.prototype.spend;
    const meter = new WorkMeter();
    meter.install();
    expect(() => meter.install()).toThrow(/already installed/);
    meter.uninstall();
    expect(SearchBudget.prototype.spend).toBe(before);
    const budget = new SearchBudget(Infinity, 3);
    expect([budget.spend(), budget.spend(), budget.spend(), budget.spend()]).toEqual([true, true, true, false]);
  });

  it('measures wall-mode work per own turn at the shipped quick allowance', async () => {
    // The allowances A3 names are read from the shipped table, never retyped.
    expect(QUICK_ALLOWANCE_MS).toEqual({ hard: aiTurnBudgetMs('hard', 'quick'), medium: aiTurnBudgetMs('medium', 'quick') });
    expect(QUICK_ALLOWANCE_MS).toEqual({ hard: 10000, medium: 3000 });
    const state = gate1StartState(book.openings[0], 0);
    const spent = await WorkMeter.around(async meter => {
      const engine = new AIEngineV2('medium');
      engine.setSeed(1); engine.setTacticalSolver(solver);
      engine.setConfig({ fixedWork: 0, scaleToBudget: true }); // WALL mode
      const result = await engine.findBestAction(state, QUICK_ALLOWANCE_MS.medium);
      expect(result.stats?.stopReason).not.toBe('work');
      return meter.read();
    });
    // The whole point of the calibration: wall-mode work is far above the 3,000
    // units A1/A2 gave a medium seat for an ENTIRE turn.
    expect(spent).toBeGreaterThan(3000);
  }, 60000);
});

/**
 * What the first version of this file actually measured: `{ turnsPerEngine: 16,
 * openings: 8, maxTurns: 2 }` — every sample from game turns 1–2, eight
 * openings, one handicap each, n = 16 per engine. That is the median over the
 * CHEAPEST turns of the game, not "the median search work each engine consumes
 * per own turn" (A3 §3).
 */
describe('sampling covers whole games, not opening turns', () => {
  it('defaults to every dev opening, both handicaps and full-length games', () => {
    expect(DEFAULT_CALIBRATION.openings).toBe(CALIBRATION_OPENINGS);
    expect(DEFAULT_CALIBRATION.openings).toBe(48);
    expect([...DEFAULT_CALIBRATION.handicaps]).toEqual([...HANDICAPS]);
    expect(DEFAULT_CALIBRATION.maxTurns).toBeGreaterThanOrEqual(MIN_CALIBRATION_MAX_TURNS);
    expect(MIN_CALIBRATION_MAX_TURNS).toBe(20);
    expect(DEFAULT_CALIBRATION.turnsPerEngine).toBe(0); // no early stop
  });

  it('refuses to sample two-turn games at all', async () => {
    await expect(sampleEngine('medium', solver, { ...DEFAULT_CALIBRATION, maxTurns: 2 }, book))
      .rejects.toThrow(/full-length games/);
  });

  it('labels every own turn with its tercile, including very short games', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => stageOf(i, 9))).toEqual([
      'opening', 'opening', 'opening', 'middle', 'middle', 'middle', 'late', 'late', 'late']);
    // A two-turn game has no late third: turn 1 of 2 sits at the halfway mark,
    // inside the middle tercile. Every sample is still labelled, none dropped.
    expect([0, 1].map(i => stageOf(i, 2))).toEqual(['opening', 'middle']);
    expect([0, 1, 2, 3].map(i => stageOf(i, 4))).toEqual(['opening', 'opening', 'middle', 'late']);
    expect(stageOf(0, 1)).toBe('opening');
    expect(() => stageOf(0, 0)).toThrow();
  });

  it('reports the overall median AND one per stage, with n', () => {
    // One nine-own-turn game whose work climbs as the board fills. The overall
    // median sits in the middle third and is nowhere near what a late turn
    // costs — exactly the gap the stage report exists to make visible.
    const samples: TurnSample[] = [100, 200, 300, 1000, 1100, 1200, 5000, 5100, 5200].map((work, i) => ({
      difficulty: 'hard', opening: 'p1-x', handicap: 0, turn: i, seat: 'white',
      work, searchMs: 10, searches: 2, ownTurnIndex: i, ownTurns: 9, stage: stageOf(i, 9),
    }));
    const summary = summarizeSamples(samples);
    expect(summary.ownTurns).toBe(9);
    expect(summary.games).toBe(1);
    expect(summary.overall.medianWorkPerTurn).toBe(1100);
    expect(summary.stages.opening).toMatchObject({ ownTurns: 3, medianWorkPerTurn: 200 });
    expect(summary.stages.middle).toMatchObject({ ownTurns: 3, medianWorkPerTurn: 1100 });
    expect(summary.stages.late).toMatchObject({ ownTurns: 3, medianWorkPerTurn: 5100 });
    expect(summary.coverage).toMatchObject({ openings: 1, handicaps: [0], games: 1 });
    expect(median([1, 2, 3, 4])).toBe(3); // even sample: midpoint, rounded to an integer budget
    expect(() => median([])).toThrow();
  });
});

describe('calibration manifest', () => {
  it('accepts a complete, fresh, idle, same-machine, same-tree calibration', () => {
    const good = load(manifest());
    expect(good.budgets).toEqual({ hard: 53155, medium: 9000 });
    expect(good.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(good.acceptance).toEqual({ accepted: [], overridden: [], reasons: [] });
    expect(good.provisional).toBeNull();
    expect(good.searchesPerTurn).toEqual({ hard: 3, medium: 3 });
  });

  it('refuses anything that is not a complete A3 calibration, flag or no flag', () => {
    const broken: Record<string, unknown>[] = [
      manifest({ schema: 'muju-gate1-calibration-v1' }), // the opening-only sampler
      manifest({ amendment: 'A2' }),
      manifest({ book: { path: 'lab/hard-ai/ladder/openings/p1-val.jsonl' } }),
      manifest({ engines: { hard: engine(53155) } }),
      manifest({ engines: { hard: engine(53155, { allowanceMs: 8000 }), medium: engine(9000) } }),
      manifest({ engines: { hard: engine(53155), medium: engine(9000, { pace: 'deep' }) } }),
      manifest({ engines: { hard: engine(53155, { ownTurns: 2 }), medium: engine(9000) } }),
      manifest({ budgets: { hard: 6000, medium: 3000 } }), // the withdrawn constants are not a calibration
      manifest({ budgets: { hard: 53155, medium: 0 } }),
      // Coverage: A3 §3 wants ALL the dev openings at BOTH handicaps.
      manifest({ engines: { hard: engine(53155, { coverage: { openings: 8, handicaps: [0, 3] } }), medium: engine(9000) } }),
      manifest({ engines: { hard: engine(53155, { coverage: { openings: 48, handicaps: [0] } }), medium: engine(9000) } }),
      // A game capped at two turns, or a run stopped at a turn cap, is a smoke test.
      manifest({ options: { ...manifest().options, maxTurns: 2 } }),
      manifest({ options: { ...manifest().options, turnsPerEngine: 16 } }),
      // A stage with no samples means the games never got there.
      manifest({ engines: { medium: engine(9000), hard: engine(53155, { stages: {
        opening: { ownTurns: 900 }, middle: { ownTurns: 0 }, late: { ownTurns: 0 } } }) } }),
      // Provenance the row cannot do without.
      manifest({ machine: undefined }), manifest({ load: undefined }),
      manifest({ sourceIdentity: undefined }), manifest({ finishedAt: undefined }),
      // A v2 manifest sampled the load twice, at the two moments a twelve-hour
      // measurement is least likely to be contended. That is not load evidence.
      manifest({ load: { ...manifest().load, boundaries: undefined } }),
      // Without searches per turn the row cannot be shown to pace like the loop.
      manifest({ engines: { medium: engine(9000),
        hard: engine(53155, { overall: { ownTurns: 900, medianWorkPerTurn: 53155 } }) } }),
    ];
    for (const value of broken) {
      const label = JSON.stringify(value).slice(0, 90);
      expect(() => load(value), label).toThrow();
      // The override flag is for a valid calibration of another SITUATION, never
      // for an incomplete one.
      expect(() => load(value, { accept: ALL, acceptProvisional: true }), label).toThrow();
    }
  });

  it('uses the OVERALL median as the budget, not a stage median', () => {
    const lateHeavy = manifest({
      engines: {
        hard: engine(53155, { stages: Object.fromEntries(GAME_STAGES.map(s =>
          [s, { ownTurns: 300, medianWorkPerTurn: s === 'late' ? 400000 : 900 }])) }),
        medium: engine(9000),
      },
    });
    expect(load(lateHeavy).budgets.hard).toBe(53155);
    // A budget taken from the late-game median instead is refused outright.
    expect(() => load({ ...lateHeavy, budgets: { hard: 400000, medium: 9000 } })).toThrow(/OVERALL median/);
  });

  // The KIND column is typed, not a widened string: a typo in it must fail the
  // typecheck rather than ask loadCalibration to accept a kind that cannot exist.
  it.each<[string, Record<string, unknown>, RegExp, CalibrationOverride]>([
    ['a loaded start', { load: { ...manifest().load, load1AtStart: MAX_CALIBRATION_LOAD1 + 0.1 } }, /1-minute load average at start/, 'load'],
    ['a loaded finish', { load: { ...manifest().load, load1AtEnd: 9.8 } }, /1-minute load average at end/, 'load'],
    ['a contended middle', { load: { ...manifest().load, boundaries: boundaryLoad(MAX_CALIBRATION_LOAD5 + 0.1) } }, /highest 5-minute load average at any game boundary/, 'load'],
    ['another machine', { machine: { ...HOST, sha256: 'other', hostname: 'elsewhere' } }, /not on this host/, 'machine'],
    ['a stale measurement', { finishedAt: new Date(NOW - MAX_CALIBRATION_AGE_MS - 1000).toISOString() }, /freshness window/, 'age'],
    ['another source tree', { sourceIdentity: { sha256: 'a'.repeat(64) } }, /source identity/, 'sources'],
  ])('refuses %s unless the row explicitly accepts that KIND', (_name, override, pattern, kind) => {
    expect(() => load(manifest(override))).toThrow(pattern);
    // Accepting a DIFFERENT kind does not wave this one through, which is the whole
    // reason the single --accept-loaded-calibration switch was split up.
    for (const other of CALIBRATION_OVERRIDES.filter(k => k !== kind)) {
      expect(() => load(manifest(override), { accept: [other] }), other).toThrow(pattern);
    }
    const accepted = load(manifest(override), { accept: [kind] });
    expect(accepted.acceptance.accepted).toEqual([kind]);
    expect(accepted.acceptance.overridden).toHaveLength(1);
    expect(accepted.acceptance.overridden[0].kind).toBe(kind);
    expect(accepted.acceptance.overridden[0].reason).toMatch(pattern);
    expect(accepted.acceptance.reasons[0]).toContain(`[${kind}]`);
    expect(accepted.budgets).toEqual({ hard: 53155, medium: 9000 });
  });

  it('holds the load threshold at exactly 1.5 and reports every reason at once', () => {
    expect(MAX_CALIBRATION_LOAD1).toBe(1.5);
    expect(MAX_CALIBRATION_AGE_MS).toBe(24 * 60 * 60 * 1000);
    expect(() => load(manifest({ load: { ...manifest().load, load1AtStart: 1.5 } }))).not.toThrow();
    expect(() => load(manifest({ load: { ...manifest().load, load1AtStart: 1.51 } }))).toThrow();
    const several = manifest({
      load: { ...manifest().load, load1AtStart: 10, load1AtEnd: 9 },
      machine: { ...HOST, sha256: 'other' },
      finishedAt: new Date(NOW - MAX_CALIBRATION_AGE_MS - 1).toISOString(),
      sourceIdentity: { sha256: 'a'.repeat(64) },
    });
    expect(load(several, { accept: ALL }).acceptance.overridden).toHaveLength(5);
    // With no source identity to compare against (`--plan`), that one check is
    // skipped rather than silently passed.
    expect(loadCalibration(write(several), { now: NOW, machine: HOST, accept: ALL })
      .acceptance.overridden).toHaveLength(4);
  });

  it('requires an output directory, full-length games and a bounded opening count', () => {
    expect(parseArgs(['--out', 'x']).options).toEqual(DEFAULT_CALIBRATION);
    for (const args of [[], ['--turns', '4'], ['--out', 'x', '--turns', '0'], ['--out', 'x', '--openings', '49'],
      ['--out', 'x', '--out', 'y'], ['--out', 'x', '--what', '1'],
      ['--out', 'x', '--max-turns', '2'], ['--out', 'x', '--max-turns', '19'],
      ['--out', 'x', '--provisional']]) {
      expect(() => parseArgs(args), args.join(' ')).toThrow();
    }
    expect(parseArgs(['--out', 'x', '--max-turns', '20']).options.maxTurns).toBe(20);
    // A deliberately short sample is allowed only when it SAYS it is not a budget.
    const short = parseArgs(['--out', 'x', '--max-turns', '4', '--openings', '2', '--provisional', 'busy machine']);
    expect(short.options).toMatchObject({ maxTurns: 4, openings: 2, provisional: 'busy machine' });
  });

  /**
   * A provisional calibration is an admitted non-measurement, not a broken one: it
   * may be short, capped and narrow, and it says so. The refusal is therefore about
   * PERMISSION rather than validity — a row has to ask for it by name, and
   * `gate1.ts` only lets a pilot ask.
   */
  it('refuses a provisional calibration unless the row asks for one by name', () => {
    const provisional = manifest({
      provisional: { reason: 'short sample on a busy machine; coordinator runs the real one', eligible: false },
      options: { openings: 2, handicaps: [...HANDICAPS], maxTurns: 4, turnsPerEngine: 8, seed: 1 },
      engines: {
        hard: engine(53155, { coverage: { openings: 2, handicaps: [0, 3] },
          stages: { opening: { ownTurns: 8 }, middle: { ownTurns: 0 }, late: { ownTurns: 0 } } }),
        medium: engine(9000, { coverage: { openings: 2, handicaps: [0, 3] },
          stages: { opening: { ownTurns: 8 }, middle: { ownTurns: 0 }, late: { ownTurns: 0 } } }),
      },
    });
    expect(() => load(provisional)).toThrow(/declares itself PROVISIONAL and ineligible/);
    const accepted = load(provisional, { acceptProvisional: true });
    expect(accepted.provisional).toMatch(/busy machine/);
    expect(accepted.budgets).toEqual({ hard: 53155, medium: 9000 });
    // What it is excused is exactly the COMPLETENESS checks. A provisional manifest
    // still may not lie about its own budget, or omit its provenance, or be a v2.
    expect(() => load({ ...provisional, budgets: { hard: 1, medium: 9000 } }, { acceptProvisional: true }))
      .toThrow(/OVERALL median/);
    expect(() => load({ ...provisional, machine: undefined }, { acceptProvisional: true }))
      .toThrow(/no machine identity/);
    expect(() => load({ ...provisional, schema: 'muju-gate1-calibration-v2' }, { acceptProvisional: true }))
      .toThrow(/not a muju-gate1-calibration-v3/);
  });

  it('names the load ceiling and the allowance it makes for its own thread', () => {
    expect(CALIBRATION_OWN_THREAD_LOAD).toBe(1.0);
    expect(MAX_CALIBRATION_LOAD5).toBe(2.0);
    expect(() => load(manifest({ load: { ...manifest().load, boundaries: boundaryLoad(2.0) } }))).not.toThrow();
    expect(() => load(manifest({ load: { ...manifest().load, boundaries: boundaryLoad(2.01) } })))
      .toThrow(/highest 5-minute load average/);
    // A contended calibration names the other heavy-queue holders it saw, so the
    // operator learns WHO to wait for rather than only that the number was high.
    const contended = manifest({ load: { ...manifest().load, boundaries: {
      ...boundaryLoad(6.4), heavySlotHoldersSeen: [{ holder: 'ladder-shard-3/12 (pid 999)', samples: 40 }] } } });
    expect(load(contended, { accept: ['load'] }).acceptance.reasons[0]).toContain('ladder-shard-3/12 (pid 999)');
  });

  it('parses the override kinds and refuses anything that is not one', () => {
    expect(CALIBRATION_OVERRIDES).toEqual(['load', 'machine', 'age', 'sources']);
    expect(parseCalibrationOverrides('load')).toEqual(['load']);
    expect(parseCalibrationOverrides('age, sources')).toEqual(['age', 'sources']);
    for (const bad of ['', ' ', 'loaded', 'load,load', 'load,nonsense', ',']) {
      expect(() => parseCalibrationOverrides(bad), bad).toThrow();
    }
  });


  it('identifies the machine by what changes how much searching gets done', () => {
    const identity = machineIdentity();
    expect(identity.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(identity.cpuCount).toBeGreaterThan(0);
    expect(machineIdentity().sha256).toBe(identity.sha256);
    expect(identity.node).toBe(process.version);
    // The node version is recorded but is NOT part of the identity hash, so a
    // patch release does not void a twelve-hour calibration.
    const withOtherNode = { ...identity, node: 'v0.0.0-other' };
    expect(loadCalibration(write(manifest()), { now: NOW, machine: withOtherNode, sourceIdentitySha256: SOURCES })
      .acceptance.overridden).toEqual([]);
  });
});

/**
 * WHAT THE MANIFEST SAYS ABOUT ITS OWN WEIGHTING AND ITS OWN LOAD.
 *
 * The budget is the turn-weighted overall median, because A3 §3 names that one. Two
 * things about it were invisible in a v2 manifest and are not any more: a median
 * over turns depends on how long the sampled games ran, and a measurement that
 * begins and ends idle can be contended for hours in between.
 */
describe('weighting, buckets and per-boundary load', () => {
  const sample = (work: number, ownTurnIndex: number, ownTurns: number, opening: string): TurnSample => ({
    difficulty: 'hard', opening, handicap: 0, turn: ownTurnIndex, seat: 'white',
    work, searchMs: 10, searches: 3, ownTurnIndex, ownTurns, stage: stageOf(ownTurnIndex, ownTurns),
  });

  it('labels own turns by ABSOLUTE index as well as by tercile', () => {
    expect(OWN_TURN_BUCKETS.map(b => b.id)).toEqual(['1-5', '6-15', '16+']);
    expect([0, 4].map(bucketOf)).toEqual(['1-5', '1-5']);
    expect([5, 14].map(bucketOf)).toEqual(['6-15', '6-15']);
    expect([15, 99].map(bucketOf)).toEqual(['16+', '16+']);
    // A tercile is relative to its own game, so "late" in a 9-turn game and "late"
    // in a 40-turn game are different positions. These buckets are not.
    const short = sample(100, 8, 9, 'p1-short');
    const long = sample(9000, 8, 40, 'p1-long');
    expect([short.stage, long.stage]).toEqual(['late', 'opening']);
    expect([bucketOf(short.ownTurnIndex), bucketOf(long.ownTurnIndex)]).toEqual(['6-15', '6-15']);
  });

  it('reports the median of per-game medians and flags a disagreement over 25%', () => {
    expect(WEIGHTING_DISAGREEMENT).toBe(0.25);
    // Two short cheap games and one long expensive one. Turn-weighted, the long
    // game supplies most of the samples and pulls the median up; game-weighted,
    // it is one game in three.
    const cheap = [0, 1].flatMap(g => [0, 1].map(i => sample(100, i, 2, `p1-cheap-${g}`)));
    const dear = Array.from({ length: 20 }, (_, i) => sample(10000, i, 20, 'p1-dear'));
    const mixed = weightingComparison([...cheap, ...dear]);
    expect(mixed.games).toBe(3);
    expect(mixed.turnWeightedMedian).toBe(10000);
    expect(mixed.gameWeightedMedian).toBe(100);
    expect(mixed.medianOfPerGameMedians).toBe(100);
    expect(mixed.flagged).toBe(true);
    expect(mixed.note).toMatch(/beyond 25%/);
    // A homogeneous sample is not flagged.
    const even = [0, 1, 2].flatMap(g => Array.from({ length: 6 }, (_, i) => sample(500, i, 6, `p1-even-${g}`)));
    expect(weightingComparison(even)).toMatchObject({ flagged: false, turnWeightedMedian: 500, gameWeightedMedian: 500 });
    // And it all arrives in the engine block, next to the median that IS the budget.
    const summary = summarizeSamples([...cheap, ...dear]);
    expect(summary.overall.medianWorkPerTurn).toBe(10000);
    expect(summary.weighting.flagged).toBe(true);
    expect(summary.ownTurnBuckets['1-5']).toMatchObject({ ownTurns: 9 });
    expect(summary.ownTurnBuckets['16+']).toMatchObject({ ownTurns: 5, medianWorkPerTurn: 10000 });
    expect(summary.overall.medianSearchesPerTurn).toBe(3);
  });

  it('samples the load at every boundary and records who else held a heavy slot', () => {
    const readings = [[0.5, 0.4, 0.3], [3.0, 2.5, 1.0], [1.0, 0.8, 0.6]];
    let i = 0;
    const sampler = new LoadSampler(() => readings[i++] ?? readings[readings.length - 1],
      () => [
        { index: 0, path: 's0', stale: false, record: { pid: process.pid, startedAt: 'x', label: 'gate1-calibrate', host: 'h', cwd: '.' } },
        { index: 1, path: 's1', stale: false, record: { pid: 424242, startedAt: 'x', label: 'ladder-shard-3/12', host: 'h', cwd: '.' } },
        { index: 2, path: 's2', stale: true, record: { pid: 1, startedAt: 'x', label: 'dead-benchmark', host: 'h', cwd: '.' } },
      ]);
    for (const label of ['before', 'middle', 'after']) sampler.sample(label);
    const summary = sampler.summary();
    expect(summary.samples).toBe(3);
    // The MAXIMUM is what a row checks: a contended middle is invisible in a mean
    // and entirely invisible in a start/end pair.
    expect(summary.load5.max).toBe(2.5);
    expect(summary.load5.mean).toBeCloseTo((0.4 + 2.5 + 0.8) / 3, 3);
    expect(summary.load1.max).toBe(3.0);
    // This process's own slot is not competition; a stale holder is not running.
    expect(summary.heavySlotHoldersSeen).toEqual([{ holder: 'ladder-shard-3/12 (pid 424242)', samples: 3 }]);
    expect(summary.note).toContain('every game boundary');
  });
});
