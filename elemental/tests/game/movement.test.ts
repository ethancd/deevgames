import { describe, it, expect } from 'vitest';
import {
  canMove,
  getValidMoves,
  isValidMove,
  executeMove,
} from '../../src/game/movement';
import {
  createEmptyBoard,
  createUnit,
  addUnit,
} from '../../src/game/board';
import type { Unit, BoardState } from '../../src/game/types';

describe('Movement Module', () => {
  describe('canMove', () => {
    it('returns true for fresh unit', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      expect(canMove(unit)).toBe(true);
    });

    it('returns false if unit has already moved', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      unit.hasMoved = true;
      expect(canMove(unit)).toBe(false);
    });

    it('returns false if unit cannot act this turn', () => {
      const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
      unit.canActThisTurn = false;
      expect(canMove(unit)).toBe(false);
    });
  });

  describe('getValidMoves', () => {
    it('returns empty array if unit cannot move', () => {
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      unit.hasMoved = true;
      const board = createEmptyBoard();
      expect(getValidMoves(unit, board)).toEqual([]);
    });

    describe('Speed 1 unit (Hi - fire_1)', () => {
      it('can move to 4 adjacent squares in open board', () => {
        let board = createEmptyBoard();
        const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
        board = addUnit(board, unit);

        const moves = getValidMoves(unit, board);
        expect(moves).toHaveLength(4);
        expect(moves).toContainEqual({ x: 5, y: 4 });
        expect(moves).toContainEqual({ x: 5, y: 6 });
        expect(moves).toContainEqual({ x: 4, y: 5 });
        expect(moves).toContainEqual({ x: 6, y: 5 });
      });

      it('has 2 moves at corner', () => {
        let board = createEmptyBoard();
        const unit = createUnit('fire_1', 'player', { x: 0, y: 0 });
        board = addUnit(board, unit);

        const moves = getValidMoves(unit, board);
        expect(moves).toHaveLength(2);
        expect(moves).toContainEqual({ x: 1, y: 0 });
        expect(moves).toContainEqual({ x: 0, y: 1 });
      });

      it('cannot move to occupied square', () => {
        let board = createEmptyBoard();
        const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
        const blocker = createUnit('water_1', 'player', { x: 5, y: 4 });
        board = addUnit(board, unit);
        board = addUnit(board, blocker);

        const moves = getValidMoves(unit, board);
        expect(moves).toHaveLength(3);
        expect(moves).not.toContainEqual({ x: 5, y: 4 });
      });
    });

    describe('Speed 2 unit (Hono - fire_2)', () => {
      it('can reach squares up to 2 distance away', () => {
        let board = createEmptyBoard();
        const unit = createUnit('fire_2', 'player', { x: 5, y: 5 });
        board = addUnit(board, unit);

        const moves = getValidMoves(unit, board);

        // Distance 1 (4 squares)
        expect(moves).toContainEqual({ x: 5, y: 4 });
        expect(moves).toContainEqual({ x: 5, y: 6 });
        expect(moves).toContainEqual({ x: 4, y: 5 });
        expect(moves).toContainEqual({ x: 6, y: 5 });

        // Distance 2 (4 more squares)
        expect(moves).toContainEqual({ x: 5, y: 3 });
        expect(moves).toContainEqual({ x: 5, y: 7 });
        expect(moves).toContainEqual({ x: 3, y: 5 });
        expect(moves).toContainEqual({ x: 7, y: 5 });

        // Also L-shaped paths (4 more squares)
        expect(moves).toContainEqual({ x: 4, y: 4 });
        expect(moves).toContainEqual({ x: 6, y: 4 });
        expect(moves).toContainEqual({ x: 4, y: 6 });
        expect(moves).toContainEqual({ x: 6, y: 6 });
      });

      it('cannot move through occupied squares', () => {
        let board = createEmptyBoard();
        const unit = createUnit('fire_2', 'player', { x: 5, y: 5 });
        const blocker = createUnit('water_1', 'player', { x: 5, y: 4 });
        board = addUnit(board, unit);
        board = addUnit(board, blocker);

        const moves = getValidMoves(unit, board);

        // Can't reach (5,3) because blocker is at (5,4)
        expect(moves).not.toContainEqual({ x: 5, y: 3 });
        // But can reach (5,4) via (4,5) then (4,4) then (5,4)? No - that's 3 moves
        // Actually can reach (4,4) via (4,5) which is 2 moves
        expect(moves).toContainEqual({ x: 4, y: 4 });
      });

      it('cannot pass through enemy units', () => {
        let board = createEmptyBoard();
        const unit = createUnit('fire_2', 'player', { x: 5, y: 5 });
        const enemy = createUnit('fire_1', 'ai', { x: 5, y: 4 });
        board = addUnit(board, unit);
        board = addUnit(board, enemy);

        const moves = getValidMoves(unit, board);
        expect(moves).not.toContainEqual({ x: 5, y: 3 });
        expect(moves).not.toContainEqual({ x: 5, y: 4 }); // Can't land on enemy
      });
    });

    describe('Speed 3+ units', () => {
      it('Gokamoka (speed 3) can move up to 3 squares', () => {
        let board = createEmptyBoard();
        const unit = createUnit('fire_4', 'player', { x: 5, y: 5 });
        board = addUnit(board, unit);

        const moves = getValidMoves(unit, board);

        // Should reach distance 3
        expect(moves).toContainEqual({ x: 5, y: 2 });
        expect(moves).toContainEqual({ x: 8, y: 5 });
      });

      it('Dhorubakali (speed 5) can move up to 5 squares', () => {
        let board = createEmptyBoard();
        const unit = createUnit('lightning_4', 'player', { x: 5, y: 5 });
        board = addUnit(board, unit);

        const moves = getValidMoves(unit, board);

        // Should reach distance 5
        expect(moves).toContainEqual({ x: 5, y: 0 }); // 5 up
        expect(moves).toContainEqual({ x: 0, y: 5 }); // 5 left
      });
    });
  });

  describe('isValidMove', () => {
    it('returns true for valid destination', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      expect(isValidMove(unit, { x: 5, y: 4 }, board)).toBe(true);
    });

    it('returns false for out-of-range destination', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      expect(isValidMove(unit, { x: 5, y: 3 }, board)).toBe(false);
    });

    it('returns false for occupied destination', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      const blocker = createUnit('water_1', 'player', { x: 5, y: 4 });
      board = addUnit(board, unit);
      board = addUnit(board, blocker);

      expect(isValidMove(unit, { x: 5, y: 4 }, board)).toBe(false);
    });
  });

  describe('executeMove', () => {
    it('updates unit position', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      const newBoard = executeMove(board, unit.id, { x: 5, y: 4 });
      const movedUnit = newBoard.units.find((u) => u.id === unit.id);

      expect(movedUnit?.position).toEqual({ x: 5, y: 4 });
    });

    it('marks unit as having moved', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      const newBoard = executeMove(board, unit.id, { x: 5, y: 4 });
      const movedUnit = newBoard.units.find((u) => u.id === unit.id);

      expect(movedUnit?.hasMoved).toBe(true);
    });

    it('returns original board if unit not found', () => {
      const board = createEmptyBoard();
      const newBoard = executeMove(board, 'nonexistent', { x: 5, y: 4 });
      expect(newBoard).toBe(board);
    });

    it('is immutable - original board unchanged', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);
      const originalUnit = board.units[0];

      executeMove(board, unit.id, { x: 5, y: 4 });

      expect(board.units[0].position).toEqual({ x: 5, y: 5 });
      expect(board.units[0].hasMoved).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('unit cannot move to its own position', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      const moves = getValidMoves(unit, board);
      expect(moves).not.toContainEqual({ x: 5, y: 5 });
    });

    it('diagonals are not valid moves', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);

      const moves = getValidMoves(unit, board);
      expect(moves).not.toContainEqual({ x: 6, y: 6 });
      expect(moves).not.toContainEqual({ x: 4, y: 4 });
    });

    it('completely surrounded unit has no moves', () => {
      let board = createEmptyBoard();
      const unit = createUnit('fire_1', 'player', { x: 5, y: 5 });
      board = addUnit(board, unit);
      board = addUnit(board, createUnit('water_1', 'player', { x: 5, y: 4 }));
      board = addUnit(board, createUnit('water_1', 'player', { x: 5, y: 6 }));
      board = addUnit(board, createUnit('water_1', 'player', { x: 4, y: 5 }));
      board = addUnit(board, createUnit('water_1', 'player', { x: 6, y: 5 }));

      const moves = getValidMoves(unit, board);
      expect(moves).toHaveLength(0);
    });
  });
});
