/**
 * Seeded PRNG utilities for the balance lab.
 * mulberry32 — same generator the engine property tests use, so playouts
 * are comparable across the test suite and the harness.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a uniform random element (undefined on empty array). */
export function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

/** Pick the max-scoring element, breaking ties with the rng (seeded tie-breaks). */
export function pickBest<T>(rng: Rng, items: T[], score: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  let bestScore = -Infinity;
  let best: T[] = [];
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      bestScore = s;
      best = [item];
    } else if (s === bestScore) {
      best.push(item);
    }
  }
  return pick(rng, best);
}

/** Derive a child seed from a parent seed and a stream index. */
export function deriveSeed(seed: number, stream: number): number {
  // splitmix-ish scramble; keeps independent streams decorrelated
  let z = (seed + 0x9e3779b9 * (stream + 1)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}
