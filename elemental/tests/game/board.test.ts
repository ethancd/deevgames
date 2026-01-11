import { describe, it, expect } from 'vitest';
import {
  createEmptyBoard,
  createCell,
  getCell,
  isValidPosition,
  getUnitAt,
  getUnitById,
  isOccupied,
  getPlayerUnits,
  createUnit,
  addUnit,
  removeUnit,
  updateUnit,
  updateCell,
  getStartCorner,
  getStartingPositions,
  createInitialGameState,
  resetUnitActions,
  manhattanDistance,
  isAdjacent,
  getAdjacentPositions,
  BOARD_SIZE,
  INITIAL_RESOURCE_LAYERS,
} from '../../src/game/board';

describe('Board Module', () => {
  describe('Constants', () => {
    it('board is 10x10', () => {
      expect(BOARD_SIZE).toBe(10);
    });

    it('cells start with 5 resource layers', () => {
      expect(INITIAL_RESOURCE_LAYERS).toBe(5);
    });
  });

  describe('createCell', () => {
    it('creates a cell at the given position', () => {
      const cell = createCell(3, 5);
      expect(cell.position).toEqual({ x: 3, y: 5 });
    });

    it('starts with full resources', () => {
      const cell = createCell(0, 0);
      expect(cell.resourceLayers).toBe(5);
      expect(cell.minedDepth).toBe(0);
    });
  });

  describe('createEmptyBoard', () => {
    it('creates a 10x10 grid', () => {
      const board = createEmptyBoard();
      expect(board.cells).toHaveLength(10);
      for (const row of board.cells) {
        expect(row).toHaveLength(10);
      }
    });

    it('starts with no units', () => {
      const board = createEmptyBoard();
      expect(board.units).toHaveLength(0);
    });

    it('all cells have full resources', () => {
      const board = createEmptyBoard();
      for (const row of board.cells) {
        for (const cell of row) {
          expect(cell.resourceLayers).toBe(5);
        }
      }
    });

    it('cells have correct positions', () => {
      const board = createEmptyBoard();
      expect(board.cells[0][0].position).toEqual({ x: 0, y: 0 });
      expect(board.cells[5][3].position).toEqual({ x: 3, y: 5 });
      expect(board.cells[9][9].position).toEqual({ x: 9, y: 9 });
    });
  });

  describe('isValidPosition', () => {
    it('returns true for valid positions', () => {
      expect(isValidPosition({ x: 0, y: 0 })).toBe(true);
      expect(isValidPosition({ x: 9, y: 9 })).toBe(true);
      expect(isValidPosition({ x: 5, y: 5 })).toBe(true);
    });

    it('returns false for negative coordinates', () => {
      expect(isValidPosition({ x: -1, y: 0 })).toBe(false);
      expect(isValidPosition({ x: 0, y: -1 })).toBe(false);
    });

    it('returns false for out-of-bounds coordinates', () => {
      expect(isValidPosition({ x: 10, y: 0 })).toBe(false);
      expect(isValidPosition({ x: 0, y: 10 })).toBe(false);
    });
  });

  describe('getCell', () => {
    it('returns the cell at a valid position', () => {
      const board = createEmptyBoard();
      const cell = getCell(board, { x: 3, y: 5 });
      expect(cell?.position).toEqual({ x: 3, y: 5 });
    });

    it('returns null for invalid positions', () => {
      const board = createEmptyBoard();
      expect(getCell(board, { x: -1, y: 0 })).toBeNull();
      expect(getCell(board, { x: 10, y: 0 })).toBeNull();
    });
  });

  describe('Unit management', () => {
    it('createUnit creates a unit with correct properties', () => {
      const unit = createUnit('fire_1', 'player', { x: 1, y: 0 });
      expect(unit.definitionId).toBe('fire_1');
      expect(unit.owner).toBe('player');
      expect(unit.position).toEqual({ x: 1, y: 0 });
      expect(unit.hasMoved).toBe(false);
      expect(unit.hasAttacked).toBe(false);
      expect(unit.hasMined).toBe(false);
      expect(unit.canActThisTurn).toBe(true);
    });

    it('createUnit generates unique IDs', () => {
      const unit1 = createUnit('fire_1', 'player', { x: 0, y: 0 });
      const unit2 = createUnit('fire_1', 'player', { x: 1, y: 0 });
      expect(unit1.id).not.toBe(unit2.id);
    });

    it('addUnit adds a unit to the board', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 1, y: 0 });
      board = addUnit(board, unit);
      expect(board.units).toHaveLength(1);
      expect(board.units[0]).toBe(unit);
    });

    it('removeUnit removes a unit from the board', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 1, y: 0 });
      board = addUnit(board, unit);
      board = removeUnit(board, unit.id);
      expect(board.units).toHaveLength(0);
    });

    it('updateUnit updates unit properties', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 1, y: 0 });
      board = addUnit(board, unit);
      board = updateUnit(board, unit.id, { hasMoved: true });
      expect(board.units[0].hasMoved).toBe(true);
    });

    it('getUnitAt returns unit at position', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 1, y: 0 });
      board = addUnit(board, unit);
      expect(getUnitAt(board, { x: 1, y: 0 })).toBe(unit);
    });

    it('getUnitAt returns null for empty position', () => {
      const board = createEmptyBoard();
      expect(getUnitAt(board, { x: 1, y: 0 })).toBeNull();
    });

    it('getUnitById returns unit by ID', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 1, y: 0 });
      board = addUnit(board, unit);
      expect(getUnitById(board, unit.id)).toBe(unit);
    });

    it('isOccupied returns true if position has unit', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 1, y: 0 });
      board = addUnit(board, unit);
      expect(isOccupied(board, { x: 1, y: 0 })).toBe(true);
      expect(isOccupied(board, { x: 0, y: 0 })).toBe(false);
    });

    it('getPlayerUnits returns only units for that player', () => {
      let board = createEmptyBoard();
      board = addUnit(board, createUnit('fire_1', 'player', { x: 0, y: 0 }));
      board = addUnit(board, createUnit('water_1', 'player', { x: 1, y: 0 }));
      board = addUnit(board, createUnit('fire_1', 'ai', { x: 9, y: 9 }));

      const playerUnits = getPlayerUnits(board, 'player');
      expect(playerUnits).toHaveLength(2);
      expect(playerUnits.every((u) => u.owner === 'player')).toBe(true);
    });
  });

  describe('updateCell', () => {
    it('updates cell properties immutably', () => {
      const board = createEmptyBoard();
      const newBoard = updateCell(board, { x: 3, y: 5 }, { resourceLayers: 3 });

      expect(getCell(newBoard, { x: 3, y: 5 })?.resourceLayers).toBe(3);
      expect(getCell(board, { x: 3, y: 5 })?.resourceLayers).toBe(5);
    });
  });

  describe('Starting positions', () => {
    it('player starts at corner (0,0)', () => {
      expect(getStartCorner('player')).toEqual({ x: 0, y: 0 });
    });

    it('AI starts at corner (9,9)', () => {
      expect(getStartCorner('ai')).toEqual({ x: 9, y: 9 });
    });

    it('player starting positions are near (0,0)', () => {
      const positions = getStartingPositions('player');
      expect(positions).toHaveLength(3);
      for (const pos of positions) {
        expect(pos.x).toBeLessThanOrEqual(1);
        expect(pos.y).toBeLessThanOrEqual(1);
      }
    });

    it('AI starting positions are near (9,9)', () => {
      const positions = getStartingPositions('ai');
      expect(positions).toHaveLength(3);
      for (const pos of positions) {
        expect(pos.x).toBeGreaterThanOrEqual(8);
        expect(pos.y).toBeGreaterThanOrEqual(8);
      }
    });
  });

  describe('createInitialGameState', () => {
    it('creates a valid game state', () => {
      const state = createInitialGameState();
      expect(state.phase).toBe('playing');
      expect(state.winner).toBeNull();
    });

    it('places 6 units (3 per player)', () => {
      const state = createInitialGameState();
      expect(state.board.units).toHaveLength(6);
    });

    it('each player has correct starting units', () => {
      const state = createInitialGameState();
      const playerUnits = getPlayerUnits(state.board, 'player');
      const aiUnits = getPlayerUnits(state.board, 'ai');

      expect(playerUnits).toHaveLength(3);
      expect(aiUnits).toHaveLength(3);

      const playerDefs = playerUnits.map((u) => u.definitionId).sort();
      expect(playerDefs).toEqual(['fire_1', 'plant_1', 'water_1']);
    });

    it('players start with 0 resources', () => {
      const state = createInitialGameState();
      expect(state.players.player.resources).toBe(0);
      expect(state.players.ai.resources).toBe(0);
    });

    it('turn starts with player in place phase', () => {
      const state = createInitialGameState();
      expect(state.turn.currentPlayer).toBe('player');
      expect(state.turn.phase).toBe('place');
      expect(state.turn.turnNumber).toBe(1);
    });
  });

  describe('resetUnitActions', () => {
    it('resets action flags for player units only', () => {
      let board = createEmptyBoard();
      const playerUnit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      const aiUnit = createUnit('fire_1', 'ai', { x: 9, y: 9 });
      board = addUnit(board, playerUnit);
      board = addUnit(board, aiUnit);
      board = updateUnit(board, playerUnit.id, { hasMoved: true, hasAttacked: true });
      board = updateUnit(board, aiUnit.id, { hasMoved: true });

      const newBoard = resetUnitActions(board, 'player');
      const updatedPlayerUnit = getUnitById(newBoard, playerUnit.id)!;
      const updatedAiUnit = getUnitById(newBoard, aiUnit.id)!;

      expect(updatedPlayerUnit.hasMoved).toBe(false);
      expect(updatedPlayerUnit.hasAttacked).toBe(false);
      expect(updatedAiUnit.hasMoved).toBe(true); // AI unit unchanged
    });
  });

  describe('Distance and adjacency', () => {
    it('manhattanDistance calculates correctly', () => {
      expect(manhattanDistance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
      expect(manhattanDistance({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
      expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
    });

    it('isAdjacent returns true for adjacent cells', () => {
      expect(isAdjacent({ x: 5, y: 5 }, { x: 5, y: 4 })).toBe(true);
      expect(isAdjacent({ x: 5, y: 5 }, { x: 5, y: 6 })).toBe(true);
      expect(isAdjacent({ x: 5, y: 5 }, { x: 4, y: 5 })).toBe(true);
      expect(isAdjacent({ x: 5, y: 5 }, { x: 6, y: 5 })).toBe(true);
    });

    it('isAdjacent returns false for diagonals', () => {
      expect(isAdjacent({ x: 5, y: 5 }, { x: 6, y: 6 })).toBe(false);
      expect(isAdjacent({ x: 5, y: 5 }, { x: 4, y: 4 })).toBe(false);
    });

    it('isAdjacent returns false for non-adjacent cells', () => {
      expect(isAdjacent({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
      expect(isAdjacent({ x: 0, y: 0 }, { x: 9, y: 9 })).toBe(false);
    });

    it('getAdjacentPositions returns valid neighbors', () => {
      const adjacent = getAdjacentPositions({ x: 5, y: 5 });
      expect(adjacent).toHaveLength(4);
      expect(adjacent).toContainEqual({ x: 5, y: 4 });
      expect(adjacent).toContainEqual({ x: 5, y: 6 });
      expect(adjacent).toContainEqual({ x: 4, y: 5 });
      expect(adjacent).toContainEqual({ x: 6, y: 5 });
    });

    it('getAdjacentPositions filters out-of-bounds at corner', () => {
      const adjacent = getAdjacentPositions({ x: 0, y: 0 });
      expect(adjacent).toHaveLength(2);
      expect(adjacent).toContainEqual({ x: 1, y: 0 });
      expect(adjacent).toContainEqual({ x: 0, y: 1 });
    });

    it('getAdjacentPositions filters out-of-bounds at edge', () => {
      const adjacent = getAdjacentPositions({ x: 5, y: 0 });
      expect(adjacent).toHaveLength(3);
    });
  });
});
