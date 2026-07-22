/**
 * EMBER — deterministic integer hashing for visual variation
 * (src/render/hash.ts).
 *
 * Render-layer sprite variation, spark drift, and shimmer phases all derive
 * from small integer hashes of (x, y, salt) / (tick, frame) — never
 * Math.random(). This is a UI-layer determinism convention (not the sim's
 * seeded Rng, which never crosses into src/render/): it exists so that
 * repeated draws of the same inputs (same tile coords, same tick) always
 * produce the same pixels, which is both what makes replays look identical
 * at 1x and what makes sprite output testable.
 */

/** 32-bit integer hash (a small xorshift/multiply mix), always >= 0. */
export function hash2(a: number, b: number, salt = 0): number {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (salt | 0) * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 0;
}

export function hash3(a: number, b: number, c: number, salt = 0): number {
  return hash2(hash2(a, b, salt), c, salt);
}

/** Integer in [0, n). */
export function hashInt(n: number, a: number, b: number, salt = 0): number {
  if (n <= 1) return 0;
  return hash2(a, b, salt) % n;
}

/** Float in [0, 1). */
export function hashFloat(a: number, b: number, salt = 0): number {
  return hash2(a, b, salt) / 4294967296;
}
