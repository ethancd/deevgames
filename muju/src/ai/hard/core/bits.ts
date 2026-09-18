/**
 * 100-square bitboards (DESIGN §4.1). A `BB` is always a `Uint32Array` of
 * length 4 whose bits 100..127 are zero; square `s` lives in word `s >>> 5`
 * at bit `s & 31`, so ascending bit order is ascending square order
 * (`sq = y*10 + x`, DESIGN §3.1).
 *
 * Every binary operator writes into a caller-supplied destination and returns
 * it, so the hot path never allocates. `d` may alias `a` and/or `b`.
 */
import type { Square } from '../types';

export type BB = Uint32Array;

const WORDS = 4;
const BOARD_SQUARES = 100;

/** Words of the 0..99 mask; bits 100..127 are never set. */
const FULL_0 = 0xffffffff;
const FULL_1 = 0xffffffff;
const FULL_2 = 0xffffffff;
const FULL_3 = 0x0000000f;

function maskWhere(pred: (s: Square) => boolean): Uint32Array {
  const m = new Uint32Array(WORDS);
  for (let s = 0; s < BOARD_SQUARES; s++) if (pred(s)) m[s >>> 5] |= 1 << (s & 31);
  return m;
}

/** Squares whose x is not 9: safe to shift east (+1) without wrapping files. */
const NOT_FILE_E = maskWhere(s => s % 10 !== 9);
/** Squares whose x is not 0: safe to shift west (-1) without wrapping files. */
const NOT_FILE_W = maskWhere(s => s % 10 !== 0);

const NOT_FILE_E_0 = NOT_FILE_E[0], NOT_FILE_E_1 = NOT_FILE_E[1], NOT_FILE_E_2 = NOT_FILE_E[2], NOT_FILE_E_3 = NOT_FILE_E[3];
const NOT_FILE_W_0 = NOT_FILE_W[0], NOT_FILE_W_1 = NOT_FILE_W[1], NOT_FILE_W_2 = NOT_FILE_W[2], NOT_FILE_W_3 = NOT_FILE_W[3];

export function bbNew(): BB {
  return new Uint32Array(WORDS);
}

export function bbZero(d: BB): BB {
  d[0] = 0; d[1] = 0; d[2] = 0; d[3] = 0;
  return d;
}

export function bbCopy(d: BB, a: BB): BB {
  d[0] = a[0]; d[1] = a[1]; d[2] = a[2]; d[3] = a[3];
  return d;
}

export function bbSet(d: BB, sq: Square): BB {
  d[sq >>> 5] |= 1 << (sq & 31);
  return d;
}

export function bbClear(d: BB, sq: Square): BB {
  d[sq >>> 5] &= ~(1 << (sq & 31));
  return d;
}

export function bbHas(a: BB, sq: Square): boolean {
  return (a[sq >>> 5] & (1 << (sq & 31))) !== 0;
}

export function bbOr(d: BB, a: BB, b: BB): BB {
  d[0] = a[0] | b[0]; d[1] = a[1] | b[1]; d[2] = a[2] | b[2]; d[3] = a[3] | b[3];
  return d;
}

export function bbAnd(d: BB, a: BB, b: BB): BB {
  d[0] = a[0] & b[0]; d[1] = a[1] & b[1]; d[2] = a[2] & b[2]; d[3] = a[3] & b[3];
  return d;
}

/** `d = a & ~b`. */
export function bbAndNot(d: BB, a: BB, b: BB): BB {
  d[0] = a[0] & ~b[0]; d[1] = a[1] & ~b[1]; d[2] = a[2] & ~b[2]; d[3] = a[3] & ~b[3];
  return d;
}

export function bbXor(d: BB, a: BB, b: BB): BB {
  d[0] = a[0] ^ b[0]; d[1] = a[1] ^ b[1]; d[2] = a[2] ^ b[2]; d[3] = a[3] ^ b[3];
  return d;
}

export function bbEquals(a: BB, b: BB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export function bbIsEmpty(a: BB): boolean {
  return (a[0] | a[1] | a[2] | a[3]) === 0;
}

export function bbIntersects(a: BB, b: BB): boolean {
  return ((a[0] & b[0]) | (a[1] & b[1]) | (a[2] & b[2]) | (a[3] & b[3])) !== 0;
}

function popcount32(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(v, 0x01010101) >>> 24);
}

export function bbCount(a: BB): number {
  return popcount32(a[0] | 0) + popcount32(a[1] | 0) + popcount32(a[2] | 0) + popcount32(a[3] | 0);
}

/** Lowest set square, or -1 when empty. */
export function bbFirst(a: BB): number {
  for (let w = 0; w < WORDS; w++) {
    const word = a[w] | 0;
    if (word !== 0) return (w << 5) + (31 - Math.clz32(word & -word));
  }
  return -1;
}

/**
 * Next set square strictly greater than `after`, or -1. `after = -1` yields
 * `bbFirst`, so the idiom is
 * `for (let s = bbNext(m, -1); s >= 0; s = bbNext(m, s)) { ... }`.
 */
export function bbNext(a: BB, after: number): number {
  const from = after + 1;
  if (from >= 128) return -1;
  let w = from >>> 5;
  let word = (a[w] | 0) & (from & 31 ? (-1 << (from & 31)) : -1);
  while (true) {
    if (word !== 0) return (w << 5) + (31 - Math.clz32(word & -word));
    if (++w >= WORDS) return -1;
    word = a[w] | 0;
  }
}

/** `d = a | north | south | east | west`, file-wrap masked and clipped to 0..99. */
export function bbDilate(d: BB, a: BB): BB {
  const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];

  // north = a >>> 10 (square - 10), south = a << 10 (square + 10)
  const n0 = (a0 >>> 10) | (a1 << 22);
  const n1 = (a1 >>> 10) | (a2 << 22);
  const n2 = (a2 >>> 10) | (a3 << 22);
  const n3 = a3 >>> 10;

  const s3 = (a3 << 10) | (a2 >>> 22);
  const s2 = (a2 << 10) | (a1 >>> 22);
  const s1 = (a1 << 10) | (a0 >>> 22);
  const s0 = a0 << 10;

  // east = (a & NOT_FILE_E) << 1, west = (a & NOT_FILE_W) >>> 1
  const e0src = a0 & NOT_FILE_E_0, e1src = a1 & NOT_FILE_E_1, e2src = a2 & NOT_FILE_E_2, e3src = a3 & NOT_FILE_E_3;
  const e3 = (e3src << 1) | (e2src >>> 31);
  const e2 = (e2src << 1) | (e1src >>> 31);
  const e1 = (e1src << 1) | (e0src >>> 31);
  const e0 = e0src << 1;

  const w0src = a0 & NOT_FILE_W_0, w1src = a1 & NOT_FILE_W_1, w2src = a2 & NOT_FILE_W_2, w3src = a3 & NOT_FILE_W_3;
  const w0 = (w0src >>> 1) | (w1src << 31);
  const w1 = (w1src >>> 1) | (w2src << 31);
  const w2 = (w2src >>> 1) | (w3src << 31);
  const w3 = w3src >>> 1;

  d[0] = (a0 | n0 | s0 | e0 | w0) & FULL_0;
  d[1] = (a1 | n1 | s1 | e1 | w1) & FULL_1;
  d[2] = (a2 | n2 | s2 | e2 | w2) & FULL_2;
  d[3] = (a3 | n3 | s3 | e3 | w3) & FULL_3;
  return d;
}

/** `d = dilate(a) & ~a`: the orthogonal ring around `a`. */
export function bbRing(d: BB, a: BB): BB {
  const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
  bbDilate(d, a);
  d[0] &= ~a0; d[1] &= ~a1; d[2] &= ~a2; d[3] &= ~a3;
  return d;
}

/** Σ `reserve[sq]` over the set squares of `a`. */
export function bbReserveSum(a: BB, reserve: Uint8Array): number {
  let sum = 0;
  for (let s = bbNext(a, -1); s >= 0; s = bbNext(a, s)) sum += reserve[s];
  return sum;
}

/**
 * Per-ply pool of stable, zeroed buffers. "Stable" means the same `(ply, i)`
 * always yields the same object for the pool's lifetime; buffers are zeroed
 * once at construction, never on access, so callers that need a clean slate
 * call `bbZero`/`fill(0)` themselves.
 *
 * DESIGN §4.1 gives the constructor three parameters; `i32PerPly` is an
 * optional fourth that defaults to `i8PerPly` (see DEVIATIONS under M4).
 */
export class Scratch {
  readonly maxPly: number;
  readonly bbPerPly: number;
  readonly i8PerPly: number;
  readonly i32PerPly: number;
  private readonly bbs: BB[];
  private readonly i8s: Int8Array[];
  private readonly i32s: Int32Array[];

  constructor(maxPly: number, bbPerPly: number, i8PerPly: number, i32PerPly: number = i8PerPly) {
    if (maxPly <= 0 || bbPerPly < 0 || i8PerPly < 0 || i32PerPly < 0) {
      throw new RangeError(`Scratch: bad dimensions ${maxPly}/${bbPerPly}/${i8PerPly}/${i32PerPly}`);
    }
    this.maxPly = maxPly;
    this.bbPerPly = bbPerPly;
    this.i8PerPly = i8PerPly;
    this.i32PerPly = i32PerPly;
    this.bbs = new Array<BB>(maxPly * bbPerPly);
    for (let i = 0; i < this.bbs.length; i++) this.bbs[i] = new Uint32Array(WORDS);
    this.i8s = new Array<Int8Array>(maxPly * i8PerPly);
    for (let i = 0; i < this.i8s.length; i++) this.i8s[i] = new Int8Array(BOARD_SQUARES);
    this.i32s = new Array<Int32Array>(maxPly * i32PerPly);
    for (let i = 0; i < this.i32s.length; i++) this.i32s[i] = new Int32Array(256);
  }

  bb(ply: number, i: number): BB {
    if (ply < 0 || ply >= this.maxPly || i < 0 || i >= this.bbPerPly) {
      throw new RangeError(`Scratch.bb(${ply}, ${i}) out of range (${this.maxPly}x${this.bbPerPly})`);
    }
    return this.bbs[ply * this.bbPerPly + i];
  }

  /** length 100. */
  i8(ply: number, i: number): Int8Array {
    if (ply < 0 || ply >= this.maxPly || i < 0 || i >= this.i8PerPly) {
      throw new RangeError(`Scratch.i8(${ply}, ${i}) out of range (${this.maxPly}x${this.i8PerPly})`);
    }
    return this.i8s[ply * this.i8PerPly + i];
  }

  /** length 256. */
  i32(ply: number, i: number): Int32Array {
    if (ply < 0 || ply >= this.maxPly || i < 0 || i >= this.i32PerPly) {
      throw new RangeError(`Scratch.i32(${ply}, ${i}) out of range (${this.maxPly}x${this.i32PerPly})`);
    }
    return this.i32s[ply * this.i32PerPly + i];
  }
}
