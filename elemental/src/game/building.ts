import type { BoardState, Unit, PlayerId, Position } from './types';
import { getUnitDefinition, UNIT_DEFINITIONS } from './units';
import { placeUnit } from './board';
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
 * Get the cost to build a unit based on tier
 * Tier 1: 1 crystal, Tier 2: 2 crystals, Tier 3: 3 crystals, Tier 4: 4 crystals
 */
export function getBuildCost(definitionId: string): number {
  const def = getUnitDefinition(definitionId);
  return def.tier;
}

/**
 * Get the build time for a unit based on tier
 * Tier 1: 1 turn, Tier 2: 2 turns, Tier 3: 3 turns, Tier 4: 4 turns
 */
export function getBuildTime(definitionId: string): number {
  const def = getUnitDefinition(definitionId);
  return def.tier;
}

/**
 * Check if a player can afford to build a unit
 */
export function canAfford(buildState: BuildState, definitionId: string): boolean {
  const cost = getBuildCost(definitionId);
  return buildState.crystals >= cost;
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
