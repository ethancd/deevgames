import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { GRID_H, GRID_W } from '../core/types';
import { generateWorld } from './worldgen';
import { isPassable } from './grid';
import { findPath } from './pathfinding';

function reachable(world: ReturnType<typeof generateWorld>, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  if (from.x === to.x && from.y === to.y) return true;
  return findPath(world, from, to, false).length > 0;
}

describe('generateWorld', () => {
  it('is deterministic: same seed produces a deep-equal world', () => {
    const a = generateWorld(1, createRng(1));
    const b = generateWorld(1, createRng(1));
    expect(a).toEqual(b);
  });

  it('different seeds produce different worlds', () => {
    const a = generateWorld(1, createRng(1));
    const b = generateWorld(2, createRng(2));
    expect(a).not.toEqual(b);
  });

  it('produces a 48x32 grid with a tile for every cell', () => {
    const w = generateWorld(7, createRng(7));
    expect(w.width).toBe(GRID_W);
    expect(w.height).toBe(GRID_H);
    expect(w.tiles.length).toBe(GRID_W * GRID_H);
  });

  it('contains grass, forest, rock, water, and den tiles', () => {
    const w = generateWorld(3, createRng(3));
    const kinds = new Set(w.tiles);
    expect(kinds.has('grass')).toBe(true);
    expect(kinds.has('forest')).toBe(true);
    expect(kinds.has('rock')).toBe(true);
    expect(kinds.has('water')).toBe(true);
    expect(kinds.has('den')).toBe(true);
  });

  it('places 8-14 deadwood entities', () => {
    for (let seed = 0; seed < 25; seed++) {
      const w = generateWorld(seed, createRng(seed));
      expect(w.deadwood.length).toBeGreaterThanOrEqual(8);
      expect(w.deadwood.length).toBeLessThanOrEqual(14);
    }
  });

  it('places 4-8 sunpatches', () => {
    for (let seed = 0; seed < 25; seed++) {
      const w = generateWorld(seed, createRng(seed));
      expect(w.sunpatches.length).toBeGreaterThanOrEqual(4);
      expect(w.sunpatches.length).toBeLessThanOrEqual(8);
    }
  });

  it('deadwood entities have unique positions and ids', () => {
    const w = generateWorld(11, createRng(11));
    const posKeys = new Set(w.deadwood.map((d) => `${d.pos.x},${d.pos.y}`));
    const ids = new Set(w.deadwood.map((d) => d.id));
    expect(posKeys.size).toBe(w.deadwood.length);
    expect(ids.size).toBe(w.deadwood.length);
  });

  it('sunpatch entities have unique positions and ids', () => {
    const w = generateWorld(12, createRng(12));
    const posKeys = new Set(w.sunpatches.map((s) => `${s.pos.x},${s.pos.y}`));
    const ids = new Set(w.sunpatches.map((s) => s.id));
    expect(posKeys.size).toBe(w.sunpatches.length);
    expect(ids.size).toBe(w.sunpatches.length);
  });

  it('ember starts near the map center', () => {
    for (let seed = 0; seed < 25; seed++) {
      const w = generateWorld(seed, createRng(seed));
      const cx = Math.floor(w.width / 2);
      const cy = Math.floor(w.height / 2);
      const d = Math.max(Math.abs(w.ember.pos.x - cx), Math.abs(w.ember.pos.y - cy));
      expect(d).toBeLessThanOrEqual(8);
    }
  });

  it('ember starts on a passable tile', () => {
    for (let seed = 0; seed < 25; seed++) {
      const w = generateWorld(seed, createRng(seed));
      expect(isPassable(w, w.ember.pos)).toBe(true);
    }
  });

  it('wolf starts far from ember, in PATROL, on a passable tile', () => {
    for (let seed = 0; seed < 25; seed++) {
      const w = generateWorld(seed, createRng(seed));
      expect(w.wolf.state).toBe('PATROL');
      expect(isPassable(w, w.wolf.pos)).toBe(true);
      const d = Math.max(
        Math.abs(w.wolf.pos.x - w.ember.pos.x),
        Math.abs(w.wolf.pos.y - w.ember.pos.y),
      );
      expect(d).toBeGreaterThan(10);
    }
  });

  it('denPos sits on a den tile', () => {
    const w = generateWorld(4, createRng(4));
    const t = w.tiles[w.denPos.y * w.width + w.denPos.x];
    expect(t).toBe('den');
  });

  it('den region touches the map edge', () => {
    for (let seed = 0; seed < 25; seed++) {
      const w = generateWorld(seed, createRng(seed));
      const onEdge =
        w.denPos.x === 0 ||
        w.denPos.y === 0 ||
        w.denPos.x === w.width - 1 ||
        w.denPos.y === w.height - 1;
      expect(onEdge).toBe(true);
    }
  });

  it('guarantees connectivity: ember can reach the den and every deadwood', () => {
    for (let seed = 0; seed < 40; seed++) {
      const w = generateWorld(seed, createRng(seed));
      expect(reachable(w, w.ember.pos, w.denPos)).toBe(true);
      for (const dw of w.deadwood) {
        expect(reachable(w, w.ember.pos, dw.pos)).toBe(true);
      }
    }
  });

  it('wolf starts in a fresh state with no accrued stateTicks', () => {
    const w = generateWorld(9, createRng(9));
    expect(w.wolf.stateTicks).toBe(0);
  });

  it('weather starts clear and tick starts at 0', () => {
    const w = generateWorld(5, createRng(5));
    expect(w.weather).toBe('clear');
    expect(w.tick).toBe(0);
  });
});
