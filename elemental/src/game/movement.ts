import type { BoardState, Position, Unit } from './types';
import {
  isValidPosition,
  isOccupied,
  manhattanDistance,
  BOARD_SIZE,
} from './board';
import { getUnitDefinition } from './units';

/**
 * Check if a unit can move (hasn't moved this turn and can act)
 */
export function canMove(unit: Unit): boolean {
  return !unit.hasMoved && unit.canActThisTurn;
}

/**
 * Get all valid move destinations for a unit
 *
 * Movement rules:
 * - Orthogonal only (no diagonals)
 * - Speed determines max squares moved
 * - Cannot move through other pieces
 * - Cannot end on occupied square
 */
export function getValidMoves(unit: Unit, board: BoardState): Position[] {
  if (!canMove(unit)) return [];

  const def = getUnitDefinition(unit.definitionId);
  const speed = def.speed;
  const validMoves: Position[] = [];

  // Use BFS to find all reachable positions within speed
  const visited = new Set<string>();
  const queue: { pos: Position; distance: number }[] = [
    { pos: unit.position, distance: 0 },
  ];

  const posKey = (p: Position) => `${p.x},${p.y}`;
  visited.add(posKey(unit.position));

  while (queue.length > 0) {
    const { pos, distance } = queue.shift()!;

    // If we've moved at least 1 square and position is valid, it's a valid move
    if (distance > 0 && !isOccupied(board, pos)) {
      validMoves.push(pos);
    }

    // Don't explore further if we've reached max speed
    if (distance >= speed) continue;

    // Explore orthogonal neighbors
    const neighbors = [
      { x: pos.x, y: pos.y - 1 },
      { x: pos.x, y: pos.y + 1 },
      { x: pos.x - 1, y: pos.y },
      { x: pos.x + 1, y: pos.y },
    ];

    for (const neighbor of neighbors) {
      if (!isValidPosition(neighbor)) continue;

      const key = posKey(neighbor);
      if (visited.has(key)) continue;

      // Can only pass through empty squares (except final destination check is above)
      if (isOccupied(board, neighbor)) {
        // Can't move through, but mark as visited so we don't try again
        visited.add(key);
        continue;
      }

      visited.add(key);
      queue.push({ pos: neighbor, distance: distance + 1 });
    }
  }

  return validMoves;
}

/**
 * Check if a specific move is valid
 */
export function isValidMove(
  unit: Unit,
  destination: Position,
  board: BoardState
): boolean {
  const validMoves = getValidMoves(unit, board);
  return validMoves.some((m) => m.x === destination.x && m.y === destination.y);
}

/**
 * Execute a move action (returns new board state)
 */
export function executeMove(
  board: BoardState,
  unitId: string,
  destination: Position
): BoardState {
  const unit = board.units.find((u) => u.id === unitId);
  if (!unit) return board;

  return {
    ...board,
    units: board.units.map((u) =>
      u.id === unitId ? { ...u, position: destination, hasMoved: true } : u
    ),
  };
}

/**
 * Find a path from one position to another (for animation purposes)
 * Returns array of positions from start to end (exclusive of start)
 * Returns null if no valid path exists
 */
export function findPath(
  from: Position,
  to: Position,
  board: BoardState,
  maxDistance: number
): Position[] | null {
  if (manhattanDistance(from, to) > maxDistance) return null;

  const posKey = (p: Position) => `${p.x},${p.y}`;
  const visited = new Map<string, Position | null>(); // maps position to its parent
  const queue: Position[] = [from];
  visited.set(posKey(from), null);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.x === to.x && current.y === to.y) {
      // Reconstruct path
      const path: Position[] = [];
      let pos: Position | null = to;

      while (pos && (pos.x !== from.x || pos.y !== from.y)) {
        path.unshift(pos);
        pos = visited.get(posKey(pos)) ?? null;
      }

      return path;
    }

    // Check if we've gone too far
    const distanceFromStart = reconstructPathLength(visited, current, from);
    if (distanceFromStart >= maxDistance) continue;

    const neighbors = [
      { x: current.x, y: current.y - 1 },
      { x: current.x, y: current.y + 1 },
      { x: current.x - 1, y: current.y },
      { x: current.x + 1, y: current.y },
    ];

    for (const neighbor of neighbors) {
      if (!isValidPosition(neighbor)) continue;

      const key = posKey(neighbor);
      if (visited.has(key)) continue;

      // Can only move through empty squares
      // Exception: destination can be checked separately
      if (
        isOccupied(board, neighbor) &&
        (neighbor.x !== to.x || neighbor.y !== to.y)
      ) {
        continue;
      }

      visited.set(key, current);
      queue.push(neighbor);
    }
  }

  return null;
}

function reconstructPathLength(
  visited: Map<string, Position | null>,
  current: Position,
  start: Position
): number {
  let length = 0;
  let pos: Position | null = current;
  const posKey = (p: Position) => `${p.x},${p.y}`;

  while (pos && (pos.x !== start.x || pos.y !== start.y)) {
    length++;
    pos = visited.get(posKey(pos)) ?? null;
  }

  return length;
}
