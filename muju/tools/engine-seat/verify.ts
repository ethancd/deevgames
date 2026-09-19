import type { GameState } from '../../src/game/types';
import type { RootResult } from '../../src/ai/hard/search/root';
import { isLegalAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import { Replica, allocState, newUndo } from '../../src/ai/hard/core/state';
import { fromAIAction, keepSetAdd, newKeepSetTable, slotForId } from '../../src/ai/hard/core/action';
import { TurnPool } from '../../src/ai/hard/gen/turn';
import { verifyTurn } from '../../src/ai/hard/verify/replay';

/**
 * What a non-searched turn actually WAS, as one word for the run log.
 *
 * `RootResult` reports two different things in two different places, and the
 * seat used to flatten both into `'unsearched'`. `result.fallback` names a
 * STRUCTURAL failure (`pack-error`, `engine-error`, `divergence`); a
 * `source: 'fallback'` with no `fallback` field is the search returning nothing
 * usable — and that is usually the CLOCK. `stats.stopReason` separates them:
 * `abort` is the watchdog firing (time), `work` is the rung running out, and
 * `complete` with nothing to show is a terminal or empty root. An operator
 * reading a run's jsonl needs the distinction, because "we ran out of time" is
 * a budget problem and "the replica diverged" is a correctness problem, and the
 * two call for opposite responses.
 */
export function classifyFallback(result: RootResult): string | null {
  if (result.fallback) return result.fallback;
  if (result.source !== 'fallback') return null;
  if (result.stats.stopReason === 'abort') return 'time';
  if (result.stats.stopReason === 'work') return 'work-exhausted';
  return 'unsearched';
}

/** Rebuild the packed line while preserving the search's claimed end key, then
 * call the canonical verifier. Never derive the claimed key from our replay. */
export function verifySeatTurn(state: GameState, result: RootResult): GameState {
  const fallback = classifyFallback(result);
  if (fallback !== null) throw new Error(`Engine fallback: ${fallback}`);
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
