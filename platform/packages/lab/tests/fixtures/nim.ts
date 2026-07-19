// A 3-heap take-1..3 nim clone for @deev/lab's own tests. Authored standalone
// — deliberately NOT imported from examples/pebble-duel, which is the same
// shape of game but depends on @deev/lab; importing it here would create a
// workspace cycle (lab -> pebble-duel -> lab).
//
// Standard subtraction(1-3) Nim: a heap's Grundy value is heap % 4; the
// position is winning for the player to move iff the xor of Grundy values is
// non-zero. perfectBot always moves to a zero-xor position when one exists.

import type { GameDef, Seat } from '@deev/core';
import type { ScriptedBot } from '../../src/bots.ts';

export interface NimState {
  heaps: number[];
  current: Seat;
  lastMover: Seat | null;
}

export interface NimMove {
  heap: number;
  take: 1 | 2 | 3;
}

export interface NimConfig {
  heaps?: number[];
}

export const NIM_SEATS: Seat[] = ['first', 'second'];
export const DEFAULT_NIM_HEAPS = [3, 5, 7];

export function nimGrundy(heaps: number[]): number {
  return heaps.reduce((acc, h) => acc ^ (h % 4), 0);
}

export const nim: GameDef<NimState, NimMove, NimConfig> = {
  id: 'lab-fixture-nim',
  version: '1.0.0',
  init: (config) => ({
    heaps: (config.heaps ?? DEFAULT_NIM_HEAPS).slice(),
    current: 'first',
    lastMover: null,
  }),
  seats: () => NIM_SEATS,
  toAct: (s) => [s.current],
  legal: (s, seat) => {
    if (seat !== s.current) return [];
    const moves: NimMove[] = [];
    s.heaps.forEach((h, heap) => {
      for (const take of [1, 2, 3] as const) {
        if (take <= h) moves.push({ heap, take });
      }
    });
    return moves;
  },
  apply: (s, move) => {
    const heaps = s.heaps.slice();
    heaps[move.heap] -= move.take;
    return {
      heaps,
      current: s.current === 'first' ? 'second' : 'first',
      lastMover: s.current,
    };
  },
  terminal: (s) =>
    s.heaps.every((h) => h === 0) && s.lastMover !== null
      ? { winner: s.lastMover, reason: 'last-take' }
      : null,
  // Positive for the seat that wins with perfect play from here.
  score: (s, seat) => {
    const currentWins = nimGrundy(s.heaps) !== 0;
    return (seat === s.current) === currentWins ? 1 : -1;
  },
};

/** Perfect play via the Grundy/mod-4 xor rule: move to a zero-xor position. */
export const perfectBot: ScriptedBot<NimState, NimMove> = {
  name: 'PerfectNim',
  choose({ view, legal }) {
    for (const move of legal) {
      const heaps = view.heaps.slice();
      heaps[move.heap] -= move.take;
      if (nimGrundy(heaps) === 0) return move;
    }
    return legal[0]; // losing position: any move is as good as another
  },
};
