// Seeded, serializable RNG. mulberry32 with an explicit state accumulator so
// randomness can be persisted mid-game and resumed deterministically (the
// pure-step design from lution/src/engine/rng.ts; fork() follows
// might-and-magic-spire's labeled-stream pattern).
//
// Ownership rule: a game's engine stream is advanced ONLY inside
// GameDef.apply. Bots, UI, and harness code get their own forked streams —
// never share one Rng between the engine and a policy.

import { fnv1a } from './hash.ts';

export interface RngState {
  /** mulberry32 accumulator (uint32). */
  s: number;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). maxExclusive must be >= 1. */
  int(maxExclusive: number): number;
  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates shuffle; returns a new array, input untouched. */
  shuffle<T>(items: readonly T[]): T[];
  /** Independent derived stream. Deterministic in (current state, label). */
  fork(label: string): Rng;
  getState(): RngState;
  setState(state: RngState): void;
}

const UINT32 = 0x1_0000_0000;

/** One pure mulberry32 step: state in, (value, next state) out. */
export function mulberry32Step(s: number): { value: number; next: number } {
  const next = (s + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / UINT32, next };
}

export function mulberry32(seed: number): Rng {
  let s = seed | 0;

  const rng: Rng = {
    next() {
      const { value, next } = mulberry32Step(s);
      s = next;
      return value;
    },
    int(maxExclusive: number) {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new Error(`rng.int: maxExclusive must be a positive integer, got ${maxExclusive}`);
      }
      return Math.floor(rng.next() * maxExclusive);
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      return items[rng.int(items.length)];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    fork(label: string) {
      // Derive a new seed from (current state, label) without advancing this
      // stream: forking is an observation, not a draw.
      const derived = parseInt(fnv1a(`${s}:${label}`), 16) | 0;
      return mulberry32(derived);
    },
    getState() {
      return { s };
    },
    setState(state: RngState) {
      s = state.s | 0;
    },
  };
  return rng;
}
