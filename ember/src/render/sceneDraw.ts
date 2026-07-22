/**
 * EMBER — scene compositing (src/render/sceneDraw.ts).
 *
 * Blits the pre-built sprite sheets (src/render/spriteSheets.ts) for the
 * current WorldState onto the frame buffer, given a Camera
 * (src/render/camera.ts). No sheet is ever rebuilt here — this module only
 * reads them.
 */

import type { TileType, WorldState } from '../core/types';
import type { Camera } from './camera';
import type { Ctx2D } from './ctx2d';
import { TILE_PX } from './palette';
import {
  SUNPATCH_FRAMES,
  WOLF_POSTURES,
  WOLF_SPRITE_H,
  WOLF_SPRITE_W,
  deadwoodVariantIndex,
  tileVariantIndex,
  type SpriteSheets,
} from './spriteSheets';

function onScreen(sx: number, sy: number, w: number, h: number, canvasW: number, canvasH: number): boolean {
  return sx + w >= 0 && sx <= canvasW && sy + h >= 0 && sy <= canvasH;
}

export function drawTerrain(
  ctx: Ctx2D,
  world: WorldState,
  camera: Camera,
  sheets: SpriteSheets,
  canvasW: number,
  canvasH: number,
): void {
  const tilePx = TILE_PX * camera.scale;
  for (let y = 0; y < world.height; y++) {
    const sy = camera.originYPx + y * tilePx;
    if (sy + tilePx < 0 || sy > canvasH) continue;
    for (let x = 0; x < world.width; x++) {
      const sx = camera.originXPx + x * tilePx;
      if (sx + tilePx < 0 || sx > canvasW) continue;
      const tileType = world.tiles[y * world.width + x] as TileType;
      const variant = tileVariantIndex(x, y, tileType);
      ctx.drawImage(sheets.tiles[tileType], variant * TILE_PX, 0, TILE_PX, TILE_PX, sx, sy, tilePx, tilePx);
    }
  }
}

export function drawProps(
  ctx: Ctx2D,
  world: WorldState,
  camera: Camera,
  sheets: SpriteSheets,
  animFrame: number,
  canvasW: number,
  canvasH: number,
): void {
  const tilePx = TILE_PX * camera.scale;
  for (const dw of world.deadwood) {
    if (dw.fuel <= 0) continue;
    const sx = camera.originXPx + dw.pos.x * tilePx;
    const sy = camera.originYPx + dw.pos.y * tilePx;
    if (!onScreen(sx, sy, tilePx, tilePx, canvasW, canvasH)) continue;
    const variant = deadwoodVariantIndex(dw.pos.x, dw.pos.y);
    ctx.drawImage(sheets.deadwood, variant * TILE_PX, 0, TILE_PX, TILE_PX, sx, sy, tilePx, tilePx);
  }
  for (const sp of world.sunpatches) {
    if (!sp.active) continue;
    const sx = camera.originXPx + sp.pos.x * tilePx;
    const sy = camera.originYPx + sp.pos.y * tilePx;
    if (!onScreen(sx, sy, tilePx, tilePx, canvasW, canvasH)) continue;
    const f = ((animFrame % SUNPATCH_FRAMES) + SUNPATCH_FRAMES) % SUNPATCH_FRAMES;
    ctx.drawImage(sheets.sunpatch, f * TILE_PX, 0, TILE_PX, TILE_PX, sx, sy, tilePx, tilePx);
  }
}

export function drawWolf(
  ctx: Ctx2D,
  world: WorldState,
  camera: Camera,
  sheets: SpriteSheets,
  canvasW: number,
  canvasH: number,
): void {
  const scale = camera.scale;
  const anchorSx = camera.originXPx + world.wolf.pos.x * TILE_PX * scale;
  const anchorSy = camera.originYPx + world.wolf.pos.y * TILE_PX * scale;
  const sx = anchorSx - ((WOLF_SPRITE_W - TILE_PX) / 2) * scale;
  const sy = anchorSy - (WOLF_SPRITE_H - TILE_PX) * scale;
  const w = WOLF_SPRITE_W * scale;
  const h = WOLF_SPRITE_H * scale;
  if (!onScreen(sx, sy, w, h, canvasW, canvasH)) return;
  const postureIdx = Math.max(0, WOLF_POSTURES.indexOf(world.wolf.state));
  ctx.drawImage(sheets.wolf, postureIdx * WOLF_SPRITE_W, 0, WOLF_SPRITE_W, WOLF_SPRITE_H, sx, sy, w, h);
}
