import type { BoardState, Unit, PlayerId, Position } from './types';
import { getUnitDefinition, UNIT_DEFINITIONS } from './units';
import { placeUnit, getPlayerUnits } from './board';
import { isValidSpawnPosition, getAllSpawnPositions } from './spawning';

/**
 * Build queue entry - represents a unit being built
 */
export interface BuildQueueEntry {
  definitionId: string;
  turnsRemaining: number;
}

/**
 * Player's build state
 */
export interface BuildState {
  queue: BuildQueueEntry[];
  crystals: number;
}

/**
 * Get the cost to build a unit (from unit definition)
 */
export function getBuildCost(definitionId: string): number {
  const def = getUnitDefinition(definitionId);
  return def.cost;
}

/**
 * Get the build time for a unit (from unit definition)
 */
export function getBuildTime(definitionId: string): number {
  const def = getUnitDefinition(definitionId);
  return def.buildTime;
}

/**
 * Check if a player can afford to build a unit
 */
export function canAfford(buildState: BuildState, definitionId: string): boolean {
  const cost = getBuildCost(definitionId);
  return buildState.crystals >= cost;
}

/**
 * Check if a player meets the tech requirements to build a unit.
 * - T1 units: Always available
 * - T2+ units: Require a unit of the same element at tier (N-1) or higher on the board
 */
export function meetsTechRequirement(
  definitionId: string,
  player: PlayerId,
  board: BoardState
): boolean {
  const def = getUnitDefinition(definitionId);

  // T1 units are always available
  if (def.tier === 1) {
    return true;
  }

  // For T2+, need a unit of same element at tier (N-1) or higher
  const requiredTier = def.tier - 1;
  const playerUnits = getPlayerUnits(board, player);

  return playerUnits.some((unit) => {
    const unitDef = getUnitDefinition(unit.definitionId);
    return unitDef.element === def.element && unitDef.tier >= requiredTier;
  });
}

/**
 * Get the required tier for building a unit (tier - 1, or 0 for T1)
 */
export function getRequiredTier(definitionId: string): number {
  const def = getUnitDefinition(definitionId);
  return Math.max(0, def.tier - 1);
}

/**
 * Check if a player can build a unit (affordable + meets tech requirements)
 */
export function canBuildUnit(
  definitionId: string,
  player: PlayerId,
  board: BoardState,
  buildState: BuildState
): boolean {
  return (
    canAfford(buildState, definitionId) &&
    meetsTechRequirement(definitionId, player, board)
  );
}

/**
 * Add a unit to the build queue
 * Returns new build state with updated crystals and queue
 */
export function addToBuildQueue(
  buildState: BuildState,
  definitionId: string
): BuildState {
  const cost = getBuildCost(definitionId);
  const buildTime = getBuildTime(definitionId);

  return {
    crystals: buildState.crystals - cost,
    queue: [
      ...buildState.queue,
      { definitionId, turnsRemaining: buildTime },
    ],
  };
}

/**
 * Process the build queue at end of turn
 * Decrements turn counters, returns ready units and updated queue
 */
export function processBuildQueue(buildState: BuildState): {
  readyUnits: string[];
  newBuildState: BuildState;
} {
  const readyUnits: string[] = [];
  const remainingQueue: BuildQueueEntry[] = [];

  for (const entry of buildState.queue) {
    const newTurnsRemaining = entry.turnsRemaining - 1;
    if (newTurnsRemaining <= 0) {
      readyUnits.push(entry.definitionId);
    } else {
      remainingQueue.push({
        ...entry,
        turnsRemaining: newTurnsRemaining,
      });
    }
  }

  return {
    readyUnits,
    newBuildState: {
      ...buildState,
      queue: remainingQueue,
    },
  };
}

/**
 * Create a unit instance from a definition
 */
export function createUnitFromDefinition(
  definitionId: string,
  owner: PlayerId,
  position: Position,
  id: string
): Unit {
  return {
    id,
    definitionId,
    owner,
    position,
    hasMoved: false,
    hasAttacked: false,
    hasMined: false,
    canActThisTurn: false, // Units placed this turn cannot act
  };
}

/**
 * Place a newly built unit on the board
 * Returns the new board with the unit placed, or null if placement is invalid
 */
export function placeBuiltUnit(
  board: BoardState,
  definitionId: string,
  owner: PlayerId,
  position: Position,
  unitId: string
): BoardState | null {
  if (!isValidSpawnPosition(position, owner, board)) {
    return null;
  }

  const unit = createUnitFromDefinition(definitionId, owner, position, unitId);
  return placeUnit(board, unit);
}

/**
 * Get all available build options for a player
 * Returns unit definitions they could potentially build
 */
export function getAvailableBuildOptions(buildState: BuildState): string[] {
  return UNIT_DEFINITIONS
    .filter((def) => canAfford(buildState, def.id))
    .map((def) => def.id);
}

/**
 * Check if a player has any valid spawn positions
 */
export function hasValidSpawnPositions(
  player: PlayerId,
  board: BoardState
): boolean {
  const positions = getAllSpawnPositions(player, board);
  return positions.length > 0;
}

/**
 * Create initial build state
 */
export function createInitialBuildState(): BuildState {
  return {
    queue: [],
    crystals: 0,
  };
}

/**
 * Add crystals to build state (from mining)
 */
export function addCrystals(buildState: BuildState, amount: number): BuildState {
  return {
    ...buildState,
    crystals: buildState.crystals + amount,
  };
}

/**
 * Get queue summary for display
 */
export function getQueueSummary(buildState: BuildState): Array<{
  name: string;
  element: string;
  tier: number;
  turnsRemaining: number;
}> {
  return buildState.queue.map((entry) => {
    const def = getUnitDefinition(entry.definitionId);
    return {
      name: def.name,
      element: def.element,
      tier: def.tier,
      turnsRemaining: entry.turnsRemaining,
    };
  });
}
