/**
 * Bitboard BFS, the distance cache and move costs (DESIGN §4.5, §5.1).
 *
 * The canonical engine walks the board with a queue and a 100-entry FIFO cache
 * keyed by `BoardState` identity (`movement.ts:239-257`); its distance field is
 * `-1` on every square an occupant blocks, `0` at the origin, and the shortest
 * orthogonal path length over EMPTY squares everywhere else. `bfsFrom`
 * reproduces that field exactly by ring expansion over bitboards: the
 * neighbour order cannot change a distance, so the two agree square for square
 * even though the traversal orders differ (the canonical up/down/left/right
 * order only matters where a concrete PATH is needed, which is
 * `verify/replay.ts`, never the search).
 *
 * `moveCost` is `getMoveCost` (`movement.ts:226-234`) with `null` spelled `-1`;
 * `tests/ai/hard/movement.test.ts` pins the two against each other on 200,000
 * random (position, destination, speed, occupancy) tuples.
 *
 * Nothing here allocates after construction: the ring buffers are module-level
 * scratch (the engine is single-threaded; `bfsFrom` and `DistanceCache.multi`
 * are not reentrant) and cache entries are allocated once per slot and then
 * reused in place.
 */
import type { PackedState, Square } from '../types';
import {
  bbAndNot,
  bbCopy,
  bbDilate,
  bbIsEmpty,
  bbNew,
  bbNext,
  bbOr,
  bbSet,
  bbZero,
  type BB,
} from './bits';
import { BOARD } from './tables';

/** Scratch for `bfsFrom`/`multi`: frontier, next ring, visited. */
const SC_FRONTIER = bbNew();
const SC_NEXT = bbNew();
const SC_VISITED = bbNew();

/**
 * Single-source BFS over `~occ`. Writes `out[0..99]`: `0` at `origin`, the
 * shortest orthogonal distance through unoccupied squares elsewhere, `-1` on
 * every unreachable or occupied square (the origin's own occupancy is
 * irrelevant — it is seeded before the expansion, exactly as the canonical
 * engine seeds `distances[origin] = 0`).
 */
export function bfsFrom(occ: BB, origin: Square, out: Int8Array): void {
  out.fill(-1);
  out[origin] = 0;
  bbZero(SC_VISITED);
  bbSet(SC_VISITED, origin);
  bbZero(SC_FRONTIER);
  bbSet(SC_FRONTIER, origin);
  for (let d = 1; d < BOARD; d++) {
    bbDilate(SC_NEXT, SC_FRONTIER);
    bbAndNot(SC_NEXT, SC_NEXT, occ);
    bbAndNot(SC_NEXT, SC_NEXT, SC_VISITED);
    if (bbIsEmpty(SC_NEXT)) return;
    for (let s = bbNext(SC_NEXT, -1); s >= 0; s = bbNext(SC_NEXT, s)) out[s] = d;
    bbOr(SC_VISITED, SC_VISITED, SC_NEXT);
    bbCopy(SC_FRONTIER, SC_NEXT);
  }
}

/** Multi-source variant: every square of `sources` starts at distance 0. */
export function bfsMulti(occ: BB, sources: BB, out: Int8Array): void {
  out.fill(-1);
  bbCopy(SC_VISITED, sources);
  bbCopy(SC_FRONTIER, sources);
  for (let s = bbNext(sources, -1); s >= 0; s = bbNext(sources, s)) out[s] = 0;
  for (let d = 1; d < BOARD; d++) {
    bbDilate(SC_NEXT, SC_FRONTIER);
    bbAndNot(SC_NEXT, SC_NEXT, occ);
    bbAndNot(SC_NEXT, SC_NEXT, SC_VISITED);
    if (bbIsEmpty(SC_NEXT)) return;
    for (let s = bbNext(SC_NEXT, -1); s >= 0; s = bbNext(SC_NEXT, s)) out[s] = d;
    bbOr(SC_VISITED, SC_VISITED, SC_NEXT);
    bbCopy(SC_FRONTIER, SC_NEXT);
  }
}

/**
 * Actions a unit of `speed` needs to reach `to` given a distance field:
 * `ceil(dist[to] / speed)`, and `-1` where `getMoveCost` returns `null`
 * (`dist[to] <= 0` — unreachable, occupied, or the origin itself).
 */
export function moveCost(dist: Int8Array, to: Square, speed: number): number {
  const d = dist[to];
  if (d <= 0) return -1;
  return ((d + speed - 1) / speed) | 0;
}

/** `out = {q : 0 < dist[q] <= speed * actions}` — every square reachable with the budget. */
export function reachMask(dist: Int8Array, speed: number, actions: number, out: BB): BB {
  bbZero(out);
  const limit = speed * actions;
  if (limit <= 0) return out;
  for (let s = 0; s < BOARD; s++) {
    const d = dist[s];
    if (d > 0 && d <= limit) bbSet(out, s);
  }
  return out;
}

export interface DistanceCache {
  /** BFS distances from `origin` over `p`'s occupancy; the array is owned by the cache. */
  get(p: PackedState, origin: Square): Int8Array;
  /** Multi-source BFS from `sources` over `p`'s occupancy; never cached. */
  multi(p: PackedState, sources: BB, out: Int8Array): void;
  invalidate(): void;
  readonly hits: number;
  readonly misses: number;
}

/** Default 2^14 direct-mapped entries (DESIGN §5.1). */
export const DISTANCE_CACHE_BITS = 14;

class DirectMappedDistanceCache implements DistanceCache {
  private readonly mask: number;
  private readonly slots: (Int8Array | null)[];
  /** `occHash` of the state the slot was filled from; `keyOrigin` disambiguates. */
  private readonly keyHash: Int32Array;
  private readonly keyOrigin: Int32Array;
  private readonly occ: BB = bbNew();
  private hitCount = 0;
  private missCount = 0;

  constructor(bits: number) {
    const size = 1 << bits;
    this.mask = size - 1;
    this.slots = new Array<Int8Array | null>(size).fill(null);
    this.keyHash = new Int32Array(size);
    this.keyOrigin = new Int32Array(size).fill(-1);
  }

  get hits(): number {
    return this.hitCount;
  }

  get misses(): number {
    return this.missCount;
  }

  invalidate(): void {
    this.keyOrigin.fill(-1);
  }

  get(p: PackedState, origin: Square): Int8Array {
    const hash = p.occHash | 0;
    const index = (Math.imul(hash, 0x9e3779b1) ^ Math.imul(origin + 1, 0x85ebca6b)) >>> 0 & this.mask;
    let entry = this.slots[index];
    if (entry !== null && this.keyOrigin[index] === origin && this.keyHash[index] === hash) {
      this.hitCount++;
      return entry;
    }
    this.missCount++;
    if (entry === null) {
      entry = new Int8Array(BOARD);
      this.slots[index] = entry;
    }
    bfsFrom(occupancyOf(p, this.occ), origin, entry);
    this.keyHash[index] = hash;
    this.keyOrigin[index] = origin;
    return entry;
  }

  multi(p: PackedState, sources: BB, out: Int8Array): void {
    bfsMulti(occupancyOf(p, this.occ), sources, out);
  }
}

/** `p.occ` as a `BB`, copied into `dst` so the BFS scratch never aliases the state. */
function occupancyOf(p: PackedState, dst: BB): BB {
  dst[0] = p.occ[0];
  dst[1] = p.occ[1];
  dst[2] = p.occ[2];
  dst[3] = p.occ[3];
  return dst;
}

export function createDistanceCache(bits: number = DISTANCE_CACHE_BITS): DistanceCache {
  return new DirectMappedDistanceCache(bits);
}
