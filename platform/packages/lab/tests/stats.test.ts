import { describe, expect, it } from 'vitest';
import { wilson, mean, fmtPct, fmtCI } from '../src/stats.ts';

describe('wilson', () => {
  it('centers on 0.5 for 50/100', () => {
    const ci = wilson(50, 100);
    expect(ci.p).toBeCloseTo(0.5, 10);
    expect(ci.lo).toBeLessThan(0.5);
    expect(ci.hi).toBeGreaterThan(0.5);
  });

  it('tightens the CI as trials grow (500/1000 vs 50/100)', () => {
    const small = wilson(50, 100);
    const large = wilson(500, 1000);
    expect(large.p).toBeCloseTo(small.p, 10);
    expect(large.hi - large.lo).toBeLessThan(small.hi - small.lo);
  });

  it('returns NaN for zero trials', () => {
    const ci = wilson(0, 0);
    expect(ci.p).toBeNaN();
    expect(ci.lo).toBeNaN();
    expect(ci.hi).toBeNaN();
  });

  it('clamps to [0, 1]', () => {
    expect(wilson(0, 10).lo).toBeGreaterThanOrEqual(0);
    expect(wilson(10, 10).hi).toBeLessThanOrEqual(1);
  });
});

describe('mean', () => {
  it('averages a list', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it('is NaN for an empty list', () => {
    expect(mean([])).toBeNaN();
  });
});

describe('fmtPct / fmtCI', () => {
  it('formats a percentage to one decimal', () => {
    expect(fmtPct(0.5)).toBe('50.0%');
    expect(fmtPct(NaN)).toBe('—');
  });

  it('formats a CI as pct [lo–hi]', () => {
    expect(fmtCI({ p: 0.5, lo: 0.4, hi: 0.6 })).toBe('50.0% [40.0%–60.0%]');
    expect(fmtCI({ p: NaN, lo: NaN, hi: NaN })).toBe('—');
  });
});
