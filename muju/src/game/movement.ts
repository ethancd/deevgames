import type { BoardState, Position, Unit } from './types';
import {
  isValidPosition,
  isOccupied,
  manhattanDistance,
} from './board';
import { getUnitDefinition } from './units';

/**
 * Check if a unit can move (can act this turn)
 * Units can move multiple times per turn if they have actions remaining.
 */
export function canMove(unit: Unit): boolean {
  return unit.canActThisTurn;
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
  return reachable(unit.position, getUnitDefinition(unit.definitionId).speed, board).map(p => p.position);
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

/**
 * Position with remaining actions to reach it
 */
export interface MovementRangePosition {
  position: Position;
  actionsRemaining: number;
}

/**
 * Calculate all reachable positions with the number of actions remaining
 * after reaching each position.
 *
 * @param startPosition - Starting position of the unit
 * @param speed - Movement speed per action
 * @param totalActions - Total actions available (e.g., 6)
 * @param board - Current board state for obstacle checking
 * @returns Array of positions with their remaining actions cost
 */
export function getMovementRange(
  startPosition: Position,
  speed: number,
  totalActions: number,
  board: BoardState
): MovementRangePosition[] {
  return reachable(startPosition, speed * totalActions, board).map(p => ({
    position: p.position, actionsRemaining: totalActions - Math.ceil(p.distance / speed),
  }));
}

/**
 * Calculate the number of actions required to move from one position to another.
 * Returns null if the position is not reachable.
 *
 * @param startPosition - Starting position
 * @param targetPosition - Target position
 * @param speed - Unit's movement speed
 * @param board - Current board state
 * @returns Number of actions required, or null if unreachable
 */
export function getMoveCost(
  startPosition: Position,
  targetPosition: Position,
  speed: number,
  board: BoardState
): number | null {
  const distance = distancesFrom(startPosition, board).distances[targetPosition.y * 10 + targetPosition.x];
  return distance > 0 ? Math.ceil(distance / speed) : null;
}


// Immutable board identity scopes derived data. Weak keys let old game/search
// positions be collected; the 100-entry FIFO preserves up/down/left/right order.
const movementCache = new WeakMap<BoardState, Map<number, { distances: Int16Array; order: number[] }>>();
function distancesFrom(start: Position, board: BoardState) {
  let cache = movementCache.get(board);
  if (!cache) { cache = new Map(); movementCache.set(board, cache); }
  const origin = start.y * 10 + start.x;
  const cached = cache.get(origin); if (cached) return cached;
  const occupied = new Uint8Array(100);
  for (const u of board.units) occupied[u.position.y * 10 + u.position.x] = 1;
  const distances = new Int16Array(100).fill(-1), queue = new Int16Array(100), order: number[] = [];
  let head = 0, tail = 1; queue[0] = origin; distances[origin] = 0;
  while (head < tail) {
    const p = queue[head++], x = p % 10, y = Math.floor(p / 10);
    for (const n of [y > 0 ? p - 10 : -1, y < 9 ? p + 10 : -1, x > 0 ? p - 1 : -1, x < 9 ? p + 1 : -1]) {
      if (n < 0 || occupied[n] || distances[n] >= 0) continue;
      distances[n] = distances[p] + 1; queue[tail++] = n; order.push(n);
    }
  }
  const result = { distances, order }; cache.set(origin, result); return result;
}
function reachable(start: Position, maximum: number, board: BoardState) {
  const { distances, order } = distancesFrom(start, board);
  return order.filter(n => distances[n] <= maximum).map(n => ({ position: { x: n % 10, y: Math.floor(n / 10) }, distance: distances[n] }));
}
