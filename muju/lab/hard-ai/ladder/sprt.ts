/**
 * Pentanomial SPRT over pair scores (DESIGN §7.7).
 *
 * Each pair contributes one score in {0, 0.5, 1, 1.5, 2} (`pairing.ts`);
 * `x = pairScore / 2` is the per-pair mean game score for engine A, and the
 * test compares the null hypothesis "A's true score is `t0 = score(elo0)`"
 * against the alternative "A's true score is `t1 = score(elo1)`" via the
 * log-likelihood ratio of a normal approximation to the mean of `x`:
 *
 *   μ̂ = mean(x), σ̂² = var(x) (floored at 1e-9 so a zero-variance run — every
 *   pair scoring identically — doesn't divide by zero),
 *   LLR = N (t1 − t0)(2μ̂ − t0 − t1) / (2σ̂²),
 *   bounds = ± log((1 − β) / α).
 *
 * `decision` is `'H1'` once `LLR ≥ upper` (accept the stronger hypothesis),
 * `'H0'` once `LLR ≤ lower` (accept the no-improvement hypothesis), else
 * `'continue'` (more pairs needed, or the run's `--pairs` cap was hit before
 * either bound was crossed).
 */

export interface SprtParams {
  elo0: number;
  elo1: number;
  alpha: number;
  beta: number;
}

export type SprtDecision = 'H0' | 'H1' | 'continue';

export interface SprtResult extends SprtParams {
  n: number;
  t0: number;
  t1: number;
  mu: number;
  variance: number;
  llr: number;
  lowerBound: number;
  upperBound: number;
  decision: SprtDecision;
}

const VARIANCE_FLOOR = 1e-9;

/** Elo-to-expected-score transform: the logistic win probability at a `elo`-point rating gap. */
export function eloToScore(elo: number): number {
  return 1 / (1 + Math.pow(10, -elo / 400));
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Population variance (divide by N, matching the fishtest/cutechess convention this formula is drawn from). */
function variance(xs: readonly number[], mu: number): number {
  if (xs.length === 0) return 0;
  return xs.reduce((acc, x) => acc + (x - mu) * (x - mu), 0) / xs.length;
}

/**
 * Runs the pentanomial SPRT over a list of pair scores (each ∈ {0, 0.5, 1,
 * 1.5, 2}). Returns `decision: 'continue'` (with `n: 0`) for an empty list —
 * callers with a `--pairs` cap should treat that as "not yet decided", not a
 * crash.
 */
export function sprt(pairScores: readonly number[], params: SprtParams): SprtResult {
  const { elo0, elo1, alpha, beta } = params;
  const t0 = eloToScore(elo0);
  const t1 = eloToScore(elo1);
  const upperBound = Math.log((1 - beta) / alpha);
  const lowerBound = Math.log(beta / (1 - alpha));
  if (pairScores.length === 0) {
    return { elo0, elo1, alpha, beta, n: 0, t0, t1, mu: NaN, variance: NaN, llr: 0, lowerBound, upperBound, decision: 'continue' };
  }
  const x = pairScores.map(s => s / 2);
  const n = x.length;
  const mu = mean(x);
  const varRaw = variance(x, mu);
  const varFloored = Math.max(varRaw, VARIANCE_FLOOR);
  const llr = (n * (t1 - t0) * (2 * mu - t0 - t1)) / (2 * varFloored);
  const decision: SprtDecision = llr >= upperBound ? 'H1' : llr <= lowerBound ? 'H0' : 'continue';
  return { elo0, elo1, alpha, beta, n, t0, t1, mu, variance: varRaw, llr, lowerBound, upperBound, decision };
}
