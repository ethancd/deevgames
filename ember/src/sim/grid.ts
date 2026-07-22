/**
 * EMBER — grid helpers shared across the sim module (src/sim/grid.ts).
 *
 * Pure, side-effect-free helpers for working with the row-major tile grid
 * and Vec arithmetic. No randomness, no mutation of shared state.
 */

import { DAY_TICKS, type TileType, type Vec, type WorldState } from '../core/types';

export function inBounds(pos: Vec, width: number, height: number): boolean {
  return pos.x >= 0 && pos.x < width && pos.y >= 0 && pos.y < height;
}

export function idx(pos: Vec, width: number): number {
  return pos.y * width + pos.x;
}

export function tileAt(world: WorldState, pos: Vec): TileType | undefined {
  if (!inBounds(pos, world.width, world.height)) return undefined;
  return world.tiles[idx(pos, world.width)];
}

export function setTile(world: WorldState, pos: Vec, t: TileType): void {
  if (!inBounds(pos, world.width, world.height)) return;
  world.tiles[idx(pos, world.width)] = t;
}

/** Chebyshev (king-move) distance — the metric used throughout EMBER for
 *  glow radius, scent range, and observation radius. */
export function chebyshev(a: Vec, b: Vec): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function vecEq(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Fixed deterministic 8-direction iteration order: N, NE, E, SE, S, SW, W, NW.
 *  Order matters for deterministic tie-breaking in movement and pathfinding. */
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

export const DIRS4: Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** rock/water block movement; everything else (grass/forest/den) is walkable. */
export function isPassable(world: WorldState, pos: Vec): boolean {
  const t = tileAt(world, pos);
  if (t === undefined) return false;
  return t !== 'rock' && t !== 'water';
}

/** tick 0..DAY_TICKS/2 is day, the remaining half is night. Wraps for any
 *  tick value (including negative, though ticks never go negative in EMBER). */
export function isDay(tick: number): boolean {
  const t = ((tick % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
  return t < DAY_TICKS / 2;
}
