/**
 * Pentanomial GSPRT over pair scores (DESIGN §7.7).
 *
 * Each pair contributes one score in {0, 0.5, 1, 1.5, 2} (`pairing.ts`) and
 * the five pair-score frequencies are the pentanomial counts [LL, LD+DL,
 * LW+DD+WL, DW+WD, WW]. The test compares the null hypothesis "A's true
 * per-game score is `t0 = eloToScore(elo0)`" against "A's true per-game
 * score is `t1 = eloToScore(elo1)`".
 *
 * The statistic is the generalized log-likelihood ratio of Stockfish
 * fishtest (`server/fishtest/stats/LLRcalc.py`, `LLR_logistic`), ported
 * faithfully: the observed pentanomial distribution is regularized (a 1e-3
 * pseudo-count into any empty cell), then for each hypothesis the maximum
 * likelihood distribution subject to the constraint "expectation = t_i" is
 * computed by solving the secular equation sum_i p_i a_i / (1 + x a_i) = 0
 * (`MLE_expected`), and the LLR is N times the expected log-ratio of the
 * two fitted distributions. The secular equation is solved by bisection
 * rather than Brent's method — its left-hand side is strictly decreasing in
 * x on the admissible interval, so bisection converges to the same root.
 *
 * This replaces an earlier normal approximation, `N (t1 − t0)(2μ̂ − t0 −
 * t1) / (2 σ̂²)` with σ̂² floored at 1e-9. That approximation (fishtest's
 * `LLR_alt2`) diverges badly on exactly the samples a short ladder run
 * produces: 24 all-draw pairs gave LLR = −95.4 instead of −0.69, and 10
 * all-sweep pairs gave +190.6 instead of +0.14, i.e. an instant decision
 * from a degenerate handful of pairs. The exact GSPRT stays bounded there
 * because the regularized MLE can fit a near-degenerate distribution to
 * either hypothesis almost equally well.
 *
 * `decision` is `'H1'` once `LLR ≥ upper` (accept the stronger hypothesis),
 * `'H0'` once `LLR ≤ lower` (accept the no-improvement hypothesis), else
 * `'continue'` (more pairs needed, or the run's `--pairs` cap was hit
 * before either bound was crossed). No decision is declared below the
 * predeclared minimum number of pairs (`DEFAULT_MIN_PAIRS`, overridable per
 * call) — in either entry point. `sprt()` is what `run.ts` calls once at
 * the end of a `--pairs` run, so the minimum has to bind there as well as
 * in the checkpoint-by-checkpoint `sprtSequential`; the LLR is still
 * reported below the minimum, only the verdict waits.
 *
 * Parameters are validated strictly (`validateSprtParams`): `elo0 ===
 * elo1` used to make `t1 − t0 = 0`, so the LLR was identically 0 and the
 * test silently ran forever without ever being able to decide; that, and
 * out-of-range error rates, now throw.
 */

import { pentanomialCounts, pentanomialIndex, type PentanomialCounts } from './elo';

export interface SprtParams {
  elo0: number;
  elo1: number;
  alpha: number;
  beta: number;
}

export type SprtDecision = 'H0' | 'H1' | 'continue';

export interface SprtResult extends SprtParams {
  /** Number of PAIRS observed. */
  n: number;
  /** Identifies the statistic, so consumers can tell a re-analysis apart from an old run. */
  method: 'pentanomial-gsprt';
  /** Raw pair-score frequencies in the order [0, 0.5, 1, 1.5, 2]. */
  counts: PentanomialCounts;
  t0: number;
  t1: number;
  /** Mean per-game score of the regularized pentanomial distribution. */
  mu: number;
  /** Variance of the per-game pair mean (`pairScore / 2`) under that distribution. */
  variance: number;
  llr: number;
  lowerBound: number;
  upperBound: number;
  /** Predeclared minimum number of pairs before a decision may be declared. */
  minPairs: number;
  decision: SprtDecision;
}

export interface SprtOptions {
  /**
   * Smallest number of pairs at which a decision may be declared. Defaults
   * to `DEFAULT_MIN_PAIRS`. Applies to both `sprt` and `sprtSequential`.
   */
  minPairs?: number;
}

/** Kept for callers that named the option type before `sprt` accepted it too. */
export type SprtSequentialOptions = SprtOptions;

export interface SprtCheckpoint {
  n: number;
  llr: number;
}

export interface SprtSequentialResult {
  decision: SprtDecision;
  /** Pair index (1-based count of pairs) at which the decision was declared, or null. */
  decidedAtPair: number | null;
  /** LLR at the last checkpoint evaluated. */
  finalLlr: number;
  /** One entry per pair observed, up to and including the deciding pair. */
  trace: SprtCheckpoint[];
  minPairs: number;
  lowerBound: number;
  upperBound: number;
}

/**
 * Predeclared protocol minimum: no decision is declared before 10 pairs (20
 * games). This is a protocol choice, not a property of the statistic. The
 * GSPRT's error guarantees are asymptotic, and at very small N the
 * regularized MLE is dominated by the 1e-3 pseudo-counts rather than by
 * observed spread, so a bound crossing there reflects the regularizer as
 * much as the engines. Ten pairs is the smallest block at which every
 * pentanomial cell can be observed more than once, and it costs at most a
 * few extra pairs on a run that would have decided sooner. It is fixed in
 * advance (never tuned per run) so that the type-I rate the simulations
 * measure is the rate the protocol actually delivers.
 */
export const DEFAULT_MIN_PAIRS = 10;

function resolveMinPairs(opts: SprtOptions | undefined): number {
  const minPairs = opts?.minPairs ?? DEFAULT_MIN_PAIRS;
  if (!Number.isInteger(minPairs) || minPairs < 1) {
    throw new Error(`sprt: minPairs must be a positive integer, got ${minPairs}`);
  }
  return minPairs;
}

const REGULARIZE_EPSILON = 1e-3; // fishtest LLRcalc.regularize
const GAME_VALUES: readonly number[] = [0, 0.25, 0.5, 0.75, 1]; // pairScore / 2

/** Elo-to-expected-score transform: the logistic win probability at a `elo`-point rating gap. */
export function eloToScore(elo: number): number {
  return 1 / (1 + Math.pow(10, -elo / 400));
}

/**
 * Rejects parameter sets the test cannot run on. In particular `elo0 ===
 * elo1` describes a point null against itself: no amount of evidence can
 * separate the hypotheses, and the old code silently returned LLR = 0
 * forever (the M19 phone row's `--sprt 0,0,0.05,0.05` was exactly this).
 */
export function validateSprtParams(params: SprtParams): void {
  const { elo0, elo1, alpha, beta } = params;
  for (const [name, value] of [['elo0', elo0], ['elo1', elo1], ['alpha', alpha], ['beta', beta]] as const) {
    if (!Number.isFinite(value)) throw new Error(`sprt: ${name} must be finite, got ${value}`);
  }
  if (elo0 === elo1) throw new Error(`sprt: elo0 and elo1 must differ, both were ${elo0}`);
  if (elo1 < elo0) throw new Error(`sprt: elo1 (${elo1}) must be greater than elo0 (${elo0})`);
  if (!(alpha > 0 && alpha < 1)) throw new Error(`sprt: alpha must lie in (0, 1), got ${alpha}`);
  if (!(beta > 0 && beta < 1)) throw new Error(`sprt: beta must lie in (0, 1), got ${beta}`);
  if (alpha + beta >= 1) throw new Error(`sprt: alpha + beta must be below 1, got ${alpha + beta}`);
}

type Pdf = readonly { value: number; prob: number }[];

/** fishtest `LLRcalc.results_to_pdf`: regularized counts to a probability distribution over [0, 1]. */
function countsToPdf(counts: PentanomialCounts): { total: number; pdf: Pdf } {
  const regularized = counts.map(c => (c === 0 ? REGULARIZE_EPSILON : c));
  const total = regularized.reduce((a, b) => a + b, 0);
  return { total, pdf: regularized.map((c, i) => ({ value: GAME_VALUES[i], prob: c / total })) };
}

/** Expectation and variance of a discrete distribution (fishtest `LLRcalc.stats`). */
function pdfStats(pdf: Pdf): { mean: number; variance: number } {
  let mean = 0;
  for (const { value, prob } of pdf) mean += value * prob;
  let variance = 0;
  for (const { value, prob } of pdf) variance += prob * (value - mean) ** 2;
  return { mean, variance };
}

/**
 * Solves `sum_i p_i a_i / (1 + x a_i) = 0` (fishtest `LLRcalc.secular`).
 * The support must straddle zero; the left-hand side is then strictly
 * decreasing on (−1/max a, −1/min a), so plain bisection is enough.
 */
function secular(pdf: Pdf): number {
  const values = pdf.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min * max >= 0) throw new Error('sprt: secular equation requires support straddling zero');
  const epsilon = 1e-9;
  let lo = -1 / max + epsilon;
  let hi = -1 / min - epsilon;
  const f = (x: number): number => {
    let sum = 0;
    for (const { value, prob } of pdf) sum += (prob * value) / (1 + x * value);
    return sum;
  };
  if (f(lo) < 0 || f(hi) > 0) throw new Error('sprt: secular equation is not bracketed');
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (hi - lo <= 1e-15 * Math.max(1, Math.abs(mid))) break;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** MLE of the distribution constrained to expectation `s` (fishtest `LLRcalc.MLE_expected`). */
function mleExpected(pdf: Pdf, s: number): Pdf {
  const shifted: Pdf = pdf.map(({ value, prob }) => ({ value: value - s, prob }));
  const x = secular(shifted);
  return pdf.map(({ value, prob }) => ({ value, prob: prob / (1 + x * (value - s)) }));
}

/** Generalized LLR divided by N (fishtest `LLRcalc.LLR`, statistic "expectation"). */
function llrPerPair(pdf: Pdf, s0: number, s1: number): number {
  const pdf0 = mleExpected(pdf, s0);
  const pdf1 = mleExpected(pdf, s1);
  let sum = 0;
  for (let i = 0; i < pdf.length; i++) sum += pdf[i].prob * (Math.log(pdf1[i].prob) - Math.log(pdf0[i].prob));
  return sum;
}

/**
 * The pentanomial GSPRT log-likelihood ratio for a set of pentanomial
 * counts, in logistic Elo (fishtest `LLRcalc.LLR_logistic`). Exported so
 * tests can pin it against the python reference in `reference/` without
 * materializing the pair list.
 */
export function llrFromCounts(counts: PentanomialCounts, elo0: number, elo1: number): number {
  const { total, pdf } = countsToPdf(counts);
  return total * llrPerPair(pdf, eloToScore(elo0), eloToScore(elo1));
}

function decide(llr: number, lowerBound: number, upperBound: number): SprtDecision {
  if (llr >= upperBound) return 'H1';
  if (llr <= lowerBound) return 'H0';
  return 'continue';
}

/**
 * Runs the pentanomial GSPRT over a list of pair scores (each ∈ {0, 0.5, 1,
 * 1.5, 2}), as a single batch over all of them. Returns `decision:
 * 'continue'` (with `n: 0`) for an empty list — callers with a `--pairs`
 * cap should treat that as "not yet decided", not a crash — and likewise
 * `'continue'` whenever fewer than `minPairs` pairs were played, however far
 * the LLR sits outside the bounds. Throws on invalid parameters (see
 * `validateSprtParams`) or a non-positive-integer `minPairs`.
 */
export function sprt(pairScores: readonly number[], params: SprtParams, opts?: SprtOptions): SprtResult {
  validateSprtParams(params);
  const minPairs = resolveMinPairs(opts);
  const { elo0, elo1, alpha, beta } = params;
  const t0 = eloToScore(elo0);
  const t1 = eloToScore(elo1);
  const upperBound = Math.log((1 - beta) / alpha);
  const lowerBound = Math.log(beta / (1 - alpha));
  const counts = pentanomialCounts(pairScores);
  if (pairScores.length === 0) {
    return {
      elo0, elo1, alpha, beta, n: 0, method: 'pentanomial-gsprt', counts, t0, t1,
      mu: NaN, variance: NaN, llr: 0, lowerBound, upperBound, minPairs, decision: 'continue',
    };
  }
  const { total, pdf } = countsToPdf(counts);
  const { mean, variance } = pdfStats(pdf);
  const llr = total * llrPerPair(pdf, t0, t1);
  const n = pairScores.length;
  return {
    elo0, elo1, alpha, beta,
    n,
    method: 'pentanomial-gsprt',
    counts,
    t0, t1,
    mu: mean,
    variance,
    llr,
    lowerBound,
    upperBound,
    minPairs,
    decision: n < minPairs ? 'continue' : decide(llr, lowerBound, upperBound),
  };
}

/**
 * Evaluates the GSPRT at every pair checkpoint, in play order, and stops at
 * the first bound crossing at or after `minPairs` (default
 * `DEFAULT_MIN_PAIRS`). `pairScoresInPlayOrder` must be ordered as the
 * pairs were actually played: a sequential test's error rates only hold if
 * the stopping rule looks at prefixes of the real sequence.
 *
 * `trace` has one entry per pair observed, up to and including the pair
 * that decided (so the last entry's `llr` is `finalLlr`). Checkpoints below
 * `minPairs` are still traced — they just cannot decide.
 */
export function sprtSequential(
  pairScoresInPlayOrder: readonly number[],
  params: SprtParams,
  opts?: SprtOptions,
): SprtSequentialResult {
  validateSprtParams(params);
  const minPairs = resolveMinPairs(opts);
  const { elo0, elo1, alpha, beta } = params;
  const upperBound = Math.log((1 - beta) / alpha);
  const lowerBound = Math.log(beta / (1 - alpha));

  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  const trace: SprtCheckpoint[] = [];
  let decision: SprtDecision = 'continue';
  let decidedAtPair: number | null = null;
  let finalLlr = 0;

  for (let i = 0; i < pairScoresInPlayOrder.length; i++) {
    counts[pentanomialIndex(pairScoresInPlayOrder[i])] += 1;
    const n = i + 1;
    const llr = llrFromCounts(counts, elo0, elo1);
    trace.push({ n, llr });
    finalLlr = llr;
    if (n >= minPairs) {
      const step = decide(llr, lowerBound, upperBound);
      if (step !== 'continue') {
        decision = step;
        decidedAtPair = n;
        break;
      }
    }
  }

  return { decision, decidedAtPair, finalLlr, trace, minPairs, lowerBound, upperBound };
}
