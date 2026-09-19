// @vitest-environment node
/**
 * Regression test for a `DirectMappedDistanceCache.get` bug that predates the
 * Phasing port (it is on master too, `core/movement.ts:346-373` pre-fix).
 *
 * `get` validated a cache hit with only `this.keyOrigin[index] === origin &&
 * this.keyHash[index] === hash`, where `hash = p.occHash | 0`. `occHash` is a
 * 32-bit XOR fold over occupied squares (`recomputeOccHash`,
 * `core/zobrist.ts`: XORs `Z.piece[zPiece(0, 0, s)]` lane 0 per occupied
 * square, owner/def independent). Being a 32-bit XOR fold, it is LINEAR over
 * GF(2) and therefore collides: two different occupancies can share one, and
 * when they land in the same direct-mapped slot (same `occHash`, same
 * `origin`) the cache used to hand back the WRONG BFS distance row. That made
 * `Replica.genActions`/`isLegal(MOVE)` impure — a query could return a stale
 * answer computed for a DIFFERENT board.
 *
 * The fix (this file pins it) makes `get` verify the full occupancy (all four
 * `p.occ` words) on every hit, exactly the way `MemoTable.load`/`store` in the
 * same file already verify the reach memo's whole key rather than a hash of
 * it.
 *
 * This file finds an actual collision with NO randomness: `occHash` is linear
 * over GF(2) (XOR of one 32-bit word per occupied square), so a nonempty
 * subset of squares whose words XOR to zero is found by plain Gaussian
 * elimination over a fixed candidate list, in a fixed elimination order. Any
 * such subset `T`, occupied in one state and empty in another (with the same
 * mover on the same origin square in both), gives two occupancies with equal
 * `occHash` and different `occ` words.
 */
import { describe, expect, it, vi } from 'vitest';
import { AKind, paA, paB, paKind } from '../../../src/ai/hard/core/action';
import { bfsFrom, createDistanceCache } from '../../../src/ai/hard/core/movement';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { Z, zPiece } from '../../../src/ai/hard/core/zobrist';
import { buildState } from './game-fixture';

vi.setConfig({ testTimeout: 10_000 });

// --- deterministic GF(2) dependency search -----------------------------------

/** Index of the highest set bit of a 32-bit value, or -1 if it is zero. */
function highestBit(v: number): number {
  if (v === 0) return -1;
  return 31 - Math.clz32(v);
}

/**
 * Standard Gaussian elimination over GF(2), tracking which original vectors
 * combine (by XOR) to each reduced row. `vectors` is processed in a FIXED
 * order; the first row that fully reduces to zero against earlier pivots
 * names a nonempty dependency, returned as the list of indices into
 * `vectors` whose XOR is zero. With 33 32-bit vectors there are only 32
 * possible pivot slots, so a dependency is always found (pigeonhole) — no
 * randomness anywhere in this process.
 */
function findGf2Dependency(vectors: readonly number[]): number[] {
  const pivotValue = new Map<number, number>();
  const pivotCombo = new Map<number, bigint>();
  for (let i = 0; i < vectors.length; i++) {
    let v = vectors[i];
    let combo = 1n << BigInt(i);
    let placed = false;
    for (;;) {
      const bit = highestBit(v);
      if (bit < 0) break;
      const pv = pivotValue.get(bit);
      if (pv === undefined) {
        pivotValue.set(bit, v);
        pivotCombo.set(bit, combo);
        placed = true;
        break;
      }
      v = v ^ pv;
      combo = combo ^ (pivotCombo.get(bit) as bigint);
    }
    if (!placed && v === 0) {
      const indices: number[] = [];
      for (let b = 0; b < vectors.length; b++) {
        if ((combo & (1n << BigInt(b))) !== 0n) indices.push(b);
      }
      return indices;
    }
  }
  throw new Error('findGf2Dependency: no dependency among the candidates (widen the candidate list)');
}

/** The mover's square: excluded from every candidate list below. */
const ORIGIN = 0;

/** 33 candidate squares (rows 5-8), none of them `ORIGIN`: guarantees (by
 * pigeonhole, 33 vectors over a 32-dim space) a nonempty GF(2) dependency. */
const CANDIDATES: readonly number[] = (() => {
  const out: number[] = [];
  for (let s = 50; s <= 82; s++) out.push(s);
  return out;
})();

/** `Z.piece[zPiece(0, 0, s)]` for each candidate square — exactly the per-square
 * word `recomputeOccHash` XORs together. */
const CANDIDATE_WORDS: readonly number[] = CANDIDATES.map(s => Z.piece[zPiece(0, 0, s)]);

const DEPENDENCY_INDICES = findGf2Dependency(CANDIDATE_WORDS);
/** The colliding wall: occupying exactly these squares does not move `occHash`
 * (their words XOR to zero), yet they are real, distinct occupied squares. */
const WALL_SQUARES: readonly number[] = DEPENDENCY_INDICES.map(i => CANDIDATES[i]);

function squareToXY(s: number): { x: number; y: number } {
  return { x: s % 10, y: (s / 10) | 0 };
}

describe('DirectMappedDistanceCache: occHash collision (pre-Phasing bug)', () => {
  it('the candidate search actually produced a nontrivial GF(2) dependency', () => {
    expect(WALL_SQUARES.length).toBeGreaterThan(0);
    // Distinct squares, all drawn from the candidate list, none the origin.
    expect(new Set(WALL_SQUARES).size).toBe(WALL_SQUARES.length);
    for (const s of WALL_SQUARES) {
      expect(CANDIDATES).toContain(s);
      expect(s).not.toBe(ORIGIN);
    }
    // The defining property: XOR of the selected words is exactly zero.
    let xor = 0;
    for (const s of WALL_SQUARES) xor ^= Z.piece[zPiece(0, 0, s)];
    expect(xor).toBe(0);
  });

  // State A: the mover plus a "wall" of enemy units on `WALL_SQUARES`.
  const stateA = buildState({
    units: [
      { def: 'lightning_3', owner: 'white', ...squareToXY(ORIGIN) },
      ...WALL_SQUARES.map(s => ({ def: 'water_1', owner: 'black' as const, ...squareToXY(s) })),
    ],
  });
  // State B: the same mover, same square, board otherwise EMPTY.
  const stateB = buildState({
    units: [{ def: 'lightning_3', owner: 'white', ...squareToXY(ORIGIN) }],
  });

  it('two different occupancies really do share one occHash', () => {
    const replica = new Replica();
    const pA = replica.pack(stateA, allocState());
    const pB = replica.pack(stateB, allocState());

    expect(pA.occHash).toBe(pB.occHash);
    // Different occupancies: A has WALL_SQUARES.length extra occupied squares.
    expect([...pA.occ]).not.toEqual([...pB.occ]);
    for (const s of WALL_SQUARES) {
      const word = s >>> 5;
      const bit = 1 << (s & 31);
      expect(pA.occ[word] & bit).not.toBe(0);
      expect(pB.occ[word] & bit).toBe(0);
    }
  });

  it('the true BFS distance rows from the shared origin genuinely differ', () => {
    const replica = new Replica();
    const pA = replica.pack(stateA, allocState());
    const pB = replica.pack(stateB, allocState());

    const distA = new Int8Array(100);
    const distB = new Int8Array(100);
    bfsFrom(pA.occ, ORIGIN, distA);
    bfsFrom(pB.occ, ORIGIN, distB);

    // Every wall square is unreachable (occupied) under A, but open (and, on
    // the wide-open board of B, always reachable) under B.
    for (const s of WALL_SQUARES) {
      expect(distA[s]).toBe(-1);
      expect(distB[s]).toBeGreaterThan(0);
    }
    expect([...distA]).not.toEqual([...distB]);
  });

  it('a single shared DistanceCache returns the CORRECT row for both, queried one after the other', () => {
    const replica = new Replica();
    const pA = replica.pack(stateA, allocState());
    const pB = replica.pack(stateB, allocState());

    const truthA = new Int8Array(100);
    const truthB = new Int8Array(100);
    bfsFrom(pA.occ, ORIGIN, truthA);
    bfsFrom(pB.occ, ORIGIN, truthB);

    // pA and pB share `occHash` and the query uses the same `origin`, so the
    // direct-mapped index the cache computes is IDENTICAL for both calls —
    // this is what makes the bug's stale-hit path reachable at all.
    const cache = createDistanceCache();
    const gotA = [...cache.get(pA, ORIGIN)]; // copy immediately: the cache
    const gotB = [...cache.get(pB, ORIGIN)]; // reuses the slot's array in place.

    // Before the fix: `gotB` would equal `gotA` (a false hit on A's stale
    // row) instead of the correct, different `truthB`.
    expect(gotA).toEqual([...truthA]);
    expect(gotB).toEqual([...truthB]);
    expect(gotB).not.toEqual(gotA);
  });

  it('Replica.genActions MOVE destinations for the mover differ between the two states', () => {
    // One Replica -> one shared `dist` cache, exactly like a real search reuses
    // its `NodeTables`' cache across positions with the same occHash/origin.
    const replica = new Replica();
    const pA = replica.pack(stateA, allocState());
    const pB = replica.pack(stateB, allocState());

    const outA = new Int32Array(300);
    const nA = replica.genActions(pA, outA);
    const outB = new Int32Array(300);
    const nB = replica.genActions(pB, outB);

    const destinationsOf = (out: Int32Array, n: number): Set<number> => {
      const dests = new Set<number>();
      for (let i = 0; i < n; i++) {
        if (paKind(out[i]) === AKind.MOVE && paA(out[i]) === 0) dests.add(paB(out[i]));
      }
      return dests;
    };
    const movesA = destinationsOf(outA, nA);
    const movesB = destinationsOf(outB, nB);

    // Every wall square is a legal MOVE destination with the board empty (B)
    // and never a legal MOVE destination with a unit sitting on it (A).
    for (const s of WALL_SQUARES) {
      expect(movesA.has(s)).toBe(false);
      expect(movesB.has(s)).toBe(true);
    }
  });
});
