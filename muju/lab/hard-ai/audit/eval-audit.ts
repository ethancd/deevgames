/**
 * `npm run hard:eval-audit` — the E3.1 contribution, scale and cost instrument
 * (`docs/hard-ai/e3/E3-PLAN.md`, lane 4; EPIC-PLAN §4 E3.1 "expose feature
 * contributions, scale and cost").
 *
 * Usage:
 *   npm run hard:eval-audit -- --positions <jsonl> [--positions <jsonl> ...]
 *        [--exam <cases.jsonl>] [--limit n] [--reps n] --out <dir>
 *
 * For every position it packs the canonical `GameState` and calls
 * `Evaluator.full` with `outFeatures` under `DEFAULT_WEIGHTS`, once from the
 * side to move and once from the other side, and records:
 *
 *   - `f[i]` (the raw symmetric-difference feature) and `c[i] = w[i] · f[i]`
 *     (its contribution in centi-crystals) for all 58 features;
 *   - the five group sums of `eval-groups.ts` (coordinator-owned; imported,
 *     never edited) and the three stage sums of `STAGE_OF`;
 *   - the evaluator's own `stage0`/`stage1`/`stage2` returns next to those
 *     stage sums, which is the only place `Material` can disagree (see
 *     MATERIAL below);
 *   - per-position stage cost in µs over `--reps` repetitions.
 *
 * THREE CHECKS, all decided by arithmetic on the engine's own output:
 *
 *   1. SIDE SWAP. `f_i(p, side)` must equal `−f_i(p, 1 − side)` for all 58
 *      features. `extract` writes `f(me) − f(them)` by construction (DESIGN
 *      §5.12.1), so a failure is a feature that reads a seat rather than a
 *      point of view. Nothing is rotated here, so relocation's argmax tie-break
 *      cannot excuse a failure.
 *   2. ROT180. `mirror180(state)` (`positions/corpus.ts`) rotates the board
 *      180° and swaps the seats, so the player who was `side` in `p` is
 *      `1 − side` in the mirror. Per feature, `f_i(mirror, 1 − side)` must
 *      EQUAL `f_i(p, side)` — the same player, the same position, a different
 *      spelling. That is `canonicalKey`'s `negated` flag written out: with the
 *      seats swapped the score of the mirror is the negation of the score of
 *      the original, and with the root swapped back it is the identity.
 *      NO `PackedState` TRANSFORM IS EXPORTED. `src/ai/hard/book/probe.ts`
 *      has `mirrorInto`, the packed-state rotation `canonicalKey` uses, but it
 *      is module-private and writes into one shared buffer; only
 *      `canonicalKey(p) -> {lo, hi, negated}` is exported, and a key cannot be
 *      evaluated. This tool therefore rotates the canonical `GameState` with
 *      `mirror180` and re-packs, which is what `lab/hard-ai/bench/run.ts
 *      --eval`'s M12 symmetry gate does as well.
 *   3. SCORE IDENTITY. `Σ_i w[i] · f[i]` must equal `full`'s return, and the
 *      five group sums must partition that same total.
 *
 * MATERIAL. `Evaluator.stage0` scores feature 0 from the 18 `w.material`
 * parameters (`Σ_d material[d] · (n_me[d] − n_them[d])` in cc), while
 * `extract` — which DESIGN §4.15 gives no `Weights` — writes the weight-free
 * catalogue prior `div100(p.materialCc[me] − p.materialCc[them])` into
 * `outFeatures[F.Material]`. The two agree only when `w[Material] === 100` and
 * `material[d] === cost[d] × 100`, which is what `DEFAULT_WEIGHTS` holds.
 * `materialResidual` in the artifact measures the gap on every position rather
 * than assuming it, and `scoreIdentity` would catch it if it opened.
 *
 * RULES ARE PROCESS-GLOBAL. Every position carries a `rules` block because
 * `setElementGraph`/`setUpkeepVariant`/`setCombatHandicap` are module-level in
 * `src/game`; `withOpeningRules` installs and restores them around each item.
 *
 * WEIGHTS. This tool builds no engine; it builds an `Evaluator` directly and
 * asserts `DEFAULT_WEIGHTS.version !== 0`, which is E0's I2 lesson (an
 * `armHardConfig()` engine plays with the version-0 placeholder vector) in the
 * form E3-PLAN.md's rules section states it.
 *
 * Artifacts under `--out`: `summary.json`, `summary.md`, `features.jsonl`
 * (per-position vectors, at most `--limit` rows, uncompressed) and
 * `violations.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import { Evaluator } from '../../../src/ai/hard/eval/evaluate';
import { FEATURE_COUNT, FEATURE_NAMES, STAGE_OF } from '../../../src/ai/hard/eval/features';
import { DEFAULT_WEIGHTS, weightsHash } from '../../../src/ai/hard/eval/weights';
import { mirror180 } from '../positions/corpus';
import { withOpeningRules } from '../ladder/openings';
import { EVAL_GROUPS, EVAL_GROUP_NAMES, GROUP_OF, type EvalGroup } from './eval-groups';
import { loadExamFile, loadPositionFile, type AuditItem } from './eval-corpus';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface EvalAuditArgs {
  positions: string[];
  exam: string[];
  /** Cap on the number of `features.jsonl` rows written. */
  limit: number;
  /** Repetitions per timed call; the per-position sample is their median. */
  reps: number;
  out: string;
  /** Name printed in the artifacts; defaults to the last path segment of `--out`. */
  corpus: string;
}

export function parseArgs(argv: readonly string[]): EvalAuditArgs {
  const a: EvalAuditArgs = { positions: [], exam: [], limit: 500, reps: 5, out: '', corpus: '' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case '--positions': a.positions.push(need(v, k)); i++; break;
      case '--exam': a.exam.push(need(v, k)); i++; break;
      case '--limit': a.limit = int(need(v, k), k); i++; break;
      case '--reps': a.reps = int(need(v, k), k); i++; break;
      case '--out': a.out = need(v, k); i++; break;
      case '--corpus': a.corpus = need(v, k); i++; break;
      default: throw new Error(`eval-audit: unknown argument ${k}`);
    }
  }
  if (a.positions.length === 0 && a.exam.length === 0) {
    throw new Error('eval-audit: pass at least one --positions <jsonl> or --exam <cases.jsonl>');
  }
  if (a.out === '') throw new Error('eval-audit: --out <dir> is required');
  if (a.reps < 1) throw new Error('eval-audit: --reps must be at least 1');
  if (a.limit < 0) throw new Error('eval-audit: --limit must not be negative');
  if (a.corpus === '') a.corpus = path.basename(path.resolve(a.out));
  return a;
}

function need(v: string | undefined, k: string): string {
  if (v === undefined || v.startsWith('--')) throw new Error(`eval-audit: ${k} needs a value`);
  return v;
}

function int(v: string, k: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`eval-audit: ${k} needs an integer, got ${v}`);
  return n;
}

// ---------------------------------------------------------------------------
// Per-position measurement
// ---------------------------------------------------------------------------

/** One position's feature vectors and the three checks' outcome. */
export interface PositionRecord {
  id: string;
  source: string;
  bucket: AuditItem['bucket'];
  tags: string[];
  /** 0 = white, 1 = black; the side to move, which is the evaluation root. */
  side: Side;
  /** `full(p, side)`; centi-crystals from the side to move. */
  score: number;
  /** `full(p, 1 - side)`. */
  scoreOther: number;
  /** `Σ_i w[i] · f[i]` — equals `score` when the score identity holds. */
  sumWf: number;
  /** `sumWf - score`. */
  scoreResidual: number;
  /** The evaluator's own `stage0` / `stage1` / `stage2` returns. */
  stageReturns: [number, number, number];
  /** `Σ w·f` restricted to each stage, from the same vector. */
  stageSums: [number, number, number];
  /** `stageSums[0] - stageReturns[0]`: the only place `Material` can disagree. */
  materialResidual: number;
  groupSums: Record<EvalGroup, number>;
  /** The 58 raw features from the side to move. */
  f: number[];
  /** `w[i] · f[i]`, centi-crystals. */
  c: number[];
  /** Feature indices where `f_i(p, side) !== -f_i(p, 1 - side)`. */
  sideSwapBad: number[];
  /** Feature indices where `f_i(mirror, 1 - side) !== f_i(p, side)`; `null` when the mirror did not pack. */
  rot180Bad: number[] | null;
  /** The mirror's value at each index of `rot180Bad`, same order. */
  rot180BadValues: number[] | null;
  /**
   * `Σ_i w[i] · (f_i(mirror, 1 - side) − f_i(p, side))` over the violating
   * features: how many centi-crystals the two spellings of the same position
   * disagree by. 0 when there is no violation.
   */
  rot180ScoreDelta: number;
}

const WHITE: Side = 0;

function other(s: Side): Side {
  return (1 - s) as Side;
}

/** A measurement context: one replica, one scratch, one evaluator, reused. */
export interface Ctx {
  rep: Replica;
  sc: Scratch;
  ev: Evaluator;
  fMover: Int32Array;
  fOther: Int32Array;
  fMirror: Int32Array;
}

export function newCtx(): Ctx {
  if (DEFAULT_WEIGHTS.version === 0) {
    throw new Error('eval-audit: DEFAULT_WEIGHTS.version is 0 (placeholder weights); refusing to measure');
  }
  const rep = new Replica();
  return {
    rep,
    sc: new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2),
    ev: new Evaluator(rep, DEFAULT_WEIGHTS),
    fMover: new Int32Array(FEATURE_COUNT),
    fOther: new Int32Array(FEATURE_COUNT),
    fMirror: new Int32Array(FEATURE_COUNT),
  };
}

/** A packed position with its rules installed for the caller's `fn`. */
function withRules<T>(item: AuditItem, fn: () => T): T {
  return withOpeningRules(
    {
      blackCrystalHandicap: item.rules.handicap,
      elementGraph: item.rules.elementGraph,
      upkeep: item.rules.upkeep,
      handicap: item.rules.combatHandicap,
    },
    fn,
  );
}

export function measure(ctx: Ctx, item: AuditItem): PositionRecord {
  const { rep, sc, ev, fMover, fOther, fMirror } = ctx;
  return withRules(item, () => {
    const p: PackedState = rep.pack(item.state);
    const side = p.side as Side;

    const score = ev.full(p, side, sc, 0, fMover);
    const scoreOther = ev.full(p, other(side), sc, 0, fOther);

    const w = DEFAULT_WEIGHTS.w;
    const f: number[] = new Array<number>(FEATURE_COUNT);
    const c: number[] = new Array<number>(FEATURE_COUNT);
    const stageSums: [number, number, number] = [0, 0, 0];
    const groupSums = {} as Record<EvalGroup, number>;
    for (const g of EVAL_GROUP_NAMES) groupSums[g] = 0;
    let sumWf = 0;
    const sideSwapBad: number[] = [];
    for (let i = 0; i < FEATURE_COUNT; i++) {
      const v = fMover[i];
      const ci = w[i] * v;
      f[i] = v;
      c[i] = ci;
      sumWf += ci;
      stageSums[STAGE_OF[i]] += ci;
      groupSums[GROUP_OF[i]] += ci;
      if (fOther[i] !== -v) sideSwapBad.push(i);
    }

    // The evaluator's own stage returns, recomputed on the same position.
    const s0 = ev.stage0(p, side);
    const s1 = ev.stage1(p, side, sc, 0);
    const s2 = ev.stage2(p, side, sc, 0);

    // rot180: the same player, the board rotated and the seats swapped.
    let rot180Bad: number[] | null = null;
    let rot180BadValues: number[] | null = null;
    let rot180ScoreDelta = 0;
    try {
      const q = rep.pack(mirror180(item.state));
      ev.full(q, other(side), sc, 0, fMirror);
      rot180Bad = [];
      rot180BadValues = [];
      for (let i = 0; i < FEATURE_COUNT; i++) {
        if (fMirror[i] === fMover[i]) continue;
        rot180Bad.push(i);
        rot180BadValues.push(fMirror[i]);
        rot180ScoreDelta += w[i] * (fMirror[i] - fMover[i]);
      }
    } catch {
      rot180Bad = null;
      rot180BadValues = null;
      rot180ScoreDelta = 0;
    }

    return {
      id: item.id,
      source: item.source,
      bucket: item.bucket,
      tags: item.tags,
      side,
      score,
      scoreOther,
      sumWf,
      scoreResidual: sumWf - score,
      stageReturns: [s0, s1, s2],
      stageSums,
      materialResidual: stageSums[0] - s0,
      groupSums,
      f,
      c,
      sideSwapBad,
      rot180Bad,
      rot180BadValues,
      rot180ScoreDelta,
    };
  });
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

export interface CostStats {
  /** µs per call, mean over positions of the per-position median. */
  meanUs: number;
  /** The 95th percentile of the same per-position sample (nearest-rank). */
  p95Us: number;
  n: number;
}

function stats(samples: readonly number[]): CostStats {
  if (samples.length === 0) return { meanUs: 0, p95Us: 0, n: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const rank = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);
  return { meanUs: mean, p95Us: sorted[Math.max(0, rank)], n: sorted.length };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface PackedItem {
  item: AuditItem;
  p: PackedState;
  side: Side;
}

/**
 * One timed pass per variant over the WHOLE list, in list order, so the
 * evaluator's one-position table cache (`NodeTables.keyLo/keyHi`) misses on
 * every call — the cold-table regime `bench/run.ts --eval`'s throughput
 * measurement uses. The shared BFS distance cache inside `NodeTables` is NOT
 * invalidated, here or in the bench: a one-position list therefore measures
 * warm tables and is reported with `n = 1`.
 */
function timeStages(ctx: Ctx, packed: readonly PackedItem[], reps: number): Record<string, CostStats> {
  const { sc, ev } = ctx;
  const run = (fn: (pi: PackedItem) => void): number[] => {
    for (const pi of packed) fn(pi); // warm-up pass, discarded
    const perPosition: number[][] = packed.map(() => []);
    for (let r = 0; r < reps; r++) {
      for (let k = 0; k < packed.length; k++) {
        const t0 = process.hrtime.bigint();
        fn(packed[k]);
        const t1 = process.hrtime.bigint();
        perPosition[k].push(Number(t1 - t0) / 1000);
      }
    }
    return perPosition.map(median);
  };

  const s0 = run(pi => { ev.stage0(pi.p, pi.side); });
  const s01 = run(pi => { ev.stage0(pi.p, pi.side); ev.stage1(pi.p, pi.side, sc, 0); });
  const full = run(pi => { ev.full(pi.p, pi.side, sc, 0); });

  const s1 = s01.map((v, i) => v - s0[i]);
  const s2 = full.map((v, i) => v - s01[i]);
  return {
    stage0: stats(s0),
    stage1: stats(s1),
    stage2: stats(s2),
    stage0plus1: stats(s01),
    full: stats(full),
  };
}

// ---------------------------------------------------------------------------
// Corpus statistics
// ---------------------------------------------------------------------------

export interface FeatureStats {
  index: number;
  name: string;
  group: EvalGroup;
  stage: number;
  w: number;
  /** Positions where `f[i] !== 0`. */
  nonzero: number;
  nonzeroShare: number;
  meanAbsContribution: number;
  maxAbsContribution: number;
  /** `Σ|c_i| / Σ_j Σ|c_j|` over the corpus. */
  shareOfAbsTotal: number;
  positive: number;
  negative: number;
  /** `(positive - negative) / nonzero`, 0 when the feature never fires. */
  signBalance: number;
  meanF: number;
  maxAbsF: number;
}

export interface GroupStats {
  group: EvalGroup;
  features: number;
  nonzeroPositions: number;
  meanAbsSum: number;
  maxAbsSum: number;
  shareOfAbsTotal: number;
  positive: number;
  negative: number;
}

export interface CorrelationPair {
  a: number;
  b: number;
  nameA: string;
  nameB: string;
  groupA: EvalGroup;
  groupB: EvalGroup;
  r: number;
  /** Positions where both contributions are nonzero. */
  bothNonzero: number;
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n;
  const my = sy / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Pearson correlation of the contribution `c_i = w[i]·f[i]` across positions,
 * for every pair of features that fires often enough to say anything: both
 * features nonzero in at least `minFiring` positions. A feature that fires
 * twice would otherwise produce `|r| = 1` against anything.
 */
export function correlatedPairs(
  records: readonly PositionRecord[],
  minFiring: number,
  top: number,
): CorrelationPair[] {
  const n = records.length;
  const cols: (number[] | null)[] = new Array<number[] | null>(FEATURE_COUNT).fill(null);
  const firing = new Array<number>(FEATURE_COUNT).fill(0);
  for (let i = 0; i < FEATURE_COUNT; i++) {
    const col = new Array<number>(n);
    let fired = 0;
    for (let k = 0; k < n; k++) {
      col[k] = records[k].c[i];
      if (col[k] !== 0) fired++;
    }
    firing[i] = fired;
    cols[i] = fired >= minFiring ? col : null;
  }
  const out: CorrelationPair[] = [];
  for (let i = 0; i < FEATURE_COUNT; i++) {
    const ci = cols[i];
    if (ci === null) continue;
    for (let j = i + 1; j < FEATURE_COUNT; j++) {
      const cj = cols[j];
      if (cj === null) continue;
      const r = pearson(ci, cj);
      if (!Number.isFinite(r) || r === 0) continue;
      let both = 0;
      for (let k = 0; k < n; k++) if (ci[k] !== 0 && cj[k] !== 0) both++;
      out.push({
        a: i, b: j,
        nameA: FEATURE_NAMES[i], nameB: FEATURE_NAMES[j],
        groupA: GROUP_OF[i], groupB: GROUP_OF[j],
        r, bothNonzero: both,
      });
    }
  }
  out.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  return out.slice(0, top);
}

export function featureStats(records: readonly PositionRecord[]): FeatureStats[] {
  const n = Math.max(1, records.length);
  const w = DEFAULT_WEIGHTS.w;
  let absTotal = 0;
  const absSum = new Array<number>(FEATURE_COUNT).fill(0);
  for (const r of records) for (let i = 0; i < FEATURE_COUNT; i++) { absSum[i] += Math.abs(r.c[i]); }
  for (let i = 0; i < FEATURE_COUNT; i++) absTotal += absSum[i];
  const out: FeatureStats[] = [];
  for (let i = 0; i < FEATURE_COUNT; i++) {
    let nonzero = 0;
    let pos = 0;
    let neg = 0;
    let maxAbs = 0;
    let sumF = 0;
    let maxAbsF = 0;
    for (const r of records) {
      const fi = r.f[i];
      const ci = r.c[i];
      if (fi !== 0) nonzero++;
      if (ci > 0) pos++;
      else if (ci < 0) neg++;
      const a = Math.abs(ci);
      if (a > maxAbs) maxAbs = a;
      sumF += fi;
      if (Math.abs(fi) > maxAbsF) maxAbsF = Math.abs(fi);
    }
    out.push({
      index: i,
      name: FEATURE_NAMES[i],
      group: GROUP_OF[i],
      stage: STAGE_OF[i],
      w: w[i],
      nonzero,
      nonzeroShare: nonzero / n,
      meanAbsContribution: absSum[i] / n,
      maxAbsContribution: maxAbs,
      shareOfAbsTotal: absTotal === 0 ? 0 : absSum[i] / absTotal,
      positive: pos,
      negative: neg,
      signBalance: nonzero === 0 ? 0 : (pos - neg) / nonzero,
      meanF: sumF / n,
      maxAbsF,
    });
  }
  return out;
}

export function groupStats(records: readonly PositionRecord[]): GroupStats[] {
  const n = Math.max(1, records.length);
  const absSum = {} as Record<EvalGroup, number>;
  for (const g of EVAL_GROUP_NAMES) absSum[g] = 0;
  for (const r of records) for (const g of EVAL_GROUP_NAMES) absSum[g] += Math.abs(r.groupSums[g]);
  let absTotal = 0;
  for (const g of EVAL_GROUP_NAMES) absTotal += absSum[g];
  return EVAL_GROUP_NAMES.map(g => {
    let nonzero = 0;
    let pos = 0;
    let neg = 0;
    let maxAbs = 0;
    for (const r of records) {
      const v = r.groupSums[g];
      if (v !== 0) nonzero++;
      if (v > 0) pos++;
      else if (v < 0) neg++;
      if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
    }
    return {
      group: g,
      features: EVAL_GROUPS[g].length,
      nonzeroPositions: nonzero,
      meanAbsSum: absSum[g] / n,
      maxAbsSum: maxAbs,
      shareOfAbsTotal: absTotal === 0 ? 0 : absSum[g] / absTotal,
      positive: pos,
      negative: neg,
    };
  });
}

// ---------------------------------------------------------------------------
// Violations
// ---------------------------------------------------------------------------

/** At most this many example ids are listed per feature per check. */
const EXAMPLE_CAP = 25;

export interface ViolationFeature {
  index: number;
  name: string;
  group: EvalGroup;
  positions: number;
  /** At most `EXAMPLE_CAP` ids, in corpus order, with the two values. */
  examples: { id: string; side: Side; a: number; b: number }[];
}

export interface Violations {
  corpus: string;
  sideSwap: { checked: number; positions: number; byFeature: ViolationFeature[] };
  rot180: { checked: number; skipped: number; positions: number; byFeature: ViolationFeature[] };
  scoreIdentity: { checked: number; mismatches: number; examples: { id: string; score: number; sumWf: number; residual: number }[] };
  materialResidual: { checked: number; nonzero: number; examples: { id: string; residual: number }[] };
  stageIdentity: { checked: number; mismatches: number; examples: { id: string; full: number; stageSum: number }[] };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export interface EvalAuditResult {
  summary: Record<string, unknown>;
  violations: Violations;
  records: PositionRecord[];
}

export function loadItems(args: EvalAuditArgs): AuditItem[] {
  const items: AuditItem[] = [];
  for (const f of args.positions) items.push(...loadPositionFile(f));
  for (const f of args.exam) items.push(...loadExamFile(f));
  return items;
}

export function runAudit(args: EvalAuditArgs): EvalAuditResult {
  const ctx = newCtx();
  const items = loadItems(args);
  const records: PositionRecord[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const packed: PackedItem[] = [];

  for (const item of items) {
    try {
      const rec = measure(ctx, item);
      records.push(rec);
      withRules(item, () => {
        const p = ctx.rep.pack(item.state);
        packed.push({ item, p, side: p.side as Side });
      });
    } catch (err) {
      skipped.push({ id: item.id, reason: (err as Error).message });
    }
  }

  const cost = records.length === 0 ? {} : timeStages(ctx, packed, args.reps);

  // --- violations --------------------------------------------------------
  const mkByFeature = (pick: (r: PositionRecord) => number[] | null, a: (r: PositionRecord, i: number) => number, b: (r: PositionRecord, i: number) => number): { byFeature: ViolationFeature[]; positions: number } => {
    const counts = new Array<number>(FEATURE_COUNT).fill(0);
    const examples: { id: string; side: Side; a: number; b: number }[][] = Array.from({ length: FEATURE_COUNT }, () => []);
    let positions = 0;
    for (const r of records) {
      const bad = pick(r);
      if (bad === null || bad.length === 0) continue;
      positions++;
      for (const i of bad) {
        counts[i]++;
        if (examples[i].length < EXAMPLE_CAP) examples[i].push({ id: r.id, side: r.side, a: a(r, i), b: b(r, i) });
      }
    }
    const byFeature: ViolationFeature[] = [];
    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (counts[i] === 0) continue;
      byFeature.push({ index: i, name: FEATURE_NAMES[i], group: GROUP_OF[i], positions: counts[i], examples: examples[i] });
    }
    byFeature.sort((p, q) => q.positions - p.positions);
    return { byFeature, positions };
  };

  const swap = mkByFeature(r => r.sideSwapBad, (r, i) => r.f[i], (r, i) => -r.f[i]);
  const rot = mkByFeature(
    r => r.rot180Bad,
    (r, i) => r.f[i],
    (r, i) => {
      const k = (r.rot180Bad ?? []).indexOf(i);
      return k < 0 ? 0 : (r.rot180BadValues ?? [])[k];
    },
  );
  // `rot180Bad === null` means the mirror did not pack; count it separately.
  let rotSkipped = 0;
  for (const r of records) if (r.rot180Bad === null) rotSkipped++;

  const scoreBad = records.filter(r => r.scoreResidual !== 0);
  const materialBad = records.filter(r => r.materialResidual !== 0);
  const stageBad = records.filter(r => r.stageReturns[0] + r.stageReturns[1] + r.stageReturns[2] !== r.score);

  const violations: Violations = {
    corpus: args.corpus,
    sideSwap: { checked: records.length, positions: swap.positions, byFeature: swap.byFeature },
    rot180: { checked: records.length - rotSkipped, skipped: rotSkipped, positions: rot.positions, byFeature: rot.byFeature },
    scoreIdentity: {
      checked: records.length,
      mismatches: scoreBad.length,
      examples: scoreBad.slice(0, EXAMPLE_CAP).map(r => ({ id: r.id, score: r.score, sumWf: r.sumWf, residual: r.scoreResidual })),
    },
    materialResidual: {
      checked: records.length,
      nonzero: materialBad.length,
      examples: materialBad.slice(0, EXAMPLE_CAP).map(r => ({ id: r.id, residual: r.materialResidual })),
    },
    stageIdentity: {
      checked: records.length,
      mismatches: stageBad.length,
      examples: stageBad.slice(0, EXAMPLE_CAP).map(r => ({
        id: r.id, full: r.score, stageSum: r.stageReturns[0] + r.stageReturns[1] + r.stageReturns[2],
      })),
    },
  };

  // --- statistics --------------------------------------------------------
  const minFiring = Math.max(5, Math.ceil(0.02 * records.length));
  const feats = featureStats(records);
  const groups = groupStats(records);
  const pairs = correlatedPairs(records, minFiring, 20);
  const buckets: Record<string, number> = {};
  for (const r of records) buckets[r.bucket] = (buckets[r.bucket] ?? 0) + 1;

  const lossRoots = records.filter(r => r.bucket === 'loss-root');
  const byBucket: Record<string, { n: number; features: FeatureStats[]; groups: GroupStats[] }> = {};
  for (const b of Object.keys(buckets)) {
    const sub = records.filter(r => r.bucket === b);
    byBucket[b] = { n: sub.length, features: featureStats(sub), groups: groupStats(sub) };
  }

  const summary: Record<string, unknown> = {
    tool: 'hard:eval-audit',
    corpus: args.corpus,
    generatedAt: new Date().toISOString(),
    inputs: { positions: args.positions, exam: args.exam, reps: args.reps, limit: args.limit },
    weights: { label: DEFAULT_WEIGHTS.label, version: DEFAULT_WEIGHTS.version, hash: weightsHash(DEFAULT_WEIGHTS) },
    positionsLoaded: items.length,
    positionsMeasured: records.length,
    positionsSkipped: skipped.length,
    skipped: skipped.slice(0, EXAMPLE_CAP),
    buckets,
    sideToMove: { white: records.filter(r => r.side === WHITE).length, black: records.filter(r => r.side !== WHITE).length },
    scoreCc: scoreSummary(records.map(r => r.score)),
    cost,
    minFiringForCorrelation: minFiring,
    neverFires: feats.filter(f => f.nonzero === 0).map(f => ({ index: f.index, name: f.name, group: f.group, w: f.w })),
    zeroWeight: feats.filter(f => f.w === 0).map(f => ({ index: f.index, name: f.name, nonzero: f.nonzero })),
    features: feats,
    groups,
    correlatedPairs: pairs,
    lossRoots: lossRoots.length === 0 ? null : { n: lossRoots.length, features: featureStats(lossRoots), groups: groupStats(lossRoots) },
    byBucket,
    rot180ScoreDeltaCc: scoreSummary(records.filter(r => r.rot180Bad !== null && r.rot180Bad.length > 0).map(r => r.rot180ScoreDelta)),
    checks: {
      sideSwapPositions: violations.sideSwap.positions,
      rot180Positions: violations.rot180.positions,
      rot180Skipped: violations.rot180.skipped,
      scoreIdentityMismatches: violations.scoreIdentity.mismatches,
      materialResidualNonzero: violations.materialResidual.nonzero,
      stageIdentityMismatches: violations.stageIdentity.mismatches,
    },
  };

  return { summary, violations, records };
}

function scoreSummary(xs: readonly number[]): Record<string, number> {
  if (xs.length === 0) return { n: 0, mean: 0, min: 0, max: 0, meanAbs: 0 };
  let sum = 0;
  let sumAbs = 0;
  let min = xs[0];
  let max = xs[0];
  for (const x of xs) { sum += x; sumAbs += Math.abs(x); if (x < min) min = x; if (x > max) max = x; }
  return { n: xs.length, mean: sum / xs.length, min, max, meanAbs: sumAbs / xs.length };
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

function n2(x: number): string {
  return Number.isFinite(x) ? x.toFixed(2) : 'n/a';
}

function pct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

export function summaryMarkdown(result: EvalAuditResult, args: EvalAuditArgs): string {
  const s = result.summary;
  const feats = s.features as FeatureStats[];
  const groups = s.groups as GroupStats[];
  const pairs = s.correlatedPairs as CorrelationPair[];
  const cost = s.cost as Record<string, CostStats>;
  const v = result.violations;
  const n = s.positionsMeasured as number;
  const L: string[] = [];

  L.push(`# hard:eval-audit — ${args.corpus}`);
  L.push('');
  L.push(`- Generated ${String(s.generatedAt)}.`);
  L.push(`- Inputs: ${[...args.positions, ...args.exam].join(', ')}.`);
  const wsum = s.weights as { label: string; version: number; hash: string };
  L.push(`- Weights \`${wsum.label}\` version ${wsum.version}, hash \`${wsum.hash}\`.`);
  L.push(`- Positions loaded ${String(s.positionsLoaded)}, measured ${n}, skipped ${String(s.positionsSkipped)}.`);
  const b = s.buckets as Record<string, number>;
  L.push(`- Buckets: ${Object.entries(b).map(([k, c]) => `${k} ${c}`).join(', ')}.`);
  const sm = s.sideToMove as { white: number; black: number };
  L.push(`- Side to move: white ${sm.white}, black ${sm.black}.`);
  const sc = s.scoreCc as Record<string, number>;
  L.push(`- Score from the side to move (cc): mean ${n2(sc.mean)}, mean |score| ${n2(sc.meanAbs)}, min ${sc.min}, max ${sc.max}.`);
  L.push('');

  L.push('## Checks');
  L.push('');
  L.push(`- Side swap: ${v.sideSwap.positions} of ${v.sideSwap.checked} positions have at least one feature where \`f_i(p, side) !== -f_i(p, 1 - side)\`.`);
  const rd = s.rot180ScoreDeltaCc as Record<string, number>;
  L.push(`- Rot180: ${v.rot180.positions} of ${v.rot180.checked} positions have at least one feature where \`f_i(mirror180(p), 1 - side) !== f_i(p, side)\`; ${v.rot180.skipped} positions had no packable mirror.`);
  L.push(`- Rot180 score disagreement on those ${rd.n} positions (cc): mean ${n2(rd.mean)}, mean |delta| ${n2(rd.meanAbs)}, min ${rd.min}, max ${rd.max}.`);
  L.push(`- Score identity \`Σ w·f === full()\`: ${v.scoreIdentity.mismatches} of ${v.scoreIdentity.checked} mismatch.`);
  L.push(`- Stage identity \`stage0 + stage1 + stage2 === full()\`: ${v.stageIdentity.mismatches} of ${v.stageIdentity.checked} mismatch.`);
  L.push(`- Material residual \`w[Material]·f[Material] − stage0's material block\`: ${v.materialResidual.nonzero} of ${v.materialResidual.checked} nonzero.`);
  L.push('');
  if (v.sideSwap.byFeature.length > 0) {
    L.push('### Side-swap violations by feature');
    L.push('');
    L.push('| feature | group | positions | first examples (id: f(side) vs −f(other)) |');
    L.push('| --- | --- | ---: | --- |');
    for (const f of v.sideSwap.byFeature) {
      L.push(`| ${f.name} | ${f.group} | ${f.positions} | ${f.examples.slice(0, 3).map(e => `${e.id}: ${e.a} vs ${e.b}`).join('; ')} |`);
    }
    L.push('');
  }
  if (v.rot180.byFeature.length > 0) {
    L.push('### Rot180 violations by feature');
    L.push('');
    L.push('| feature | group | positions | share of checked | first examples (id: f(p) vs f(mirror)) |');
    L.push('| --- | --- | ---: | ---: | --- |');
    for (const f of v.rot180.byFeature) {
      L.push(`| ${f.name} | ${f.group} | ${f.positions} | ${pct(v.rot180.checked === 0 ? 0 : f.positions / v.rot180.checked)} | ${f.examples.slice(0, 3).map(e => `${e.id}: ${e.a} vs ${e.b}`).join('; ')} |`);
    }
    L.push('');
  }

  L.push('## Cost');
  L.push('');
  L.push('| stage | mean µs/call | p95 µs/call | n positions |');
  L.push('| --- | ---: | ---: | ---: |');
  for (const k of ['stage0', 'stage1', 'stage2', 'stage0plus1', 'full']) {
    const c = cost[k];
    if (c === undefined) continue;
    L.push(`| ${k} | ${n2(c.meanUs)} | ${n2(c.p95Us)} | ${c.n} |`);
  }
  L.push('');
  L.push(`Cold tables: one timed pass per variant over the whole list in list order, ${args.reps} repetitions, per-position median. Stage 1 and stage 2 are differences of the measured cumulative passes.`);
  L.push('');

  L.push('## Groups');
  L.push('');
  L.push('| group | features | positions with a nonzero sum | mean \\|Σ w·f\\| cc | max \\|Σ w·f\\| cc | share of Σ\\|group sum\\| | +/− positions |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const g of groups) {
    L.push(`| ${g.group} | ${g.features} | ${g.nonzeroPositions} | ${n2(g.meanAbsSum)} | ${g.maxAbsSum} | ${pct(g.shareOfAbsTotal)} | ${g.positive}/${g.negative} |`);
  }
  L.push('');

  L.push('## Features');
  L.push('');
  L.push('| # | feature | group | stage | w | fires | mean \\|w·f\\| cc | max \\|w·f\\| cc | share of Σ\\|w·f\\| | sign balance |');
  L.push('| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const f of [...feats].sort((a, c) => c.shareOfAbsTotal - a.shareOfAbsTotal)) {
    L.push(`| ${f.index} | ${f.name} | ${f.group} | ${f.stage} | ${f.w} | ${pct(f.nonzeroShare)} | ${n2(f.meanAbsContribution)} | ${f.maxAbsContribution} | ${pct(f.shareOfAbsTotal)} | ${n2(f.signBalance)} |`);
  }
  L.push('');

  const never = s.neverFires as { index: number; name: string; group: EvalGroup; w: number }[];
  L.push('## Features that never fire');
  L.push('');
  if (never.length === 0) L.push(`Every one of the 58 features is nonzero on at least one of the ${n} positions.`);
  else {
    L.push(`${never.length} of 58 features are zero on all ${n} positions.`);
    L.push('');
    L.push('| # | feature | group | w |');
    L.push('| ---: | --- | --- | ---: |');
    for (const f of never) L.push(`| ${f.index} | ${f.name} | ${f.group} | ${f.w} |`);
  }
  L.push('');

  L.push('## Most correlated contribution pairs');
  L.push('');
  L.push(`Pearson r of \`c_i = w[i]·f[i]\` across the ${n} positions, both features nonzero in at least ${String(s.minFiringForCorrelation)} of them.`);
  L.push('');
  if (pairs.length === 0) L.push('No pair passed the firing threshold.');
  else {
    L.push('| r | feature A | group A | feature B | group B | both nonzero |');
    L.push('| ---: | --- | --- | --- | --- | ---: |');
    for (const p of pairs) {
      L.push(`| ${p.r.toFixed(3)} | ${p.nameA} | ${p.groupA} | ${p.nameB} | ${p.groupB} | ${p.bothNonzero} |`);
    }
  }
  L.push('');

  const loss = s.lossRoots as { n: number; features: FeatureStats[] } | null;
  if (loss !== null) {
    L.push('## Loss roots');
    L.push('');
    L.push(`${loss.n} exam cases carried over from real E1.1 losses (\`source.kind === "loss"\`), reported separately.`);
    L.push('');
    L.push('| # | feature | group | fires | mean \\|w·f\\| cc | share of Σ\\|w·f\\| |');
    L.push('| ---: | --- | --- | ---: | ---: | ---: |');
    for (const f of [...loss.features].sort((a, c) => c.shareOfAbsTotal - a.shareOfAbsTotal).slice(0, 20)) {
      L.push(`| ${f.index} | ${f.name} | ${f.group} | ${pct(f.nonzeroShare)} | ${n2(f.meanAbsContribution)} | ${pct(f.shareOfAbsTotal)} |`);
    }
    L.push('');
  }

  return L.join('\n') + '\n';
}

export function writeArtifacts(result: EvalAuditResult, args: EvalAuditArgs): void {
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'summary.json'), JSON.stringify(result.summary, null, 2) + '\n');
  fs.writeFileSync(path.join(args.out, 'violations.json'), JSON.stringify(result.violations, null, 2) + '\n');
  fs.writeFileSync(path.join(args.out, 'summary.md'), summaryMarkdown(result, args));
  const rows = result.records.slice(0, args.limit).map(r => JSON.stringify(r));
  fs.writeFileSync(path.join(args.out, 'features.jsonl'), rows.length === 0 ? '' : rows.join('\n') + '\n');
}

export function main(argv: readonly string[]): void {
  const args = parseArgs(argv);
  const result = runAudit(args);
  writeArtifacts(result, args);
  const s = result.summary;
  process.stdout.write(
    `eval-audit ${args.corpus}: ${String(s.positionsMeasured)} positions, ` +
      `${String((s.checks as Record<string, number>).sideSwapPositions)} side-swap, ` +
      `${String((s.checks as Record<string, number>).rot180Positions)} rot180, ` +
      `${String((s.checks as Record<string, number>).scoreIdentityMismatches)} score-identity -> ${args.out}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
