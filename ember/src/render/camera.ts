/**
 * EMBER — camera / world-to-screen mapping (src/render/camera.ts).
 *
 * "Fit the full 48x32 grid when it fits; otherwise follow the ember"
 * (contracts.ts). Scale is always an integer (strict pixel-art requirement:
 * no fractional-pixel tile scaling).
 */

import { GRID_H, GRID_W, type Vec } from '../core/types';
import { TILE_PX } from './palette';

export const WORLD_PX_W = GRID_W * TILE_PX;
export const WORLD_PX_H = GRID_H * TILE_PX;

export interface Camera {
  scale: number;
  originXPx: number;
  originYPx: number;
}

export interface CameraOpts {
  /** When set and greater than the natural "fit the whole grid" scale, force
   *  a follow-the-ember camera at (at least) this integer scale instead of
   *  fitting the full grid — used to keep a small DEFEND-mode glow radius
   *  legible instead of shrinking it into a tiny dot on an overview map. */
  minScale?: number;
}

export function computeCamera(canvasPxW: number, canvasPxH: number, followPos: Vec, opts?: CameraOpts): Camera {
  const fitScale = Math.floor(Math.min(canvasPxW / WORLD_PX_W, canvasPxH / WORLD_PX_H));
  // A caller explicitly asking for a minScale (the DEFEND-mode forced zoom)
  // wants the ember centered even right at a map edge — clamping the camera
  // to never reveal past the grid would instead pin the ember flush against
  // the canvas edge there, clipping its glow. The unforced small-canvas
  // fallback path (opts omitted) keeps the original clamped behavior.
  const forced = opts?.minScale !== undefined;
  const minScale = Math.max(1, Math.floor(opts?.minScale ?? 1));
  if (fitScale >= 1 && fitScale >= minScale) {
    return {
      scale: fitScale,
      originXPx: Math.floor((canvasPxW - WORLD_PX_W * fitScale) / 2),
      originYPx: Math.floor((canvasPxH - WORLD_PX_H * fitScale) / 2),
    };
  }
  const scale = Math.max(1, minScale);
  const viewWtiles = Math.max(1, Math.floor(canvasPxW / (TILE_PX * scale)));
  const viewHtiles = Math.max(1, Math.floor(canvasPxH / (TILE_PX * scale)));
  const rawCamTileX = followPos.x - Math.floor(viewWtiles / 2);
  const rawCamTileY = followPos.y - Math.floor(viewHtiles / 2);
  const camTileX = forced ? rawCamTileX : Math.max(0, Math.min(GRID_W - viewWtiles, rawCamTileX));
  const camTileY = forced ? rawCamTileY : Math.max(0, Math.min(GRID_H - viewHtiles, rawCamTileY));
  // (`|| 0` normalizes -0 -> 0 for camTileX/Y === 0, which JS's unary
  // negation would otherwise produce and which some equality assertions —
  // Object.is-based ones — treat as distinct from 0.)
  return {
    scale,
    originXPx: -camTileX * TILE_PX * scale || 0,
    originYPx: -camTileY * TILE_PX * scale || 0,
  };
}

/** Maps a fractional world tile coordinate to a screen pixel coordinate
 *  (pass e.g. `pos.x + 0.5` for a tile's center). */
export function worldToScreen(camera: Camera, tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: camera.originXPx + tileX * TILE_PX * camera.scale,
    y: camera.originYPx + tileY * TILE_PX * camera.scale,
  };
}
