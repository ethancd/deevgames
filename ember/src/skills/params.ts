/**
 * EMBER — Intent param validation helpers (src/skills/params.ts).
 *
 * Small, dependency-free helpers shared by every SkillDef.precondition() so
 * that "missing/mistyped params" and "NaN/out-of-range numeric params" are
 * rejected uniformly and with specific reason strings (these reasons flow
 * back to the pilot as `whyNot`).
 */

import type { Vec } from '../core/types';

export type ParamResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function requireString(
  params: Record<string, unknown>,
  key: string,
): ParamResult<string> {
  const v = params[key];
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
  const v = params[key];
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
  const v = params[key];
  if (v === undefined || v === null || typeof v !== 'object') {
    return { ok: false, reason: `missing required param "${key}" (expected {x, y})` };
  }
  const obj = v as Record<string, unknown>;
  const x = obj.x;
  const y = obj.y;
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
  const v = params[key];
  if (v === undefined || v === null) return { ok: true, value: fallback };
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    return {
      ok: false,
      reason: `param "${key}" must be one of ${allowed.join('|')}`,
    };
  }
  return { ok: true, value: v as T };
}
