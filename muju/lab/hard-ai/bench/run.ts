/**
 * `npm run hard:bench -- --eval --positions <n> [--out <path>]` (DESIGN §5.12,
 * MILESTONES.md M12). Throughput and correctness measurements for the
 * evaluator; M14 extends the same runner with `--calibrate` and `--tt-check`.
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
import { execFileSync } from 'node:child_process';
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

main();
