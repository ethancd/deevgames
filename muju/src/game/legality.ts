import type { GameState, PlayerId, Position } from './types';
import type { AIAction } from '../ai/types';
import { getUnitById, isValidPosition } from './board';
import { UNIT_DEFINITIONS, getUnitDefinition } from './units';
import { canBuildUnit, meetsTechRequirement } from './building';
import { isValidSpawnPosition } from './spawning';
import { canPromote } from './promotion';
import { getMoveCost } from './movement';
import { getValidAttacks } from './combat';
import { canMine } from './mining';

const validPosition = (p: Position) => Number.isInteger(p.x) && Number.isInteger(p.y) && isValidPosition(p);

/** Rules at the application boundary, shared by human play, AI search and the lab.
 * No opponent resources or hidden queue are inspected to authorize own actions.
 */
export function isLegalAction(state: GameState, action: AIAction, player: PlayerId = state.turn.currentPlayer): boolean {
  if (state.phase !== 'playing' || state.turn.currentPlayer !== player) return false;
  const phase = state.turn.phase;
  const me = state.players[player];
  switch (action.type) {
    case 'RESIGN': return true;
    case 'END_PLACE_PHASE': return phase === 'place';
    case 'END_ACTION_PHASE': return phase === 'action';
    case 'END_TURN': return phase === 'queue';
    case 'QUEUE_UNIT':
      return phase === 'queue' && UNIT_DEFINITIONS.some(d => d.id === action.definitionId) &&
        canBuildUnit(action.definitionId, player, state.board, { queue: [], crystals: me.resources });
    case 'PLACE_UNIT': {
      if (phase !== 'place' || !validPosition(action.position)) return false;
      const q = me.buildQueue.find(q => q.id === action.queuedUnitId && q.owner === player && q.turnsRemaining === 0);
      return !!q && meetsTechRequirement(q.definitionId, player, state.board) &&
        isValidSpawnPosition(action.position, player, state.board);
    }
    case 'PROMOTE_UNIT': {
      const unit = getUnitById(state.board, action.unitId);
      return phase === 'place' && !!unit && unit.owner === player &&
        canPromote(unit, { queue: [], crystals: me.resources });
    }
    default: {
      if (phase !== 'action' || state.turn.actionsRemaining <= 0) return false;
      const unit = getUnitById(state.board, action.unitId);
      if (!unit || unit.owner !== player || !unit.canActThisTurn) return false;
      if (action.type === 'MINE') return canMine(unit, state.board);
      if (action.type === 'ATTACK') return validPosition(action.targetPosition) &&
        getValidAttacks(unit, state.board).some(p => p.x === action.targetPosition.x && p.y === action.targetPosition.y);
      if (!validPosition(action.to)) return false;
      const cost = getMoveCost(unit.position, action.to, getUnitDefinition(unit.definitionId).speed, state.board);
      return cost !== null && cost > 0 && cost <= state.turn.actionsRemaining;
    }
  }
}

export function phaseEndAction(state: GameState): AIAction {
  return { type: state.turn.phase === 'place' ? 'END_PLACE_PHASE' : state.turn.phase === 'action' ? 'END_ACTION_PHASE' : 'END_TURN' };
}
