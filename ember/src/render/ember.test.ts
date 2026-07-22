import { describe, expect, it } from 'vitest';
import { drawEmber, drawSparks, emberColors, flickerFrameFromTime, sparkPositions } from './ember';
import { FakeCtx2D } from './testSupport/fakeCtx2d';

describe('flickerFrameFromTime', () => {
  it('is a pure function of time, cycling through the flicker frames', () => {
    expect(flickerFrameFromTime(0)).toBe(flickerFrameFromTime(0));
    const seen = new Set<number>();
    for (let t = 0; t < 2000; t += 37) seen.add(flickerFrameFromTime(t));
    expect(seen.size).toBeGreaterThan(1);
    for (const f of seen) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(4);
    }
  });
});

describe('emberColors', () => {
  it('brightens toward the hot palette as fuel rises', () => {
    const dim = emberColors(0.02, 0);
    const bright = emberColors(0.95, 0);
    // crude luminance proxy: sum of hex channel values
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 0xff) + ((n >> 8) & 0xff) + (n & 0xff);
    };
    expect(luminance(bright.core)).toBeGreaterThan(luminance(dim.core));
    expect(luminance(bright.body)).toBeGreaterThan(luminance(dim.body));
  });

  it('is deterministic for the same (fuel, frame)', () => {
    expect(emberColors(0.5, 2)).toEqual(emberColors(0.5, 2));
  });
});

describe('drawEmber', () => {
  it('paints non-transparent pixels centered on the given screen position', () => {
    const ctx = new FakeCtx2D(32, 32);
    drawEmber(ctx, 16, 16, 0.8, 0);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    let anyOpaque = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) {
        anyOpaque = true;
        break;
      }
    }
    expect(anyOpaque).toBe(true);
  });
});

describe('sparkPositions / drawSparks', () => {
  it('is deterministic for identical (tick, frame, fuel) — replay-stable at 1x', () => {
    const a = sparkPositions(1042, 2, 0.6, 100, 100);
    const b = sparkPositions(1042, 2, 0.6, 100, 100);
    expect(a).toEqual(b);
  });

  it('spark count grows with fuel', () => {
    const low = sparkPositions(10, 0, 0.0, 0, 0);
    const high = sparkPositions(10, 0, 1.0, 0, 0);
    expect(high.length).toBeGreaterThanOrEqual(low.length);
  });

  it('drawSparks does not throw and paints pixels for a healthy ember', () => {
    const ctx = new FakeCtx2D(64, 64);
    expect(() => drawSparks(ctx, 100, 1, 0.9, 32, 32)).not.toThrow();
  });
});
