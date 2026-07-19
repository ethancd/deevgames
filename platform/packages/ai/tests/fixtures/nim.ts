// Classic (unbounded) Nim: two seats alternate removing any positive number
// of objects from a single heap; the seat that takes the last object wins
// (normal play convention). nimValue(heaps) = XOR of heap sizes is the
// textbook ground truth: nonzero means the seat to move can force a win.
//
// Written standalone for @deev/ai's own tests — deliberately NOT shared with
// examples/pebble-duel (which takes 1-3 per heap, a different game) or
// @deev/lab's own nim-shaped sensitivity fixture, to avoid a workspace
// dependency cycle.

import type { GameDef, Rng, Seat } from '@deev/core';

export interface NimState {
  heaps: number[];
  toMove: Seat;
}

export interface NimAction {
  heap: number;
  take: number;
}

export interface NimConfig {
  heaps: number[];
}

const SEAT_A = 'A';
const SEAT_B = 'B';

function other(seat: Seat): Seat {
  return seat === SEAT_A ? SEAT_B : SEAT_A;
}

export const nim: GameDef<NimState, NimAction, NimConfig, NimState> = {
  id: 'fixture-nim',
  version: '1.0.0',
  init(config: NimConfig, _rng: Rng): NimState {
    return { heaps: config.heaps.slice(), toMove: SEAT_A };
  },
  seats(_config: NimConfig): Seat[] {
    return [SEAT_A, SEAT_B];
  },
  toAct(state: NimState): Seat[] {
    return [state.toMove];
  },
  legal(state: NimState, _seat: Seat): NimAction[] {
    const actions: NimAction[] = [];
    state.heaps.forEach((size, heap) => {
      for (let take = 1; take <= size; take++) actions.push({ heap, take });
    });
    return actions;
  },
  apply(state: NimState, action: NimAction, _rng: Rng): NimState {
    const heaps = state.heaps.slice();
    heaps[action.heap] -= action.take;
    return { heaps, toMove: other(state.toMove) };
  },
  terminal(state: NimState) {
    if (state.heaps.every((h) => h === 0)) {
      // toMove has no move; the previous mover took the last object and wins.
      const win = other(state.toMove);
      return {
        winner: win,
        scores: { [win]: 1, [state.toMove]: 0 },
        reason: 'heaps-exhausted',
      };
    }
    return null;
  },
};

/** XOR of heap sizes: nonzero means the seat to move can force a win. */
export function nimValue(heaps: number[]): number {
  return heaps.reduce((acc, h) => acc ^ h, 0);
}
