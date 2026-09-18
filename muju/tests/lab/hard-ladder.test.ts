// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { sprt, sprtSequential, eloToScore, DEFAULT_MIN_PAIRS, type SprtParams } from '../../lab/hard-ai/ladder/sprt';
import { eloFromScore, eloEstimate } from '../../lab/hard-ai/ladder/elo';
import { buildPairs, expandGames, shardRange, gameScoreFor, pairScore, derivePairSeed } from '../../lab/hard-ai/ladder/pairing';
import { parseWorkSpec, workKey } from '../../lab/hard-ai/ladder/engines';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });
function expandCounts(counts: [number, number, number, number, number]): number[] {
  const values = [0, 0.5, 1, 1.5, 2];
  const out: number[] = [];
  for (let i = 0; i < 5; i++) for (let k = 0; k < counts[i]; k++) out.push(values[i]);
  return out;
}

/**
 * Structural behaviour of the SPRT. The LLR's numeric values are pinned in
 * `tests/lab/ladder-stats.test.ts` against a python transcription of
 * fishtest's `LLRcalc.py`; this block covers the parts a consumer depends on
 * (bounds, decision thresholds, empty input, parameter rejection).
 */
describe('lab/hard-ai/ladder/sprt', () => {
  it('reports the pentanomial GSPRT statistic and the observed pentanomial counts', () => {
    const result = sprt(expandCounts([3, 5, 8, 5, 3]), { elo0: 0, elo1: 50, alpha: 0.05, beta: 0.05 });
    expect(result.method).toBe('pentanomial-gsprt');
    expect(result.counts).toEqual([3, 5, 8, 5, 3]);
    expect(result.n).toBe(24); // pairs, not games
  });

  it('is exactly zero when the pair-score distribution is symmetric under symmetric Elo bounds', () => {
    // score(-e) + score(e) = 1 for any e (logistic symmetry), so with
    // elo0 = -elo1 the two hypotheses are mirror images. A counts
    // distribution symmetric about the middle bucket then fits both
    // hypotheses equally well and the GSPRT LLR is identically zero.
    const params: SprtParams = { elo0: -73, elo1: 73, alpha: 0.05, beta: 0.05 };
    const result = sprt(expandCounts([7, 5, 6, 5, 7]), params);
    expect(Math.abs(result.llr)).toBeLessThan(1e-9);
  });

  it('bounds are ± log((1 - β) / α) / log(β / (1 - α)) independently of the data', () => {
    const params: SprtParams = { elo0: 0, elo1: 20, alpha: 0.02, beta: 0.08 };
    const result = sprt([1, 0.5, 1.5, 2, 0], params);
    expect(result.upperBound).toBeCloseTo(Math.log((1 - params.beta) / params.alpha), 12);
    expect(result.lowerBound).toBeCloseTo(Math.log(params.beta / (1 - params.alpha)), 12);
  });

  it('decision crosses H1 once LLR exceeds the upper bound and H0 once it drops below the lower bound', () => {
    const params: SprtParams = { elo0: 0, elo1: 30, alpha: 0.05, beta: 0.05 };
    // A run entirely of A-favoring pair scores at reasonably large N should cross H1.
    const strong = sprt(Array(60).fill(2), params);
    expect(strong.decision).toBe('H1');
    // A run entirely of B-favoring pair scores should cross H0.
    const weak = sprt(Array(60).fill(0), params);
    expect(weak.decision).toBe('H0');
    // Sixty pairs is enough; ten of the same pairs is not (see
    // ladder-stats.test.ts for the degenerate-sample clause).
    expect(sprt(Array(10).fill(2), params).decision).toBe('continue');
  });

  it('the BATCH sprt() honours the predeclared minimum, exactly like sprtSequential', () => {
    // The lane B verifier's case: nine all-draw pairs at elo0=0/elo1=100 put
    // the LLR past the lower bound, and `sprt()` answered H0 — a verdict from
    // nine pairs of nothing. The LLR is still reported; only the verdict waits.
    const params: SprtParams = { elo0: 0, elo1: 100, alpha: 0.05, beta: 0.05 };
    const nine = sprt(Array<number>(9).fill(1), params);
    expect(nine.llr).toBeLessThan(nine.lowerBound);
    expect(nine.decision).toBe('continue');
    expect(nine.minPairs).toBe(DEFAULT_MIN_PAIRS);
    expect(sprtSequential(Array<number>(9).fill(1), params).decision).toBe('continue');
    // The tenth pair reaches the minimum, and then the model decides.
    const ten = sprt(Array<number>(10).fill(1), params);
    expect(ten.decision).toBe('H0');
    expect(sprtSequential(Array<number>(10).fill(1), params).decidedAtPair).toBe(10);
  });

  it('reports "continue" on an empty pair list rather than throwing', () => {
    const result = sprt([], { elo0: 0, elo1: 50, alpha: 0.05, beta: 0.05 });
    expect(result.decision).toBe('continue');
    expect(result.n).toBe(0);
  });

  it('rejects a degenerate hypothesis pair instead of silently never deciding', () => {
    expect(() => sprt([1, 2, 0], { elo0: 0, elo1: 0, alpha: 0.05, beta: 0.05 })).toThrow(/must differ/);
  });

  it('eloToScore(0) === 0.5 and is monotonically increasing', () => {
    expect(eloToScore(0)).toBeCloseTo(0.5, 12);
    expect(eloToScore(100)).toBeGreaterThan(eloToScore(0));
    expect(eloToScore(-100)).toBeLessThan(eloToScore(0));
  });
});

describe('lab/hard-ai/ladder/elo', () => {
  it('eloFromScore(0.5) === 0 and is the inverse of eloToScore', () => {
    expect(eloFromScore(0.5)).toBeCloseTo(0, 9);
    for (const e of [-350, -100, -1, 1, 100, 350]) {
      expect(eloFromScore(eloToScore(e))).toBeCloseTo(e, 6);
    }
  });

  it('eloFromScore is -Infinity/+Infinity at the score-space boundary', () => {
    expect(eloFromScore(0)).toBe(-Infinity);
    expect(eloFromScore(1)).toBe(Infinity);
  });

  it('eloEstimate on an even split of wins/losses returns ~0 Elo with los ~0.5', () => {
    const pairScores = [...Array(20).fill(2), ...Array(20).fill(0)]; // half A sweeps, half B sweeps
    const est = eloEstimate(pairScores);
    // n is the number of PAIRS: the two games of a pair share an opening
    // seed and only flip seats, so they are not two independent games.
    expect(est.n).toBe(40);
    expect(est.games).toBe(80);
    expect(est.mu).toBeCloseTo(0.5, 9);
    expect(est.elo).toBeCloseTo(0, 6);
    expect(est.los).toBeCloseTo(0.5, 6);
  });

  it('eloEstimate on a near-total A-wins run returns a large, finite positive Elo and los near 1', () => {
    // 29 pure A sweeps plus one split pair keeps mu just under 1, so the
    // sample is not degenerate and no regularization is applied.
    const est = eloEstimate([...Array(29).fill(2), 1.5]);
    expect(est.n).toBe(30);
    expect(est.degenerate).toBe(false);
    expect(est.elo).toBeGreaterThan(200);
    expect(Number.isFinite(est.elo)).toBe(true);
    expect(est.los).toBeGreaterThan(0.99);
  });

  it('eloEstimate on an empty list is well-defined (n=0, NaN elo, no throw)', () => {
    const est = eloEstimate([]);
    expect(est.n).toBe(0);
    expect(Number.isNaN(est.elo)).toBe(true);
  });
});

describe('lab/hard-ai/ladder/pairing', () => {
  it('buildPairs distributes handicaps round-robin and expandGames produces exactly 2 seat-mirrored games per pair', () => {
    const pairs = buildPairs(9, 42, [0, 3]);
    expect(pairs).toHaveLength(9);
    expect(pairs.map(p => p.handicap)).toEqual([0, 3, 0, 3, 0, 3, 0, 3, 0]);

    const games = expandGames(pairs);
    expect(games).toHaveLength(18);

    // Perfect seat symmetry: A is white exactly as often as B is white.
    const aWhite = games.filter(g => g.white === 'A').length;
    const bWhite = games.filter(g => g.white === 'B').length;
    expect(aWhite).toBe(9);
    expect(bWhite).toBe(9);

    // Each pair's two games share seed and handicap but flip seats.
    for (const pair of pairs) {
      const [gA, gB] = games.filter(g => g.pairIndex === pair.pairIndex);
      expect(gA.seed).toBe(gB.seed);
      expect(gA.seed).toBe(pair.seed);
      expect(gA.handicap).toBe(pair.handicap);
      expect(gA.white).not.toBe(gB.white);
      expect(gA.black).not.toBe(gB.black);
      expect(gA.white).toBe(gB.black);
    }
  });

  it('derivePairSeed is deterministic and pairwise-distinct across a run', () => {
    const seeds = Array.from({ length: 50 }, (_, i) => derivePairSeed(1234, i));
    expect(new Set(seeds).size).toBe(50);
    expect(derivePairSeed(1234, 7)).toBe(derivePairSeed(1234, 7));
  });

  it('gameScoreFor and pairScore reproduce the {0, 0.5, 1, 1.5, 2} pair-score set', () => {
    expect(gameScoreFor('A', 'A')).toBe(1);
    expect(gameScoreFor('A', 'B')).toBe(0);
    expect(gameScoreFor('A', null)).toBe(0.5);
    expect(pairScore(1, 1)).toBe(2);
    expect(pairScore(1, 0.5)).toBe(1.5);
    expect(pairScore(0.5, 0.5)).toBe(1);
    expect(pairScore(0, 0.5)).toBe(0.5);
    expect(pairScore(0, 0)).toBe(0);
  });

  it('shardRange partitions [0, pairs) into contiguous, non-overlapping, covering ranges for any shard count', () => {
    for (const [pairs, shardCount] of [[24, 12], [24, 5], [1, 12], [7, 3], [100, 1]] as const) {
      const ranges = Array.from({ length: shardCount }, (_, i) => shardRange(pairs, shardCount, i));
      // Contiguous & covering: each range starts where the previous ended.
      expect(ranges[0].start).toBe(0);
      expect(ranges[ranges.length - 1].end).toBe(pairs);
      for (let i = 1; i < ranges.length; i++) expect(ranges[i].start).toBe(ranges[i - 1].end);
      // Every range is non-negative length and sizes differ by at most 1.
      const sizes = ranges.map(r => r.end - r.start);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(pairs);
    }
  });
});

describe('lab/hard-ai/ladder/engines WorkSpec parsing', () => {
  it('round-trips fixed:<units> and wall:<ms> through parseWorkSpec/workKey', () => {
    expect(parseWorkSpec('fixed:1200')).toEqual({ mode: 'fixed', units: 1200 });
    expect(parseWorkSpec('wall:3000')).toEqual({ mode: 'wall', ms: 3000 });
    expect(workKey(parseWorkSpec('fixed:1200'))).toBe('fixed:1200');
    expect(workKey(parseWorkSpec('wall:3000'))).toBe('wall:3000');
  });

  it('rejects malformed --work strings', () => {
    expect(() => parseWorkSpec('1200')).toThrow();
    expect(() => parseWorkSpec('slow:1200')).toThrow();
    expect(() => parseWorkSpec('fixed:abc')).toThrow();
  });
});
