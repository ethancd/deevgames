/**
 * `npm run hard:texel -- --corpus <dir> --iterations n [--out <dir>]
 *  [--steps 100,10,1] [--refit-k] [--label <name>]`
 *
 * DESIGN §5.15's Texel fit, as an INSTRUMENT. It fits `k` on the training
 * split, runs integer coordinate descent over the evaluation parameters with
 * `material[fire_1]` pinned at 300, measures held-out log-loss before and
 * after, and writes `weights.json` (`muju-weights-v1`) and `report.md` under
 * `lab/results/`.
 *
 * IT NEVER WRITES INTO `src/`. DESIGN §5.15 names
 * `src/ai/hard/eval/weights.generated.ts` as an output of the full tune;
 * MILESTONES M20 is the milestone that may write it, and only on a fixed-work
 * SPRT H1 at work 400,000, seat-mirrored, handicaps 0 and 3, elo0 0 / elo1 10,
 * alpha = beta = 0.05. A vector this tool produces is a measurement, not a
 * candidate default. `assertNotInSrc` enforces the file half of that rule.
 *
 * THE MODEL. `p = sigma(k * evalCc)` with `sigma(x) = 1 / (1 + e^-x)` —
 * DESIGN §5.15 writes `sigma(k·eval)` and this is that expression literally,
 * so `k` carries the 1/cc scale (fitted values land near 1e-3, which is the
 * 400-cc-per-pawn convention folded into `k` instead of into the exponent).
 * The loss is log-loss, `-(r ln p + (1-r) ln(1-p))` averaged over rows, which
 * is the quantity DESIGN §5.15's gate ("held-out log-loss strictly improves")
 * and MILESTONES M18's `texel.heldOutLossAfter < texel.heldOutLossBefore`
 * name. A draw row has `r = 0.5` and contributes the symmetric term.
 *
 * `evalCc` is `rows.ts scoreOf`: `Σ_{i>=1} w[i]·f[i] + Σ_d material[d]·c[d]`.
 *
 * WHAT IS FREE AND WHAT IS PINNED.
 *   - `material[fire_1]` (defId 0) is PINNED at 300 (DESIGN §5.12, §5.15):
 *     without it every parameter could be scaled together against `k`.
 *   - `w[F.Material]` (index 0) is PINNED at its input value because it
 *     multiplies nothing: `Evaluator.stage0` scores material from the 18
 *     `material` params and `full()` leaves `outFeatures[0]` at `extract`'s
 *     weight-free prior (`src/ai/hard/eval/evaluate.ts:122-127, 163-167`).
 *     Its gradient is identically zero, so DESIGN §5.15's "58 weights and 18
 *     material values" is 57 + 17 = 74 free integers in this tree, not 76.
 *   - Everything else is free and integral at every step.
 *
 * COORDINATE DESCENT. One iteration sweeps the step schedule from coarse to
 * fine (default 100, 10, 1 cc). For each step size and each free parameter it
 * tries `+step`, then `-step`, and keeps stepping in the direction that
 * lowered TRAINING loss until it stops lowering it (at most
 * `MAX_RUN_PER_PARAM` consecutive accepted steps, so one parameter cannot
 * consume an iteration). `evalCc` is carried per row and updated by
 * `delta * x[row][j]`, so a trial costs one pass over the training rows.
 *
 * HELD-OUT. The split is the corpus builder's, by OPENING FAMILY, so no
 * opening appears in both halves. Held-out loss is measured with the same `k`
 * before and after; `--refit-k` re-fits `k` on TRAIN after each iteration
 * (off by default, because DESIGN §5.15 says "fit `k` first").
 */
import fs from 'node:fs';
import path from 'node:path';
import { FEATURE_COUNT, FEATURE_NAMES } from '../../../src/ai/hard/eval/features';
import { DEF_ID, NDEF } from '../../../src/ai/hard/core/catalog';
import { DEFAULT_WEIGHTS, WEIGHTS_VERSION } from '../../../src/ai/hard/eval/weights';
import { configHashOf } from '../ladder/identity';
import {
  WEIGHTS_FILE_SCHEMA,
  assertNotInSrc,
  readRows,
  type TexelRow,
  type WeightVector,
} from './rows';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_OUT = 'lab/results/hard-ai-e3/tune/texel';

/** `material` index that DESIGN §5.12 pins at 300. */
export const FIRE_1 = 0;
export const FIRE_1_PIN = 300;
/** Parameter index of `w[i]` is `i`; of `material[d]` is `FEATURE_COUNT + d`. */
export const PARAM_COUNT = FEATURE_COUNT + NDEF;
/** Consecutive accepted steps one parameter may take inside one sweep. */
export const MAX_RUN_PER_PARAM = 50;

export interface TexelArgs {
  corpus: string;
  iterations: number;
  out: string;
  steps: number[];
  refitK: boolean;
  label: string | null;
}

export function parseArgs(argv: readonly string[]): TexelArgs {
  const args: TexelArgs = { corpus: '', iterations: 3, out: DEFAULT_OUT, steps: [100, 10, 1], refitK: false, label: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a}: missing value`);
      return v;
    };
    switch (a) {
      case '--corpus': args.corpus = next(); break;
      case '--iterations': args.iterations = positive(next(), a); break;
      case '--out': args.out = next(); break;
      case '--steps': args.steps = next().split(',').map(s => positive(s, a)); break;
      case '--refit-k': args.refitK = true; break;
      case '--label': args.label = next(); break;
      default: throw new Error(`unknown argument ${a}`);
    }
  }
  if (args.corpus === '') throw new Error('--corpus <dir> is required');
  if (args.steps.length === 0) throw new Error('--steps: at least one step size is required');
  return args;
}

function positive(value: string, flag: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag}: expected a positive number, got ${value}`);
  return Math.floor(n);
}

// --- the design matrix -----------------------------------------------------

/** Rows packed for the fit: `x[r * PARAM_COUNT + j]`, labels, and `evalCc`. */
export interface Design {
  n: number;
  x: Int32Array;
  y: Float64Array;
  evalCc: Float64Array;
}

export function buildDesign(rows: readonly TexelRow[], theta: Float64Array): Design {
  const n = rows.length;
  const x = new Int32Array(n * PARAM_COUNT);
  const y = new Float64Array(n);
  for (let r = 0; r < n; r++) {
    const row = rows[r];
    const base = r * PARAM_COUNT;
    // index 0 stays 0: `w[F.Material]` multiplies nothing (module header).
    for (let i = 1; i < FEATURE_COUNT; i++) x[base + i] = row.features[i];
    for (let d = 0; d < NDEF; d++) x[base + FEATURE_COUNT + d] = row.material[d];
    y[r] = row.result;
  }
  const evalCc = new Float64Array(n);
  for (let r = 0; r < n; r++) {
    const base = r * PARAM_COUNT;
    let s = 0;
    for (let j = 1; j < PARAM_COUNT; j++) s += theta[j] * x[base + j];
    evalCc[r] = s;
  }
  return { n, x, y, evalCc };
}

export function thetaOf(weights: WeightVector): Float64Array {
  const theta = new Float64Array(PARAM_COUNT);
  for (let i = 0; i < FEATURE_COUNT; i++) theta[i] = weights.w[i];
  for (let d = 0; d < NDEF; d++) theta[FEATURE_COUNT + d] = weights.material[d];
  return theta;
}

export function weightsOf(theta: Float64Array): WeightVector {
  return {
    w: Array.from(theta.slice(0, FEATURE_COUNT), v => Math.round(v)),
    material: Array.from(theta.slice(FEATURE_COUNT), v => Math.round(v)),
  };
}

// --- loss ------------------------------------------------------------------

const EPS = 1e-12;

export function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

/** Mean log-loss of `sigma(k · evalCc)` against the labels. */
export function logLoss(design: Design, k: number): number {
  if (design.n === 0) return Number.NaN;
  let sum = 0;
  for (let r = 0; r < design.n; r++) {
    let p = sigmoid(k * design.evalCc[r]);
    if (p < EPS) p = EPS;
    else if (p > 1 - EPS) p = 1 - EPS;
    const t = design.y[r];
    sum -= t * Math.log(p) + (1 - t) * Math.log(1 - p);
  }
  return sum / design.n;
}

/**
 * `k` by ternary search on `log10 k` over `[-7, 0]`, then 60 bisection
 * refinements. Log-loss in `k` is smooth and single-minimum for a fixed
 * parameter vector, and the search is deterministic.
 */
export function fitK(design: Design, lo = -7, hi = 0, iterations = 80): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (logLoss(design, 10 ** m1) <= logLoss(design, 10 ** m2)) b = m2;
    else a = m1;
  }
  return 10 ** ((a + b) / 2);
}

// --- coordinate descent ----------------------------------------------------

export interface FitOptions {
  iterations: number;
  steps: readonly number[];
  refitK: boolean;
}

export interface FitTrace {
  iteration: number;
  trainLoss: number;
  heldOutLoss: number;
  accepted: number;
  k: number;
}

export interface FitResult {
  theta: Float64Array;
  k: number;
  trainLossBefore: number;
  trainLossAfter: number;
  heldOutLossBefore: number;
  heldOutLossAfter: number;
  trace: FitTrace[];
  accepted: number;
  /** Parameter indices the fit was allowed to move. */
  freeParams: number[];
}

/** Free parameter indices: every `w[i]` but index 0, every `material[d]` but `fire_1`. */
export function freeParams(): number[] {
  const free: number[] = [];
  for (let i = 1; i < FEATURE_COUNT; i++) free.push(i);
  for (let d = 0; d < NDEF; d++) if (d !== FIRE_1) free.push(FEATURE_COUNT + d);
  return free;
}

function applyDelta(design: Design, j: number, delta: number): void {
  for (let r = 0; r < design.n; r++) design.evalCc[r] += delta * design.x[r * PARAM_COUNT + j];
}

export function fit(trainRows: readonly TexelRow[], heldOutRows: readonly TexelRow[], start: WeightVector, options: FitOptions): FitResult {
  const theta = thetaOf(start);
  if (Math.round(theta[FEATURE_COUNT + FIRE_1]) !== FIRE_1_PIN) {
    throw new Error(`texel: material[fire_1] must start at ${FIRE_1_PIN}, got ${theta[FEATURE_COUNT + FIRE_1]}`);
  }
  const train = buildDesign(trainRows, theta);
  const held = buildDesign(heldOutRows, theta);
  let k = fitK(train);
  const trainLossBefore = logLoss(train, k);
  const heldOutLossBefore = logLoss(held, k);
  const free = freeParams();
  const trace: FitTrace[] = [];
  let accepted = 0;

  for (let iter = 1; iter <= options.iterations; iter++) {
    let acceptedThisIteration = 0;
    let current = logLoss(train, k);
    for (const step of options.steps) {
      for (const j of free) {
        for (const dir of [1, -1]) {
          for (let run = 0; run < MAX_RUN_PER_PARAM; run++) {
            const delta = dir * step;
            applyDelta(train, j, delta);
            const candidate = logLoss(train, k);
            if (candidate < current) {
              current = candidate;
              theta[j] += delta;
              accepted++;
              acceptedThisIteration++;
              continue;
            }
            applyDelta(train, j, -delta);
            break;
          }
        }
      }
    }
    // The held-out design carries its own `evalCc`; rebuild it from the
    // current parameters rather than tracking two copies of every delta.
    const heldNow = buildDesign(heldOutRows, theta);
    held.evalCc.set(heldNow.evalCc);
    if (options.refitK) k = fitK(train);
    trace.push({ iteration: iter, trainLoss: logLoss(train, k), heldOutLoss: logLoss(held, k), accepted: acceptedThisIteration, k });
    if (acceptedThisIteration === 0) break;
  }

  return {
    theta,
    k,
    trainLossBefore,
    trainLossAfter: logLoss(train, k),
    heldOutLossBefore,
    heldOutLossAfter: logLoss(held, k),
    trace,
    accepted,
    freeParams: free,
  };
}

// --- reporting -------------------------------------------------------------

export interface Move {
  index: number;
  kind: 'w' | 'material';
  name: string;
  before: number;
  after: number;
  delta: number;
}

export function largestMoves(before: WeightVector, after: WeightVector, limit = 10): Move[] {
  const moves: Move[] = [];
  for (let i = 0; i < FEATURE_COUNT; i++) {
    if (after.w[i] !== before.w[i]) moves.push({ index: i, kind: 'w', name: FEATURE_NAMES[i], before: before.w[i], after: after.w[i], delta: after.w[i] - before.w[i] });
  }
  for (let d = 0; d < NDEF; d++) {
    if (after.material[d] !== before.material[d]) moves.push({ index: d, kind: 'material', name: DEF_ID[d], before: before.material[d], after: after.material[d], delta: after.material[d] - before.material[d] });
  }
  moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.kind.localeCompare(b.kind) || a.index - b.index);
  return moves.slice(0, limit);
}

function allIntegers(v: WeightVector): boolean {
  return v.w.every(Number.isInteger) && v.material.every(Number.isInteger);
}

export interface TexelOutput {
  schema: typeof WEIGHTS_FILE_SCHEMA;
  version: number;
  label: string;
  w: number[];
  material: number[];
  k: number;
  /** HELD-OUT log-loss — the quantity MILESTONES M18's gate expression names. */
  lossBefore: number;
  lossAfter: number;
  heldOutLossBefore: number;
  heldOutLossAfter: number;
  trainLossBefore: number;
  trainLossAfter: number;
  corpus: string;
  corpusRows: { train: number; heldout: number };
  allIntegers: boolean;
  fire1Pinned: number;
  iterations: number;
  steps: number[];
  acceptedSteps: number;
  freeParamCount: number;
  trace: FitTrace[];
  startWeights: { label: string; version: number; hash: string };
  /** Never a shipped default: MILESTONES M20 owns that decision. */
  candidate: false;
}

export function runTexel(args: TexelArgs): { output: TexelOutput; moves: Move[]; outDir: string } {
  const corpusDir = path.resolve(REPO_ROOT, args.corpus);
  const rows = readRows(corpusDir);
  const trainRows = rows.filter(r => r.split === 'train');
  const heldOutRows = rows.filter(r => r.split === 'heldout');
  if (trainRows.length === 0) throw new Error(`texel: the corpus at ${args.corpus} has no train rows`);
  if (heldOutRows.length === 0) throw new Error(`texel: the corpus at ${args.corpus} has no heldout rows; rebuild it with --holdout-by opening`);
  const trainOpenings = new Set(trainRows.map(r => r.opening));
  for (const row of heldOutRows) {
    if (trainOpenings.has(row.opening)) throw new Error(`texel: opening ${row.opening} is in both splits; the corpus is not a clean holdout`);
  }

  const start: WeightVector = { w: Array.from(DEFAULT_WEIGHTS.w), material: Array.from(DEFAULT_WEIGHTS.material) };
  const result = fit(trainRows, heldOutRows, start, { iterations: args.iterations, steps: args.steps, refitK: args.refitK });
  const tuned = weightsOf(result.theta);
  const corpusManifest = path.join(corpusDir, 'manifest.json');
  const corpusHash = fs.existsSync(corpusManifest)
    ? (JSON.parse(fs.readFileSync(corpusManifest, 'utf8')) as { positionsSha256?: string }).positionsSha256 ?? 'unknown'
    : 'unknown';

  const output: TexelOutput = {
    schema: WEIGHTS_FILE_SCHEMA,
    version: WEIGHTS_VERSION + 1,
    label: args.label ?? `texel-instrument-${corpusHash.slice(0, 8)}`,
    w: tuned.w,
    material: tuned.material,
    k: result.k,
    lossBefore: result.heldOutLossBefore,
    lossAfter: result.heldOutLossAfter,
    heldOutLossBefore: result.heldOutLossBefore,
    heldOutLossAfter: result.heldOutLossAfter,
    trainLossBefore: result.trainLossBefore,
    trainLossAfter: result.trainLossAfter,
    corpus: corpusHash,
    corpusRows: { train: trainRows.length, heldout: heldOutRows.length },
    allIntegers: allIntegers(tuned),
    fire1Pinned: tuned.material[FIRE_1],
    iterations: args.iterations,
    steps: [...args.steps],
    acceptedSteps: result.accepted,
    freeParamCount: result.freeParams.length,
    trace: result.trace,
    startWeights: {
      label: DEFAULT_WEIGHTS.label,
      version: DEFAULT_WEIGHTS.version,
      hash: configHashOf({ w: DEFAULT_WEIGHTS.w, material: DEFAULT_WEIGHTS.material, version: DEFAULT_WEIGHTS.version, label: DEFAULT_WEIGHTS.label }),
    },
    candidate: false,
  };
  const moves = largestMoves(start, tuned, 10);
  const outDir = path.resolve(REPO_ROOT, args.out);
  assertNotInSrc(outDir, REPO_ROOT);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'weights.json'), `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'report.md'), renderReport(args, output, moves));
  return { output, moves, outDir };
}

export function renderReport(args: TexelArgs, out: TexelOutput, moves: readonly Move[]): string {
  const lines: string[] = [];
  lines.push('# Texel instrument run');
  lines.push('');
  lines.push('**This vector is not a candidate.** No row measured it. Enabling tuned weights as a');
  lines.push('default is MILESTONES M20\'s contract: a fixed-work SPRT at work 400,000, seat-mirrored,');
  lines.push('handicaps 0 and 3, `elo0 0 / elo1 10 / alpha = beta = 0.05`, and `src/` is written only on H1.');
  lines.push('');
  lines.push(`- corpus: \`${args.corpus}\` (positions sha256 \`${out.corpus}\`)`);
  lines.push(`- rows: ${out.corpusRows.train} train / ${out.corpusRows.heldout} held out, split by opening family`);
  lines.push(`- iterations: ${out.iterations}; step schedule ${out.steps.join(', ')} cc; free parameters ${out.freeParamCount} of ${PARAM_COUNT}`);
  lines.push(`- k: ${out.k.toExponential(6)}`);
  lines.push(`- train log-loss: ${out.trainLossBefore.toFixed(6)} -> ${out.trainLossAfter.toFixed(6)}`);
  lines.push(`- held-out log-loss: ${out.heldOutLossBefore.toFixed(6)} -> ${out.heldOutLossAfter.toFixed(6)}`);
  lines.push(`- all integers: ${String(out.allIntegers)}; material[fire_1]: ${out.fire1Pinned}`);
  lines.push(`- accepted steps: ${out.acceptedSteps}`);
  lines.push('');
  lines.push('## Ten largest parameter moves');
  lines.push('');
  lines.push('| kind | index | name | before | after | delta |');
  lines.push('| --- | ---: | --- | ---: | ---: | ---: |');
  for (const m of moves) lines.push(`| ${m.kind} | ${m.index} | ${m.name} | ${m.before} | ${m.after} | ${m.delta > 0 ? '+' : ''}${m.delta} |`);
  if (moves.length === 0) lines.push('| — | — | (no parameter moved) | — | — | — |');
  lines.push('');
  lines.push('## Per-iteration trace');
  lines.push('');
  lines.push('| iteration | accepted steps | train log-loss | held-out log-loss |');
  lines.push('| ---: | ---: | ---: | ---: |');
  for (const t of out.trace) lines.push(`| ${t.iteration} | ${t.accepted} | ${t.trainLoss.toFixed(6)} | ${t.heldOutLoss.toFixed(6)} |`);
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { output, moves, outDir } = runTexel(args);
  console.log(`texel: ${output.corpusRows.train} train / ${output.corpusRows.heldout} heldout rows -> ${path.relative(REPO_ROOT, outDir)}`);
  console.log(`  k ${output.k.toExponential(6)}`);
  console.log(`  train log-loss ${output.trainLossBefore.toFixed(6)} -> ${output.trainLossAfter.toFixed(6)}`);
  console.log(`  held-out log-loss ${output.heldOutLossBefore.toFixed(6)} -> ${output.heldOutLossAfter.toFixed(6)}`);
  console.log(`  all integers ${String(output.allIntegers)}, material[fire_1] ${output.fire1Pinned}, accepted steps ${output.acceptedSteps}`);
  for (const m of moves) console.log(`  ${m.kind}[${m.index}] ${m.name}: ${m.before} -> ${m.after} (${m.delta > 0 ? '+' : ''}${m.delta})`);
  console.log('  NOT A CANDIDATE: no row measured this vector (MILESTONES M20).');
}

const INVOKED_DIRECTLY = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (INVOKED_DIRECTLY) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
