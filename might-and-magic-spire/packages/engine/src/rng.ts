// Seeded RNG — every run reproducible from a seed string.
//
// We hash the seed string into a 32-bit integer (xmur3) and drive a mulberry32
// generator from it. Both are tiny, well-understood, and produce the same
// stream on every platform — which is the whole point: a run is a pure function
// of its seed.

export interface Rng {
  /** The seed this generator was created from (for provenance / replay). */
  readonly seed: string;
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** Pick a uniformly-random element. Throws on empty input. */
  pick<T>(items: readonly T[]): T;
  /** Return a new array, shuffled (Fisher–Yates). Does not mutate input. */
  shuffle<T>(items: readonly T[]): T[];
  /** true with probability p (default 0.5). */
  chance(p?: number): boolean;
  /**
   * Fork a deterministic child generator namespaced by `label`. Lets distinct
   * subsystems (map gen, combat draws, reward rolls) draw from independent
   * streams so adding a draw in one place doesn't shift another.
   */
  fork(label: string): Rng;
}

/** xmur3 string hash → 32-bit seed. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 — a fast 32-bit PRNG with good statistical properties. */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string): Rng {
  const gen = mulberry32(hashSeed(seed));

  const rng: Rng = {
    seed,
    next: () => gen(),
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(gen() * (max - min + 1));
    },
    float(min, max) {
      return min + gen() * (max - min);
    },
    pick(items) {
      if (items.length === 0) throw new Error("rng.pick: empty array");
      return items[Math.floor(gen() * items.length)];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(gen() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    chance(p = 0.5) {
      return gen() < p;
    },
    fork(label) {
      return makeRng(`${seed}::${label}`);
    },
  };

  return rng;
}
