/**
 * ONE ALLOWANCE PER TURN, ACROSS EVERY PHASE OF IT.
 *
 * `useAI` funds a TURN, not a search: `aiTurnBudgetMs(difficulty, pace)` is
 * handed out once and debited by what each search actually spent. That was
 * already true, and under Standard rules it was also sufficient — a Standard
 * turn's whole-turn plan normally comes back in one search.
 *
 * A PHASING TURN SPANS THREE SEARCHABLE SEGMENTS UNDER THE SAME MOVER:
 *
 *     Act → END_ACTION_PHASE (mine, then upkeep) → Prepare → END_PLACE_PHASE
 *
 * `useAI`'s turn loop runs `while (turn.currentPlayer === playerId)`, so all
 * three are inside ONE turn and one dial. Before this module the loop simply
 * re-requested `remainingCPU` at every segment boundary, and because
 * `remainingCPU` is debited by MEASURED SEARCH TIME, a cheap Act decision left
 * it nearly full: an independent review reproduced a turn requesting
 * `[3000, 3000]` where the pace funds `3000` for the whole turn. The engines do
 * not sit on their clocks, so a Phasing turn could run to roughly twice its
 * allowance in the worst case — and, symmetrically, a greedy Act search that
 * DID spend the whole budget left Prepare with nothing but the
 * `MIN_TURN_SEARCH_MS` floor, i.e. an unfunded promotion/summon decision.
 *
 * THE FIX, which is the pattern `lab/ai/gate1-bot.ts` and
 * `lab/ai/phasing-selfplay.ts` already use in the lab (read there, not
 * imported — lab code never enters `src/`):
 *
 *   - every segment of this turn that still has to be SEARCHED after the
 *     current one reserves a modest floor, `turnBudgetMs / RESERVE_DIVISOR`,
 *     that the current search may not touch (`segmentsAfter`,
 *     `turnSearchAllowance`);
 *   - the current search gets everything else the turn has left, so the LAST
 *     segment always requests the whole remainder and nothing is stranded;
 *   - the request is never more than the remainder, so the turn's total
 *     requested time can never exceed the turn's allowance;
 *   - the per-action fallback loop divides the remainder by the DECISIONS that
 *     are actually still to come, which under Phasing includes the upkeep
 *     decision and Prepare — not just the Act actions.
 *
 * STANDARD IS BYTE FOR BYTE WHAT IT WAS. Every function here short-circuits on
 * a non-Phasing state to the exact expression `useAI` used before, so the only
 * ruleset whose funding changes is the one the AI could not previously play.
 */
import type { GameState } from '../game/types';
import { isPhasing } from '../game/rules';

/**
 * Each segment of this turn still to be searched after the current one reserves
 * `turnBudgetMs / this`. Eight is `lab/ai/gate1-bot.ts`'s `PREPARE_RESERVE_DIVISOR`,
 * chosen so the first search of a turn keeps three quarters of the allowance
 * while the two later segments keep a floor they cannot be starved below.
 */
export const PREPARE_RESERVE_DIVISOR = 8;

/**
 * How many hand-off segments of this own turn still have to be searched AFTER
 * the one the mover is in. Act is followed by the upkeep decision and Prepare;
 * the upkeep decision by Prepare; Prepare by nothing.
 *
 * ALWAYS 0 UNDER STANDARD: its `place`/`action` pair is one plan to the v2
 * whole-turn search, and reserving against it would change shipped funding.
 */
export function segmentsAfter(state: GameState): number {
  if (!isPhasing(state)) return 0;
  if (state.upkeepPending) return 1;
  return state.turn.phase === 'action' ? 2 : 0;
}

/** The floor this search must leave behind for the rest of its own turn. */
export function prepareReserveMs(state: GameState, turnBudgetMs: number): number {
  return segmentsAfter(state) * Math.floor(Math.max(0, turnBudgetMs) / PREPARE_RESERVE_DIVISOR);
}

/**
 * What ONE whole-turn search may be funded with: everything the turn has left,
 * less the floor reserved for the segments that still have to be searched.
 * Never more than the remainder, and never below `minMs` — a spent turn must
 * still ASK for a legal plan rather than run a zero-budget search that comes
 * back empty and silently passes the phase.
 */
export function turnSearchAllowance(state: GameState, remainingMs: number, turnBudgetMs: number, minMs: number): number {
  return Math.max(minMs, remainingMs - prepareReserveMs(state, turnBudgetMs));
}

/**
 * The divisor the PER-ACTION fallback loop splits the remainder by.
 *
 * Standard keeps its historical expression exactly: the Act actions still to
 * come, or a flat 4 in the place phase. Under Phasing that would leave the
 * upkeep decision and Prepare unfunded once the Act actions were counted out,
 * so the remaining decisions of the turn are counted the way
 * `lab/ai/phasing-selfplay.ts` counts them — Act actions plus the three
 * segment-ending decisions still ahead.
 */
export function fallbackDecisionsRemaining(state: GameState): number {
  if (!isPhasing(state)) {
    return state.turn.phase === 'action' ? Math.max(1, state.turn.actionsRemaining) : 4;
  }
  if (state.turn.phase === 'action') return Math.max(0, state.turn.actionsRemaining) + 3;
  return state.upkeepPending ? 3 : 2;
}
