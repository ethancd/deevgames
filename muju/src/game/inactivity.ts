import type { GameState } from './types';

/** Rules revision `muju-phasing-2` (2026-09-19): twenty quiet plies, ten hand-offs
 * per player. Standard and Phasing deliberately share this one constant. */
export const INACTIVITY_LIMIT = 20;
export const INACTIVITY_WARNING = 17;

/** The limit under `muju-phasing-1` and every earlier revision. Pass it to
 * `resolveInactivityDraw` ONLY to replay an archived game recorded under the old
 * rule; live play uses the default. Never use it to produce new evidence. */
export const LEGACY_INACTIVITY_LIMIT = 10;

/** Resolve at turn end, before the next player's turn or home-win check.
 * `limit` defaults to the live constant and exists so a historical replay can pin
 * the revision its archive was recorded under. */
export function resolveInactivityDraw(state: GameState, limit: number = INACTIVITY_LIMIT): GameState {
  if (state.phase !== 'playing' || state.inactivityRule === 'off' || (state.inactivityPlies ?? 0) < limit) return state;
  return { ...state, phase: 'victory', winner: null, victoryReason: 'inactivity',
    upkeepPending: false, selectedUnit: null, validMoves: [], validAttacks: [] };
}
