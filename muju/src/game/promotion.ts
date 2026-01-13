import type { BoardState, Unit, PlayerId } from './types';
import { getUnitDefinition, UNIT_DEFINITIONS } from './units';
import type { BuildState } from './building';

/**
 * Get the promotion cost for upgrading a unit to the next tier
 * Cost = difference between current and next tier unit costs
 */
export function getPromotionCost(unit: Unit): number | null {
  const def = getUnitDefinition(unit.definitionId);
  if (def.tier >= 4) {
    return null; // Can't promote T4 units
  }

  // Find next tier definition
  const nextTier = def.tier + 1;
  const nextDef = UNIT_DEFINITIONS.find(
    (d) => d.element === def.element && d.tier === nextTier
  );

  if (!nextDef) {
    return null;
  }

  return nextDef.cost - def.cost;
}

/**
 * Get the definition ID for a promoted unit (same element, next tier)
 */
export function getPromotedDefinitionId(unit: Unit): string | null {
  const def = getUnitDefinition(unit.definitionId);
  if (def.tier >= 4) {
    return null;
  }

  const nextTier = def.tier + 1;
  const promotedDef = UNIT_DEFINITIONS.find(
    (d) => d.element === def.element && d.tier === nextTier
  );

  return promotedDef?.id ?? null;
}

/**
 * Check if a unit can be promoted
 * Units can only be promoted once per placement phase
 * Units cannot be promoted on the same turn they were placed
 */
export function canPromote(unit: Unit, buildState: BuildState): boolean {
  // Check if placed this turn (can't promote same turn as placement)
  if (unit.placedThisTurn) {
    return false;
  }
  // Check if already promoted this placement phase
  if (unit.promotedThisPlacement) {
    return false;
  }
  const cost = getPromotionCost(unit);
  if (cost === null) {
    return false;
  }
  return buildState.crystals >= cost;
}

/**
 * Check if a unit is at max tier (T4)
 */
export function isMaxTier(unit: Unit): boolean {
  const def = getUnitDefinition(unit.definitionId);
  return def.tier >= 4;
}

/**
 * Promote a unit to the next tier
 * Returns the updated board state and build state
 * Marks unit as having been promoted this placement phase
 */
export function promoteUnit(
  board: BoardState,
  unitId: string,
  buildState: BuildState
): { board: BoardState; buildState: BuildState } | null {
  const unit = board.units.find((u) => u.id === unitId);
  if (!unit) {
    return null;
  }

  const cost = getPromotionCost(unit);
  const newDefId = getPromotedDefinitionId(unit);

  if (cost === null || newDefId === null) {
    return null;
  }

  if (buildState.crystals < cost) {
    return null;
  }

  // Update the unit's definition ID and mark as promoted this placement
  const newBoard: BoardState = {
    ...board,
    units: board.units.map((u) =>
      u.id === unitId ? { ...u, definitionId: newDefId, promotedThisPlacement: true } : u
    ),
  };

  const newBuildState: BuildState = {
    ...buildState,
    crystals: buildState.crystals - cost,
  };

  return { board: newBoard, buildState: newBuildState };
}

/**
 * Get all units that can be promoted for a player
 */
export function getPromotableUnits(
  board: BoardState,
  player: PlayerId,
  buildState: BuildState
): Unit[] {
  return board.units.filter(
    (unit) =>
      unit.owner === player &&
      canPromote(unit, buildState)
  );
}

/**
 * Get promotion info for a unit
 */
export function getPromotionInfo(unit: Unit): {
  currentTier: number;
  nextTier: number | null;
  cost: number | null;
  currentName: string;
  promotedName: string | null;
} {
  const def = getUnitDefinition(unit.definitionId);
  const promotedDefId = getPromotedDefinitionId(unit);
  const promotedDef = promotedDefId ? getUnitDefinition(promotedDefId) : null;

  return {
    currentTier: def.tier,
    nextTier: promotedDef?.tier ?? null,
    cost: getPromotionCost(unit),
    currentName: def.name,
    promotedName: promotedDef?.name ?? null,
  };
}
