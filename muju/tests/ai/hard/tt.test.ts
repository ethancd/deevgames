// @vitest-environment node
/**
 * `search/tt.ts` (DESIGN §4.16, §5.11.3): the macro transposition table, its
 * replacement policy, the mate-score re-basing, and the proof cache.
 *
 * The sharp tests here are the ones the search depends on for CORRECTNESS
 * rather than speed: `scoreToTT`/`scoreFromTT` must preserve mate DISTANCE
 * across plies (a mate-in-2 read at a different ply is still a mate-in-2), and
 * `usable()` must admit a stored score only when it is the value the current
 * search would have computed — which is what makes M14's gate clause
 * `bench.ttOnOffScoreMismatch === 0` reachable at all.
 */
import { describe, expect, it } from 'vitest';
import { MATE_PLY_CC, WIN_CC } from '../../../src/ai/hard/types';
import {
  Bound,
  MATE_BOUND_CC,
  ProofCache,
  ProofValue,
  TranspositionTable,
  newTTEntry,
  scoreFromTT,
  scoreToTT,
  usable,
} from '../../../src/ai/hard/search/tt';

describe('scoreToTT / scoreFromTT', () => {
  it('leaves ordinary scores alone', () => {
    for (const score of [0, 1, -1, 12_345, -600_000, MATE_BOUND_CC - 1]) {
      expect(scoreToTT(score, 7)).toBe(score);
      expect(scoreFromTT(score, 7)).toBe(score);
    }
  });

  it('is an exact round trip at every ply', () => {
    for (let ply = 0; ply < 12; ply++) {
      for (const score of [WIN_CC - ply * MATE_PLY_CC, -(WIN_CC - ply * MATE_PLY_CC), 0, 4_200]) {
        expect(scoreFromTT(scoreToTT(score, ply), ply)).toBe(score);
      }
    }
  });

  it('preserves mate DISTANCE when the entry is read at a different ply', () => {
    // A mate found five plies from the root is "three more plies" away from a
    // node at ply 2. Storing at 5 and reading at 2 must say exactly that.
    const atPly5 = WIN_CC - 5 * MATE_PLY_CC;
    const stored = scoreToTT(atPly5, 5);
    expect(scoreFromTT(stored, 2)).toBe(WIN_CC - 2 * MATE_PLY_CC);
    const lossAtPly5 = -(WIN_CC - 5 * MATE_PLY_CC);
    expect(scoreFromTT(scoreToTT(lossAtPly5, 5), 2)).toBe(-(WIN_CC - 2 * MATE_PLY_CC));
  });
});

describe('usable', () => {
  const entry = (bound: number, depth: number, scoreCc: number) => ({ ...newTTEntry(), bound, depth, scoreCc });

  it('never uses an entry shallower than the request', () => {
    expect(usable(entry(Bound.EXACT, 2, 100), 3, -1000, 1000)).toBe(false);
    expect(usable(entry(Bound.LOWER, 2, 5000), 3, -1000, 1000)).toBe(false);
  });

  it('uses EXACT at this depth or deeper (DESIGN §5.11.2)', () => {
    expect(usable(entry(Bound.EXACT, 3, 100), 3, -1000, 1000)).toBe(true);
    // "if tt.depth >= depth and bound usable: return scoreFromTT" — a deeper
    // EXACT value is the value of a search at least as deep, and it is the
    // largest single source of TT cutoffs.
    expect(usable(entry(Bound.EXACT, 5, 100), 3, -1000, 1000)).toBe(true);
  });

  it('narrows EXACT to the same depth for the TT-on/off comparison arm', () => {
    // A depth-3 search that returns a depth-5 value is no longer a depth-3
    // search, so `bench --calibrate --tt-check` runs BOTH arms this way
    // (`search/tt.ts`'s header). The shipped search leaves the flag off.
    expect(usable(entry(Bound.EXACT, 3, 100), 3, -1000, 1000, true)).toBe(true);
    expect(usable(entry(Bound.EXACT, 5, 100), 3, -1000, 1000, true)).toBe(false);
    // The narrowing touches EXACT only: a deeper bound on the far side of the
    // window is a cutoff either way.
    expect(usable(entry(Bound.LOWER, 5, 5000), 3, -1000, 1000, true)).toBe(true);
    expect(usable(entry(Bound.UPPER, 5, -5000), 3, -1000, 1000, true)).toBe(true);
  });

  it('uses a bound only on the far side of the window', () => {
    expect(usable(entry(Bound.LOWER, 4, 5000), 3, -1000, 1000)).toBe(true);
    expect(usable(entry(Bound.LOWER, 4, 500), 3, -1000, 1000)).toBe(false);
    expect(usable(entry(Bound.UPPER, 4, -5000), 3, -1000, 1000)).toBe(true);
    expect(usable(entry(Bound.UPPER, 4, -500), 3, -1000, 1000)).toBe(false);
  });
});

describe('TranspositionTable', () => {
  it('stores and probes a round trip', () => {
    const tt = new TranspositionTable(10);
    const out = newTTEntry();
    expect(tt.probe(0x1234, 0xabcd, out)).toBe(false);
    tt.store(0x1234, 0xabcd, 4_200, 5, Bound.EXACT, 0xdeadbeef, 0);
    expect(tt.probe(0x1234, 0xabcd, out)).toBe(true);
    expect(out.scoreCc).toBe(4_200);
    expect(out.depth).toBe(5);
    expect(out.bound).toBe(Bound.EXACT);
    expect(out.bestEndLo >>> 0).toBe(0xdeadbeef);
    expect(tt.hits).toBe(1);
    expect(tt.probes).toBe(2);
  });

  it('records the prover mode the value was computed under (DESIGN §5.11.4)', () => {
    // A value computed at a scout node under the admissible bound is a
    // different quantity from one computed under the full prover — the bound can
    // only UNDER-claim a corner mate — so the entry has to say which it is, or a
    // transposition hands a PV node a value it was never allowed to reuse.
    const tt = new TranspositionTable(10);
    const out = newTTEntry();
    tt.store(0x11, 0x22, 100, 3, Bound.EXACT, 0, 0, true);
    expect(tt.probe(0x11, 0x22, out)).toBe(true);
    expect(out.boundProver).toBe(true);
    tt.store(0x33, 0x44, 100, 3, Bound.EXACT, 0, 0, false);
    expect(tt.probe(0x33, 0x44, out)).toBe(true);
    expect(out.boundProver).toBe(false);
    // The bit must not disturb the meta word's other fields.
    expect(out.depth).toBe(3);
    expect(out.bound).toBe(Bound.EXACT);
    // Default: a store that says nothing means the full prover.
    tt.store(0x55, 0x66, 100, 7, Bound.LOWER, 0, 0);
    expect(tt.probe(0x55, 0x66, out)).toBe(true);
    expect(out.boundProver).toBe(false);
    expect(out.depth).toBe(7);
    expect(out.bound).toBe(Bound.LOWER);
  });

  it('a slot that was never written reads as a miss, not as depth 0', () => {
    const tt = new TranspositionTable(8);
    const out = newTTEntry();
    for (let i = 0; i < 64; i++) expect(tt.probe(i, 0, out)).toBe(false);
  });

  it('refuses to demote a deeper EXACT entry of the same generation to a bound', () => {
    const tt = new TranspositionTable(10);
    const out = newTTEntry();
    tt.store(7, 9, 1_000, 8, Bound.EXACT, 111, 0);
    tt.store(7, 9, -5_000, 3, Bound.LOWER, 222, 0);
    expect(tt.probe(7, 9, out)).toBe(true);
    expect(out.scoreCc).toBe(1_000);
    expect(out.depth).toBe(8);
    expect(out.bound).toBe(Bound.EXACT);
  });

  it('replaces the same position with a deeper entry', () => {
    const tt = new TranspositionTable(10);
    const out = newTTEntry();
    tt.store(7, 9, 1_000, 3, Bound.EXACT, 111, 0);
    tt.store(7, 9, 2_000, 6, Bound.EXACT, 222, 0);
    expect(tt.probe(7, 9, out)).toBe(true);
    expect(out.depth).toBe(6);
    expect(out.scoreCc).toBe(2_000);
  });

  it('an entry from an older generation always loses its slot', () => {
    // A bucket holds four entries; fill it, then age the table and store five
    // more keys that land in the same bucket. Every old entry must be gone.
    const bits = 6; // 64 entries, 16 buckets
    const tt = new TranspositionTable(bits);
    const out = newTTEntry();
    const buckets = (1 << bits) / 4;
    const sameBucket = (n: number): number => n * buckets; // identical bucket index
    for (let i = 0; i < 4; i++) tt.store(sameBucket(i), 100 + i, 9_000, 12, Bound.EXACT, i, 0);
    tt.newSearch();
    for (let i = 0; i < 4; i++) tt.store(sameBucket(i + 4), 200 + i, 1, 1, Bound.EXACT, i, 0);
    for (let i = 0; i < 4; i++) expect(tt.probe(sameBucket(i), 100 + i, out)).toBe(false);
    for (let i = 0; i < 4; i++) expect(tt.probe(sameBucket(i + 4), 200 + i, out)).toBe(true);
  });

  it('within one generation the shallowest entry loses', () => {
    const bits = 6;
    const tt = new TranspositionTable(bits);
    const out = newTTEntry();
    const buckets = (1 << bits) / 4;
    const depths = [9, 3, 7, 11];
    for (let i = 0; i < 4; i++) tt.store(i * buckets, 500 + i, 1_000 + i, depths[i], Bound.EXACT, i, 0);
    tt.store(4 * buckets, 999, 42, 5, Bound.EXACT, 4, 0);
    // The depth-3 entry is the one that went.
    expect(tt.probe(1 * buckets, 501, out)).toBe(false);
    expect(tt.probe(0 * buckets, 500, out)).toBe(true);
    expect(tt.probe(2 * buckets, 502, out)).toBe(true);
    expect(tt.probe(3 * buckets, 503, out)).toBe(true);
    expect(tt.probe(4 * buckets, 999, out)).toBe(true);
  });

  it('stores a mate score ply-independently', () => {
    const tt = new TranspositionTable(10);
    const out = newTTEntry();
    const mateAtPly4 = WIN_CC - 4 * MATE_PLY_CC;
    tt.store(1, 2, mateAtPly4, 3, Bound.EXACT, 0, 4);
    expect(tt.probe(1, 2, out)).toBe(true);
    expect(scoreFromTT(out.scoreCc, 4)).toBe(mateAtPly4);
    expect(scoreFromTT(out.scoreCc, 1)).toBe(WIN_CC - MATE_PLY_CC);
  });

  it('clear() empties the table and the counters', () => {
    const tt = new TranspositionTable(8);
    const out = newTTEntry();
    tt.store(3, 4, 5, 6, Bound.EXACT, 7, 0);
    tt.clear();
    expect(tt.probe(3, 4, out)).toBe(false);
    expect(tt.hits).toBe(0);
  });

  it('rejects impossible sizes', () => {
    expect(() => new TranspositionTable(1)).toThrow(RangeError);
    expect(() => new TranspositionTable(30)).toThrow(RangeError);
  });
});

describe('ProofCache', () => {
  it('distinguishes "nothing here" from a stored UNKNOWN', () => {
    const cache = new ProofCache(8);
    expect(cache.get(5, 6)).toBe(ProofValue.UNKNOWN);
    cache.put(5, 6, ProofValue.DISPROVEN);
    expect(cache.get(5, 6)).toBe(ProofValue.DISPROVEN);
    cache.put(5, 6, ProofValue.UNKNOWN);
    expect(cache.get(5, 6)).toBe(ProofValue.UNKNOWN);
  });

  it('is keyed on the full 64-bit key, not the index alone', () => {
    const cache = new ProofCache(8);
    cache.put(1, 111, ProofValue.MATE);
    expect(cache.get(1, 111)).toBe(ProofValue.MATE);
    expect(cache.get(1, 222)).toBe(ProofValue.UNKNOWN);
  });

  it('clear() drops every verdict', () => {
    const cache = new ProofCache(8);
    cache.put(2, 3, ProofValue.RESCUE);
    cache.clear();
    expect(cache.get(2, 3)).toBe(ProofValue.UNKNOWN);
  });
});
