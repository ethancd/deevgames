// @vitest-environment node
/**
 * `core/movement.ts` against the canonical engine (DESIGN §4.5, §5.1).
 *
 * The headline is the M5 gate's own criterion: `moveCost` agrees with
 * `getMoveCost` on 200,000 random (occupancy, origin, destination, speed)
 * tuples. The rest pins the distance field itself, the `-1` spelling of
 * `null`, `reachMask`, and the direct-mapped `DistanceCache`'s identity
 * (a hit must return the same field a fresh BFS would).
 */
import { describe, expect, it, vi } from 'vitest';
import { getMoveCost, getMovementRange } from '../../../src/game/movement';
import { seededRandom } from '../../../src/ai/runtime';
import { bbNew, bbNext, bbSet } from '../../../src/ai/hard/core/bits';
import { bfsFrom, createDistanceCache, moveCost, reachMask } from '../../../src/ai/hard/core/movement';
import { Replica } from '../../../src/ai/hard/core/state';
import { randomState, buildState } from './game-fixture';

// E0.5 timeout budget: slowest test 1.1 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 20 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 20_000 });

const replica = new Replica();

describe('core/movement.ts', () => {
  it('moveCost agrees with getMoveCost on 200,000 random tuples', () => {
    const rng = seededRandom(0x4d4f5645);
    const cache = createDistanceCache(12);
    let compared = 0;
    let unreachable = 0;
    let multiAction = 0;
    for (let board = 0; board < 2000; board++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 14));
      if (state.board.units.length === 0) continue;
      const p = replica.pack(state);
      for (let t = 0; t < 100; t++) {
        const unit = state.board.units[Math.floor(rng() * state.board.units.length)];
        const origin = unit.position;
        const to = { x: Math.floor(rng() * 10), y: Math.floor(rng() * 10) };
        const speed = 1 + Math.floor(rng() * 5);
        const expected = getMoveCost(origin, to, speed, state.board);
        const actual = moveCost(cache.get(p, origin.y * 10 + origin.x), to.y * 10 + to.x, speed);
        if (expected === null) {
          expect(actual).toBe(-1);
          unreachable++;
        } else {
          expect(actual).toBe(expected);
          if (expected > 1) multiAction++;
        }
        compared++;
      }
    }
    expect(compared).toBe(200_000);
    // Guard against a degenerate corpus that would make the equality vacuous.
    expect(unreachable).toBeGreaterThan(1000);
    expect(multiAction).toBeGreaterThan(50_000);
  });

  it('bfsFrom reproduces the canonical distance field square for square', () => {
    const rng = seededRandom(7);
    for (let i = 0; i < 300; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 12));
      if (state.board.units.length === 0) continue;
      const occ = bbNew();
      for (const u of state.board.units) bbSet(occ, u.position.y * 10 + u.position.x);
      const origin = state.board.units[0].position;
      const dist = new Int8Array(100);
      bfsFrom(occ, origin.y * 10 + origin.x, dist);

      expect(dist[origin.y * 10 + origin.x]).toBe(0);
      // getMovementRange with a huge budget lists every reachable square once.
      const seen = new Set<number>();
      for (const r of getMovementRange(origin, 1, 99, state.board)) {
        const s = r.position.y * 10 + r.position.x;
        seen.add(s);
        expect(dist[s]).toBe(99 - r.actionsRemaining);
      }
      for (let s = 0; s < 100; s++) {
        if (s === origin.y * 10 + origin.x) continue;
        if (!seen.has(s)) expect(dist[s]).toBe(-1);
      }
    }
  });

  it('a square occupied by another unit is never reachable', () => {
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 0, y: 0 },
        { def: 'water_1', owner: 'black', x: 0, y: 1 },
      ],
    });
    const p = replica.pack(state);
    const cache = createDistanceCache(8);
    const dist = cache.get(p, 0);
    expect(dist[10]).toBe(-1);
    expect(moveCost(dist, 10, 2)).toBe(-1);
    expect(getMoveCost({ x: 0, y: 0 }, { x: 0, y: 1 }, 2, state.board)).toBeNull();
    // The origin itself: distance 0, and `getMoveCost` spells that `null`.
    expect(dist[0]).toBe(0);
    expect(moveCost(dist, 0, 2)).toBe(-1);
  });

  it('reachMask is exactly {q : 0 < d(q) <= speed * actions}', () => {
    const rng = seededRandom(11);
    const cache = createDistanceCache(10);
    const mask = bbNew();
    for (let i = 0; i < 200; i++) {
      const state = randomState(rng, 2 + Math.floor(rng() * 8));
      const p = replica.pack(state);
      const unit = state.board.units[0];
      const origin = unit.position.y * 10 + unit.position.x;
      const speed = 1 + Math.floor(rng() * 4);
      const actions = 1 + Math.floor(rng() * 4);
      const dist = cache.get(p, origin);
      reachMask(dist, speed, actions, mask);
      const expected = new Set(
        getMovementRange(unit.position, speed, actions, state.board)
          .filter(r => actions - r.actionsRemaining >= 1)
          .map(r => r.position.y * 10 + r.position.x),
      );
      const got = new Set<number>();
      for (let s = bbNext(mask, -1); s >= 0; s = bbNext(mask, s)) got.add(s);
      expect([...got].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
    }
  });

  it('the distance cache returns a field identical to a fresh BFS, and counts hits', () => {
    const rng = seededRandom(13);
    const state = randomState(rng, 8);
    const p = replica.pack(state);
    const cache = createDistanceCache(8);
    const occ = bbNew();
    for (const u of state.board.units) bbSet(occ, u.position.y * 10 + u.position.x);
    const fresh = new Int8Array(100);
    for (const u of state.board.units) {
      const origin = u.position.y * 10 + u.position.x;
      bfsFrom(occ, origin, fresh);
      const cached = cache.get(p, origin);
      expect([...cached]).toEqual([...fresh]);
      // Second lookup of the same (occHash, origin) must be a hit.
      const hitsBefore = cache.hits;
      cache.get(p, origin);
      expect(cache.hits).toBe(hitsBefore + 1);
    }
    expect(cache.misses).toBe(state.board.units.length);
    cache.invalidate();
    const missesBefore = cache.misses;
    cache.get(p, state.board.units[0].position.y * 10 + state.board.units[0].position.x);
    expect(cache.misses).toBe(missesBefore + 1);
  });
});
