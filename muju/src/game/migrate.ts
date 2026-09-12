import type { GameState } from './types';

export type LegacyGameState = Omit<GameState, 'actionsPerTurn'> & { actionsPerTurn?: 4 | 6 };

/** Upgrade a pre-four-action-standard save without replacing its board or result. */
export function migrateLegacyGame(state: LegacyGameState): GameState {
  const oldBudget = state.actionsPerTurn ?? 6;
  const spent = oldBudget - state.turn.actionsRemaining;
  return { ...state, actionsPerTurn: 4,
    turn: { ...state.turn, actionsRemaining: state.turn.phase === 'place' ? 4 : Math.max(0, 4 - spent) },
    // Income used to reset this clock; its history cannot reconstruct kill-free turns.
    inactivityPlies: state.phase === 'playing' ? 0 : state.inactivityPlies,
    selectedUnit: null, validMoves: [], validAttacks: [],
  };
}
