// @vitest-environment node
/**
 * `core/bits.ts` against brute-force set semantics (DESIGN §4.1; M4 gate:
 * "`bb*` ops equal brute-force set ops on 10,000 random masks").
 */
import { describe, expect, it } from 'vitest';
import {
  Scratch,
  bbAnd,
  bbAndNot,
  bbClear,
  bbCopy,
  bbCount,
  bbDilate,
  bbEquals,
  bbFirst,
  bbHas,
  bbIntersects,
  bbIsEmpty,
  bbNew,
  bbNext,
  bbOr,
  bbReserveSum,
  bbRing,
  bbSet,
  bbXor,
  bbZero,
  type BB,
} from '../../../src/ai/hard/core/bits';
import { seededRandom } from '../../../src/ai/runtime';
import { getAdjacentPositions } from '../../../src/game/board';

const SQUARES = 100;

function toSet(bb: BB): Set<number> {
  const out = new Set<number>();
  for (let s = 0; s < SQUARES; s++) if (bbHas(bb, s)) out.add(s);
  return out;
}

function fromSet(set: ReadonlySet<number>): BB {
  const bb = bbNew();
  for (const s of set) bbSet(bb, s);
  return bb;
}

function randomSet(rng: () => number): Set<number> {
  const density = rng();
  const out = new Set<number>();
  for (let s = 0; s < SQUARES; s++) if (rng() < density) out.add(s);
  return out;
}

function sortedList(set: ReadonlySet<number>): number[] {
  return [...set].sort((a, b) => a - b);
}

/** Brute-force dilate: the set plus every orthogonal neighbour, via the canonical adjacency. */
function bruteDilate(set: ReadonlySet<number>): Set<number> {
  const out = new Set<number>(set);
  for (const s of set) {
    for (const p of getAdjacentPositions({ x: s % 10, y: (s / 10) | 0 })) out.add(p.y * 10 + p.x);
  }
  return out;
}

describe('core/bits: representation', () => {
  it('a BB is 4 words with bits 100..127 always clear', () => {
    const bb = bbNew();
    expect(bb.length).toBe(4);
    for (let s = 0; s < SQUARES; s++) bbSet(bb, s);
    expect(bbCount(bb)).toBe(SQUARES);
    expect(bb[3] >>> 0).toBe(0x0000000f);
  });

  it('set/has/clear are exact for every square', () => {
    for (let s = 0; s < SQUARES; s++) {
      const bb = bbNew();
      expect(bbHas(bb, s)).toBe(false);
      bbSet(bb, s);
      expect(bbHas(bb, s)).toBe(true);
      expect(bbCount(bb)).toBe(1);
      expect(bbFirst(bb)).toBe(s);
      bbClear(bb, s);
      expect(bbIsEmpty(bb)).toBe(true);
      expect(bbFirst(bb)).toBe(-1);
    }
  });
});

describe('core/bits: 10,000 random masks vs brute-force set algebra', () => {
  it('or/and/andNot/xor/equals/isEmpty/intersects/count/first/next/copy/zero agree', () => {
    const rng = seededRandom(0x6d756a75);
    const d = bbNew();
    for (let trial = 0; trial < 10_000; trial++) {
      const sa = randomSet(rng);
      const sb = randomSet(rng);
      const a = fromSet(sa);
      const b = fromSet(sb);

      expect(sortedList(toSet(bbOr(d, a, b)))).toEqual(sortedList(new Set([...sa, ...sb])));
      expect(sortedList(toSet(bbAnd(d, a, b)))).toEqual(sortedList(new Set([...sa].filter(s => sb.has(s)))));
      expect(sortedList(toSet(bbAndNot(d, a, b)))).toEqual(sortedList(new Set([...sa].filter(s => !sb.has(s)))));
      const symmetric = new Set<number>([...[...sa].filter(s => !sb.has(s)), ...[...sb].filter(s => !sa.has(s))]);
      expect(sortedList(toSet(bbXor(d, a, b)))).toEqual(sortedList(symmetric));

      expect(bbCount(a)).toBe(sa.size);
      expect(bbIsEmpty(a)).toBe(sa.size === 0);
      expect(bbEquals(a, b)).toBe(sa.size === sb.size && [...sa].every(s => sb.has(s)));
      expect(bbIntersects(a, b)).toBe([...sa].some(s => sb.has(s)));

      const listed = sortedList(sa);
      expect(bbFirst(a)).toBe(listed.length === 0 ? -1 : listed[0]);
      const iterated: number[] = [];
      for (let s = bbNext(a, -1); s >= 0; s = bbNext(a, s)) iterated.push(s);
      expect(iterated).toEqual(listed);

      expect(bbEquals(bbCopy(d, a), a)).toBe(true);
      expect(bbIsEmpty(bbZero(d))).toBe(true);
    }
  });

  it('dilate and ring equal the canonical orthogonal neighbourhood', () => {
    const rng = seededRandom(0x44494c41);
    const d = bbNew();
    for (let trial = 0; trial < 2_000; trial++) {
      const sa = randomSet(rng);
      const a = fromSet(sa);
      const expected = bruteDilate(sa);
      expect(sortedList(toSet(bbDilate(d, a)))).toEqual(sortedList(expected));
      const ring = new Set([...expected].filter(s => !sa.has(s)));
      expect(sortedList(toSet(bbRing(d, a)))).toEqual(sortedList(ring));
    }
  });

  it('dilate never wraps a file: a1 and j1 keep their own edges', () => {
    const d = bbNew();
    // A1 (square 0) dilates to {0, 1, 10} only.
    expect(sortedList(toSet(bbDilate(d, fromSet(new Set([0])))))).toEqual([0, 1, 10]);
    // J1 (square 9, x = 9) must not reach square 10 (A2).
    expect(sortedList(toSet(bbDilate(d, fromSet(new Set([9])))))).toEqual([8, 9, 19]);
    // A2 (square 10, x = 0) must not reach square 9.
    expect(sortedList(toSet(bbDilate(d, fromSet(new Set([10])))))).toEqual([0, 10, 11, 20]);
    // J10 (square 99) is the far corner.
    expect(sortedList(toSet(bbDilate(d, fromSet(new Set([99])))))).toEqual([89, 98, 99]);
  });

  it('dilate is idempotent on the full board and aliasing-safe', () => {
    const full = bbNew();
    for (let s = 0; s < SQUARES; s++) bbSet(full, s);
    const d = bbNew();
    expect(bbEquals(bbDilate(d, full), full)).toBe(true);
    const inPlace = fromSet(new Set([44]));
    bbDilate(inPlace, inPlace);
    expect(sortedList(toSet(inPlace))).toEqual([34, 43, 44, 45, 54]);
  });

  it('bbReserveSum sums the reserve of exactly the set squares', () => {
    const rng = seededRandom(0x52455356);
    const reserve = new Uint8Array(SQUARES);
    for (let s = 0; s < SQUARES; s++) reserve[s] = Math.floor(rng() * 17);
    for (let trial = 0; trial < 500; trial++) {
      const set = randomSet(rng);
      let expected = 0;
      for (const s of set) expected += reserve[s];
      expect(bbReserveSum(fromSet(set), reserve)).toBe(expected);
    }
  });
});

describe('core/bits: Scratch', () => {
  it('hands out stable, zeroed, per-(ply, index) buffers', () => {
    const sc = new Scratch(4, 3, 2);
    const a = sc.bb(2, 1);
    expect(sc.bb(2, 1)).toBe(a);
    expect(sc.bb(2, 0)).not.toBe(a);
    expect(sc.bb(1, 1)).not.toBe(a);
    expect(bbIsEmpty(a)).toBe(true);
    bbSet(a, 7);
    expect(bbHas(sc.bb(2, 1), 7)).toBe(true);

    expect(sc.i8(0, 0).length).toBe(100);
    expect(sc.i32(0, 0).length).toBe(256);
    expect(sc.i8(3, 1)).toBe(sc.i8(3, 1));
    expect(sc.i32(3, 1)).toBe(sc.i32(3, 1));
  });

  it('i32PerPly defaults to i8PerPly and out-of-range access throws', () => {
    const sc = new Scratch(2, 1, 2);
    expect(sc.i32PerPly).toBe(2);
    expect(() => sc.bb(2, 0)).toThrow(RangeError);
    expect(() => sc.bb(0, 1)).toThrow(RangeError);
    expect(() => sc.i8(0, 2)).toThrow(RangeError);
    expect(() => sc.i32(0, 2)).toThrow(RangeError);
    expect(() => new Scratch(0, 1, 1)).toThrow(RangeError);
    expect(new Scratch(2, 1, 1, 5).i32PerPly).toBe(5);
  });
});
