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
 *
 * E4.3 CANDIDATE C (lane 8), `HardConfig.searchFix.reachCache`: `ReachMemo`
 * below is an OPTIONAL second-level memo shared by every `DistanceCache` one
 * engine owns. It is absent on every profile — `createDistanceCache()` with no
 * memo is the champion, allocates nothing extra and takes no new branch on the
 * first-level HIT path — and it is output-identical WHEN PRESENT by
 * construction, not by measurement: `bfsFrom`/`bfsMulti` are pure functions of
 * (occupancy, origin) / (occupancy, sources), the memo verifies the WHOLE key
 * (four occupancy words plus the origin square or the four source words) on
 * every probe rather than a hash of it, so a hit returns exactly the bytes the
 * BFS it replaces would have written. See `docs/hard-ai/e4/E4.3-REACH-CACHE.md`.
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

// --- E4.3 candidate C: the shared reach memo (`searchFix.reachCache`) --------

/**
 * A bounded, full-key-verified memo for `bfsFrom`/`bfsMulti` outputs, shared by
 * every `DistanceCache` an engine owns (the per-ply `NodeTables`, the
 * `Evaluator`'s own tables and the `Replica`'s).
 *
 * WHY A SECOND LEVEL. `DirectMappedDistanceCache` is per-`NodeTables` and keyed
 * on `PackedState.occHash` (a 32-bit Zobrist fold) plus the origin; it catches
 * the repeats inside ONE ply's own table build, generation and ordering. It
 * does not catch the repeats ACROSS plies, across the evaluator's tables and
 * the search's, or across the `Replica`'s own cache, and it catches no
 * multi-source call at all (`DistanceCache.multi` has never been cached). E4.3
 * lane 8 measured both on the 16 `e1-dev` turn-6 positions at fixed:100,000
 * (`docs/hard-ai/e4/E4.3-REACH-CACHE.md`): the first level answers 76.9% of
 * 27,118,221 `get` calls, and of the 9,765,744 BFS runs that still happen only
 * 4,938,223 carry a distinct key — 49.4% of the BFS work in a search recomputes
 * a field the same search already computed.
 *
 * IDENTITY. Every probe compares the complete key word for word. A miss runs
 * the same `bfsFrom`/`bfsMulti` the champion runs; a hit copies back bytes that
 * an earlier run of that same pure function wrote for that same input. There is
 * no eviction policy to get wrong (a slot is simply overwritten) and no
 * invalidation to miss: board geometry is constant, so the memo never goes
 * stale and `DistanceCache.invalidate` deliberately does not clear it.
 */
export interface ReachMemo {
  /** True and `out` filled if `(occ, origin)` is present; false and `out` untouched otherwise. */
  loadFrom(occ: BB, origin: Square, out: Int8Array): boolean;
  storeFrom(occ: BB, origin: Square, row: Int8Array): void;
  /** True and `out` filled if `(occ, sources)` is present; false and `out` untouched otherwise. */
  loadMulti(occ: BB, sources: BB, out: Int8Array): boolean;
  storeMulti(occ: BB, sources: BB, row: Int8Array): void;
  readonly fromHits: number;
  readonly fromMisses: number;
  readonly multiHits: number;
  readonly multiMisses: number;
}

/**
 * 2^16 entries per table, chosen by measurement and not by taste (lane 8's
 * census on the 16 `e1-dev` turn-6 positions at fixed:100,000; hit rate over
 * ALL BFS runs, against the 49.4% ceiling an unbounded memo would reach):
 * 2^12 33.2%, 2^14 38.3%, 2^16 43.4%, 2^18 47.1%. 2^16 buys 5.1 points over
 * 2^14 for 12 MB and 2^18 buys 3.7 more for 50 MB, so 2^16 is where the curve
 * stops paying: 16.6 MB per engine, allocated once, only when the flag is on.
 */
export const REACH_MEMO_BITS = 16;

/** One direct-mapped table: `words` key words and a `BOARD`-byte row per slot. */
class MemoTable {
  private readonly mask: number;
  private readonly words: number;
  private readonly keys: Int32Array;
  private readonly rows: Int8Array;
  private readonly filled: Uint8Array;
  hits = 0;
  misses = 0;

  constructor(bits: number, words: number) {
    const size = 1 << bits;
    this.mask = size - 1;
    this.words = words;
    this.keys = new Int32Array(size * words);
    this.rows = new Int8Array(size * BOARD);
    this.filled = new Uint8Array(size);
  }

  /** FNV-1a over the key words, avalanched; the index is advisory, the compare is not. */
  private index(k: Int32Array): number {
    let h = 0x811c9dc5 | 0;
    for (let i = 0; i < this.words; i++) h = Math.imul(h ^ k[i], 0x01000193) | 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2545f491) | 0;
    return (h >>> 16) & this.mask;
  }

  load(k: Int32Array, out: Int8Array): boolean {
    const idx = this.index(k);
    if (this.filled[idx] === 1) {
      const kb = idx * this.words;
      let same = true;
      for (let i = 0; i < this.words; i++) {
        if (this.keys[kb + i] !== k[i]) {
          same = false;
          break;
        }
      }
      if (same) {
        const rb = idx * BOARD;
        for (let i = 0; i < BOARD; i++) out[i] = this.rows[rb + i];
        this.hits++;
        return true;
      }
    }
    this.misses++;
    return false;
  }

  store(k: Int32Array, row: Int8Array): void {
    const idx = this.index(k);
    const kb = idx * this.words;
    for (let i = 0; i < this.words; i++) this.keys[kb + i] = k[i];
    const rb = idx * BOARD;
    for (let i = 0; i < BOARD; i++) this.rows[rb + i] = row[i];
    this.filled[idx] = 1;
  }
}

class DirectMappedReachMemo implements ReachMemo {
  private readonly single: MemoTable;
  private readonly multiTable: MemoTable;
  /** Key scratch, written before every probe; the memo is as single-threaded as the BFS. */
  private readonly key = new Int32Array(8);

  constructor(bits: number) {
    this.single = new MemoTable(bits, 5);
    this.multiTable = new MemoTable(bits, 8);
  }

  get fromHits(): number {
    return this.single.hits;
  }

  get fromMisses(): number {
    return this.single.misses;
  }

  get multiHits(): number {
    return this.multiTable.hits;
  }

  get multiMisses(): number {
    return this.multiTable.misses;
  }

  private singleKey(occ: BB, origin: Square): Int32Array {
    const k = this.key;
    k[0] = occ[0] | 0;
    k[1] = occ[1] | 0;
    k[2] = occ[2] | 0;
    k[3] = occ[3] | 0;
    k[4] = origin;
    return k;
  }

  private multiKey(occ: BB, sources: BB): Int32Array {
    const k = this.key;
    k[0] = occ[0] | 0;
    k[1] = occ[1] | 0;
    k[2] = occ[2] | 0;
    k[3] = occ[3] | 0;
    k[4] = sources[0] | 0;
    k[5] = sources[1] | 0;
    k[6] = sources[2] | 0;
    k[7] = sources[3] | 0;
    return k;
  }

  loadFrom(occ: BB, origin: Square, out: Int8Array): boolean {
    return this.single.load(this.singleKey(occ, origin), out);
  }

  storeFrom(occ: BB, origin: Square, row: Int8Array): void {
    this.single.store(this.singleKey(occ, origin), row);
  }

  loadMulti(occ: BB, sources: BB, out: Int8Array): boolean {
    return this.multiTable.load(this.multiKey(occ, sources), out);
  }

  storeMulti(occ: BB, sources: BB, row: Int8Array): void {
    this.multiTable.store(this.multiKey(occ, sources), row);
  }
}

/** One memo per engine, created ONLY when `searchFix.reachCache` is on. */
export function createReachMemo(bits: number = REACH_MEMO_BITS): ReachMemo {
  return new DirectMappedReachMemo(bits);
}

export interface DistanceCache {
  /** BFS distances from `origin` over `p`'s occupancy; the array is owned by the cache. */
  get(p: PackedState, origin: Square): Int8Array;
  /** Multi-source BFS from `sources` over `p`'s occupancy; not cached at the
   * first level (E4.3 candidate C's memo, when present, does cache it). */
  multi(p: PackedState, sources: BB, out: Int8Array): void;
  invalidate(): void;
  readonly hits: number;
  readonly misses: number;
}

/** Default 2^14 direct-mapped entries (DESIGN §5.1). */
export const DISTANCE_CACHE_BITS = 14;

class DirectMappedDistanceCache implements DistanceCache {
  private readonly memo: ReachMemo | null;
  private readonly mask: number;
  private readonly slots: (Int8Array | null)[];
  /** `occHash` of the state the slot was filled from; `keyOrigin` disambiguates. */
  private readonly keyHash: Int32Array;
  private readonly keyOrigin: Int32Array;
  private readonly occ: BB = bbNew();
  private hitCount = 0;
  private missCount = 0;

  constructor(bits: number, memo: ReachMemo | null) {
    this.memo = memo;
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
    // E4.3 candidate C: the second level is consulted only on a FIRST-level
    // miss, so the champion's hit path above is untouched and an `occHash`
    // collision resolves exactly as it does with the flag absent.
    const occ = occupancyOf(p, this.occ);
    const memo = this.memo;
    if (memo === null) {
      bfsFrom(occ, origin, entry);
    } else if (!memo.loadFrom(occ, origin, entry)) {
      bfsFrom(occ, origin, entry);
      memo.storeFrom(occ, origin, entry);
    }
    this.keyHash[index] = hash;
    this.keyOrigin[index] = origin;
    return entry;
  }

  multi(p: PackedState, sources: BB, out: Int8Array): void {
    const occ = occupancyOf(p, this.occ);
    const memo = this.memo;
    if (memo === null) {
      bfsMulti(occ, sources, out);
      return;
    }
    if (memo.loadMulti(occ, sources, out)) return;
    bfsMulti(occ, sources, out);
    memo.storeMulti(occ, sources, out);
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

/**
 * `memo` is E4.3 candidate C's second level (`searchFix.reachCache`): `null` —
 * what every existing call site gets, and what `HardEngine` passes unless the
 * flag is on — is the champion, byte for byte.
 */
export function createDistanceCache(bits: number = DISTANCE_CACHE_BITS, memo: ReachMemo | null = null): DistanceCache {
  return new DirectMappedDistanceCache(bits, memo);
}
