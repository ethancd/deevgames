import type { GameState, PlayerId } from '../game/types';
import type { AIAction } from './types';
import { getPlayerUnits } from '../game/board';
import { getValidMoves } from '../game/movement';
import { getValidAttacks } from '../game/combat';
import { canMine } from '../game/mining';
import { getAllSpawnPositions } from '../game/spawning';
import { getReadyUnits } from '../game/turn';
import { canPromote, getPromotionCost } from '../game/promotion';
import { UNIT_DEFINITIONS } from '../game/units';

/**
 * Generate all legal move actions for a player's units
 */
export function generateMoveActions(state: GameState, player: PlayerId): AIAction[] {
  const actions: AIAction[] = [];
  const units = getPlayerUnits(state.board, player);

  for (const unit of units) {
    if (!unit.canActThisTurn || unit.hasMoved) continue;

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
    if (!unit.canActThisTurn || unit.hasAttacked) continue;

    const validAttacks = getValidAttacks(unit, state.board);
    for (const targetPosition of validAttacks) {
      actions.push({ type: 'ATTACK', unitId: unit.id, targetPosition });
    }
  }

  return actions;
}

/**
 * Generate all legal mine actions for a player's units
 */
export function generateMineActions(state: GameState, player: PlayerId): AIAction[] {
  const actions: AIAction[] = [];
  const units = getPlayerUnits(state.board, player);

  for (const unit of units) {
    if (!unit.canActThisTurn || unit.hasMined) continue;

    if (canMine(unit, state.board)) {
      actions.push({ type: 'MINE', unitId: unit.id });
    }
  }

  return actions;
}

/**
 * Generate all actions available during action phase
 */
export function generateActionPhaseActions(state: GameState, player: PlayerId): AIAction[] {
  if (state.turn.phase !== 'action' || state.turn.actionsRemaining <= 0) {
    return [{ type: 'END_ACTION_PHASE' }];
  }

  const actions: AIAction[] = [];

  // Generate all possible actions
  actions.push(...generateMoveActions(state, player));
  actions.push(...generateAttackActions(state, player));
  actions.push(...generateMineActions(state, player));

  // Always can end action phase early
  actions.push({ type: 'END_ACTION_PHASE' });

  return actions;
}

/**
 * Generate placement actions for units ready to place
 */
export function generatePlaceActions(state: GameState, player: PlayerId): AIAction[] {
  const actions: AIAction[] = [];
  const playerState = state.players[player];
  const readyUnits = getReadyUnits(playerState);

  if (readyUnits.length === 0) {
    return actions;
  }

  const spawnPositions = getAllSpawnPositions(player, state.board);

  for (const queuedUnit of readyUnits) {
    for (const position of spawnPositions) {
      actions.push({
        type: 'PLACE_UNIT',
        queuedUnitId: queuedUnit.id,
        position,
      });
    }
  }

  return actions;
}

/**
 * Generate promotion actions for units that can be promoted
 */
export function generatePromoteActions(state: GameState, player: PlayerId): AIAction[] {
  const actions: AIAction[] = [];
  const playerState = state.players[player];
  const units = getPlayerUnits(state.board, player);

  // Create a mock build state for canPromote check
  const buildState = { queue: [], crystals: playerState.resources };

  for (const unit of units) {
    if (canPromote(unit, buildState)) {
      const cost = getPromotionCost(unit);
      if (cost !== null && playerState.resources >= cost) {
        actions.push({ type: 'PROMOTE_UNIT', unitId: unit.id });
      }
    }
  }

  return actions;
}

/**
 * Generate queue actions for building new units
 */
export function generateQueueActions(state: GameState, player: PlayerId): AIAction[] {
  const actions: AIAction[] = [];
  const playerState = state.players[player];

  // Get all units player can afford
  for (const def of UNIT_DEFINITIONS) {
    if (playerState.resources >= def.cost) {
      actions.push({ type: 'QUEUE_UNIT', definitionId: def.id });
    }
  }

  return actions;
}

/**
 * Generate all actions available during place phase
 */
export function generatePlacePhaseActions(state: GameState, player: PlayerId): AIAction[] {
  if (state.turn.phase !== 'place') {
    return [];
  }

  const actions: AIAction[] = [];

  // Can place ready units
  actions.push(...generatePlaceActions(state, player));

  // Can promote units
  actions.push(...generatePromoteActions(state, player));

  return actions;
}

/**
 * Generate all actions available during queue phase
 */
export function generateQueuePhaseActions(state: GameState, player: PlayerId): AIAction[] {
  if (state.turn.phase !== 'queue') {
    return [{ type: 'END_TURN' }];
  }

  const actions: AIAction[] = [];

  // Can queue new units
  actions.push(...generateQueueActions(state, player));

  // Always can end turn
  actions.push({ type: 'END_TURN' });

  return actions;
}

/**
 * Generate all legal actions for current game phase
 */
export function generateAllActions(state: GameState, player: PlayerId): AIAction[] {
  switch (state.turn.phase) {
    case 'place':
      return generatePlacePhaseActions(state, player);
    case 'action':
      return generateActionPhaseActions(state, player);
    case 'queue':
      return generateQueuePhaseActions(state, player);
    default:
      return [];
  }
}

/**
 * Check if any units can still act
 */
export function hasActionsAvailable(state: GameState, player: PlayerId): boolean {
  if (state.turn.actionsRemaining <= 0) return false;

  const units = getPlayerUnits(state.board, player);
  return units.some(
    (u) =>
      u.canActThisTurn && (!u.hasMoved || !u.hasAttacked || !u.hasMined)
  );
}

/**
 * Get priority-sorted actions (attacks first, then moves, then mining)
 * This is for action ordering in alpha-beta to improve pruning
 */
export function getSortedActions(actions: AIAction[]): AIAction[] {
  const priority = (action: AIAction): number => {
    switch (action.type) {
      case 'ATTACK':
        return 0; // Highest priority - check kills first
      case 'MOVE':
        return 1;
      case 'MINE':
        return 2;
      case 'QUEUE_UNIT':
        return 3;
      case 'PLACE_UNIT':
        return 4;
      case 'PROMOTE_UNIT':
        return 5;
      case 'END_ACTION_PHASE':
        return 6;
      case 'END_TURN':
        return 7;
      default:
        return 10;
    }
  };

  return [...actions].sort((a, b) => priority(a) - priority(b));
}
