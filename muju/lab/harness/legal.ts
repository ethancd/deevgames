import type { GameState, PlayerId } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import {
  generatePlacePhaseActions,
  generateActionPhaseActions,
} from '../../src/ai/moves';
import { isLegalAction } from '../../src/game/legality';

/** Candidate generation plus the same authoritative rules used in actual play. */
export function legalActions(state: GameState, player: PlayerId): AIAction[] {
  const actions = state.turn.phase === 'place' ? generatePlacePhaseActions(state, player)
    : generateActionPhaseActions(state, player);
  return actions.filter(a => isLegalAction(state, a, player));
}

function posEq(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Structural equality on AIActions (for membership checks against the legal set). */
export function actionsEqual(a: AIAction, b: AIAction): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'PAY_UPKEEP': return b.type==='PAY_UPKEEP' && JSON.stringify([...a.keepUnitIds].sort())===JSON.stringify([...b.keepUnitIds].sort());
    case 'MOVE':
      return b.type === 'MOVE' && a.unitId === b.unitId && posEq(a.to, b.to);
    case 'ATTACK':
      return b.type === 'ATTACK' && a.unitId === b.unitId && posEq(a.targetPosition, b.targetPosition);
    case 'BUY_UNIT':
      return b.type === 'BUY_UNIT' && a.definitionId === b.definitionId && posEq(a.position, b.position);
    case 'PROMOTE_UNIT':
      return b.type === 'PROMOTE_UNIT' && a.unitId === b.unitId;
    default:
      // END_ACTION_PHASE / RESIGN carry no payload
      return true;
  }
}

/**
 * Is an emitted action legal right now? END_ACTION_PHASE / RESIGN
 * are treated as always-available phase controls in the matching phase
 * (mirrors the real reducer, which accepts them whenever the phase matches).
 */
export function isLegalNow(state: GameState, player: PlayerId, action: AIAction): boolean {
  return isLegalAction(state, action, player);
}
