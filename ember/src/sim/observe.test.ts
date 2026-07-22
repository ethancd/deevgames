import { describe, expect, it } from 'vitest';
import type { WorldState } from '../core/types';
import { observe } from './observe';

function baseWorld(): WorldState {
  const w = 12;
  const h = 10;
  const tiles = new Array(w * h).fill('grass');
  // A small pond in the middle with an edge tile detectable at (5,5)/(6,5)/etc.
  tiles[5 * w + 5] = 'water';
  tiles[5 * w + 6] = 'water';
  tiles[6 * w + 5] = 'water';
  tiles[6 * w + 6] = 'water';
  tiles[4 * w + 4] = 'den';
  return {
    seed: 1,
    tick: 0,
    width: w,
    height: h,
    tiles,
    denPos: { x: 4, y: 4 },
    deadwood: [
      { id: 'dw-a', pos: { x: 2, y: 2 }, fuel: 0.5 },
      { id: 'dw-b', pos: { x: 8, y: 2 }, fuel: 0.9 },
    ],
    sunpatches: [{ id: 'sp-a', pos: { x: 3, y: 3 }, active: true }],
    wolf: { pos: { x: 9, y: 9 }, state: 'PATROL', stateTicks: 0 },
    weather: 'clear',
    ember: { pos: { x: 3, y: 2 } },
  };
}

describe('observe', () => {
  it('returns only entities/terrain within the Chebyshev radius', () => {
    const w = baseWorld();
    const obs = observe(w, { x: 3, y: 2 }, 1);
    // Only dw-a (distance 1) should be within radius 1 of (3,2).
    expect(obs.some((o) => o.what === 'deadwood' && o.detail?.id === 'dw-a')).toBe(true);
    expect(obs.some((o) => o.what === 'deadwood' && o.detail?.id === 'dw-b')).toBe(false);
    expect(obs.every((o) => o.distance <= 1)).toBe(true);
  });

  it('sees the wolf when in range and reports its state', () => {
    const w = baseWorld();
    const obs = observe(w, { x: 3, y: 2 }, 20);
    const wolfObs = obs.find((o) => o.what === 'wolf');
    expect(wolfObs).toBeDefined();
    expect(wolfObs?.detail?.state).toBe('PATROL');
    expect(wolfObs?.pos).toEqual({ x: 9, y: 9 });
  });

  it('reports den terrain and water-edge terrain within radius', () => {
    const w = baseWorld();
    const obs = observe(w, { x: 3, y: 2 }, 20);
    expect(obs.some((o) => o.kind === 'terrain' && o.what === 'den')).toBe(true);
    expect(obs.some((o) => o.kind === 'terrain' && o.what === 'water')).toBe(true);
  });

  it('does not report interior water tiles as terrain, only edges', () => {
    const w = baseWorld();
    // Grow the pond so it has an interior tile with no non-water neighbor.
    const bw = w.width;
    for (let y = 4; y <= 7; y++) {
      for (let x = 4; x <= 7; x++) {
        w.tiles[y * bw + x] = 'water';
      }
    }
    const obs = observe(w, { x: 5, y: 5 }, 20);
    const waterObs = obs.filter((o) => o.what === 'water');
    // (5,5) and (6,6) etc are interior (all 4-neighbors also water); must be excluded.
    const interior = waterObs.find((o) => o.pos.x === 5 && o.pos.y === 5);
    expect(interior).toBeUndefined();
  });

  it('is sorted by distance ascending, then by a stable secondary key', () => {
    const w = baseWorld();
    const obs = observe(w, { x: 3, y: 2 }, 20);
    for (let i = 1; i < obs.length; i++) {
      expect(obs[i].distance).toBeGreaterThanOrEqual(obs[i - 1].distance);
    }
  });

  it('produces identical output on repeated calls (deterministic order)', () => {
    const w = baseWorld();
    const a = observe(w, { x: 3, y: 2 }, 20);
    const b = observe(w, { x: 3, y: 2 }, 20);
    expect(a).toEqual(b);
  });

  it('returns copies, never live references into WorldState', () => {
    const w = baseWorld();
    const obs = observe(w, { x: 3, y: 2 }, 20);
    const wolfObs = obs.find((o) => o.what === 'wolf')!;
    wolfObs.pos.x = 999;
    (wolfObs.detail as Record<string, unknown>).state = 'MUTATED';
    expect(w.wolf.pos.x).toBe(9);
    expect(w.wolf.state).toBe('PATROL');

    const dwObs = obs.find((o) => o.what === 'deadwood' && o.detail?.id === 'dw-a')!;
    dwObs.pos.x = 555;
    expect(w.deadwood[0].pos.x).toBe(2);
  });

  it('respects radius 0: only exact-position matches', () => {
    const w = baseWorld();
    const obs = observe(w, { x: 2, y: 2 }, 0);
    expect(obs.every((o) => o.distance === 0)).toBe(true);
    expect(obs.some((o) => o.what === 'deadwood' && o.detail?.id === 'dw-a')).toBe(true);
  });
});
