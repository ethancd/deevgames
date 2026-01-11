import type {
  BoardState,
  Cell,
  Position,
  Unit,
  PlayerId,
  GameState,
  PlayerState,
  TurnState,
} from './types';
import { STARTING_UNITS } from './units';

export const BOARD_SIZE = 10;
export const INITIAL_RESOURCE_LAYERS = 5;
export const MAX_ACTIONS_PER_TURN = 4;

/**
 * Create a fresh cell at a position with full resources
 */
export function createCell(x: number, y: number): Cell {
  return {
    position: { x, y },
    resourceLayers: INITIAL_RESOURCE_LAYERS,
    minedDepth: 0,
  };
}

/**
 * Create an empty 10x10 board with all cells having full resources
 */
export function createEmptyBoard(): BoardState {
  const cells: Cell[][] = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      row.push(createCell(x, y));
    }
    cells.push(row);
  }

  return { cells, units: [] };
}

/**
 * Get a cell at a position
 */
export function getCell(board: BoardState, pos: Position): Cell | null {
  if (!isValidPosition(pos)) return null;
  return board.cells[pos.y][pos.x];
}

/**
 * Check if a position is within the board bounds
 */
export function isValidPosition(pos: Position): boolean {
  return pos.x >= 0 && pos.x < BOARD_SIZE && pos.y >= 0 && pos.y < BOARD_SIZE;
}

/**
 * Get a unit at a position, or null if empty
 */
export function getUnitAt(board: BoardState, pos: Position): Unit | null {
  return (
    board.units.find((u) => u.position.x === pos.x && u.position.y === pos.y) ??
    null
  );
}

/**
 * Get a unit by ID
 */
export function getUnitById(board: BoardState, unitId: string): Unit | null {
  return board.units.find((u) => u.id === unitId) ?? null;
}

/**
 * Check if a position is occupied by any unit
 */
export function isOccupied(board: BoardState, pos: Position): boolean {
  return getUnitAt(board, pos) !== null;
}

/**
 * Get all units belonging to a player
 */
export function getPlayerUnits(board: BoardState, player: PlayerId): Unit[] {
  return board.units.filter((u) => u.owner === player);
}

/**
 * Create a unit instance
 */
export function createUnit(
  definitionId: string,
  owner: PlayerId,
  position: Position,
  canAct: boolean = true
): Unit {
  return {
    id: `${owner}_${definitionId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    definitionId,
    owner,
    position,
    hasMoved: false,
    hasAttacked: false,
    hasMined: false,
    canActThisTurn: canAct,
  };
}

/**
 * Add a unit to the board (immutably)
 */
export function addUnit(board: BoardState, unit: Unit): BoardState {
  return {
    ...board,
    units: [...board.units, unit],
  };
}

/**
 * Remove a unit from the board (immutably)
 */
export function removeUnit(board: BoardState, unitId: string): BoardState {
  return {
    ...board,
    units: board.units.filter((u) => u.id !== unitId),
  };
}

/**
 * Update a unit on the board (immutably)
 */
export function updateUnit(
  board: BoardState,
  unitId: string,
  updates: Partial<Unit>
): BoardState {
  return {
    ...board,
    units: board.units.map((u) => (u.id === unitId ? { ...u, ...updates } : u)),
  };
}

/**
 * Update a cell on the board (immutably)
 */
export function updateCell(
  board: BoardState,
  pos: Position,
  updates: Partial<Cell>
): BoardState {
  const newCells = board.cells.map((row, y) =>
    y === pos.y
      ? row.map((cell, x) => (x === pos.x ? { ...cell, ...updates } : cell))
      : row
  );
  return { ...board, cells: newCells };
}

/**
 * Get the starting corner for a player
 */
export function getStartCorner(player: PlayerId): Position {
  return player === 'player' ? { x: 0, y: 0 } : { x: 9, y: 9 };
}

/**
 * Get starting unit positions relative to a corner
 * Player at (0,0): Hi at (1,0), Sjor at (1,1), Muju at (0,1)
 * AI at (9,9): Hi at (8,9), Sjor at (8,8), Muju at (9,8)
 */
export function getStartingPositions(player: PlayerId): Position[] {
  if (player === 'player') {
    return [
      { x: 1, y: 0 }, // Hi (Fire)
      { x: 1, y: 1 }, // Sjor (Water)
      { x: 0, y: 1 }, // Muju (Plant)
    ];
  } else {
    return [
      { x: 8, y: 9 }, // Hi (Fire)
      { x: 8, y: 8 }, // Sjor (Water)
      { x: 9, y: 8 }, // Muju (Plant)
    ];
  }
}

/**
 * Create the initial game state
 */
export function createInitialGameState(): GameState {
  let board = createEmptyBoard();

  // Add starting units for both players
  const players: PlayerId[] = ['player', 'ai'];

  for (const player of players) {
    const positions = getStartingPositions(player);
    STARTING_UNITS.forEach((defId, index) => {
      const unit = createUnit(defId, player, positions[index], true);
      board = addUnit(board, unit);
    });
  }

  const playerState: PlayerState = {
    id: 'player',
    resources: 0,
    buildQueue: [],
    startCorner: getStartCorner('player'),
  };

  const aiState: PlayerState = {
    id: 'ai',
    resources: 0,
    buildQueue: [],
    startCorner: getStartCorner('ai'),
  };

  const turnState: TurnState = {
    currentPlayer: 'player',
    phase: 'place',
    actionsRemaining: MAX_ACTIONS_PER_TURN,
    turnNumber: 1,
  };

  return {
    phase: 'playing',
    board,
    players: {
      player: playerState,
      ai: aiState,
    },
    turn: turnState,
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

/**
 * Reset action flags for all units of a player at the start of their turn
 */
export function resetUnitActions(
  board: BoardState,
  player: PlayerId
): BoardState {
  return {
    ...board,
    units: board.units.map((u) =>
      u.owner === player
        ? {
            ...u,
            hasMoved: false,
            hasAttacked: false,
            hasMined: false,
            canActThisTurn: true,
          }
        : u
    ),
  };
}

/**
 * Calculate Manhattan distance between two positions
 */
export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Check if two positions are orthogonally adjacent
 */
export function isAdjacent(a: Position, b: Position): boolean {
  return manhattanDistance(a, b) === 1;
}

/**
 * Get all orthogonally adjacent positions
 */
export function getAdjacentPositions(pos: Position): Position[] {
  const deltas = [
    { x: 0, y: -1 }, // up
    { x: 0, y: 1 }, // down
    { x: -1, y: 0 }, // left
    { x: 1, y: 0 }, // right
  ];

  return deltas
    .map((d) => ({ x: pos.x + d.x, y: pos.y + d.y }))
    .filter(isValidPosition);
}
