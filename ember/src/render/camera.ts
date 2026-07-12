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
  // Always clamp the follow camera to the world's bounds — including under
  // a caller-forced minScale (DEFEND's tighter zoom). An earlier version
  // deliberately left the forced path unclamped, reasoning that clamping
  // would "pin the ember flush against the canvas edge, clipping its glow"
  // near a map boundary. That reasoning was wrong in practice: skipping the
  // clamp doesn't recenter anything, it just lets camTileX/camTileY run past
  // the world's edge into tiles that were never generated — the renderer
  // then has nothing to draw there but a flat fallback fill, producing a
  // large uniform void band (confirmed in the night-defend capture, where
  // DEFEND's forced 3x zoom near the world's top edge left ~40% of the
  // canvas a flat, textureless #05070f fill). Clamping instead leaves the
  // ember off-center near the edge of the viewport — fully visible, glow
  // included — with real terrain drawn edge-to-edge, exactly like every
  // other edge-of-map camera position already handles correctly (see
  // 'never produces a follow-mode origin that reveals past the grid edge'
  // in camera.test.ts, which this forced path now satisfies too). Bare
  // Math.max(0, Math.min(...)) below degrades gracefully even when the
  // viewport is wider/taller than the whole world (GRID_W - viewWtiles < 0):
  // it pins to 0, matching the pre-existing unforced fallback behavior.
  const camTileX = Math.max(0, Math.min(GRID_W - viewWtiles, rawCamTileX));
  const camTileY = Math.max(0, Math.min(GRID_H - viewHtiles, rawCamTileY));
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
