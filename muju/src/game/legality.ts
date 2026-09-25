import { isUpkeepSelectionLegal, defaultUpkeepAction } from './upkeep';
import type { GameState, PlayerId, Position } from './types';
import type { AIAction } from '../ai/types';
import { boardSize, getUnitById, isValidPosition } from './board';
import { UNIT_DEFINITIONS, getUnitDefinition } from './units';
import { isValidSpawnPosition } from './spawning';
import { canPromote } from './promotion';
import { getMoveCost } from './movement';
import { getValidAttacks } from './combat';
import { hasPendingSummon } from './summoning';
import { isMicro } from './rules';
import { isMicroPiece, microAttackSpent } from './micro';

const validPosition = (p: Position, size: number) => Number.isInteger(p.x) && Number.isInteger(p.y) && isValidPosition(p, size);

/** Rules at the application boundary, shared by human play, AI search and the lab.
 * All inventory is public; only the current player may act.
 */
export function isLegalAction(state: GameState, action: AIAction, player: PlayerId = state.turn.currentPlayer): boolean {
  if (state.phase !== 'playing' || state.turn.currentPlayer !== player) return false;
  if(action.type==='PAY_UPKEEP')return isUpkeepSelectionLegal(state,action.keepUnitIds);
  if(state.upkeepPending)return action.type==='RESIGN';
  const phase = state.turn.phase;
  const me = state.players[player], size = boardSize(state.board);
  switch (action.type) {
    case 'RESIGN': return true;
    case 'END_PLACE_PHASE': return phase === 'place';
    case 'END_ACTION_PHASE': return phase === 'action';
    case 'BUY_UNIT': {
      const def = UNIT_DEFINITIONS.find(d => d.id === action.definitionId);
      return phase === 'place' && !!def && def.tier === 1 && (!isMicro(state) || isMicroPiece(def.id)) && me.resources >= def.cost &&
        validPosition(action.position, size) && isValidSpawnPosition(action.position, player, state.board) &&
        !hasPendingSummon(state, player, action.position);
    }
    case 'PROMOTE_UNIT': {
      const unit = getUnitById(state.board, action.unitId);
      // MICRO MUJU has no promotions.
      return phase === 'place' && !isMicro(state) && !!unit && unit.owner === player &&
        canPromote(unit, { crystals: me.resources });
    }
    default: {
      if (phase !== 'action' || state.turn.actionsRemaining <= 0) return false;
      const unit = getUnitById(state.board, action.unitId);
      if (!unit || unit.owner !== player || !unit.canActThisTurn) return false;
      // MICRO MUJU: one attack per creature per turn, even after a kill.
      if (action.type === 'ATTACK') return validPosition(action.targetPosition, size) && !microAttackSpent(state, unit) &&
        getValidAttacks(unit, state.board).some(p => p.x === action.targetPosition.x && p.y === action.targetPosition.y);
      if (action.type !== 'MOVE' || !validPosition(action.to, size)) return false;
      const cost = getMoveCost(unit.position, action.to, getUnitDefinition(unit.definitionId).speed, state.board);
      return cost !== null && cost > 0 && cost <= state.turn.actionsRemaining;
    }
  }
}

export function phaseEndAction(state: GameState): AIAction {
  if(state.upkeepPending)return defaultUpkeepAction(state);
  return { type: state.turn.phase === 'place' ? 'END_PLACE_PHASE' : 'END_ACTION_PHASE' };
}
