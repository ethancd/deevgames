/**
 * EMBER — the ember-spirit sprite (src/render/ember.ts).
 *
 * Drawn procedurally every frame rather than pre-baked into a sprite sheet:
 * its color continuously tracks live `body.fuel` (brightness/saturation
 * scale with fuel), so there is no fixed set of frames to cache — only the
 * flicker *animation phase* is cached-free real-time state (UI-layer pacing,
 * explicitly allowed by contracts.ts's header; it never feeds back into
 * sim/body state). Spark particles ARE seeded from (tick, frame hash) per
 * PLAN guidance, so a replay watched at 1x shows the same drift each time
 * even though the phase itself is real-time.
 */

import { hash2 } from './hash';
import { PALETTE, TILE_PX } from './palette';
import type { Ctx2D } from './ctx2d';

export const EMBER_FLICKER_FRAMES = 4;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[c(r), c(g), c(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const clampedT = Math.max(0, Math.min(1, t));
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    ar + (br - ar) * clampedT,
    ag + (bg - ag) * clampedT,
    ab + (bb - ab) * clampedT,
  );
}

/** Real-time flicker frame index — pure UI pacing, never read by sim/body. */
export function flickerFrameFromTime(nowMs: number): number {
  return Math.floor(nowMs / 130) % EMBER_FLICKER_FRAMES;
}

/** Core/edge colors, brightness + saturation scaled by fuel (0 = ashen dim,
 *  1 = bright hot core), with a small per-frame flicker jitter. */
export function emberColors(fuel: number, frame: number): { core: string; body: string } {
  const f = Math.max(0, Math.min(1, fuel));
  const jitter = (hash2(frame, 71) % 100) / 100 - 0.5; // [-0.5, 0.5)
  const flicker = Math.max(0, Math.min(1, f + jitter * 0.06));
  return {
    body: lerpColor(PALETTE.ember.dim, PALETTE.ember.warm, flicker),
    core: lerpColor(PALETTE.ember.warm, lerpColor(PALETTE.ember.hot, PALETTE.ember.core, flicker), flicker),
  };
}

/** Teardrop flame silhouette, blocky pixel-art style, centered on
 *  (screenX, screenY) which is the ember's tile center. */
export function drawEmber(
  ctx: Ctx2D,
  screenX: number,
  screenY: number,
  fuel: number,
  frame: number,
): void {
  const { core, body } = emberColors(fuel, frame);
  const bob = frame % 2 === 0 ? 0 : -1; // gentle 1px bob
  const x = screenX - TILE_PX / 2;
  const y = screenY - TILE_PX / 2 + bob;

  ctx.fillStyle = body;
  ctx.fillRect(x + 6, y + 3, 4, 3); // tip
  ctx.fillRect(x + 5, y + 6, 6, 4); // widening
  ctx.fillRect(x + 4, y + 10, 8, 3); // base, widest
  ctx.fillRect(x + 5, y + 13, 6, 1);

  ctx.fillStyle = core;
  ctx.fillRect(x + 6, y + 7, 4, 5);
  ctx.fillRect(x + 7, y + 5, 2, 3);
}

/** Deterministic drifting spark positions for this (tick, frame). Same
 *  inputs -> same output, so replayed runs at 1x look identical. Count
 *  scales gently with fuel (a healthy ember throws more sparks). */
export function sparkPositions(
  tick: number,
  frame: number,
  fuel: number,
  screenX: number,
  screenY: number,
): { x: number; y: number; alpha: number }[] {
  const count = Math.round(2 + Math.max(0, Math.min(1, fuel)) * 3);
  const out: { x: number; y: number; alpha: number }[] = [];
  for (let i = 0; i < count; i++) {
    const seed = hash2(tick, i * 131 + frame * 7);
    const life = ((tick + i * 17) % 24) / 24; // 0..1 rise-and-fade cycle
    const driftX = ((seed % 9) - 4) * 0.6;
    const driftY = -life * 10;
    out.push({
      x: screenX + driftX,
      y: screenY - 2 + driftY,
      alpha: Math.max(0, 1 - life),
    });
  }
  return out;
}

export function drawSparks(
  ctx: Ctx2D,
  tick: number,
  frame: number,
  fuel: number,
  screenX: number,
  screenY: number,
): void {
  const sparks = sparkPositions(tick, frame, fuel, screenX, screenY);
  for (const s of sparks) {
    ctx.globalAlpha = s.alpha * 0.9;
    ctx.fillStyle = PALETTE.ember.spark;
    ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
  }
  ctx.globalAlpha = 1;
}
