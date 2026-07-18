import type { GameState, PlayerId } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import {
  generatePlacePhaseActions,
  generateActionPhaseActions,
  generateQueuePhaseActions,
} from '../../src/ai/moves';
import { canBuildUnit } from '../../src/game/building';

/**
 * Legal actions for the current phase, filtered through the FULL rules.
 *
 * The raw queue generator ignores tech requirements (SPEC_AUDIT divergence
 * D1), so QUEUE_UNIT actions are filtered through canBuildUnit — same ruling
 * as the engine property tests (J-001). Scripted bots therefore cannot cheat
 * by construction; engine bots emit their own actions and are checked against
 * this set by the runner.
 */
export function legalActions(state: GameState, player: PlayerId): AIAction[] {
  switch (state.turn.phase) {
    case 'place':
      return generatePlacePhaseActions(state, player);
    case 'action':
      return generateActionPhaseActions(state, player);
    case 'queue': {
      const actions = generateQueuePhaseActions(state, player);
      return actions.filter((a) => {
        if (a.type !== 'QUEUE_UNIT') return true;
        const buildState = {
          queue: [],
          crystals: state.players[player].resources,
        };
        return canBuildUnit(a.definitionId, player, state.board, buildState);
      });
    }
    default:
      return [];
  }
}

function posEq(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Structural equality on AIActions (for membership checks against the legal set). */
export function actionsEqual(a: AIAction, b: AIAction): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'MOVE':
      return b.type === 'MOVE' && a.unitId === b.unitId && posEq(a.to, b.to);
    case 'ATTACK':
      return b.type === 'ATTACK' && a.unitId === b.unitId && posEq(a.targetPosition, b.targetPosition);
    case 'MINE':
      return b.type === 'MINE' && a.unitId === b.unitId;
    case 'QUEUE_UNIT':
      return b.type === 'QUEUE_UNIT' && a.definitionId === b.definitionId;
    case 'PLACE_UNIT':
      return b.type === 'PLACE_UNIT' && a.queuedUnitId === b.queuedUnitId && posEq(a.position, b.position);
    case 'PROMOTE_UNIT':
      return b.type === 'PROMOTE_UNIT' && a.unitId === b.unitId;
    default:
      // END_ACTION_PHASE / END_TURN / RESIGN carry no payload
      return true;
  }
}

/**
 * Is an emitted action legal right now? END_ACTION_PHASE / END_TURN / RESIGN
 * are treated as always-available phase controls in the matching phase
 * (mirrors the real reducer, which accepts them whenever the phase matches).
 */
export function isLegalNow(state: GameState, player: PlayerId, action: AIAction): boolean {
  if (action.type === 'RESIGN') return true;
  if (action.type === 'END_ACTION_PHASE') return state.turn.phase === 'action';
  if (action.type === 'END_TURN') return state.turn.phase === 'queue';
  // MOVE in the action phase: the generator only emits single-action moves,
  // but multi-action moves are legal on the human path (D10). Accept any MOVE
  // whose cost fits the remaining budget by checking the generator set first,
  // then falling back to a cost check.
  const legal = legalActions(state, player);
  if (legal.some((l) => actionsEqual(l, action))) return true;
  if (action.type === 'MOVE' && state.turn.phase === 'action') {
    return isLegalMultiActionMove(state, player, action);
  }
  return false;
}

import { getUnitById } from '../../src/game/board';
import { getUnitDefinition } from '../../src/game/units';
import { getMoveCost } from '../../src/game/movement';

function isLegalMultiActionMove(
  state: GameState,
  player: PlayerId,
  action: Extract<AIAction, { type: 'MOVE' }>
): boolean {
  const unit = getUnitById(state.board, action.unitId);
  if (!unit || unit.owner !== player || !unit.canActThisTurn) return false;
  const def = getUnitDefinition(unit.definitionId);
  const cost = getMoveCost(unit.position, action.to, def.speed, state.board);
  return cost !== null && cost <= state.turn.actionsRemaining;
}
