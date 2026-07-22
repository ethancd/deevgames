/**
 * EMBER — shared viable-band deviation helpers (src/body/deviation.ts).
 *
 * Used both to derive `stability` and to detect band-crossing events in
 * stepBody, and to shape interoception urgency/salience.
 */

import { VIABLE_BANDS, type BodyVar } from '../core/types';
import { EPS, clamp01 } from './constants';

/** 0 when `value` is inside [lo, hi]; otherwise how far outside, normalized
 *  by the distance from the edge to the nearest extreme (0 or 1), clamped
 *  to [0, 1]. */
export function normalizedDeviation(v: BodyVar, value: number): number {
  const [lo, hi] = VIABLE_BANDS[v];
  if (value < lo) return clamp01((lo - value) / Math.max(lo, EPS));
  if (value > hi) return clamp01((value - hi) / Math.max(1 - hi, EPS));
  return 0;
}

export function inBand(v: BodyVar, value: number): boolean {
  const [lo, hi] = VIABLE_BANDS[v];
  return value >= lo && value <= hi;
}
