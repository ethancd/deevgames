/**
 * Elo point estimate, 95% confidence interval, and LOS from a set of pair
 * scores (DESIGN §7.7: "Elo: `−400 log10(1/μ̂ − 1)` with 95% interval and
 * LOS"). Shares `pairing.ts`'s pair-score convention (each ∈ {0, 0.5, 1,
 * 1.5, 2}, A's perspective).
 */

const Z95 = 1.959963985; // two-sided 95% normal quantile

/** `−400 log10(1/μ − 1)`; ±Infinity at the score-space boundary (μ ∈ {0, 1}). */
export function eloFromScore(mu: number): number {
  if (mu <= 0) return -Infinity;
  if (mu >= 1) return Infinity;
  return -400 * Math.log10(1 / mu - 1);
}

/** Standard normal CDF via the erf identity (Abramowitz–Stegun 7.1.26, good to ~1e-7). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export interface EloEstimate {
  n: number;
  mu: number; // mean per-game score for A, ∈ [0, 1]
  variance: number; // population variance of the per-pair-half score
  elo: number;
  eloLo: number; // 95% CI lower bound
  eloHi: number; // 95% CI upper bound
  /** Likelihood Of Superiority: P(A's true score > 0.5), i.e. P(A is the stronger engine). */
  los: number;
}

/**
 * `pairScores`: one entry per pair, each ∈ {0, 0.5, 1, 1.5, 2} (A's
 * perspective, DESIGN §7.7). Internally expanded to per-game scores (each
 * pair contributes its two halves) so `n` and the confidence interval match
 * the actual number of games played, not pairs.
 */
export function eloEstimate(pairScores: readonly number[]): EloEstimate {
  const games = pairScores.flatMap(p => {
    // A pair score is the sum of two per-game scores each in {0, 0.5, 1};
    // split evenly — the two orientations' individual game scores are not
    // separately recoverable from the pair score alone, but their mean and
    // variance contribution to the aggregate is what the CI needs, so treat
    // each half as `pairScore / 2` (matches the SPRT's own `x = pairScore/2`
    // normalization, DESIGN §7.7 formula).
    const half = p / 2;
    return [half, half];
  });
  const n = games.length;
  if (n === 0) return { n: 0, mu: NaN, variance: NaN, elo: NaN, eloLo: NaN, eloHi: NaN, los: NaN };
  const mu = games.reduce((a, b) => a + b, 0) / n;
  const variance = games.reduce((acc, x) => acc + (x - mu) * (x - mu), 0) / n;
  const se = Math.sqrt(Math.max(variance, 1e-9) / n);
  const muLo = Math.min(1, Math.max(0, mu - Z95 * se));
  const muHi = Math.min(1, Math.max(0, mu + Z95 * se));
  const los = normalCdf((mu - 0.5) / Math.max(se, 1e-9));
  return { n, mu, variance, elo: eloFromScore(mu), eloLo: eloFromScore(muLo), eloHi: eloFromScore(muHi), los };
}
