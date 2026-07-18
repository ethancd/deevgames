// Seeded PRNG (mulberry32) with explicitly serializable state, so an inner
// game's randomness can be persisted/resumed and replayed deterministically
// from a given seed.
//
// mulberry32Step is the pure core: given a seed (the "state" integer), it
// returns the next float in [0,1) AND the next state integer to feed back in
// on the following call. Everything else in this file is a thin wrapper
// around that one pure step.

import type { RNG } from './types';

export function mulberry32Step(seed: number): { value: number; nextSeed: number } {
  // Advance the internal state by the mulberry32 constant first; that
  // advanced value IS the next state (what gets serialized/persisted).
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextSeed };
}

function intFromValue(value: number, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(value * maxExclusive);
}

// Fisher-Yates using an arbitrary `next()` source of floats in [0,1).
function fisherYates<T>(items: T[], next: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

export interface StatefulRng extends RNG {
  getState(): number;
  setState(seed: number): void;
}

// A standalone RNG owning its own mutable state (used by match.ts for
// outer-loop randomness and by tests). Not tied to any InnerGameState.
export function createRng(seed: number): StatefulRng {
  let state = seed;
  const next = (): number => {
    const { value, nextSeed } = mulberry32Step(state);
    state = nextSeed;
    return value;
  };
  const int = (maxExclusive: number): number => intFromValue(next(), maxExclusive);
  const shuffle = <T,>(items: T[]): T[] => fisherYates(items, next);

  return {
    next,
    int,
    shuffle,
    getState: () => state,
    setState: (s: number) => {
      state = s;
    },
  };
}

// An RNG whose state lives externally (InnerGameState.rngState via the
// supplied getter/setter). Used by engine/api.ts so the state object stays
// the single source of truth for randomness with no separate sync step:
// every next()/int()/shuffle() call reads the current state, advances it,
// and writes the new state straight back.
export function createBoundRng(
  getState: () => number,
  setState: (seed: number) => void
): RNG {
  const next = (): number => {
    const { value, nextSeed } = mulberry32Step(getState());
    setState(nextSeed);
    return value;
  };
  const int = (maxExclusive: number): number => intFromValue(next(), maxExclusive);
  const shuffle = <T,>(items: T[]): T[] => fisherYates(items, next);

  return { next, int, shuffle };
}

// Pure helper: shuffle `items` with a given seed, returning both the
// shuffled result and the resulting next seed (for callers, like match.ts,
// that want to fold randomness through a value they persist themselves
// rather than through a stateful RNG object).
export function shuffleWithSeed<T>(
  items: T[],
  seed: number
): { result: T[]; nextSeed: number } {
  let state = seed;
  const next = (): number => {
    const { value, nextSeed } = mulberry32Step(state);
    state = nextSeed;
    return value;
  };
  const result = fisherYates(items, next);
  return { result, nextSeed: state };
}
