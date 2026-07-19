// Pebble Duel: 3 heaps of pebbles, take 1-3 from one heap, last take wins.
// A deliberately tiny GameDef used as the platform's worked example. It is a
// subtraction(1-3) Nim variant, so perfect play is the Grundy rule: a heap's
// Grundy value is heap % 4, a position is winning for the player to move iff
// the XOR of Grundy values is non-zero.

import type { GameDef, Seat } from '@deev/core';

export interface PebbleState {
  heaps: number[];
  current: Seat;
  lastMover: Seat | null;
}

export interface PebbleMove {
  heap: number;
  take: 1 | 2 | 3;
}

export interface PebbleConfig {
  heaps?: number[];
}

export const SEATS: Seat[] = ['first', 'second'];
export const DEFAULT_HEAPS = [3, 5, 7];

export function grundyValue(heaps: number[]): number {
  return heaps.reduce((acc, h) => acc ^ h % 4, 0);
}

export const pebbleDuel: GameDef<PebbleState, PebbleMove, PebbleConfig> = {
  id: 'pebble-duel',
  version: '1.0.0',
  init: (config) => ({
    heaps: (config.heaps ?? DEFAULT_HEAPS).slice(),
    current: 'first',
    lastMover: null,
  }),
  seats: () => SEATS,
  toAct: (s) => [s.current],
  legal: (s, seat) => {
    if (seat !== s.current) return [];
    const moves: PebbleMove[] = [];
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
    const winningToMove = grundyValue(s.heaps) !== 0;
    const currentWins = winningToMove;
    return (seat === s.current) === currentWins ? 1 : -1;
  },
};

/** Perfect play: move to a zero-Grundy position when one exists. */
export function perfectMove(s: PebbleState, legal: PebbleMove[]): PebbleMove {
  for (const move of legal) {
    const heaps = s.heaps.slice();
    heaps[move.heap] -= move.take;
    if (grundyValue(heaps) === 0) return move;
  }
  return legal[0]; // losing position: any move
}
