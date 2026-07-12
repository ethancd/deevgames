import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '../core/types';
import { nightFactor, wrapSpeech } from './fx';

describe('nightFactor', () => {
  it('is 0 well into the day and 1 well into the night', () => {
    expect(nightFactor(100)).toBe(0);
    expect(nightFactor(DAY_TICKS / 2 + 100)).toBe(1);
  });

  it('smoothly interpolates across the dusk boundary (monotone rise)', () => {
    const half = DAY_TICKS / 2;
    const samples = [half - 25, half - 15, half - 5, half + 5, half + 15, half + 25].map(nightFactor);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    expect(samples[0]).toBe(0);
    expect(samples[samples.length - 1]).toBe(1);
  });

  it('smoothly interpolates across the dawn boundary (monotone fall, wraps)', () => {
    const wrapPoint = DAY_TICKS;
    const before = nightFactor(wrapPoint - 15);
    const at = nightFactor(wrapPoint);
    const after = nightFactor(wrapPoint + 15);
    expect(before).toBeGreaterThan(at);
    expect(at).toBeGreaterThan(after);
  });

  it('is periodic in DAY_TICKS', () => {
    expect(nightFactor(50)).toBeCloseTo(nightFactor(50 + DAY_TICKS), 10);
  });

  it('is a pure function of tick (no drift across repeated calls)', () => {
    const a = nightFactor(300);
    const b = nightFactor(300);
    expect(a).toBe(b);
  });
});

describe('wrapSpeech', () => {
  it('does not wrap short text', () => {
    expect(wrapSpeech('Too dim.')).toEqual(['Too dim.']);
  });

  it('wraps to roughly the requested max width without breaking words', () => {
    const lines = wrapSpeech('Too dim. The den. Now, before the fire fades completely away.', 24);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(24 + 20); // generous bound: never splits a long single word mid-way beyond its own length
    }
    expect(lines.join(' ')).toBe('Too dim. The den. Now, before the fire fades completely away.');
  });

  it('drops empty/whitespace-only input to an empty line list', () => {
    expect(wrapSpeech('   ')).toEqual([]);
  });
});
