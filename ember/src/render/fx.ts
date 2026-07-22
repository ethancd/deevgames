/**
 * EMBER — day/night, glow, weather, speech bubble, path-line fx
 * (src/render/fx.ts).
 *
 * All functions here are pure over their explicit arguments (tick, a
 * fuel-derived radius, screen coordinates) — no Date.now()/Math.random().
 * Rain streak and path-dot animation are seeded by `tick` (not wall time) so
 * a replay watched at 1x renders identically every time, per PLAN guidance.
 */

import { DAY_TICKS } from '../core/types';
import type { Ctx2D } from './ctx2d';
import { hash2 } from './hash';
import { PALETTE } from './palette';

// -------------------------------------------------------------- day/night

/** 0 = full day, 1 = full night, smoothly interpolated over a ~40-tick
 *  window straddling each day/night boundary (mirrors sim's isDay() but
 *  produces a continuous factor for the visual crossfade rather than a
 *  boolean — see contracts.ts's "smooth dusk/dawn interpolation" note). */
export function nightFactor(tick: number): number {
  const phase = ((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
  const half = DAY_TICKS / 2;
  const window = 40;
  const smoothstep = (t: number) => t * t * (3 - 2 * t);

  // Dusk boundary (day -> night) at `half`: rises 0 -> 1 across
  // [half - window/2, half + window/2].
  const duskT = (phase - (half - window / 2)) / window;
  if (duskT >= 0 && duskT <= 1) return smoothstep(duskT);

  // Dawn boundary (night -> day) at 0 (mod DAY_TICKS): falls 1 -> 0 across
  // that same window straddling the wrap point. Represent phase as a
  // signed offset from 0 (negative just before the wrap, positive just
  // after) so the window is handled symmetrically across the modulo.
  const offsetFromDawn = phase > half ? phase - DAY_TICKS : phase;
  const dawnT = (offsetFromDawn + window / 2) / window;
  if (dawnT >= 0 && dawnT <= 1) return 1 - smoothstep(dawnT);

  return phase < half ? 0 : 1;
}

export function drawEnvironmentTint(ctx: Ctx2D, w: number, h: number, factor: number): void {
  if (factor > 0.002) {
    ctx.globalAlpha = factor;
    ctx.fillStyle = PALETTE.night.overlay;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (factor < 0.998) {
    ctx.globalAlpha = 1 - factor;
    ctx.fillStyle = PALETTE.day.tint;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------- glow

/** Warm additive-feeling light pool, drawn on top of the night overlay so
 *  the area around the ember reads as lit even though the tiles underneath
 *  were already darkened. `radiusPx` should already include glowRadius(fuel)
 *  scaled by the current camera zoom. */
export function drawGlow(ctx: Ctx2D, screenX: number, screenY: number, radiusPx: number): void {
  if (radiusPx <= 0.5) return;
  const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radiusPx);
  grad.addColorStop(0, PALETTE.glow.inner);
  grad.addColorStop(0.45, PALETTE.glow.mid);
  grad.addColorStop(1, PALETTE.glow.outer);
  ctx.fillStyle = grad;
  ctx.fillRect(screenX - radiusPx, screenY - radiusPx, radiusPx * 2, radiusPx * 2);
}

// ------------------------------------------------------------------- rain

export function drawRain(ctx: Ctx2D, w: number, h: number, tick: number): void {
  const streaks = Math.max(16, Math.min(60, Math.floor((w * h) / 9000)));
  ctx.fillStyle = PALETTE.rain.streak;
  for (let i = 0; i < streaks; i++) {
    const seed = hash2(i, 909);
    const x = seed % Math.max(1, w);
    const fall = (tick * 5 + ((seed >>> 8) % (h + 40))) % (h + 40) - 20;
    ctx.fillRect(x, fall, 1, 7);
  }
}

// --------------------------------------------------------------- path line

export interface ScreenPoint {
  x: number;
  y: number;
}

/** Dotted amber dots along a display path, animated by `tick` (deterministic,
 *  not wall-clock) so it replays identically at 1x. */
export function drawPathDots(
  ctx: Ctx2D,
  points: readonly ScreenPoint[],
  tick: number,
  scale = 1,
): void {
  const phase = Math.floor(tick / 4) % 2;
  // Dot footprint scales with camera zoom so the route stays legible at
  // both the full-grid fit scale and the tight DEFEND follow-zoom.
  const w = Math.max(3, Math.round(scale * 5));
  const h = Math.max(2, Math.round(scale * 3));
  const hx = Math.floor(w / 2);
  const hy = Math.floor(h / 2);
  points.forEach((p, i) => {
    if ((i + phase) % 2 === 0) return;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    ctx.fillStyle = PALETTE.path.dotShadow;
    ctx.fillRect(x - hx, y - hy + 1, w, h);
    ctx.fillStyle = PALETTE.path.dot;
    ctx.fillRect(x - hx, y - hy, w, h);
  });
}

// ---------------------------------------------------------------- speech

/** Word-wraps to ~24 chars/line (never breaks a word mid-way). */
export function wrapSpeech(text: string, maxChars = 24): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Pixel-corner cream speech bubble with a small tail, anchored above
 *  (anchorX, anchorY) — typically the ember's screen position. */
export function drawSpeechBubble(ctx: Ctx2D, text: string, anchorX: number, anchorY: number): void {
  const lines = wrapSpeech(text);
  if (lines.length === 0) return;

  const lineHeight = 11;
  const padX = 7;
  const padY = 6;
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const widest = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  const w = Math.ceil(widest) + padX * 2;
  const h = lines.length * lineHeight + padY * 2;
  const x = Math.round(anchorX - w / 2);
  const y = Math.round(anchorY - h - 16);

  ctx.fillStyle = PALETTE.bubble.border;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = PALETTE.bubble.bg;
  ctx.fillRect(x, y, w, h);
  // pixel-corner notches
  ctx.fillStyle = PALETTE.bubble.border;
  ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.fillRect(x + w - 1, y - 1, 2, 2);
  ctx.fillRect(x - 1, y + h - 1, 2, 2);
  ctx.fillRect(x + w - 1, y + h - 1, 2, 2);
  // tail pointing down toward the anchor
  ctx.fillStyle = PALETTE.bubble.border;
  ctx.fillRect(Math.round(anchorX) - 3, y + h - 1, 6, 3);
  ctx.fillStyle = PALETTE.bubble.bg;
  ctx.fillRect(Math.round(anchorX) - 2, y + h - 1, 4, 2);

  ctx.fillStyle = PALETTE.bubble.text;
  lines.forEach((line, i) => {
    ctx.fillText(line, Math.round(anchorX), y + padY + i * lineHeight);
  });
}
