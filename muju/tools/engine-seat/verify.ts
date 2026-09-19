import type { GameState } from '../../src/game/types';
import type { RootResult } from '../../src/ai/hard/search/root';
import { isLegalAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import { Replica, allocState, newUndo } from '../../src/ai/hard/core/state';
import { fromAIAction, keepSetAdd, newKeepSetTable, slotForId } from '../../src/ai/hard/core/action';
import { TurnPool } from '../../src/ai/hard/gen/turn';
import { verifyTurn } from '../../src/ai/hard/verify/replay';

/** Rebuild the packed line while preserving the search's claimed end key, then
 * call the canonical verifier. Never derive the claimed key from our replay. */
export function verifySeatTurn(state: GameState, result: RootResult): GameState {
  if (result.fallback || result.source === 'fallback') throw new Error(`Engine fallback: ${result.fallback ?? 'unsearched'}`);
  if (!/^[a-f0-9]{16}$/i.test(result.endKey)) throw new Error('Engine returned no verifiable end key.');
  const rep = new Replica(), start = rep.pack(state, allocState()), walk = rep.pack(state, allocState());
  const keep = newKeepSetTable(), turn = new TurnPool(1).alloc(), undo = newUndo();
  if (!result.actions.length || result.actions.length > Math.min(32, turn.actions.length)) throw new Error('Invalid whole-turn length.');
  let canonical = state;
  for (const action of result.actions) {
    if (canonical.phase !== 'playing' || canonical.turn.currentPlayer !== state.turn.currentPlayer ||
      canonical.turn.turnNumber !== state.turn.turnNumber || !isLegalAction(canonical, action)) throw new Error('Illegal or cross-turn engine action.');
    if (action.type === 'PAY_UPKEEP') {
      const index = keep.count++;
      for (const id of action.keepUnitIds) keepSetAdd(keep, index, slotForId(walk, id));
    }
    const packed = fromAIAction(walk, action, keep);
    turn.actions[turn.count++] = packed;
    rep.resetUndoScratch(); undo.top = 0; rep.make(walk, packed, undo, keep);
    canonical = applyAction(canonical, action);
  }
  turn.endHi = parseInt(result.endKey.slice(0, 8), 16);
  turn.endLo = parseInt(result.endKey.slice(8), 16);
  const verified = verifyTurn(rep, state, start, turn, keep);
  if (!verified.verified) throw new Error(`verifyTurn rejected: ${verified.reason}`);
  if (JSON.stringify(verified.actions) !== JSON.stringify(result.actions)) throw new Error('Packed line changed submitted actions.');
  if (canonical.phase === 'playing' && canonical.turn.currentPlayer === state.turn.currentPlayer && canonical.turn.turnNumber === state.turn.turnNumber) {
    throw new Error('Engine returned a partial turn.');
  }
  return verified.endState;
}
