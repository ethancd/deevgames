// @vitest-environment node
/**
 * E4.3 candidate C (lane 8): `core/movement.ts ReachMemo`, the second-level
 * memo behind `HardConfig.searchFix.reachCache`
 * (`docs/hard-ai/e4/E4.3-REACH-CACHE.md`).
 *
 * The candidate is a PURE OPTIMISATION, so the only thing this file has to
 * establish is that it computes nothing new: a memo hit must return, byte for
 * byte, the field the `bfsFrom`/`bfsMulti` it replaced would have written.
 * That claim is made by construction (the BFS is a pure function of its inputs
 * and every probe verifies the WHOLE key, not a hash of it) and it is checked
 * here over 10,000 fuzzed `(occupancy, origin)` pairs and 10,000 fuzzed
 * `(occupancy, sources)` pairs, with the corners, the four edges, the empty
 * board and the full board among them, and with a deliberately TINY memo (2^6
 * entries against 10,000 distinct keys) so that eviction and same-slot
 * different-key probes are the common case rather than a rarity.
 *
 * The last two cases lift the same equality to the level a search actually
 * uses: a `DistanceCache` built WITH the memo returns what one built WITHOUT
 * it returns, on random packed states, for `get` and for `multi`.
 */
import { describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../../src/ai/runtime';
import { bbNew, bbSet, type BB } from '../../../src/ai/hard/core/bits';
import {
  REACH_MEMO_BITS,
  bfsFrom,
  bfsMulti,
  createDistanceCache,
  createReachMemo,
  type ReachMemo,
} from '../../../src/ai/hard/core/movement';
import { Replica } from '../../../src/ai/hard/core/state';
import { randomState } from './game-fixture';

// E0.5 timeout budget: this file's slowest case is the 10,000-pair multi-source
// fuzz at ~1.5 s (M2 Max); 20 s is its explicit ceiling.
vi.setConfig({ testTimeout: 20_000 });

const BOARD = 100;

/** Every square on the rim, plus the four corners twice over: the edge cases. */
const EDGE_SQUARES: readonly number[] = (() => {
  const out: number[] = [];
  for (let s = 0; s < BOARD; s++) {
    const x = s % 10;
    const y = (s / 10) | 0;
    if (x === 0 || x === 9 || y === 0 || y === 9) out.push(s);
  }
  return out;
})();

/** A random occupancy at the given density; `1` fills the board. */
function randomOcc(rng: () => number, density: number, out: BB): BB {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  for (let s = 0; s < BOARD; s++) if (rng() < density) bbSet(out, s);
  return out;
}

/**
 * The memo path for one `(occ, origin)`: what a `DistanceCache` miss does with
 * the flag on. Returns the field and whether the memo answered it.
 */
function memoFrom(memo: ReachMemo, occ: BB, origin: number, out: Int8Array): boolean {
  if (memo.loadFrom(occ, origin, out)) return true;
  bfsFrom(occ, origin, out);
  memo.storeFrom(occ, origin, out);
  return false;
}

function memoMulti(memo: ReachMemo, occ: BB, sources: BB, out: Int8Array): boolean {
  if (memo.loadMulti(occ, sources, out)) return true;
  bfsMulti(occ, sources, out);
  memo.storeMulti(occ, sources, out);
  return false;
}

function sameField(a: Int8Array, b: Int8Array): boolean {
  for (let i = 0; i < BOARD; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('core/movement.ts ReachMemo (searchFix.reachCache)', () => {
  it('returns bfsFrom byte for byte over 10,000 fuzzed (occupancy, origin) pairs', () => {
    const rng = seededRandom(0x52454143);
    // 2^6 = 64 slots against 10,000 keys: every kind of probe (empty slot,
    // occupied slot with a DIFFERENT key, occupied slot with the SAME key)
    // happens thousands of times.
    const memo = createReachMemo(6);
    const occ = bbNew();
    const ref = new Int8Array(BOARD);
    const got = new Int8Array(BOARD);
    let hits = 0;
    let fullBoards = 0;
    let emptyBoards = 0;
    let edgeOrigins = 0;
    let mismatches = 0;
    for (let i = 0; i < 10_000; i++) {
      // Densities from empty to full, with both endpoints hit on purpose.
      const density = i % 500 === 0 ? 1 : i % 500 === 1 ? 0 : rng() * 0.9;
      randomOcc(rng, density, occ);
      if (density === 1) fullBoards++;
      if (density === 0) emptyBoards++;
      const origin =
        i % 3 === 0
          ? (EDGE_SQUARES[Math.floor(rng() * EDGE_SQUARES.length)] as number)
          : Math.floor(rng() * BOARD);
      if (EDGE_SQUARES.includes(origin)) edgeOrigins++;

      bfsFrom(occ, origin, ref);
      if (memoFrom(memo, occ, origin, got)) hits++;
      if (!sameField(got, ref)) mismatches++;

      // Re-probe: the pair was just stored, so this one must be a HIT and must
      // still equal the fresh BFS.
      got.fill(0);
      expect(memoFrom(memo, occ, origin, got)).toBe(true);
      if (!sameField(got, ref)) mismatches++;
    }
    expect(mismatches).toBe(0);
    // Non-vacuous: the memo really answered, and the fuzz really covered the
    // edges it claims to.
    expect(hits).toBeGreaterThan(0);
    expect(fullBoards).toBe(20);
    expect(emptyBoards).toBe(20);
    expect(edgeOrigins).toBeGreaterThan(3000);
    expect(memo.fromHits).toBeGreaterThan(10_000);
  });

  it('returns bfsMulti byte for byte over 10,000 fuzzed (occupancy, sources) pairs', () => {
    const rng = seededRandom(0x4d554c54);
    const memo = createReachMemo(6);
    const occ = bbNew();
    const src = bbNew();
    const ref = new Int8Array(BOARD);
    const got = new Int8Array(BOARD);
    let mismatches = 0;
    let emptySources = 0;
    let fullBoards = 0;
    for (let i = 0; i < 10_000; i++) {
      const density = i % 500 === 0 ? 1 : i % 500 === 1 ? 0 : rng() * 0.9;
      randomOcc(rng, density, occ);
      if (density === 1) fullBoards++;
      // Sources: sometimes a single corner (what `tables/context.ts` and
      // `tables/home.ts` ask for), sometimes a spawn-mask-shaped scatter,
      // sometimes empty (the degenerate case `bfsMulti` must still answer).
      src[0] = 0;
      src[1] = 0;
      src[2] = 0;
      src[3] = 0;
      const kind = i % 4;
      if (kind === 0) bbSet(src, EDGE_SQUARES[Math.floor(rng() * EDGE_SQUARES.length)] as number);
      else if (kind === 1) {
        const n = 1 + Math.floor(rng() * 12);
        for (let k = 0; k < n; k++) bbSet(src, Math.floor(rng() * BOARD));
      } else if (kind === 2) {
        for (let s = 0; s < BOARD; s++) if (rng() < 0.15) bbSet(src, s);
      } else emptySources++;

      bfsMulti(occ, src, ref);
      memoMulti(memo, occ, src, got);
      if (!sameField(got, ref)) mismatches++;

      got.fill(0);
      expect(memoMulti(memo, occ, src, got)).toBe(true);
      if (!sameField(got, ref)) mismatches++;
    }
    expect(mismatches).toBe(0);
    expect(fullBoards).toBe(20);
    expect(emptySources).toBeGreaterThan(2000);
    expect(memo.multiHits).toBeGreaterThan(10_000);
  });

  it('never answers a probe whose key differs by one bit', () => {
    // The whole identity argument is that a probe compares the COMPLETE key.
    // One flipped occupancy bit, or one different origin, must miss.
    const memo = createReachMemo(REACH_MEMO_BITS);
    const occ = bbNew();
    const other = bbNew();
    const out = new Int8Array(BOARD);
    for (let s = 0; s < BOARD; s += 3) bbSet(occ, s);
    bfsFrom(occ, 0, out);
    memo.storeFrom(occ, 0, out);
    expect(memo.loadFrom(occ, 0, out)).toBe(true);
    expect(memo.loadFrom(occ, 1, out)).toBe(false);
    for (let s = 0; s < BOARD; s++) {
      other[0] = occ[0];
      other[1] = occ[1];
      other[2] = occ[2];
      other[3] = occ[3];
      other[s >>> 5] ^= 1 << (s & 31);
      expect(memo.loadFrom(other, 0, out)).toBe(false);
    }
  });

  it('a DistanceCache WITH the memo returns what one WITHOUT it returns (get)', () => {
    const rng = seededRandom(0x44495354);
    const replica = new Replica();
    const memo = createReachMemo(8);
    const plain = createDistanceCache(10);
    // TWO memoised caches sharing one memo: the cross-ply case the flag exists
    // for. The second cache's first lookup is the memo's hit.
    const memoised = createDistanceCache(10, memo);
    const sibling = createDistanceCache(10, memo);
    let compared = 0;
    for (let i = 0; i < 300; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 14));
      if (state.board.units.length === 0) continue;
      const p = replica.pack(state);
      for (const u of state.board.units) {
        const origin = u.position.y * 10 + u.position.x;
        // Two lookups of each, so the first-level HIT path is compared too.
        for (let k = 0; k < 2; k++) {
          expect([...memoised.get(p, origin)]).toEqual([...plain.get(p, origin)]);
          expect([...sibling.get(p, origin)]).toEqual([...plain.get(p, origin)]);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
    expect(memo.fromHits).toBeGreaterThan(0);
  });

  it('a DistanceCache WITH the memo returns what one WITHOUT it returns (multi)', () => {
    const rng = seededRandom(0x4d554c43);
    const replica = new Replica();
    const memo = createReachMemo(8);
    const plain = createDistanceCache(10);
    const memoised = createDistanceCache(10, memo);
    const src = bbNew();
    const a = new Int8Array(BOARD);
    const b = new Int8Array(BOARD);
    let compared = 0;
    for (let i = 0; i < 400; i++) {
      const state = randomState(rng, 1 + Math.floor(rng() * 14));
      const p = replica.pack(state);
      src[0] = 0;
      src[1] = 0;
      src[2] = 0;
      src[3] = 0;
      const n = 1 + Math.floor(rng() * 6);
      for (let k = 0; k < n; k++) bbSet(src, Math.floor(rng() * BOARD));
      for (let k = 0; k < 2; k++) {
        plain.multi(p, src, a);
        memoised.multi(p, src, b);
        expect([...b]).toEqual([...a]);
        compared++;
      }
    }
    expect(compared).toBe(800);
    expect(memo.multiHits).toBeGreaterThan(0);
  });
});
