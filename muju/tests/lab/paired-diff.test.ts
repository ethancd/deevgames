// @vitest-environment node
/**
 * `lab/hard-ai/ladder/paired-diff.ts`, the paired R1-minus-R0 score difference amendment A8
 * preregisters (`docs/hard-ai/PHASING-PREREGISTRATION-2026-09-18.md`). Hand-computed cases, so
 * the formula, the flag and the refusals are pinned before R1 is played.
 */
import { describe, expect, it } from 'vitest';
import { pairedDiff, type PairRow } from '../../lab/hard-ai/ladder/paired-diff';

const rows = (scores: number[]): PairRow[] => scores.map((scoreA, i) => ({ pairId: `op:${i % 6}:${i}`, scoreA }));

describe('paired-diff (A8)', () => {
  it('d = (test − base) / 2 per pair, with the hand-computed mean, sd and interval', () => {
    // d = [+0.5, 0, −0.5, +1]: mean 0.25; deviations 0.25, −0.25, −0.75, 0.75;
    // squares sum 1.25; sd = sqrt(1.25 / 3).
    const r = pairedDiff(rows([1, 1, 2, 0]), rows([2, 1, 1, 2]));
    expect(r.n).toBe(4);
    expect(r.mean).toBeCloseTo(0.25, 12);
    expect(r.sd).toBeCloseTo(Math.sqrt(1.25 / 3), 12);
    const half = (1.96 * Math.sqrt(1.25 / 3)) / 2;
    expect(r.lo).toBeCloseTo(0.25 - half, 12);
    expect(r.hi).toBeCloseTo(0.25 + half, 12);
    expect([r.negative, r.zero, r.positive]).toEqual([1, 1, 2]);
    expect(r.regressionFlag).toBe(false);
  });

  it('flags only when the whole interval lies below zero', () => {
    const base = rows(Array(40).fill(2));
    // 30 pairs lose one game (d = −0.5), 10 hold (d = 0): mean −0.375, clearly below.
    const worse = rows([...Array(30).fill(1), ...Array(10).fill(2)]);
    expect(pairedDiff(base, worse).regressionFlag).toBe(true);
    // One pair of 40 loses a game: the interval straddles zero, no flag.
    const noisy = rows([1, ...Array(39).fill(2)]);
    const r = pairedDiff(base, noisy);
    expect(r.mean).toBeLessThan(0);
    expect(r.hi).toBeGreaterThan(0);
    expect(r.regressionFlag).toBe(false);
  });

  it('matches pairs by pairId, not by order', () => {
    const base = rows([0, 2, 1]);
    const test = [...rows([2, 2, 1])].reverse();
    expect(pairedDiff(base, test).mean).toBeCloseTo(1 / 3, 12);
  });

  it('refuses mismatched or duplicated schedules', () => {
    expect(() => pairedDiff(rows([1, 1]), rows([1, 1, 1]))).toThrow(/not the base row/);
    expect(() => pairedDiff(rows([1, 1, 1]), rows([1, 1]))).toThrow(/not the test row/);
    const dup = [...rows([1, 1]), { pairId: 'op:0:0', scoreA: 1 }];
    expect(() => pairedDiff(dup, rows([1, 1]))).toThrow(/duplicate/);
    expect(() => pairedDiff(rows([1]), rows([1]))).toThrow(/at least 2/);
  });
});
