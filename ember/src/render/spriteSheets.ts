/**
 * EMBER — procedural sprite sheets (src/render/spriteSheets.ts).
 *
 * No image assets: every tile/prop/wolf sprite is drawn with primitive
 * fillRect calls, seeded by deterministic integer hashes (src/render/hash.ts)
 * — never Math.random(). Per PLAN.md/contracts.ts: sheets are built ONCE
 * (see buildSpriteSheets()'s module-level cache in GameCanvas.tsx) into
 * offscreen canvases; per-tile *variant selection* at draw time hashes
 * (x, y, tileType) so the same map position always renders the same variant.
 *
 * Each `draw*Variant`/`draw*Posture` function below is a small pure function
 * over a Ctx2D + local pixel offset — this is what spriteSheets.test.ts
 * exercises directly (via a fake Ctx2D) to check determinism without
 * depending on a real browser canvas backend (see ctx2d.ts's header).
 */

import type { TileType, WolfState } from '../core/types';
import type { Ctx2D } from './ctx2d';
import { hash2, hashInt } from './hash';
import { PALETTE, TILE_PX } from './palette';

// ---------------------------------------------------------------- tile hash

const TILE_TYPE_CODE: Record<TileType, number> = {
  grass: 1,
  forest: 2,
  rock: 3,
  water: 4,
  den: 5,
};

export const TILE_VARIANTS = 4;

/** Deterministic variant index for a world tile position + type. Callers
 *  drawing the map use this to pick which pre-built sheet frame to stamp. */
export function tileVariantIndex(x: number, y: number, tileType: TileType): number {
  return hashInt(TILE_VARIANTS, x, y, TILE_TYPE_CODE[tileType] * 97);
}

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length];
}

// -------------------------------------------------------------- tile draws

function drawGrassBase(ctx: Ctx2D, ox: number, oy: number, seed: number): void {
  const base = pick(PALETTE.tiles.grass, hash2(seed, 1));
  ctx.fillStyle = base;
  ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
  // sparse blade/dither speckle
  for (let i = 0; i < 6; i++) {
    const h = hash2(seed, 100 + i);
    const px = h % TILE_PX;
    const py = (h >>> 8) % TILE_PX;
    ctx.fillStyle = pick(PALETTE.tiles.grass, hash2(seed, 200 + i));
    ctx.fillRect(ox + px, oy + py, 1, 1);
  }
  if (hash2(seed, 999) % 5 === 0) {
    const h = hash2(seed, 998);
    ctx.fillStyle = pick(PALETTE.tiles.grassFlower, h);
    ctx.fillRect(ox + (h % (TILE_PX - 2)) + 1, oy + ((h >>> 6) % (TILE_PX - 2)) + 1, 1, 1);
  }
}

function drawForest(ctx: Ctx2D, ox: number, oy: number, seed: number): void {
  drawGrassBase(ctx, ox, oy, seed);
  ctx.fillStyle = PALETTE.tiles.forestFloor;
  ctx.fillRect(ox + 1, oy + 11, TILE_PX - 2, 5);
  ctx.fillStyle = PALETTE.tiles.forestTrunk;
  ctx.fillRect(ox + 7, oy + 11, 2, 4);
  const canopy = pick(PALETTE.tiles.forestCanopy, hash2(seed, 3));
  // three stacked triangular canopy bands, widest at bottom
  ctx.fillStyle = canopy;
  ctx.fillRect(ox + 6, oy + 8, 4, 3);
  ctx.fillRect(ox + 4, oy + 4, 8, 4);
  ctx.fillRect(ox + 5, oy + 1, 6, 3);
  ctx.fillRect(ox + 6, oy, 4, 1);
}

function drawRock(ctx: Ctx2D, ox: number, oy: number, seed: number): void {
  ctx.fillStyle = pick(PALETTE.tiles.rockBase, hash2(seed, 4));
  ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
  ctx.fillStyle = PALETTE.tiles.rockShadow;
  ctx.fillRect(ox + 2, oy + 11, 11, 3);
  ctx.fillStyle = PALETTE.tiles.rockHighlight;
  ctx.fillRect(ox + 3, oy + 3, 6, 5);
  ctx.fillRect(ox + 9, oy + 6, 4, 4);
}

function drawWater(ctx: Ctx2D, ox: number, oy: number, seed: number): void {
  ctx.fillStyle = pick(PALETTE.tiles.waterBase, hash2(seed, 5));
  ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
  ctx.fillStyle = PALETTE.tiles.waterRipple;
  for (let i = 0; i < 3; i++) {
    const h = hash2(seed, 300 + i);
    const ry = 2 + ((h >>> 4) % (TILE_PX - 4));
    const rx = h % 5;
    ctx.fillRect(ox + rx, oy + ry, 6, 1);
  }
}

function drawDen(ctx: Ctx2D, ox: number, oy: number, seed: number): void {
  ctx.fillStyle = PALETTE.tiles.denRockDark;
  ctx.fillRect(ox, oy, TILE_PX, TILE_PX);
  ctx.fillStyle = PALETTE.tiles.denRock;
  for (let i = 0; i < 5; i++) {
    const h = hash2(seed, 400 + i);
    ctx.fillRect(ox + (h % 12), oy + ((h >>> 4) % 12), 3, 3);
  }
  ctx.fillStyle = PALETTE.tiles.denMouth;
  ctx.fillRect(ox + 5, oy + 5, 6, 8);
  ctx.fillRect(ox + 6, oy + 4, 4, 1);
}

/** Draws ONE tile variant into `ctx` at local pixel offset (ox, oy). Pure
 *  function of (tileType, variantSeed) — same inputs always produce the same
 *  pixels (spriteSheets.test.ts checks this directly). */
export function drawTileVariant(
  ctx: Ctx2D,
  tileType: TileType,
  variantSeed: number,
  ox: number,
  oy: number,
): void {
  switch (tileType) {
    case 'grass':
      return drawGrassBase(ctx, ox, oy, variantSeed);
    case 'forest':
      return drawForest(ctx, ox, oy, variantSeed);
    case 'rock':
      return drawRock(ctx, ox, oy, variantSeed);
    case 'water':
      return drawWater(ctx, ox, oy, variantSeed);
    case 'den':
      return drawDen(ctx, ox, oy, variantSeed);
  }
}

// ------------------------------------------------------------- deadwood

export const DEADWOOD_VARIANTS = 3;

export function deadwoodVariantIndex(x: number, y: number): number {
  return hashInt(DEADWOOD_VARIANTS, x, y, 701);
}

/** Fallen log, drawn diagonally-ish across the lower half of the tile. */
export function drawDeadwoodVariant(ctx: Ctx2D, variantSeed: number, ox: number, oy: number): void {
  const flip = variantSeed % 2 === 0;
  ctx.fillStyle = PALETTE.deadwood.logShadow;
  ctx.fillRect(ox + 2, oy + 10, 12, 3);
  ctx.fillStyle = PALETTE.deadwood.log;
  ctx.fillRect(ox + 2, oy + 8, 12, 3);
  ctx.fillStyle = PALETTE.deadwood.logHighlight;
  ctx.fillRect(ox + (flip ? 3 : 12), oy + 8, 2, 3);
}

// ------------------------------------------------------------- sunpatch

export const SUNPATCH_FRAMES = 3;

/** Shimmering patch of light on open ground — frame index is a real-time
 *  animation phase (render-only), never fed back into sim state. */
export function drawSunpatchFrame(ctx: Ctx2D, frame: number, ox: number, oy: number): void {
  ctx.globalAlpha = 0.55 + 0.15 * Math.sin((frame / SUNPATCH_FRAMES) * Math.PI * 2);
  ctx.fillStyle = PALETTE.sunpatch.core;
  ctx.fillRect(ox + 3, oy + 5, 10, 7);
  ctx.fillRect(ox + 5, oy + 3, 6, 2);
  ctx.globalAlpha = 1;
}

// ----------------------------------------------------------------- wolf

export const WOLF_POSTURES: WolfState[] = ['PATROL', 'STALK', 'ATTACK', 'FLEE'];
export const WOLF_SPRITE_W = 20;
export const WOLF_SPRITE_H = 16;

/** Distinct silhouette per FSM state: upright PATROL, lowered STALK with
 *  pale eyes, lunging ATTACK, turned-away FLEE. Drawn once per posture into
 *  the wolf sheet (a fixed seed, not per-tile-position — the wolf is a
 *  single entity). */
export function drawWolfPosture(ctx: Ctx2D, state: WolfState, ox: number, oy: number): void {
  const furSeed = hash2(TILE_TYPE_CODE.rock, 1234);
  ctx.fillStyle = PALETTE.wolf.fur;

  if (state === 'PATROL') {
    // upright body + head + tail, ears alert
    ctx.fillRect(ox + 4, oy + 6, 10, 5); // body
    ctx.fillRect(ox + 12, oy + 3, 5, 5); // head
    ctx.fillRect(ox + 15, oy + 1, 2, 2); // ear
    ctx.fillRect(ox + 2, oy + 5, 3, 2); // tail up
    ctx.fillRect(ox + 5, oy + 11, 2, 3); // front leg
    ctx.fillRect(ox + 11, oy + 11, 2, 3); // back leg
    ctx.fillStyle = PALETTE.wolf.eye;
    ctx.fillRect(ox + 15, oy + 4, 1, 1);
  } else if (state === 'STALK') {
    // lowered body, head forward and low, pale eyes prominent
    ctx.fillRect(ox + 3, oy + 9, 12, 4); // low body
    ctx.fillRect(ox + 13, oy + 8, 5, 4); // low head
    ctx.fillRect(ox + 1, oy + 10, 3, 2); // tail low
    ctx.fillRect(ox + 5, oy + 13, 2, 2);
    ctx.fillRect(ox + 12, oy + 13, 2, 2);
    ctx.fillStyle = PALETTE.wolf.eye;
    ctx.fillRect(ox + 16, oy + 9, 1, 1);
    ctx.fillRect(ox + 14, oy + 9, 1, 1);
  } else if (state === 'ATTACK') {
    // lunging: stretched low, forelegs extended, eyes flare
    ctx.fillRect(ox + 1, oy + 8, 14, 4);
    ctx.fillRect(ox + 14, oy + 6, 5, 5);
    ctx.fillRect(ox, oy + 11, 3, 2);
    ctx.fillRect(ox + 9, oy + 12, 3, 3);
    ctx.fillStyle = PALETTE.wolf.eyeAttack;
    ctx.fillRect(ox + 17, oy + 7, 1, 1);
    ctx.fillRect(ox + 15, oy + 7, 1, 1);
  } else {
    // FLEE: turned away, haunches low, tail tucked, no visible eyes
    ctx.fillRect(ox + 5, oy + 7, 10, 5);
    ctx.fillRect(ox + 3, oy + 4, 4, 5); // head turned away (smaller, dark)
    ctx.fillRect(ox + 14, oy + 9, 3, 2); // tucked tail
    ctx.fillRect(ox + 7, oy + 12, 2, 3);
    ctx.fillRect(ox + 12, oy + 12, 2, 3);
  }

  // subtle fur-texture speckle, seeded per-posture (fixed, not per-frame)
  ctx.fillStyle = PALETTE.wolf.furLit;
  for (let i = 0; i < 3; i++) {
    const h = hash2(furSeed, i + state.length);
    ctx.fillRect(ox + 3 + (h % 12), oy + 6 + ((h >>> 5) % 6), 1, 1);
  }
}

// ------------------------------------------------------------ sheet build

export interface SpriteSheets {
  tiles: Record<TileType, HTMLCanvasElement>;
  deadwood: HTMLCanvasElement;
  sunpatch: HTMLCanvasElement;
  wolf: HTMLCanvasElement;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctxOf(c: HTMLCanvasElement): Ctx2D | null {
  return c.getContext('2d') as unknown as Ctx2D | null;
}

const TILE_TYPES: TileType[] = ['grass', 'forest', 'rock', 'water', 'den'];

/** Builds every sprite sheet ONCE. Safe to call in environments without a
 *  real canvas 2D backend (getContext('2d') returning null, e.g. jsdom in
 *  component tests): drawing is skipped but the (blank) canvases are still
 *  returned so callers never see undefined. */
export function buildSpriteSheets(): SpriteSheets {
  const tiles = {} as Record<TileType, HTMLCanvasElement>;
  for (const t of TILE_TYPES) {
    const sheet = makeCanvas(TILE_PX * TILE_VARIANTS, TILE_PX);
    const ctx = ctxOf(sheet);
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      for (let v = 0; v < TILE_VARIANTS; v++) {
        drawTileVariant(ctx, t, hash2(v, TILE_TYPE_CODE[t], 11), v * TILE_PX, 0);
      }
    }
    tiles[t] = sheet;
  }

  const deadwood = makeCanvas(TILE_PX * DEADWOOD_VARIANTS, TILE_PX);
  const dwCtx = ctxOf(deadwood);
  if (dwCtx) {
    dwCtx.imageSmoothingEnabled = false;
    for (let v = 0; v < DEADWOOD_VARIANTS; v++) drawDeadwoodVariant(dwCtx, v, v * TILE_PX, 0);
  }

  const sunpatch = makeCanvas(TILE_PX * SUNPATCH_FRAMES, TILE_PX);
  const spCtx = ctxOf(sunpatch);
  if (spCtx) {
    spCtx.imageSmoothingEnabled = false;
    for (let f = 0; f < SUNPATCH_FRAMES; f++) drawSunpatchFrame(spCtx, f, f * TILE_PX, 0);
  }

  const wolf = makeCanvas(WOLF_SPRITE_W * WOLF_POSTURES.length, WOLF_SPRITE_H);
  const wolfCtx = ctxOf(wolf);
  if (wolfCtx) {
    wolfCtx.imageSmoothingEnabled = false;
    WOLF_POSTURES.forEach((state, i) => drawWolfPosture(wolfCtx, state, i * WOLF_SPRITE_W, 0));
  }

  return { tiles, deadwood, sunpatch, wolf };
}
