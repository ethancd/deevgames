import type { BoardState, Position, Unit, PlayerId } from './types';
import { isValidPosition, getUnitAt, getPlayerUnits, getStartCorner } from './board';

/**
 * Get the spawn rectangle defined by a player's start corner and an anchor unit.
 * The rectangle includes all positions between the two corners (inclusive).
 */
export function getSpawnRectangle(
  startCorner: Position,
  anchorPosition: Position
): Position[] {
  const minX = Math.min(startCorner.x, anchorPosition.x);
  const maxX = Math.max(startCorner.x, anchorPosition.x);
  const minY = Math.min(startCorner.y, anchorPosition.y);
  const maxY = Math.max(startCorner.y, anchorPosition.y);

  const positions: Position[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const pos = { x, y };
      if (isValidPosition(pos)) {
        positions.push(pos);
      }
    }
  }

  return positions;
}

/**
 * Check if any enemy units are within a spawn rectangle.
 */
export function hasEnemyInRectangle(
  rectangle: Position[],
  board: BoardState,
  player: PlayerId
): boolean {
  for (const pos of rectangle) {
    const unit = getUnitAt(board, pos);
    if (unit && unit.owner !== player) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a spawn zone is blocked by enemy presence.
 */
export function isSpawnBlocked(
  anchor: Unit,
  player: PlayerId,
  board: BoardState
): boolean {
  const startCorner = getStartCorner(player);
  const rectangle = getSpawnRectangle(startCorner, anchor.position);
  return hasEnemyInRectangle(rectangle, board, player);
}

/**
 * Get all valid spawn positions for a player using a specific anchor.
 * Returns empty array if the spawn zone is blocked by enemies.
 */
export function getSpawnZone(
  anchor: Unit,
  player: PlayerId,
  board: BoardState
): Position[] {
  const startCorner = getStartCorner(player);
  const rectangle = getSpawnRectangle(startCorner, anchor.position);

  // Check if any enemies are in the rectangle
  if (hasEnemyInRectangle(rectangle, board, player)) {
    return [];
  }

  // Return all empty positions in the rectangle
  return rectangle.filter((pos) => !getUnitAt(board, pos));
}

/**
 * Get all valid anchors for spawning (player's units that create unblocked spawn zones).
 */
export function getValidAnchors(
  player: PlayerId,
  board: BoardState
): Unit[] {
  const playerUnits = getPlayerUnits(board, player);

  return playerUnits.filter((unit) => !isSpawnBlocked(unit, player, board));
}

/**
 * Get all possible spawn positions across all valid anchors.
 * Returns a deduplicated list of all positions where a unit could be placed.
 */
export function getAllSpawnPositions(
  player: PlayerId,
  board: BoardState
): Position[] {
  const validAnchors = getValidAnchors(player, board);
  const positionSet = new Set<string>();
  const positions: Position[] = [];

  for (const anchor of validAnchors) {
    const zone = getSpawnZone(anchor, player, board);
    for (const pos of zone) {
      const key = `${pos.x},${pos.y}`;
      if (!positionSet.has(key)) {
        positionSet.add(key);
        positions.push(pos);
      }
    }
  }

  return positions;
}

/**
 * Check if a specific position is a valid spawn location for a player.
 */
export function isValidSpawnPosition(
  position: Position,
  player: PlayerId,
  board: BoardState
): boolean {
  // Position must be empty
  if (getUnitAt(board, position)) {
    return false;
  }

  // Check if any anchor creates a valid spawn zone containing this position
  const playerUnits = getPlayerUnits(board, player);
  const startCorner = getStartCorner(player);

  for (const anchor of playerUnits) {
    const rectangle = getSpawnRectangle(startCorner, anchor.position);

    // Check if position is in this rectangle
    const inRectangle = rectangle.some(
      (p) => p.x === position.x && p.y === position.y
    );
    if (!inRectangle) continue;

    // Check if this rectangle is unblocked
    if (!hasEnemyInRectangle(rectangle, board, player)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the largest spawn zone available to a player.
 * Useful for AI evaluation.
 */
export function getLargestSpawnZone(
  player: PlayerId,
  board: BoardState
): { anchor: Unit | null; zone: Position[] } {
  const validAnchors = getValidAnchors(player, board);
  let largestZone: Position[] = [];
  let bestAnchor: Unit | null = null;

  for (const anchor of validAnchors) {
    const zone = getSpawnZone(anchor, player, board);
    if (zone.length > largestZone.length) {
      largestZone = zone;
      bestAnchor = anchor;
    }
  }

  return { anchor: bestAnchor, zone: largestZone };
}
