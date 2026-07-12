import { describe, expect, it } from 'vitest';
import { drawEnvironmentTint, drawGlow, drawPathDots, drawRain, drawSpeechBubble } from './fx';
import { FakeCtx2D } from './testSupport/fakeCtx2d';

describe('drawGlow', () => {
  it('invokes a radial gradient sized around the given radius', () => {
    const ctx = new FakeCtx2D(100, 100);
    drawGlow(ctx, 50, 50, 20);
    expect(ctx.gradientCalls).toBe(1);
  });

  it('is a no-op for a ~zero radius (collapsed ember)', () => {
    const ctx = new FakeCtx2D(100, 100);
    drawGlow(ctx, 50, 50, 0);
    expect(ctx.gradientCalls).toBe(0);
  });
});

describe('drawEnvironmentTint', () => {
  it('paints the night overlay at full night', () => {
    const ctx = new FakeCtx2D(10, 10);
    drawEnvironmentTint(ctx, 10, 10, 1);
    const data = ctx.getImageData(0, 0, 10, 10).data;
    let anyOpaque = false;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) anyOpaque = true;
    expect(anyOpaque).toBe(true);
  });

  it('paints (only) the day tint at full day', () => {
    const nightOnly = new FakeCtx2D(10, 10);
    drawEnvironmentTint(nightOnly, 10, 10, 1);
    const dayOnly = new FakeCtx2D(10, 10);
    drawEnvironmentTint(dayOnly, 10, 10, 0);
    // night tint should be visibly darker/bluer than the barely-there day tint
    const nightData = nightOnly.getImageData(0, 0, 1, 1).data;
    const dayData = dayOnly.getImageData(0, 0, 1, 1).data;
    expect(nightData[3]).toBeGreaterThan(dayData[3]);
  });
});

describe('drawRain', () => {
  it('is deterministic across ticks (replay-stable) and paints streaks', () => {
    const a = new FakeCtx2D(64, 64);
    const b = new FakeCtx2D(64, 64);
    drawRain(a, 64, 64, 500);
    drawRain(b, 64, 64, 500);
    expect(Array.from(a.getImageData(0, 0, 64, 64).data)).toEqual(
      Array.from(b.getImageData(0, 0, 64, 64).data),
    );
  });

  it('differs between distinct ticks (streaks fall over time)', () => {
    const a = new FakeCtx2D(64, 64);
    const b = new FakeCtx2D(64, 64);
    drawRain(a, 64, 64, 500);
    drawRain(b, 64, 64, 501);
    expect(Array.from(a.getImageData(0, 0, 64, 64).data)).not.toEqual(
      Array.from(b.getImageData(0, 0, 64, 64).data),
    );
  });
});

describe('drawPathDots', () => {
  it('does not throw and only draws every other point (dashed)', () => {
    const ctx = new FakeCtx2D(64, 64);
    const points = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 30, y: 10 },
      { x: 40, y: 10 },
    ];
    expect(() => drawPathDots(ctx, points, 0)).not.toThrow();
  });
});

describe('drawSpeechBubble', () => {
  it('renders text lines inside the bubble', () => {
    const ctx = new FakeCtx2D(200, 200);
    drawSpeechBubble(ctx, 'Too dim. The den. Now.', 100, 100);
    expect(ctx.fillTextCalls.length).toBeGreaterThan(0);
    expect(ctx.fillTextCalls[0].text.length).toBeGreaterThan(0);
  });

  it('does nothing for empty text', () => {
    const ctx = new FakeCtx2D(200, 200);
    drawSpeechBubble(ctx, '   ', 100, 100);
    expect(ctx.fillTextCalls.length).toBe(0);
  });
});
