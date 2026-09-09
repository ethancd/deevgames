import { upkeepActions } from '../game/upkeep';
import type { GameState, PlayerId } from '../game/types';
import type { AIAction } from './types';
import { getPlayerUnits } from '../game/board';
import { getValidMoves } from '../game/movement';
import { getValidAttacks } from '../game/combat';
import { getAllSpawnPositions } from '../game/spawning';
import { canPromote } from '../game/promotion';
import { getAffordablePurchases } from '../game/building';
import { isLegalAction } from '../game/legality';

/**
 * Generate all legal move actions for a player's units
 */
export function generateMoveActions(state: GameState, player: PlayerId): AIAction[] {
  const actions: AIAction[] = [];
  const units = getPlayerUnits(state.board, player);

  for (const unit of units) {
    if (!unit.canActThisTurn) continue;

    const validMoves = getValidMoves(unit, state.board);
    for (const to of validMoves) {
      actions.push({ type: 'MOVE', unitId: unit.id, to });
    }
  }

  return actions;
}

/**
 * Generate all legal attack actions for a player's units
 */
export function generateAttackActions(state: GameState, player: PlayerId): AIAction[] {
  const actions: AIAction[] = [];
  const units = getPlayerUnits(state.board, player);

  for (const unit of units) {
    if (!unit.canActThisTurn) continue;

    const validAttacks = getValidAttacks(unit, state.board);
    for (const targetPosition of validAttacks) {
      actions.push({ type: 'ATTACK', unitId: unit.id, targetPosition });
    }
  }

  return actions;
}

export function generatePlaceActions(state: GameState, player: PlayerId): AIAction[] {
  if (state.turn.phase !== 'place') return [];
  return getAffordablePurchases(state.players[player].resources).flatMap(def =>
    getAllSpawnPositions(player, state.board).map(position => ({ type: 'BUY_UNIT' as const, definitionId: def.id, position })));
}

export function generatePromoteActions(state: GameState, player: PlayerId): AIAction[] {
  return getPlayerUnits(state.board, player).filter(u => canPromote(u, { crystals: state.players[player].resources }))
    .map(u => ({ type: 'PROMOTE_UNIT', unitId: u.id }));
}

export function generatePlacePhaseActions(state: GameState, player: PlayerId): AIAction[] {
  if (state.upkeepPending) return upkeepActions(state);
  if (state.turn.phase !== 'place') return [];
  return [...generatePlaceActions(state, player), ...generatePromoteActions(state, player), { type: 'END_PLACE_PHASE' }];
}

export function generateActionPhaseActions(state: GameState, player: PlayerId): AIAction[] {
  if (state.turn.phase !== 'action') return [];
  return [...(state.turn.actionsRemaining > 0 ? [...generateAttackActions(state, player), ...generateMoveActions(state, player)] : []), { type: 'END_ACTION_PHASE' }];
}

export function generateAllActions(state: GameState, player: PlayerId): AIAction[] {
  if (state.phase !== 'playing' || state.turn.currentPlayer !== player) return [];
  return (state.turn.phase === 'place' ? generatePlacePhaseActions(state, player) : generateActionPhaseActions(state, player))
    .filter(a => isLegalAction(state, a, player));
}

export function hasActionsAvailable(state: GameState, player: PlayerId): boolean {
  return state.turn.actionsRemaining > 0 && getPlayerUnits(state.board, player).some(u => u.canActThisTurn);
}

export function getSortedActions(actions: AIAction[]): AIAction[] {
  const order: Record<string, number> = { ATTACK: 0, BUY_UNIT: 1, PROMOTE_UNIT: 2, MOVE: 3 };
  return [...actions].sort((a, b) => (order[a.type] ?? 10) - (order[b.type] ?? 10));
}
