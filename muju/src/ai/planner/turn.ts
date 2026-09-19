import type { GameState } from '../../game/types';
import { phaseEndAction } from '../../game/legality';
import { applyAction } from '../simulate';

/** Finish the current player's turn, including mining/upkeep and Prepare.
 * Use canonical transitions so arrivals, refunds and terminal priority agree
 * with play. A phase boundary alone is not an opponent reply under Phasing.
 */
export function passTurn(state: GameState): GameState {
  const player = state.turn.currentPlayer;
  let next = state;
  while (next.phase === 'playing' && next.turn.currentPlayer === player) {
    const after = applyAction(next, phaseEndAction(next));
    if (after === next) throw new Error('Cannot complete AI reply turn');
    next = after;
  }
  return next;
}
