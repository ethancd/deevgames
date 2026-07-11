/**
 * EMBER — seeded PRNG (src/core/rng.ts).
 *
 * mulberry32 generator wrapped to satisfy the pinned `Rng` interface in
 * src/core/types.ts. This is the ONLY source of randomness permitted
 * anywhere in src/{sim,body,skills,pilot,scenarios,engine}.
 *
 * fork() scheme (documented per PLAN/CLAUDE instructions):
 *   Each Rng instance remembers its own ORIGINAL 32-bit seed (not its
 *   mutable internal state). fork(label) hashes `label` with FNV-1a into a
 *   32-bit integer, then mixes that hash with the instance's ORIGINAL seed
 *   (via Math.imul + xor) to produce the child's seed, and constructs a
 *   fresh, independent mulberry32 stream from it.
 *
 *   Because the child seed is derived from the PARENT'S ORIGINAL SEED and
 *   the LABEL ONLY — never from how many times next()/int() has been called
 *   on the parent — fork(label) is stable: calling rng.fork('wolf') before
 *   or after any number of rng.next() draws always yields a stream that
 *   produces the identical sequence. This is what makes forked streams
 *   "label-stable" rather than fragile to draw order across subsystems.
 */

import type { Rng } from './types';

/** FNV-1a 32-bit hash of a string, used to fold fork labels into seeds. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine a 32-bit seed and a 32-bit label hash into a new 32-bit seed. */
function mixSeed(seed: number, labelHash: number): number {
  let h = (seed ^ labelHash) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

class Mulberry32Rng implements Rng {
  /** Original seed this stream was constructed from — used for fork(),
   *  never mutated, so fork() output never depends on draw history. */
  private readonly originSeed: number;
  /** Mutable generator state, advanced by next(). */
  private state: number;

  constructor(seed: number) {
    this.originSeed = seed >>> 0;
    this.state = this.originSeed;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n: number): number {
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(this.next() * n);
  }

  fork(label: string): Rng {
    const labelHash = fnv1a(label);
    const childSeed = mixSeed(this.originSeed, labelHash);
    return new Mulberry32Rng(childSeed);
  }
}

/** Construct a seeded Rng. Same seed always produces the same stream. */
export function createRng(seed: number): Rng {
  return new Mulberry32Rng(seed);
}
