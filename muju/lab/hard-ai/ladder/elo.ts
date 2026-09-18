/**
 * Pair-aware Elo point estimate, 95% confidence interval and LOS (DESIGN
 * §7.7: "Elo: `−400 log10(1/μ̂ − 1)` with 95% interval and LOS"). Shares
 * `pairing.ts`'s pair-score convention: one score per PAIR, each ∈ {0, 0.5,
 * 1, 1.5, 2}, from engine A's perspective.
 *
 * The unit of independent observation is the pair, not the game. The two
 * games of a pair share an opening seed and only flip seats, so their
 * scores are strongly correlated; treating them as two independent games
 * (as this module previously did, by splitting each pair score into two
 * equal halves and reporting `n = 2 × pairs`) understates the variance and
 * produces an interval that is too narrow. Here `n` counts pairs, the
 * variance is the population variance of the PAIR scores, and the standard
 * error of the mean per-game score μ is
 *
 *   se(μ) = sqrt(varPairs / n) / 2
 *
 * (the /2 converts a pair score in [0, 2] to a per-game score in [0, 1]).
 * This is algebraically identical to fishtest's `stat_util.get_elo`, which
 * reports `games = 2n` and a per-game variance `var = varPairs / 2` and
 * then divides by `sqrt(games)`; `variance` and `games` below are given in
 * that convention so the two can be compared directly.
 *
 * Degenerate samples. A sample where every pair scored the same (all draws,
 * all sweeps) has zero pair variance, and a sample whose mean sits on the
 * score-space boundary (μ ∈ {0, 1}) has infinite Elo. Either would yield a
 * zero-width or unbounded interval, i.e. an apparently certain result from
 * a handful of pairs. Two guards, both borrowed from fishtest:
 *
 *   1. When (and only when) the raw sample is degenerate in that sense, a
 *      Jeffreys prior — Dirichlet(1/2, …, 1/2), i.e. +0.5 added to each of
 *      the five pentanomial cells — is mixed into the counts before the
 *      mean and variance are taken, while the standard error still divides
 *      by the number of pairs actually played. `degenerate` and
 *      `regularized` report that this happened. (fishtest regularizes with
 *      a 1e-3 pseudo-count; that is calibrated for runs of many thousands
 *      of pairs and still leaves a near-zero-width interval at n = 10, so
 *      the heavier standard Jeffreys prior is used here. Non-degenerate
 *      samples are left alone so the estimate matches fishtest exactly.)
 *   2. Every Elo transform used for a reported estimate or interval bound
 *      clamps the score to [1e-3, 1 − 1e-3] (`eloFromScoreClamped`,
 *      fishtest's `stat_util.elo`), so the interval is always bounded by
 *      ±1199.83 Elo instead of running off to infinity.
 *
 * `los` remains a normal-approximation tail probability. On a degenerate
 * sample its variance input comes from the prior rather than from observed
 * spread, so it should be read as "the prior-regularized LOS", not as a
 * calibrated probability; `degenerate` flags exactly those cases.
 */

const Z95 = 1.959963985; // two-sided 95% normal quantile
const ELO_CLAMP_EPSILON = 1e-3; // fishtest stat_util.elo's clamp
const JEFFREYS_PSEUDO_COUNT = 0.5; // Dirichlet(1/2, …, 1/2) prior, per cell

/** Pair-score frequencies in the order [0, 0.5, 1, 1.5, 2] (LL, LD+DL, LW+DD+WL, DW+WD, WW). */
export type PentanomialCounts = readonly [number, number, number, number, number];

/** Pair-score values, per-game normalized (`pairScore / 2`). */
const GAME_VALUES: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

/** `−400 log10(1/μ − 1)`; ±Infinity at the score-space boundary (μ ∈ {0, 1}). */
export function eloFromScore(mu: number): number {
  if (mu <= 0) return -Infinity;
  if (mu >= 1) return Infinity;
  return -400 * Math.log10(1 / mu - 1);
}

/**
 * `eloFromScore` with the score clamped to [1e-3, 1 − 1e-3] before the
 * transform, matching fishtest's `stat_util.elo`. Bounded by ±1199.83, so a
 * boundary score yields a large-but-finite Elo rather than an infinity.
 */
export function eloFromScoreClamped(mu: number): number {
  const clamped = Math.min(1 - ELO_CLAMP_EPSILON, Math.max(ELO_CLAMP_EPSILON, mu));
  return -400 * Math.log10(1 / clamped - 1);
}

/** The largest magnitude `eloFromScoreClamped` can return (≈1199.83). */
export const ELO_CLAMP_BOUND = Math.max(Math.abs(eloFromScoreClamped(0)), Math.abs(eloFromScoreClamped(1)));

/** Standard normal CDF via the erf identity (Abramowitz–Stegun 7.1.26, good to ~1e-7). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Bins pair scores into the five pentanomial cells. Throws on a value that
 * is not one of {0, 0.5, 1, 1.5, 2} (to within 1e-9) — a pair score outside
 * that set means the caller lost track of the pairing convention, and
 * silently binning it would corrupt every statistic below.
 */
export function pentanomialCounts(pairScores: readonly number[]): PentanomialCounts {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const score of pairScores) counts[pentanomialIndex(score)] += 1;
  return counts;
}

/** The pentanomial cell (0..4) a single pair score falls in; throws on anything else. */
export function pentanomialIndex(pairScore: number): number {
  const index = Math.round(pairScore * 2);
  if (!Number.isFinite(pairScore) || index < 0 || index > 4 || Math.abs(pairScore * 2 - index) > 1e-9) {
    throw new Error(`elo: pair score ${pairScore} is not one of {0, 0.5, 1, 1.5, 2}`);
  }
  return index;
}

export interface EloEstimate {
  /** Number of PAIRS — the unit of independent observation. */
  n: number;
  /** Number of games, `2n`; reported for comparison with per-game conventions. */
  games: number;
  /** Raw pair-score frequencies, before any regularization. */
  counts: PentanomialCounts;
  /** True when the raw sample has zero pair variance or a boundary mean. */
  degenerate: boolean;
  /** True when the Jeffreys prior was mixed in (equivalent to `degenerate`). */
  regularized: boolean;
  /** Mean per-game score for A, ∈ [0, 1]. */
  mu: number;
  /** Mean per-game score before regularization (equals `mu` unless degenerate). */
  muRaw: number;
  /** 95% interval on `mu`, clipped to [0, 1]. */
  muLo: number;
  muHi: number;
  /** Population variance of the PAIR scores (each ∈ [0, 2]). */
  variancePairs: number;
  /** Per-game variance in fishtest's convention, `variancePairs / 2`. */
  variance: number;
  /** Standard error of the mean pair score, `sqrt(variancePairs / n)`. */
  sePair: number;
  /** Standard error of `mu`, `sePair / 2`. */
  se: number;
  elo: number;
  /** 95% CI bounds, via the clamped transform (finite by construction). */
  eloLo: number;
  eloHi: number;
  /** Half-width of the Elo interval, matching fishtest's `elo95`. */
  elo95: number;
  /** Likelihood Of Superiority: P(A's true score > 0.5), i.e. P(A is the stronger engine). */
  los: number;
}

/**
 * `pairScores`: one entry per pair, each ∈ {0, 0.5, 1, 1.5, 2} (A's
 * perspective, DESIGN §7.7). Returns a pair-aware estimate: see the module
 * header for the variance convention and the degenerate-sample treatment.
 * An empty list is well-defined (`n: 0`, NaN statistics, no throw) so a
 * caller whose run produced no completed pairs need not special-case it.
 */
export function eloEstimate(pairScores: readonly number[]): EloEstimate {
  const counts = pentanomialCounts(pairScores);
  const n = pairScores.length;
  if (n === 0) {
    return {
      n: 0, games: 0, counts, degenerate: true, regularized: false,
      mu: NaN, muRaw: NaN, muLo: NaN, muHi: NaN,
      variancePairs: NaN, variance: NaN, sePair: NaN, se: NaN,
      elo: NaN, eloLo: NaN, eloHi: NaN, elo95: NaN, los: NaN,
    };
  }

  const raw = momentsFromCounts(counts);
  const degenerate = raw.variancePairs <= 0 || raw.mu <= 0 || raw.mu >= 1;
  const effective = degenerate ? momentsFromCounts(withJeffreysPrior(counts)) : raw;

  const { mu, variancePairs } = effective;
  // The standard error always divides by the number of pairs actually
  // played: the prior steadies the variance estimate, it does not buy extra
  // evidence.
  const sePair = Math.sqrt(variancePairs / n);
  const se = sePair / 2;
  const muLo = Math.min(1, Math.max(0, mu - Z95 * se));
  const muHi = Math.min(1, Math.max(0, mu + Z95 * se));
  const eloLo = eloFromScoreClamped(muLo);
  const eloHi = eloFromScoreClamped(muHi);
  const los = normalCdf((mu - 0.5) / se);

  return {
    n,
    games: 2 * n,
    counts,
    degenerate,
    regularized: degenerate,
    mu,
    muRaw: raw.mu,
    muLo,
    muHi,
    variancePairs,
    variance: variancePairs / 2,
    sePair,
    se,
    elo: eloFromScoreClamped(mu),
    eloLo,
    eloHi,
    elo95: (eloHi - eloLo) / 2,
    los,
  };
}

/** Adds the Dirichlet(1/2, …, 1/2) pseudo-count to every pentanomial cell. */
function withJeffreysPrior(counts: PentanomialCounts): PentanomialCounts {
  const j = JEFFREYS_PSEUDO_COUNT;
  return [counts[0] + j, counts[1] + j, counts[2] + j, counts[3] + j, counts[4] + j];
}

/** Mean per-game score and population variance of the pair scores, from (possibly fractional) cell counts. */
function momentsFromCounts(counts: PentanomialCounts): { mu: number; variancePairs: number } {
  const total = counts.reduce((a, b) => a + b, 0);
  let mu = 0;
  for (let i = 0; i < 5; i++) mu += counts[i] * GAME_VALUES[i];
  mu /= total;
  const meanPair = 2 * mu;
  let variancePairs = 0;
  for (let i = 0; i < 5; i++) variancePairs += counts[i] * (i / 2 - meanPair) ** 2;
  variancePairs /= total;
  return { mu, variancePairs };
}
