/**
 * EMBER — sprite determinism tests (src/render/spriteSheets.test.ts).
 *
 * Exercises the real drawTileVariant/drawWolfPosture/drawDeadwoodVariant
 * production functions against a hand-built FakeCtx2D (see
 * testSupport/fakeCtx2d.ts) — same hash inputs must always produce the same
 * pixels, read back via getImageData, exactly as contracts.ts specifies.
 * Runs in the default 'node' vitest environment: no DOM/jsdom needed, since
 * these functions only touch the small Ctx2D surface.
 */

import { describe, expect, it } from 'vitest';
import {
  DEADWOOD_VARIANTS,
  TILE_VARIANTS,
  WOLF_POSTURES,
  WOLF_SPRITE_H,
  WOLF_SPRITE_W,
  deadwoodVariantIndex,
  drawDeadwoodVariant,
  drawTileVariant,
  drawWolfPosture,
  tileVariantIndex,
} from './spriteSheets';
import { TILE_PX } from './palette';
import { FakeCtx2D } from './testSupport/fakeCtx2d';

function renderTile(tileType: Parameters<typeof drawTileVariant>[1], seed: number) {
  const ctx = new FakeCtx2D(TILE_PX, TILE_PX);
  drawTileVariant(ctx, tileType, seed, 0, 0);
  return ctx.getImageData(0, 0, TILE_PX, TILE_PX).data;
}

describe('drawTileVariant determinism', () => {
  for (const tileType of ['grass', 'forest', 'rock', 'water', 'den'] as const) {
    it(`${tileType}: identical (tileType, seed) -> byte-identical pixels`, () => {
      const a = renderTile(tileType, 3);
      const b = renderTile(tileType, 3);
      expect(Array.from(a)).toEqual(Array.from(b));
    });
  }

  it('different seeds produce different pixels (variation actually happens)', () => {
    const a = renderTile('grass', 0);
    const b = renderTile('grass', 1);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('draws something non-transparent for every tile type', () => {
    for (const tileType of ['grass', 'forest', 'rock', 'water', 'den'] as const) {
      const data = renderTile(tileType, 5);
      let anyOpaque = false;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) {
          anyOpaque = true;
          break;
        }
      }
      expect(anyOpaque).toBe(true);
    }
  });
});

describe('tileVariantIndex', () => {
  it('is a pure deterministic function of (x, y, tileType)', () => {
    expect(tileVariantIndex(5, 9, 'forest')).toBe(tileVariantIndex(5, 9, 'forest'));
    expect(tileVariantIndex(12, 20, 'water')).toBe(tileVariantIndex(12, 20, 'water'));
  });

  it('stays within [0, TILE_VARIANTS)', () => {
    for (let x = 0; x < 48; x += 7) {
      for (let y = 0; y < 32; y += 5) {
        const v = tileVariantIndex(x, y, 'rock');
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(TILE_VARIANTS);
      }
    }
  });

  it('the same tile coordinate but different tile types can diverge', () => {
    const variants = new Set(
      (['grass', 'forest', 'rock', 'water', 'den'] as const).map((t) => tileVariantIndex(4, 4, t)),
    );
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe('drawDeadwoodVariant determinism', () => {
  it('identical seed -> identical pixels', () => {
    const a = new FakeCtx2D(TILE_PX, TILE_PX);
    const b = new FakeCtx2D(TILE_PX, TILE_PX);
    drawDeadwoodVariant(a, 1, 0, 0);
    drawDeadwoodVariant(b, 1, 0, 0);
    expect(Array.from(a.getImageData(0, 0, TILE_PX, TILE_PX).data)).toEqual(
      Array.from(b.getImageData(0, 0, TILE_PX, TILE_PX).data),
    );
  });

  it('deadwoodVariantIndex stays within range', () => {
    for (let i = 0; i < 20; i++) {
      const v = deadwoodVariantIndex(i, i * 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(DEADWOOD_VARIANTS);
    }
  });
});

describe('drawWolfPosture determinism + distinctness', () => {
  it('same posture renders identical pixels every time', () => {
    const a = new FakeCtx2D(WOLF_SPRITE_W, WOLF_SPRITE_H);
    const b = new FakeCtx2D(WOLF_SPRITE_W, WOLF_SPRITE_H);
    drawWolfPosture(a, 'STALK', 0, 0);
    drawWolfPosture(b, 'STALK', 0, 0);
    expect(Array.from(a.getImageData(0, 0, WOLF_SPRITE_W, WOLF_SPRITE_H).data)).toEqual(
      Array.from(b.getImageData(0, 0, WOLF_SPRITE_W, WOLF_SPRITE_H).data),
    );
  });

  it('every FSM posture renders a visibly distinct silhouette', () => {
    const renders = WOLF_POSTURES.map((state) => {
      const ctx = new FakeCtx2D(WOLF_SPRITE_W, WOLF_SPRITE_H);
      drawWolfPosture(ctx, state, 0, 0);
      return Array.from(ctx.getImageData(0, 0, WOLF_SPRITE_W, WOLF_SPRITE_H).data);
    });
    for (let i = 0; i < renders.length; i++) {
      for (let j = i + 1; j < renders.length; j++) {
        expect(renders[i]).not.toEqual(renders[j]);
      }
    }
  });
});
