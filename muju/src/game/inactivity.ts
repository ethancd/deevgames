import type { GameState } from './types';

export const INACTIVITY_LIMIT = 10;
export const INACTIVITY_WARNING = 7;

/** Resolve at turn end, before the next player's turn or home-win check. */
export function resolveInactivityDraw(state: GameState): GameState {
  if (state.phase !== 'playing' || state.inactivityRule === 'off' || (state.inactivityPlies ?? 0) < INACTIVITY_LIMIT) return state;
  return { ...state, phase: 'victory', winner: null, victoryReason: 'inactivity',
    upkeepPending: false, selectedUnit: null, validMoves: [], validAttacks: [] };
}
