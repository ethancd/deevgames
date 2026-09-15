/**
 * `npm run hard:bench -- --eval --positions <n> [--out <path>]` (DESIGN §5.12,
 * MILESTONES.md M12) and `npm run hard:bench -- --calibrate [--tt-check]
 * --positions <n> --depth <d> --rung <units> [--shards <n>] [--out <path>]`
 * (DESIGN §5.11.6, MILESTONES.md M14). The two modes share the corpus loader
 * and the artifact shape and nothing else.
 *
 * `--calibrate` answers the three questions M14's gate asks of the SEARCH:
 *
 *   1. WORK CALIBRATION (DESIGN §8: `WORK_COST` is "≈ µs; calibrated at M14").
 *      Each work class is micro-benchmarked on this box and the measured µs is
 *      reported next to the shipped cost, together with the ratio `usPerUnit`
 *      that converts a rung into wall-clock here. The costs themselves are NOT
 *      rewritten from the measurement — they are the budget's shape, and DESIGN
 *      §8 fixes them — but a box where the ratio has moved is visible in the
 *      artifact rather than invisible in the depth numbers.
 *   2. DEPTH PER RUNG. Every position is searched at `--rung` and
 *      `depthGe4Share` is the share that completed depth 4 or better. A position
 *      the must-answer layer PROVES (`source !== 'search'`: a home race, a
 *      mate-in-1, a book hit) counts as satisfied and is reported separately as
 *      `provenPositions`: it was answered, not searched, and has no depth to
 *      measure. `quiesceShareMax` is the R5 cap's measurement and
 *      `proverCallsPer1000Macro` the full-prover rate.
 *   3. TT TRANSPARENCY (`--tt-check`). The same fixed-depth search with the
 *      transposition table on and off must return the same root score on every
 *      position; `ttOnOffScoreMismatch` counts the disagreements.
 *
 * `--eval` runs five measurements and writes them to `--out` as one flat JSON
 * object the M12 gate row reads:
 *
 *   1. MIRROR SYMMETRY. `full(p, WHITE)` against `−full(mirror180(p), WHITE)`
 *      on every handicap-0 corpus position. `symmetryFeatureMismatch` is the
 *      sharper per-FEATURE form of the same identity (`f_i(p) === −f_i(mirror)`
 *      for all 58), and `symmetryEconMismatch` isolates the three features that
 *      read `economyDP`'s relocation branch — the one place in the tree where
 *      the identity cannot hold, because `tables/economy.ts
 *      bestRelocationTarget` resolves an exact argmax tie by "lowest square
 *      index" and `s ↦ 99 − s` reverses that order. No deterministic total
 *      order on squares is invariant under a 180° rotation, so this is a
 *      property of DESIGN §5.8's relocation rule itself, not of an
 *      implementation choice; `symmetryMismatch` is therefore measured on the
 *      score with those three terms removed, and `symmetryMismatchRaw` records
 *      the unadjusted count. `symmetryStayInPlaceMismatch` proves the economy
 *      module is seat-symmetric once relocation is off, which is the seat bug
 *      the gate is really hunting. See DEVIATIONS.md under M12.
 *   2. LAZY WINDOWS (DESIGN §5.12.4, F15). `--lazy-positions` positions ×
 *      `--lazy-windows` pseudo-random `(alpha, beta)` windows drawn around the
 *      true score; `evaluate` must land on the same side of every window as
 *      `full`. `lazyExits` counts how often the bound actually short-circuited.
 *   3. DETERMINISM. `--determinism-repeats` repeats of `full` on a sample, each
 *      after `Evaluator.invalidate()`, plus a `make`/`unmake` round trip.
 *   4. THROUGHPUT. Stage 1 (stage 0 + stage 1, level-1 tables built per
 *      position from a cold BFS cache) and stage 2 (`full`), in positions per
 *      second on this box.
 *   5. INVARIANT FIXTURES. `suites/invariants.suite.json`: each violating
 *      position sets exactly its own bit and each correct position sets none.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import type { GameState } from '../../../src/game/types';
import { Replica, allocState, copyState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { MAX_TURN_ACTIONS, type PackedState, type Side } from '../../../src/ai/hard/types';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { economyStayInPlace, newEconResult } from '../../../src/ai/hard/tables/economy';
import { Evaluator, NULL_METER } from '../../../src/ai/hard/eval/evaluate';
import { F, FEATURE_COUNT, FEATURE_NAMES } from '../../../src/ai/hard/eval/features';
import { DEFAULT_WEIGHTS } from '../../../src/ai/hard/eval/weights';
import { INVARIANT_COUNT, invariantBits } from '../../../src/ai/hard/eval/invariants';
import { mirror180, readPositions, type StoredPosition } from '../positions/corpus';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { HardEngine } from '../../../src/ai/hard/engine';
import { WORK_COST } from '../../../src/ai/hard/search/time';
import { QUIESCE_SHARE_DEN, QUIESCE_SHARE_NUM } from '../../../src/ai/hard/search/quiesce';
import type { HardConfig } from '../../../src/ai/hard/config';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const POSITIONS_DIR = path.resolve(import.meta.dirname, '../positions');
const SUITES_DIR = path.resolve(import.meta.dirname, '../suites');
const DEFAULT_OUT = path.resolve(REPO_ROOT, 'lab/results/hard-ai-verify/bench.json');

/** The three features whose value is read off `economyDP`'s relocation branch. */
const ECON_RELOCATION_FEATURES: readonly number[] = [F.EconDelta, F.DepletionWaste, F.RelocationDebt];

interface Args {
  eval: boolean;
  positions: number;
  lazyPositions: number;
  lazyWindows: number;
  determinismPositions: number;
  determinismRepeats: number;
  reps: number;
  seed: number;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    eval: false,
    positions: 500,
    lazyPositions: 100_000,
    lazyWindows: 20,
    determinismPositions: 8,
    determinismRepeats: 1000,
    reps: 5,
    seed: 20260915,
    out: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--eval') args.eval = true;
    else if (a === '--positions') args.positions = Number(argv[++i]);
    else if (a === '--lazy-positions') args.lazyPositions = Number(argv[++i]);
    else if (a === '--lazy-windows') args.lazyWindows = Number(argv[++i]);
    else if (a === '--determinism-positions') args.determinismPositions = Number(argv[++i]);
    else if (a === '--determinism-repeats') args.determinismRepeats = Number(argv[++i]);
    else if (a === '--reps') args.reps = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else throw new Error(`bench: unrecognised argument "${a}"`);
  }
  if (!args.eval) throw new Error('bench: nothing to do (pass --eval)');
  return args;
}

/** `authored.jsonl ++ openings.jsonl ++ fuzz-1000.jsonl`, handicap 0 only. */
function loadCorpus(): StoredPosition[] {
  const out: StoredPosition[] = [];
  for (const f of ['authored.jsonl', 'openings.jsonl', 'fuzz-1000.jsonl']) {
    const p = path.join(POSITIONS_DIR, f);
    if (!fs.existsSync(p)) continue;
    for (const sp of readPositions(p)) if (sp.rules.handicap === 0) out.push(sp);
  }
  return out;
}

/** xorshift32; the bench must be reproducible and `Math.random` is banned in
 * the engine tree (DESIGN §2) — keeping the lab side deterministic too means a
 * failing window can be replayed from the seed alone. */
function rng(seed: number): () => number {
  let s = seed | 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s |= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s |= 0;
    return (s >>> 0) / 4294967296;
  };
}

interface Packed {
  id: string;
  state: GameState;
  p: PackedState;
  mirror: PackedState;
}

function packAll(corpus: readonly StoredPosition[], rep: Replica): Packed[] {
  const out: Packed[] = [];
  for (const sp of corpus) {
    try {
      out.push({ id: sp.id, state: sp.state, p: rep.pack(sp.state), mirror: rep.pack(mirror180(sp.state)) });
    } catch {
      // Positions `pack` rejects (a finished game, say) have no packed form.
    }
  }
  return out;
}

const WHITE: Side = 0;

/** Half-widths the lazy sweep centres its windows at (see the loop below). */
const LAZY_SCALES: readonly number[] = [1_500, 12_000, 120_000];

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const rep = new Replica();
  const sc = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
  const ev = new Evaluator(rep, DEFAULT_WEIGHTS);
  const corpus = loadCorpus();
  const all = packAll(corpus, rep);
  if (all.length === 0) throw new Error('bench: empty corpus');
  const bench = all.slice(0, Math.min(args.positions, all.length));

  // --- 1. mirror symmetry -------------------------------------------------
  const fa = new Int32Array(FEATURE_COUNT);
  const fb = new Int32Array(FEATURE_COUNT);
  const featureMismatch = new Int32Array(FEATURE_COUNT);
  let symmetryMismatch = 0;
  let symmetryMismatchRaw = 0;
  let symmetryFeatureMismatch = 0;
  let symmetryEconMismatch = 0;
  let maxAbsScore = 0;
  let nonIntegral = 0;
  const firstMismatches: string[] = [];
  const econA = newEconResult();
  const econB = newEconResult();
  let symmetryStayInPlaceMismatch = 0;

  for (const item of all) {
    const va = ev.full(item.p, WHITE, sc, 0, fa);
    const vb = ev.full(item.mirror, WHITE, sc, 0, fb);
    if (!Number.isInteger(va) || !Number.isInteger(vb)) nonIntegral++;
    if (Math.abs(va) > maxAbsScore) maxAbsScore = Math.abs(va);
    if (Math.abs(vb) > maxAbsScore) maxAbsScore = Math.abs(vb);

    if (va !== -vb) symmetryMismatchRaw++;
    let econDelta = 0;
    let econBad = false;
    let nonEconBad = false;
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (fa[i] === -fb[i]) continue;
      featureMismatch[i]++;
      if (ECON_RELOCATION_FEATURES.includes(i)) econBad = true;
      else nonEconBad = true;
    }
    for (const i of ECON_RELOCATION_FEATURES) {
      econDelta += DEFAULT_WEIGHTS.w[i] * fa[i] + DEFAULT_WEIGHTS.w[i] * fb[i];
    }
    if (econBad) symmetryEconMismatch++;
    if (nonEconBad) symmetryFeatureMismatch++;
    // `va + vb` is zero exactly when the identity holds; the economy terms are
    // subtracted out on both sides at once.
    if (va + vb - econDelta !== 0) {
      symmetryMismatch++;
      if (firstMismatches.length < 10) firstMismatches.push(`${item.id}: ${va} vs ${vb}`);
    }

    economyStayInPlace(item.p, WHITE, econA);
    economyStayInPlace(item.mirror, 1, econB);
    if (econA.stream !== econB.stream || econA.waste !== econB.waste || econA.relocationDebt !== econB.relocationDebt) {
      symmetryStayInPlaceMismatch++;
    }
  }

  // --- 2. lazy windows ----------------------------------------------------
  const random = rng(args.seed);
  let lazyViolations = 0;
  let lazyChecked = 0;
  let lazyExits = 0;
  const lazyExamples: string[] = [];
  for (let i = 0; i < args.lazyPositions; i++) {
    const item = all[i % all.length];
    const p = i % (2 * all.length) < all.length ? item.p : item.mirror;
    const truth = ev.full(p, WHITE, sc, 0);
    for (let k = 0; k < args.lazyWindows; k++) {
      // Three scales, cycled: a window tight around the truth (the branch that
      // must compute stage 2), one a few thousand cc away, and one far enough
      // out that `boundStage2` can certify the answer without stage 2 at all.
      // Without the widest scale the gate would be vacuous — `lazyExits` would
      // stay 0 and every window would trivially agree.
      const scale = LAZY_SCALES[k % LAZY_SCALES.length];
      const centre = truth + Math.round((random() * 2 - 1) * scale);
      const half = Math.round(random() * 3000);
      const alpha = centre - half;
      const beta = centre + half + 1;
      const got = ev.evaluate(p, WHITE, alpha, beta, sc, 0, NULL_METER);
      lazyChecked++;
      if (got !== truth) lazyExits++;
      const sideGot = got <= alpha ? -1 : got >= beta ? 1 : 0;
      const sideTruth = truth <= alpha ? -1 : truth >= beta ? 1 : 0;
      if (sideGot !== sideTruth) {
        lazyViolations++;
        if (lazyExamples.length < 10) {
          lazyExamples.push(`${item.id}: window [${alpha}, ${beta}] truth ${truth} got ${got}`);
        }
      }
    }
  }

  // --- 3. determinism -----------------------------------------------------
  let nondeterministic = 0;
  let determinismChecked = 0;
  const undo = newUndo();
  const actions = new Int32Array(MAX_TURN_ACTIONS * 64);
  const scratchState = allocState();
  for (let i = 0; i < Math.min(args.determinismPositions, all.length); i++) {
    const p = all[i].p;
    ev.invalidate();
    const base = ev.full(p, WHITE, sc, 0);
    for (let r = 0; r < args.determinismRepeats; r++) {
      ev.invalidate();
      determinismChecked++;
      if (ev.full(p, WHITE, sc, 0) !== base) nondeterministic++;
    }
    // make / unmake round trip on the first legal action of the position.
    copyState(scratchState, p);
    const n = scratchState.phase === 0 ? rep.genPlace(scratchState, actions) : rep.genActions(scratchState, actions);
    if (n > 0) {
      rep.make(scratchState, actions[0], undo);
      rep.unmake(scratchState, undo);
      ev.invalidate();
      determinismChecked++;
      if (ev.full(scratchState, WHITE, sc, 0) !== base) nondeterministic++;
    }
  }

  // --- 4. throughput ------------------------------------------------------
  const stage1Us = time(args.reps, ev, bench, p => {
    ev.stage0(p, WHITE);
    ev.stage1(p, WHITE, sc, 0);
  });
  const stage2Us = time(args.reps, ev, bench, p => {
    ev.full(p, WHITE, sc, 0);
  });

  // --- 5. invariant fixtures ----------------------------------------------
  const invariants = checkInvariantSuite(rep, sc);

  const metrics: Record<string, unknown> = {
    corpusPositions: all.length,
    benchPositions: bench.length,

    symmetryChecked: all.length,
    symmetryMismatch,
    symmetryMismatchRaw,
    symmetryFeatureMismatch,
    symmetryEconMismatch,
    symmetryStayInPlaceMismatch,
    symmetryFeatureBreakdown: featureBreakdown(featureMismatch),
    symmetryExamples: firstMismatches,

    lazyPositions: args.lazyPositions,
    lazyWindows: args.lazyWindows,
    lazyChecked,
    lazyViolations,
    lazyExits,
    lazyExamples,

    determinismChecked,
    nondeterministic,
    nonIntegral,
    maxAbsScore,

    stage1Us: round3(stage1Us),
    stage2Us: round3(stage2Us),
    stage1PerSec: Math.round(1e6 / stage1Us),
    stage2PerSec: Math.round(1e6 / stage2Us),

    invariantFixtures: invariants.total,
    invariantFixturesExact: invariants.exact,
    invariantFailures: invariants.failures,

    weightsLabel: DEFAULT_WEIGHTS.label,
    git: gitRevision(),
    node: process.version,
    at: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(metrics, null, 2) + '\n');
  console.log(`bench: wrote ${args.out}`);
  console.log(
    JSON.stringify({
      symmetryMismatch,
      symmetryMismatchRaw,
      symmetryFeatureMismatch,
      symmetryStayInPlaceMismatch,
      lazyViolations,
      lazyExits,
      nondeterministic,
      maxAbsScore,
      stage1PerSec: metrics.stage1PerSec,
      stage2PerSec: metrics.stage2PerSec,
      invariantFixturesExact: invariants.exact,
    }),
  );

  if (
    symmetryMismatch > 0 ||
    symmetryFeatureMismatch > 0 ||
    symmetryStayInPlaceMismatch > 0 ||
    lazyViolations > 0 ||
    nondeterministic > 0 ||
    nonIntegral > 0 ||
    invariants.exact !== invariants.total
  ) {
    process.exitCode = 1;
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function featureBreakdown(counts: Int32Array): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < counts.length; i++) if (counts[i] > 0) out[FEATURE_NAMES[i]] = counts[i];
  return out;
}

/**
 * Microseconds per position. Every repetition starts from an invalidated
 * evaluator, so each position pays a real first-touch BFS the way a fresh
 * search leaf does; the one `invalidate()` is amortised over the whole sweep.
 */
function time(reps: number, ev: Evaluator, positions: readonly Packed[], fn: (p: PackedState) => void): number {
  for (const item of positions) fn(item.p);
  let best = Infinity;
  for (let r = 0; r < reps; r++) {
    ev.invalidate();
    const t0 = process.hrtime.bigint();
    for (const item of positions) fn(item.p);
    const t1 = process.hrtime.bigint();
    const us = Number(t1 - t0) / 1000 / positions.length;
    if (us < best) best = us;
  }
  return best;
}

interface SuiteCase {
  id: string;
  invariant: number;
  side: 'white' | 'black';
  violating: string;
  correct: string;
}

function checkInvariantSuite(rep: Replica, sc: Scratch): { total: number; exact: number; failures: string[] } {
  const suitePath = path.join(SUITES_DIR, 'invariants.suite.json');
  const positionsPath = path.join(SUITES_DIR, 'invariants.positions.jsonl');
  if (!fs.existsSync(suitePath) || !fs.existsSync(positionsPath)) {
    return { total: 0, exact: 0, failures: ['invariants.suite.json is missing'] };
  }
  const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8')) as { cases: SuiteCase[] };
  const byId = new Map<string, StoredPosition>();
  for (const sp of readPositions(positionsPath)) byId.set(sp.id, sp);
  const tables = allocTables();
  const packed = allocState();
  const failures: string[] = [];
  let exact = 0;

  const bitsOf = (ref: string, side: Side): number => {
    const id = ref.slice(ref.indexOf('#') + 1);
    const sp = byId.get(id);
    if (sp === undefined) throw new Error(`bench: invariants suite references unknown position ${id}`);
    rep.pack(sp.state, packed);
    tables.keyLo = -1 >>> 0;
    tables.keyHi = -1 >>> 0;
    buildTables(packed, sc, 0, 2, tables);
    return invariantBits(packed, tables, side, sc, 0);
  };

  for (const c of suite.cases) {
    const side: Side = c.side === 'white' ? 0 : 1;
    const structural = c.invariant === 15 || c.invariant === 18;
    const want = structural ? 0 : 1 << (c.invariant - 1);
    const violating = bitsOf(c.violating, side);
    const correct = bitsOf(c.correct, side);
    if (violating === want && correct === 0) exact++;
    else failures.push(`${c.id}: violating=${describeBits(violating)} correct=${describeBits(correct)}`);
  }
  return { total: suite.cases.length, exact, failures };
}

function describeBits(bits: number): string {
  if (bits === 0) return 'none';
  const out: number[] = [];
  for (let i = 0; i < INVARIANT_COUNT; i++) if ((bits >>> i) & 1) out.push(i + 1);
  return out.join(',');
}

function gitRevision(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// --- M14: `--calibrate` -------------------------------------------------------

interface CalibrateArgs {
  positions: number;
  depth: number;
  rung: number;
  shards: number;
  shardIndex: number;
  shardCount: number;
  ttCheck: boolean;
  out: string;
}

function parseCalibrateArgs(argv: string[]): CalibrateArgs {
  const args: CalibrateArgs = {
    positions: 200,
    depth: 3,
    rung: 3_200_000,
    shards: 1,
    shardIndex: -1,
    shardCount: 1,
    ttCheck: false,
    out: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--calibrate') continue;
    else if (a === '--tt-check') args.ttCheck = true;
    else if (a === '--positions') args.positions = Number(argv[++i]);
    else if (a === '--depth') args.depth = Number(argv[++i]);
    else if (a === '--rung') args.rung = Number(argv[++i]);
    else if (a === '--shards') args.shards = Number(argv[++i]);
    else if (a === '--shard-index') args.shardIndex = Number(argv[++i]);
    else if (a === '--shard-count') args.shardCount = Number(argv[++i]);
    else if (a === '--out') args.out = path.resolve(REPO_ROOT, argv[++i]);
    else throw new Error(`bench --calibrate: unrecognised argument "${a}"`);
  }
  return args;
}

interface CalibratePartial {
  positions: number;
  proven: number;
  depthGe4: number;
  depthSum: number;
  quiesceShareMax: number;
  quiesceShareUncappedMax: number;
  quiesceCapTripped: number;
  macroNodes: number;
  proverCalls: number;
  workSum: number;
  elapsedMsSum: number;
  ttChecked: number;
  ttMismatch: number;
  ttMismatchIds: string[];
  shallow: string[];
}

function emptyCalibratePartial(): CalibratePartial {
  return {
    positions: 0, proven: 0, depthGe4: 0, depthSum: 0, quiesceShareMax: 0,
    quiesceShareUncappedMax: 0, quiesceCapTripped: 0,
    macroNodes: 0, proverCalls: 0, workSum: 0, elapsedMsSum: 0,
    ttChecked: 0, ttMismatch: 0, ttMismatchIds: [], shallow: [],
  };
}

/** Measured µs per unit of each `WorkClass`, on this box. */
function measureWorkCost(ev: Evaluator, sample: readonly Packed[]): Record<string, number> {
  const sc = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
  const tables = allocTables();
  const stage1Us = time(3, ev, sample, p => { ev.stage0(p, WHITE); ev.stage1(p, WHITE, sc, 0); });
  const fullUs = time(3, ev, sample, p => { ev.full(p, WHITE, sc, 0); });
  const tablesUs = time(3, ev, sample, p => {
    tables.keyLo = -1 >>> 0;
    tables.keyHi = -1 >>> 0;
    buildTables(p, sc, 0, 2, tables);
  });
  return {
    EVAL1: round3(stage1Us),
    EVAL2: round3(fullUs - stage1Us),
    KILLTABLE: round3(tablesUs),
  };
}

async function calibrateMain(argv: string[]): Promise<void> {
  const args = parseCalibrateArgs(argv);
  const corpus = loadCorpus();
  const bench = corpus.slice(0, Math.min(args.positions, corpus.length));

  if (args.shardIndex >= 0) {
    const mine = bench.filter((_, i) => i % args.shardCount === args.shardIndex);
    const partial = await runCalibrateShard(args, mine);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(partial) + '\n');
    return;
  }

  const shards = Math.max(1, Math.min(args.shards, bench.length));
  let merged: CalibratePartial;
  if (shards <= 1) {
    merged = await runCalibrateShard(args, bench);
  } else {
    const dir = path.join(path.dirname(args.out), `.bench-shards-${process.pid}`);
    fs.mkdirSync(dir, { recursive: true });
    const runs: Promise<CalibratePartial>[] = [];
    for (let i = 0; i < shards; i++) runs.push(spawnCalibrateShard(args, i, shards, path.join(dir, `shard-${i}.json`)));
    const parts = await Promise.all(runs);
    merged = emptyCalibratePartial();
    for (const part of parts) {
      merged.positions += part.positions;
      merged.proven += part.proven;
      merged.depthGe4 += part.depthGe4;
      merged.depthSum += part.depthSum;
      merged.macroNodes += part.macroNodes;
      merged.proverCalls += part.proverCalls;
      merged.workSum += part.workSum;
      merged.elapsedMsSum += part.elapsedMsSum;
      merged.ttChecked += part.ttChecked;
      merged.ttMismatch += part.ttMismatch;
      merged.quiesceCapTripped += part.quiesceCapTripped;
      if (part.quiesceShareMax > merged.quiesceShareMax) merged.quiesceShareMax = part.quiesceShareMax;
      if (part.quiesceShareUncappedMax > merged.quiesceShareUncappedMax) {
        merged.quiesceShareUncappedMax = part.quiesceShareUncappedMax;
      }
      for (const id of part.ttMismatchIds) if (merged.ttMismatchIds.length < 20) merged.ttMismatchIds.push(id);
      for (const id of part.shallow) if (merged.shallow.length < 40) merged.shallow.push(id);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const rep = new Replica();
  const ev = new Evaluator(rep, DEFAULT_WEIGHTS);
  const sample = packAll(corpus.slice(0, 64), rep);
  const measuredUs = measureWorkCost(ev, sample);
  const usPerUnit = merged.workSum === 0 ? 0 : (merged.elapsedMsSum * 1000) / merged.workSum;

  const metrics = {
    mode: 'calibrate',
    positions: merged.positions,
    provenPositions: merged.proven,
    rung: args.rung,
    depth: args.depth,
    shards,
    depthGe4Share: merged.positions === 0 ? 0 : (merged.depthGe4 + merged.proven) / merged.positions,
    meanDepth: merged.positions === merged.proven ? 0 : merged.depthSum / Math.max(1, merged.positions - merged.proven),
    quiesceShareMax: round3(merged.quiesceShareMax),
    quiesceShareUncappedMax: round3(merged.quiesceShareUncappedMax),
    quiesceUncappedRung: UNCAPPED_RUNG,
    quiesceCapTripped: merged.quiesceCapTripped,
    quiesceCapNum: QUIESCE_SHARE_NUM,
    quiesceCapDen: QUIESCE_SHARE_DEN,
    proverCallsPer1000Macro: merged.macroNodes === 0 ? 0 : (merged.proverCalls * 1000) / merged.macroNodes,
    ttOnOffScoreMismatch: merged.ttMismatch,
    ttChecked: merged.ttChecked,
    ttMismatchIds: merged.ttMismatchIds,
    shallowPositions: merged.shallow,
    nodesPerSec: merged.elapsedMsSum === 0 ? 0 : (merged.macroNodes * 1000) / merged.elapsedMsSum,
    unitsPerMs: merged.elapsedMsSum === 0 ? 0 : merged.workSum / merged.elapsedMsSum,
    usPerUnit: round3(usPerUnit),
    workCost: Array.from(WORK_COST),
    measuredUs,
    git: gitRevision(),
    at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(metrics, null, 2) + '\n');
  console.log(`hard:bench --calibrate: wrote ${args.out}`);
  console.log(JSON.stringify({
    depthGe4Share: metrics.depthGe4Share,
    quiesceShareMax: metrics.quiesceShareMax,
    quiesceShareUncappedMax: metrics.quiesceShareUncappedMax,
    quiesceCapTripped: metrics.quiesceCapTripped,
    proverCallsPer1000Macro: metrics.proverCallsPer1000Macro,
    ttOnOffScoreMismatch: metrics.ttOnOffScoreMismatch,
    usPerUnit: metrics.usPerUnit,
  }));
}

function spawnCalibrateShard(args: CalibrateArgs, index: number, count: number, tmp: string): Promise<CalibratePartial> {
  const cliArgs = [
    '--import', 'tsx', SELF_PATH, '--calibrate',
    ...(args.ttCheck ? ['--tt-check'] : []),
    '--positions', String(args.positions),
    '--depth', String(args.depth),
    '--rung', String(args.rung),
    '--shard-index', String(index),
    '--shard-count', String(count),
    '--out', tmp,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, cliArgs, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += String(d); });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`hard:bench shard ${index}/${count} exited ${code}:\n${stderr.slice(-4000)}`));
        return;
      }
      try {
        resolve(JSON.parse(fs.readFileSync(tmp, 'utf8')) as CalibratePartial);
      } catch (err) {
        reject(new Error(`hard:bench shard ${index}/${count}: unreadable partial ${tmp}: ${String(err)}`));
      }
    });
  });
}

async function runCalibrateShard(args: CalibrateArgs, items: readonly StoredPosition[]): Promise<CalibratePartial> {
  const partial = emptyCalibratePartial();
  for (const sp of items) {
    setElementGraph(sp.rules.elementGraph);
    setUpkeepVariant(sp.rules.upkeep);
    setCombatHandicap('white', sp.rules.combatHandicap.white);
    setCombatHandicap('black', sp.rules.combatHandicap.black);

    const engine = new HardEngine();
    const started = Date.now();
    const result = await engine.searchTurn(sp.state, { work: args.rung });
    const elapsedMs = Date.now() - started;
    partial.positions++;
    partial.workSum += result.work;
    partial.elapsedMsSum += elapsedMs;
    partial.macroNodes += result.stats.nodes;
    partial.proverCalls += result.stats.proverCalls;
    if (result.source !== 'search') {
      partial.proven++;
    } else {
      partial.depthSum += result.depth;
      if (result.depth >= 4) partial.depthGe4++;
      else if (partial.shallow.length < 40) partial.shallow.push(`${sp.id}:d${result.depth}`);
      // DESIGN §5.11.4 writes the R5 gate as `byClass[QUIESCE] <= 0.35 x
      // meter.LIMIT`, so the rung is the denominator. Dividing by the units
      // actually SPENT (which is below the rung whenever iterative deepening
      // declines to start an iteration it cannot finish) measures a different,
      // much jumpier quantity.
      const share = result.stats.quiesceWork / args.rung;
      if (share > partial.quiesceShareMax) partial.quiesceShareMax = share;
      if (share * QUIESCE_SHARE_DEN >= QUIESCE_SHARE_NUM) partial.quiesceCapTripped++;
    }

    // THE UNCAPPED ARM. `search/quiesce.ts` ENFORCES the R5 share, so the
    // number above is bounded by the enforcement threshold and says nothing
    // about how much quiescence WANTED. This arm switches the enforcement off
    // and measures that, at a cheaper rung so the honest number costs a
    // fraction of the run rather than doubling it. Reported next to the capped
    // one so the artifact says which of the two each number is.
    {
      const uncapped = new HardEngine();
      uncapped.setQuiesceCap(false);
      const r = await uncapped.searchTurn(sp.state, { work: UNCAPPED_RUNG });
      if (r.source === 'search') {
        const share = r.stats.quiesceWork / UNCAPPED_RUNG;
        if (share > partial.quiesceShareUncappedMax) partial.quiesceShareUncappedMax = share;
      }
    }

    if (args.ttCheck) {
      // BOTH ARMS RUN THE SHIPPED SEARCH. The clause MILESTONES.md M14 writes
      // is "TT on vs off, fixed depth 3, same score on 200 positions", and the
      // only thing that makes it worth measuring is that the arm on the left is
      // the engine that ships. An earlier revision narrowed EXACT hits to
      // `e.depth === depth` on both arms on the theory that a deeper EXACT
      // entry breaks the identity; measured over this corpus it does not
      // (`shippedScoreMismatch 0`, `shippedDepthMismatch 0` on all 200), so the
      // narrowing bought nothing and cost the gate its meaning. It is gone.
      const withTT = new HardEngine(ttCheckConfig(args.depth));
      const withoutTT = new HardEngine(ttCheckConfig(args.depth));
      withoutTT.setUseTT(false);
      const a = await withTT.searchTurn(sp.state, { work: TT_CHECK_WORK });
      const b = await withoutTT.searchTurn(sp.state, { work: TT_CHECK_WORK });
      partial.ttChecked++;
      if (a.scoreCc !== b.scoreCc || a.depth !== b.depth) {
        partial.ttMismatch++;
        if (partial.ttMismatchIds.length < 20) {
          partial.ttMismatchIds.push(`${sp.id}: tt=${a.scoreCc}@d${a.depth} noTt=${b.scoreCc}@d${b.depth}`);
        }
      }
    }
  }
  return partial;
}

/**
 * The TT comparison's search shape.
 *
 * `--depth` and not the meter must decide when the search stops, or the two
 * arms could differ by TRUNCATION rather than by the table — so the budget is
 * far above what a depth-`d` search needs. That in turn switches off the R5 cap
 * (0.34 of an enormous limit is not a limit), and an uncapped quiescence at
 * every depth-0 leaf is what the measurement then spends its time on. Since
 * quiescence never touches the macro transposition table, it has nothing to
 * contribute to a test of that table: `quiesce.maxPly = 0` turns every leaf
 * into a stand-pat on BOTH arms, and the comparison is exactly the macro search
 * with the table on and off.
 */
function ttCheckConfig(depth: number): Partial<HardConfig> {
  return { maxDepth: depth, quiesce: { maxPly: 0, deltaMarginCc: 300, maxCandidates: 8 } };
}

const TT_CHECK_WORK = 40_000_000;

/** The uncapped quiescence arm's rung (see `runCalibrateShard`). A share is a
 * ratio, so it does not need the full desktop rung to be representative, and an
 * eighth of it keeps the honest number cheap. */
const UNCAPPED_RUNG = 400_000;
const SELF_PATH = path.resolve(import.meta.dirname, 'run.ts');

const ARGV = process.argv.slice(2);
if (ARGV.includes('--calibrate')) {
  calibrateMain(ARGV).catch(err => {
    console.error(`hard:bench: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
  });
} else {
  main();
}
