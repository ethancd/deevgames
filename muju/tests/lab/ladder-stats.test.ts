// @vitest-environment node
/**
 * Statistical validity of the ladder's SPRT and Elo estimator (E0.3).
 *
 * The LLR numbers pinned below were NOT produced by the TypeScript under
 * test. They come from `lab/hard-ai/ladder/reference/llr_reference.py`, a
 * pure-python transcription of Stockfish fishtest's `LLRcalc.py` and
 * `stat_util.py`, run with:
 *
 *   cd lab/hard-ai/ladder/reference && python3 llr_reference.py
 *
 * Its output is reproduced verbatim in the comments next to each pin.
 */
import { describe, it, expect } from 'vitest';
import {
  sprt,
  sprtSequential,
  llrFromCounts,
  eloToScore,
  DEFAULT_MIN_PAIRS,
  type SprtParams,
} from '../../lab/hard-ai/ladder/sprt';
import { eloEstimate, ELO_CLAMP_BOUND, type PentanomialCounts } from '../../lab/hard-ai/ladder/elo';

function expandCounts(counts: PentanomialCounts): number[] {
  const values = [0, 0.5, 1, 1.5, 2];
  const out: number[] = [];
  for (let i = 0; i < 5; i++) for (let k = 0; k < counts[i]; k++) out.push(values[i]);
  return out;
}

describe('ladder stats: pentanomial GSPRT LLR pinned against the python reference', () => {
  // `python3 llr_reference.py`, section "# pentanomial GSPRT LLR (LLRcalc.LLR_logistic)".
  const cases: Array<{ name: string; counts: PentanomialCounts; elo0: number; elo1: number; llr: number }> = [
    { name: 'spread-24', counts: [3, 5, 8, 5, 3], elo0: 0, elo1: 50, llr: -0.6885485524865322 },
    { name: 'skew-A-32', counts: [1, 2, 4, 10, 15], elo0: 0, elo1: 100, llr: 6.680471281827828 },
    { name: 'skew-B-32', counts: [15, 10, 4, 2, 1], elo0: -50, elo1: 0, llr: -3.741764774025664 },
    { name: 'all-draws-24', counts: [0, 0, 24, 0, 0], elo0: 0, elo1: 10, llr: -0.6936708174979099 },
    { name: 'bimodal-20', counts: [10, 0, 0, 0, 10], elo0: 0, elo1: 20, llr: -0.033127687638014325 },
    { name: 'all-sweeps-10', counts: [0, 0, 0, 0, 10], elo0: 0, elo1: 5, llr: 0.1429044325441585 },
    { name: 'asym-bounds-20', counts: [2, 3, 5, 7, 3], elo0: -20, elo1: 20, llr: 0.8800139576417187 },
    { name: 'large-300', counts: [50, 60, 80, 60, 50], elo0: 0, elo1: 4, llr: -0.04587840043236857 },
  ];

  for (const c of cases) {
    it(`matches the reference LLR for "${c.name}" to 1e-6`, () => {
      expect(Math.abs(llrFromCounts(c.counts, c.elo0, c.elo1) - c.llr)).toBeLessThan(1e-6);
    });
  }

  it('sprt() over the expanded pair list agrees with the counts-level LLR', () => {
    for (const c of cases) {
      const params: SprtParams = { elo0: c.elo0, elo1: c.elo1, alpha: 0.05, beta: 0.05 };
      const result = sprt(expandCounts(c.counts), params);
      expect(Math.abs(result.llr - c.llr)).toBeLessThan(1e-6);
      expect(result.counts).toEqual(c.counts);
      expect(result.method).toBe('pentanomial-gsprt');
      expect(result.n).toBe(c.counts.reduce((a, b) => a + b, 0));
    }
  });

  it('stays bounded where the old normal approximation exploded', () => {
    // The replaced formula, N (t1−t0)(2μ̂−t0−t1) / (2 σ̂²) with σ̂² floored at
    // 1e-9, reported LLR_alt2 = −95.413 for 24 all-draw pairs and +190.608
    // for 10 all-sweep pairs (python reference, LLR_alt2 column): both far
    // outside ±log(0.95/0.05) = ±2.944, i.e. an instant decision from a
    // degenerate sample. The exact GSPRT stays inside the bounds.
    expect(Math.abs(llrFromCounts([0, 0, 24, 0, 0], 0, 10))).toBeLessThan(2.9444389791664403);
    expect(Math.abs(llrFromCounts([0, 0, 0, 0, 10], 0, 5))).toBeLessThan(2.9444389791664403);
  });
});

describe('ladder stats: Elo interval cross-checked against fishtest stat_util', () => {
  // `python3 llr_reference.py`, section "# Elo estimate (stat_util.get_elo)".
  const cases: Array<{
    name: string;
    counts: PentanomialCounts;
    games: number;
    mu: number;
    variance: number;
    elo: number;
    elo95: number;
    los: number;
  }> = [
    {
      name: 'spread-24',
      counts: [3, 5, 8, 5, 3],
      games: 48,
      mu: 0.5,
      variance: 0.17708333333333334,
      elo: 0,
      elo95: 84.3404581870999,
      los: 0.5,
    },
    {
      name: 'skew-A-32',
      counts: [1, 2, 4, 10, 15],
      games: 64,
      mu: 0.78125,
      variance: 0.138671875,
      elo: 221.1367874631123,
      elo95: 97.5334799017082,
      los: 0.9999999992394216,
    },
  ];

  for (const c of cases) {
    it(`reproduces stat_util.get_elo for "${c.name}"`, () => {
      const est = eloEstimate(expandCounts(c.counts));
      // n counts PAIRS; fishtest's `games` is the 2n the same sample has.
      expect(est.n).toBe(c.counts.reduce((a, b) => a + b, 0));
      expect(est.games).toBe(c.games);
      expect(est.mu).toBeCloseTo(c.mu, 12);
      // fishtest's per-game variance is exactly half the pair variance.
      expect(est.variance).toBeCloseTo(c.variance, 12);
      expect(est.variancePairs).toBeCloseTo(2 * c.variance, 12);
      expect(est.elo).toBeCloseTo(c.elo, 6);
      expect(est.elo95).toBeCloseTo(c.elo95, 6);
      expect(est.los).toBeCloseTo(c.los, 6);
      expect(est.degenerate).toBe(false);
    });
  }

  it('uses pair-level variance: the interval is wider than the discredited per-game-halves one', () => {
    // Old behaviour: each pair score was split into two equal halves, the
    // 2n halves were treated as independent games, and the standard error
    // came out as sqrt(var(halves) / 2n) = sqrt(varPairs / 4 / 2n), i.e. a
    // factor sqrt(2) too small. Pin the ratio so the correlation cannot be
    // dropped again silently.
    const counts: PentanomialCounts = [3, 5, 8, 5, 3];
    const est = eloEstimate(expandCounts(counts));
    const halves = expandCounts(counts).flatMap(p => [p / 2, p / 2]);
    const muHalves = halves.reduce((a, b) => a + b, 0) / halves.length;
    const varHalves = halves.reduce((acc, x) => acc + (x - muHalves) ** 2, 0) / halves.length;
    const seOld = Math.sqrt(varHalves / halves.length);
    expect(est.se / seOld).toBeCloseTo(Math.SQRT2, 9);
  });
});

describe('ladder stats: strict parameter validation', () => {
  const base: SprtParams = { elo0: 0, elo1: 50, alpha: 0.05, beta: 0.05 };
  const pairs = [1, 1.5, 0.5, 2, 0];

  it('throws when elo0 === elo1 (the M19 phone row, --sprt 0,0,0.05,0.05)', () => {
    expect(() => sprt(pairs, { elo0: 0, elo1: 0, alpha: 0.05, beta: 0.05 })).toThrow(/must differ/);
    expect(() => sprtSequential(pairs, { elo0: 0, elo1: 0, alpha: 0.05, beta: 0.05 })).toThrow(/must differ/);
    expect(() => sprt(pairs, { elo0: 12.5, elo1: 12.5, alpha: 0.05, beta: 0.05 })).toThrow(/must differ/);
  });

  it('throws on alpha or beta outside the open interval (0, 1)', () => {
    for (const alpha of [0, 1, -0.01, 1.5, NaN]) {
      expect(() => sprt(pairs, { ...base, alpha })).toThrow();
    }
    for (const beta of [0, 1, -0.01, 1.5, NaN]) {
      expect(() => sprt(pairs, { ...base, beta })).toThrow();
    }
  });

  it('throws when alpha + beta >= 1, or an Elo bound is not finite, or the bounds are inverted', () => {
    expect(() => sprt(pairs, { ...base, alpha: 0.6, beta: 0.4 })).toThrow(/alpha \+ beta/);
    expect(() => sprt(pairs, { ...base, elo1: Infinity })).toThrow(/finite/);
    expect(() => sprt(pairs, { ...base, elo0: NaN })).toThrow(/finite/);
    expect(() => sprt(pairs, { elo0: 50, elo1: 0, alpha: 0.05, beta: 0.05 })).toThrow(/must be greater/);
  });

  it('rejects a pair score outside {0, 0.5, 1, 1.5, 2}', () => {
    expect(() => sprt([1, 0.3], base)).toThrow(/pair score/);
    expect(() => eloEstimate([2.5])).toThrow(/pair score/);
  });

  it('accepts the parameter sets the shipped gate rows use', () => {
    for (const [elo0, elo1] of [[0, 100], [0, 50], [0, 10], [0, 4]] as const) {
      expect(() => sprt(pairs, { elo0, elo1, alpha: 0.05, beta: 0.05 })).not.toThrow();
    }
  });
});

describe('ladder stats: no green result from tiny degenerate samples', () => {
  const params: SprtParams = { elo0: 0, elo1: 50, alpha: 0.05, beta: 0.05 };
  const degenerate: Array<{ name: string; value: number }> = [
    { name: 'all-draw', value: 1 },
    { name: 'all-win', value: 2 },
    { name: 'all-loss', value: 0 },
  ];

  for (const { name, value } of degenerate) {
    for (const n of [1, 2, 5, 10]) {
      it(`${name} × ${n} pairs: no decision below the predeclared minimum`, () => {
        const sample = Array<number>(n).fill(value);
        const seq = sprtSequential(sample, params);
        expect(seq.minPairs).toBe(DEFAULT_MIN_PAIRS);
        expect(seq.decidedAtPair === null || seq.decidedAtPair >= DEFAULT_MIN_PAIRS).toBe(true);
        if (n < DEFAULT_MIN_PAIRS) {
          expect(seq.decision).toBe('continue');
          expect(seq.decidedAtPair).toBeNull();
        }
        expect(seq.trace).toHaveLength(n);
        expect(seq.trace[n - 1].n).toBe(n);
        expect(seq.finalLlr).toBeCloseTo(seq.trace[n - 1].llr, 12);
        // The batch entry point (what `run.ts` calls) honours the same minimum.
        const batch = sprt(sample, params);
        expect(batch.minPairs).toBe(DEFAULT_MIN_PAIRS);
        if (n < DEFAULT_MIN_PAIRS) expect(batch.decision).toBe('continue');
      });

      it(`${name} × ${n} pairs: bounded, non-degenerate-width Elo interval`, () => {
        const est = eloEstimate(Array<number>(n).fill(value));
        expect(est.n).toBe(n);
        expect(est.games).toBe(2 * n);
        expect(est.degenerate).toBe(true);
        expect(est.regularized).toBe(true);
        expect(Number.isFinite(est.eloLo)).toBe(true);
        expect(Number.isFinite(est.eloHi)).toBe(true);
        expect(Math.abs(est.eloLo)).toBeLessThanOrEqual(ELO_CLAMP_BOUND);
        expect(Math.abs(est.eloHi)).toBeLessThanOrEqual(ELO_CLAMP_BOUND);
        // Not a zero-width interval: a handful of identical pairs must not
        // look like certainty. 100 Elo of width is the floor at n = 10.
        expect(est.eloHi - est.eloLo).toBeGreaterThan(100);
        expect(est.se).toBeGreaterThan(0);
        expect(est.los).toBeLessThan(1);
        expect(est.los).toBeGreaterThan(0);
      });
    }
  }

  it('all-draw samples sit at exactly Elo 0 with LOS 0.5, however few pairs', () => {
    for (const n of [1, 2, 5, 10]) {
      const est = eloEstimate(Array<number>(n).fill(1));
      expect(est.mu).toBeCloseTo(0.5, 12);
      expect(est.elo).toBeCloseTo(0, 9);
      // The normal CDF is the Abramowitz–Stegun erf approximation, good to ~1e-7.
      expect(est.los).toBeCloseTo(0.5, 7);
    }
  });

  it('LOS on a handful of one-sided pairs stays away from 1', () => {
    expect(eloEstimate([2]).los).toBeLessThan(0.7);
    expect(eloEstimate([2, 2]).los).toBeLessThan(0.85);
    expect(eloEstimate([2, 2, 2, 2, 2]).los).toBeLessThan(0.995);
    expect(eloEstimate([0]).los).toBeGreaterThan(0.3);
    expect(eloEstimate([0, 0, 0, 0, 0]).los).toBeGreaterThan(0.005);
  });

  it('the minPairs guard binds in BOTH entry points: 9 all-draw pairs cross the H0 bound but cannot decide', () => {
    // Reference LLR for 9 all-draw pairs at elo0=0, elo1=100 is −2.95072,
    // already past the lower bound −2.94444 (python reference).
    const wide: SprtParams = { elo0: 0, elo1: 100, alpha: 0.05, beta: 0.05 };
    const nine = Array<number>(9).fill(1);
    const batch = sprt(nine, wide);
    expect(batch.llr).toBeLessThan(batch.lowerBound);
    // `run.ts` calls the batch `sprt()` once at the end of a `--pairs` run,
    // so the predeclared minimum has to bind there too, not only in
    // `sprtSequential`. The LLR is still reported; only the verdict waits.
    expect(batch.decision).toBe('continue');
    expect(batch.minPairs).toBe(DEFAULT_MIN_PAIRS);
    expect(sprtSequential(nine, wide).decision).toBe('continue');
    expect(sprtSequential(nine, wide).decidedAtPair).toBeNull();
    // With the minimum lowered to 1 the same sample decides at pair 9 in
    // both entry points, which is what the predeclared minimum exists to
    // prevent.
    expect(sprt(nine, wide, { minPairs: 1 }).decision).toBe('H0');
    expect(sprtSequential(nine, wide, { minPairs: 1 }).decidedAtPair).toBe(9);
    // One more all-draw pair reaches the minimum and decides there.
    expect(sprtSequential(Array<number>(10).fill(1), wide).decidedAtPair).toBe(10);
    expect(sprt(Array<number>(10).fill(1), wide).decision).toBe('H0');
  });

  it('rejects a nonsensical minPairs', () => {
    const params2: SprtParams = { elo0: 0, elo1: 50, alpha: 0.05, beta: 0.05 };
    expect(() => sprtSequential([1, 1], params2, { minPairs: 0 })).toThrow(/minPairs/);
    expect(() => sprtSequential([1, 1], params2, { minPairs: 2.5 })).toThrow(/minPairs/);
    expect(() => sprt([1, 1], params2, { minPairs: 0 })).toThrow(/minPairs/);
    expect(() => sprt([1, 1], params2, { minPairs: 2.5 })).toThrow(/minPairs/);
  });
});

/**
 * Seeded simulation. The generator is a pentanomial distribution whose TRUE
 * expected per-game score is exactly the hypothesised one: a fixed base
 * shape is exponentially tilted, `p_i ∝ b_i exp(λ v_i)`, and λ is solved by
 * bisection so that `sum_i p_i v_i` equals the target to machine precision.
 * Tilting keeps a realistic pentanomial shape (draw-heavy middle, rare
 * double sweeps) instead of a two-point distribution that would flatter the
 * test.
 */
const BASE_SHAPE: readonly number[] = [0.05, 0.2, 0.5, 0.2, 0.05];
const GAME_VALUES: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

function tiltedPentanomial(targetScore: number): number[] {
  const meanAt = (lambda: number): number => {
    const weights = BASE_SHAPE.map((b, i) => b * Math.exp(lambda * GAME_VALUES[i]));
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.reduce((acc, w, i) => acc + (w / total) * GAME_VALUES[i], 0);
  };
  let lo = -60;
  let hi = 60;
  for (let i = 0; i < 300; i++) {
    const mid = 0.5 * (lo + hi);
    if (meanAt(mid) < targetScore) lo = mid;
    else hi = mid;
  }
  const lambda = 0.5 * (lo + hi);
  const weights = BASE_SHAPE.map((b, i) => b * Math.exp(lambda * GAME_VALUES[i]));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

/** mulberry32: a small, seeded, dependency-free PRNG (no Math.random anywhere). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawPairScore(pdf: readonly number[], rng: () => number): number {
  const u = rng();
  let acc = 0;
  for (let i = 0; i < pdf.length; i++) {
    acc += pdf[i];
    if (u < acc) return i / 2;
  }
  return 2;
}

describe('ladder stats: seeded null and alternative simulations', () => {
  const params: SprtParams = { elo0: 0, elo1: 70, alpha: 0.05, beta: 0.05 };
  const RUNS = 2000;
  const MAX_PAIRS = 300;

  function simulate(trueScore: number, seed: number): { h1: number; h0: number; undecided: number; meanPairs: number } {
    const pdf = tiltedPentanomial(trueScore);
    const rng = mulberry32(seed);
    let h1 = 0;
    let h0 = 0;
    let undecided = 0;
    let pairsTotal = 0;
    for (let run = 0; run < RUNS; run++) {
      const sample: number[] = [];
      for (let i = 0; i < MAX_PAIRS; i++) sample.push(drawPairScore(pdf, rng));
      const result = sprtSequential(sample, params);
      pairsTotal += result.decidedAtPair ?? MAX_PAIRS;
      if (result.decision === 'H1') h1++;
      else if (result.decision === 'H0') h0++;
      else undecided++;
    }
    return { h1, h0, undecided, meanPairs: pairsTotal / RUNS };
  }

  it('the generator hits the hypothesised expected score exactly', () => {
    for (const elo of [params.elo0, params.elo1]) {
      const pdf = tiltedPentanomial(eloToScore(elo));
      const mean = pdf.reduce((acc, p, i) => acc + p * GAME_VALUES[i], 0);
      expect(pdf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(mean).toBeCloseTo(eloToScore(elo), 12);
      expect(pdf.every(p => p > 0)).toBe(true);
    }
  });

  it(`holds the type-I rate under H0 and the power under H1 over ${RUNS} runs capped at ${MAX_PAIRS} pairs`, () => {
    const underNull = simulate(eloToScore(params.elo0), 0x5eed01);
    const underAlt = simulate(eloToScore(params.elo1), 0x5eed02);

    const typeI = underNull.h1 / RUNS;
    const power = underAlt.h1 / RUNS;
    if (process.env.LADDER_STATS_VERBOSE) {
      console.log('H0:', underNull, 'typeI', typeI);
      console.log('H1:', underAlt, 'power', power);
    }
    // Stated margin: the asymptotic GSPRT guarantee plus 0.02 for Monte
    // Carlo error (2 s.e. at 2000 runs is about 0.01) and for the discrete
    // overshoot of the bound.
    expect(typeI).toBeLessThanOrEqual(params.alpha + 0.02);
    expect(power).toBeGreaterThanOrEqual(1 - params.beta - 0.02);
    // Sanity: the test must actually be terminating, not scraping past the
    // thresholds by never deciding.
    expect(underNull.undecided / RUNS).toBeLessThan(0.1);
    expect(underAlt.undecided / RUNS).toBeLessThan(0.1);
  }, 600_000);
});
