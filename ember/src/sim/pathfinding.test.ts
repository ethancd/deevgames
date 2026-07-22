import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { WorldState } from '../core/types';
import { generateWorld } from './worldgen';
import { findPath } from './pathfinding';
import { isPassable } from './grid';

function emptyWorld(w = 10, h = 8): WorldState {
  return {
    seed: 0,
    tick: 0,
    width: w,
    height: h,
    tiles: new Array(w * h).fill('grass'),
    denPos: { x: 0, y: 0 },
    deadwood: [],
    sunpatches: [],
    wolf: { pos: { x: w - 1, y: h - 1 }, state: 'PATROL', stateTicks: 0 },
    weather: 'clear',
    ember: { pos: { x: 0, y: 0 } },
  };
}

describe('findPath', () => {
  it('returns [] when from equals to', () => {
    const w = emptyWorld();
    expect(findPath(w, { x: 2, y: 2 }, { x: 2, y: 2 }, false)).toEqual([]);
  });

  it('finds a direct diagonal path on an open grid', () => {
    const w = emptyWorld();
    const path = findPath(w, { x: 0, y: 0 }, { x: 3, y: 3 }, false);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 3, y: 3 });
    // Every step must be passable and adjacent (Chebyshev distance 1) to the previous.
    let prev = { x: 0, y: 0 };
    for (const step of path) {
      expect(Math.max(Math.abs(step.x - prev.x), Math.abs(step.y - prev.y))).toBe(1);
      expect(isPassable(w, step)).toBe(true);
      prev = step;
    }
  });

  it('returns [] when the destination is impassable', () => {
    const w = emptyWorld();
    w.tiles[1 * w.width + 1] = 'rock';
    expect(findPath(w, { x: 0, y: 0 }, { x: 1, y: 1 }, false)).toEqual([]);
  });

  it('returns [] when the destination is unreachable (walled off)', () => {
    const w = emptyWorld(6, 6);
    // Wall off column x=3 entirely so the grid splits into two halves.
    for (let y = 0; y < w.height; y++) w.tiles[y * w.width + 3] = 'rock';
    const path = findPath(w, { x: 0, y: 0 }, { x: 5, y: 5 }, false);
    expect(path).toEqual([]);
  });

  it('routes around an obstacle rather than failing', () => {
    const w = emptyWorld(8, 8);
    // Wall with a gap at y=7 (bottom row still open).
    for (let y = 0; y < 6; y++) w.tiles[y * w.width + 4] = 'rock';
    const path = findPath(w, { x: 0, y: 0 }, { x: 7, y: 0 }, false);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 7, y: 0 });
  });

  it('does not cut diagonally through a blocked corner', () => {
    const w = emptyWorld(5, 5);
    // Block both orthogonal flanks of the diagonal from (1,1) to (2,2).
    w.tiles[1 * w.width + 2] = 'rock'; // (2,1)
    w.tiles[2 * w.width + 1] = 'rock'; // (1,2)
    const path = findPath(w, { x: 1, y: 1 }, { x: 2, y: 2 }, false);
    // Must detour, not step directly diagonal through the corner.
    expect(path).not.toEqual([{ x: 2, y: 2 }]);
    expect(path.length).toBeGreaterThan(1);
  });

  it('is deterministic: repeated calls with identical inputs produce identical output', () => {
    const rng = createRng(21);
    const world = generateWorld(21, rng);
    const p1 = findPath(world, world.ember.pos, world.denPos, false);
    const p2 = findPath(world, world.ember.pos, world.denPos, false);
    expect(p1).toEqual(p2);
  });

  it('cautious mode avoids tiles near the wolf when a similar-cost detour exists', () => {
    const w = emptyWorld(9, 3);
    w.wolf.pos = { x: 4, y: 1 };
    const direct = findPath(w, { x: 0, y: 1 }, { x: 8, y: 1 }, false);
    const cautious = findPath(w, { x: 0, y: 1 }, { x: 8, y: 1 }, true);
    expect(direct.length).toBeGreaterThan(0);
    expect(cautious.length).toBeGreaterThan(0);
    // Cautious path should keep more distance from the wolf's tile on average.
    const minDist = (path: { x: number; y: number }[]) =>
      Math.min(...path.map((p) => Math.max(Math.abs(p.x - w.wolf.pos.x), Math.abs(p.y - w.wolf.pos.y))));
    expect(minDist(cautious)).toBeGreaterThanOrEqual(minDist(direct));
  });

  it('does not mutate the world', () => {
    const rng = createRng(3);
    const world = generateWorld(3, rng);
    const before = JSON.stringify(world);
    findPath(world, world.ember.pos, world.denPos, true);
    const after = JSON.stringify(world);
    expect(after).toBe(before);
  });
});
