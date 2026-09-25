import type { GameState, PlayerId } from './types';

/** The lab switch, or MICRO MUJU, which has no kill clock at all. */
const clockOff = (state: GameState): boolean => state.inactivityRule === 'off' || state.variant === 'micro';

/** Rules revision `muju-phasing-3` (2026-09-22): the KILL CLOCK. Ten kill-free
 * plies end the game, and the higher mined total wins (a tie is a draw). The
 * counter, its trigger (only an attack that removes a unit resets it) and its
 * cadence (once per turn at `END_PLACE_PHASE`, the killer's own turn closes at
 * zero) are unchanged from the draw clock it replaces; only the limit and the
 * verdict moved. The identifiers keep their historical names because more than
 * sixty pinned lab, test and Academy files import them. */
export const INACTIVITY_LIMIT = 10;
export const INACTIVITY_WARNING = 7;

/** The limit under `muju-phasing-2` (2026-09-19 to 2026-09-22): twenty plies
 * and a DRAW. Pass it with `verdict: 'draw'` ONLY to replay an archived game
 * recorded under that rule or to adjudicate a save written under it; live play
 * uses the defaults. Never use it to produce new evidence. */
export const LEGACY_INACTIVITY_LIMIT = 20;

export type InactivityVerdict = 'mined-total' | 'draw';

/** A player's mined total: every crystal their units ever took from the board,
 * plus Black's starting handicap (owner decision 2026-09-22). Spending, upkeep,
 * releases and refunds never reduce it. */
export function minedTotal(state: GameState, player: PlayerId): number {
  return state.players[player].resourcesGained + (player === 'black' ? state.blackCrystalHandicap ?? 0 : 0);
}

/** The count the hand-off at the end of the current turn is about to produce:
 * zero when this turn already contained a kill, otherwise one more than now.
 * Home-checkmate reads it to decide whether the invader's next turn start is
 * guaranteed to happen. */
export function killClockCountAfterTurn(state: GameState): number {
  return state.progressThisTurn ? 0 : (state.inactivityPlies ?? 0) + 1;
}

/** True when awarding `#` at the end of the current (invading) turn would
 * pre-empt the clock: with `c ≥ limit − 1` the defender's reply is the last
 * counted ply (or the hand-off itself ends the game), so the invader's next
 * turn start is not guaranteed and no checkmate may be awarded. */
export function killClockForbidsCheckmate(state: GameState, limit: number = INACTIVITY_LIMIT): boolean {
  if (clockOff(state)) return false;
  return killClockCountAfterTurn(state) >= limit - 1;
}

/** Resolve at turn end, before the next player's turn or home-win check.
 * `limit`/`verdict` default to the live rule and exist so a historical replay or
 * a legacy save can pin the revision it was recorded under. */
export function resolveInactivityDraw(state: GameState, limit: number = INACTIVITY_LIMIT, verdict: InactivityVerdict = 'mined-total'): GameState {
  if (state.phase !== 'playing' || clockOff(state) || (state.inactivityPlies ?? 0) < limit) return state;
  const ended = { ...state, phase: 'victory' as const, upkeepPending: false, selectedUnit: null, validMoves: [], validAttacks: [] };
  if (verdict === 'draw') return { ...ended, winner: null, victoryReason: 'inactivity' };
  const white = minedTotal(state, 'white'), black = minedTotal(state, 'black');
  return { ...ended, winner: white > black ? 'white' : black > white ? 'black' : null, victoryReason: 'kill-clock' };
}

/** The live name for the rule; `resolveInactivityDraw` stays for its importers. */
export const resolveKillClock = resolveInactivityDraw;
