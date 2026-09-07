import type { GameState, PlayerId } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import {
  generatePlacePhaseActions,
  generateActionPhaseActions,
  generateQueuePhaseActions,
} from '../../src/ai/moves';
import { isLegalAction } from '../../src/game/legality';

/** Candidate generation plus the same authoritative rules used in actual play. */
export function legalActions(state: GameState, player: PlayerId): AIAction[] {
  const actions = state.turn.phase === 'place' ? generatePlacePhaseActions(state, player)
    : state.turn.phase === 'action' ? generateActionPhaseActions(state, player)
    : generateQueuePhaseActions(state, player);
  return actions.filter(a => isLegalAction(state, a, player));
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
  return isLegalAction(state, action, player);
}
