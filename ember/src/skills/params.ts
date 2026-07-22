/**
 * EMBER — Intent param validation helpers (src/skills/params.ts).
 *
 * Small, dependency-free helpers shared by every SkillDef.precondition() so
 * that "missing/mistyped params" and "NaN/out-of-range numeric params" are
 * rejected uniformly and with specific reason strings (these reasons flow
 * back to the pilot as `whyNot`).
 *
 * Hardened against a fixed audit finding: a pilot-supplied params object
 * could define a throwing getter on a property these helpers read (e.g.
 * `dest`), crashing precondition()/estCost() uncaught. Every property read
 * below goes through safeGet(), which turns a throwing accessor into a
 * clean "could not be read" rejection instead of propagating the throw.
 */

import type { Vec } from '../core/types';

export type ParamResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Reads params[key] defensively — a throwing getter becomes `{ threw: true }`
 *  instead of propagating the exception up through precondition()/estCost(). */
function safeGet(
  params: Record<string, unknown>,
  key: string,
): { threw: true } | { threw: false; value: unknown } {
  try {
    return { threw: false, value: params[key] };
  } catch {
    return { threw: true };
  }
}

export function requireString(
  params: Record<string, unknown>,
  key: string,
): ParamResult<string> {
  const read = safeGet(params, key);
  if (read.threw) {
    return { ok: false, reason: `param "${key}" could not be read` };
  }
  const v = read.value;
  if (v === undefined || v === null) {
    return { ok: false, reason: `missing required param "${key}"` };
  }
  if (typeof v !== 'string' || v.length === 0) {
    return { ok: false, reason: `param "${key}" must be a non-empty string` };
  }
  return { ok: true, value: v };
}

export function requireFiniteNumber(
  params: Record<string, unknown>,
  key: string,
  opts?: { min?: number; max?: number },
): ParamResult<number> {
  const read = safeGet(params, key);
  if (read.threw) {
    return { ok: false, reason: `param "${key}" could not be read` };
  }
  const v = read.value;
  if (v === undefined || v === null) {
    return { ok: false, reason: `missing required param "${key}"` };
  }
  if (typeof v !== 'number' || Number.isNaN(v) || !Number.isFinite(v)) {
    return { ok: false, reason: `param "${key}" must be a finite number` };
  }
  if (opts?.min !== undefined && v < opts.min) {
    return { ok: false, reason: `param "${key}" must be >= ${opts.min}` };
  }
  if (opts?.max !== undefined && v > opts.max) {
    return { ok: false, reason: `param "${key}" must be <= ${opts.max}` };
  }
  return { ok: true, value: v };
}

export function requireVec(
  params: Record<string, unknown>,
  key: string,
  opts?: { boundsWidth?: number; boundsHeight?: number },
): ParamResult<Vec> {
  const read = safeGet(params, key);
  if (read.threw) {
    return { ok: false, reason: `param "${key}" could not be read` };
  }
  const v = read.value;
  if (v === undefined || v === null || typeof v !== 'object') {
    return { ok: false, reason: `missing required param "${key}" (expected {x, y})` };
  }
  const obj = v as Record<string, unknown>;
  let x: unknown;
  let y: unknown;
  try {
    x = obj.x;
    y = obj.y;
  } catch {
    return { ok: false, reason: `param "${key}" could not be read` };
  }
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return { ok: false, reason: `param "${key}" must be {x, y} finite numbers` };
  }
  if (opts?.boundsWidth !== undefined && (x < 0 || x >= opts.boundsWidth)) {
    return { ok: false, reason: `param "${key}".x is out of bounds` };
  }
  if (opts?.boundsHeight !== undefined && (y < 0 || y >= opts.boundsHeight)) {
    return { ok: false, reason: `param "${key}".y is out of bounds` };
  }
  return { ok: true, value: { x, y } };
}

export function optionalEnum<T extends string>(
  params: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): ParamResult<T> {
  const read = safeGet(params, key);
  if (read.threw) {
    return { ok: false, reason: `param "${key}" could not be read` };
  }
  const v = read.value;
  if (v === undefined || v === null) return { ok: true, value: fallback };
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    return {
      ok: false,
      reason: `param "${key}" must be one of ${allowed.join('|')}`,
    };
  }
  return { ok: true, value: v as T };
}
