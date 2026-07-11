/**
 * EMBER — tiny local Vec helpers (src/skills/vecUtils.ts).
 *
 * Deliberately NOT imported from src/sim/: module ownership rules only
 * permit importing sim's public API (src/sim/index.ts: generateWorld,
 * stepWorld, isPassable, isDay, observe, findPath). Chebyshev distance and
 * 8-neighbor enumeration are trivial pure math, safely duplicated here
 * rather than reaching into sim's internal grid.ts.
 */

import type { Vec } from '../core/types';

export function chebyshev(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function vecEq(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Fixed deterministic 8-direction order: N, NE, E, SE, S, SW, W, NW. */
export const DIRS8: Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}
