/**
 * EMBER — ContextPacket serializer (src/pilot/serialize.ts).
 *
 * Required export per src/pilot/llmContracts.ts:
 *   serializePacket(packet: ContextPacket): string
 *
 * Compact, stable JSON: object keys are sorted recursively and every number
 * is rounded to 2 decimal places, so two structurally-identical packets
 * (even if built by independent code paths, e.g. two Sim runs with the same
 * seed) serialize to byte-identical strings — this is what
 * serialize.test.ts's stability test checks, and what makes the packet
 * prompt-caching friendly turn-to-turn (a stable rendering of the same
 * underlying values never perturbs the cached prefix on some incidental key
 * order or float-noise difference).
 *
 * No legend/prose is injected here — this module's only contract input is
 * the packet itself (see the pinned signature above), so any per-variant
 * "legend" framing lives in src/pilot/prompts.ts's system text instead.
 */

import type { ContextPacket } from '../core/types';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Rounds to 2dp and normalizes -0 -> 0 (JSON.stringify already does the
 *  latter, but making it explicit here keeps this function's contract
 *  self-evident and independent of that engine quirk). Non-finite numbers
 *  (NaN/Infinity) should never occur in a well-formed ContextPacket, but are
 *  defensively mapped to 0 rather than producing invalid JSON. */
function roundNum(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const rounded = Math.round(n * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function canonicalize(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return roundNum(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, Json> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = obj[key];
      if (v === undefined) continue; // drop absent optional fields (e.g. Intent.thought)
      out[key] = canonicalize(v);
    }
    return out;
  }
  // functions/symbols/bigints etc. should never appear in a ContextPacket;
  // drop defensively rather than throwing mid-serialization.
  return null;
}

export function serializePacket(packet: ContextPacket): string {
  return JSON.stringify(canonicalize(packet));
}
