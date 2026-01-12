import { describe, it, expect } from 'vitest';
import {
  isPlayerEliminated,
  getUnitCount,
  checkVictory,
  getOpponent,
  hasWon,
  hasLost,
  isGameOngoing,
  getGameSummary,
} from '../../src/game/victory';
import { createEmptyBoard, placeUnit } from '../../src/game/board';
import type { Unit, Position } from '../../src/game/types';

function createUnit(
  id: string,
  owner: 'player' | 'ai',
  position: Position,
  definitionId: string = 'fire_1'
): Unit {
  return {
    id,
    definitionId,
    owner,
    position,
    hasMoved: false,
    hasAttacked: false,
    hasMined: false,
    canActThisTurn: true,
  };
}

describe('Victory System', () => {
  describe('isPlayerEliminated', () => {
    it('returns true when player has no units', () => {
      const board = createEmptyBoard();
      expect(isPlayerEliminated(board, 'player')).toBe(true);
    });

    it('returns false when player has units', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 1, y: 1 });
      board = placeUnit(board, unit);

      expect(isPlayerEliminated(board, 'player')).toBe(false);
    });

    it('checks correct player', () => {
      let board = createEmptyBoard();
      const playerUnit = createUnit('p1', 'player', { x: 1, y: 1 });
      board = placeUnit(board, playerUnit);

      expect(isPlayerEliminated(board, 'player')).toBe(false);
      expect(isPlayerEliminated(board, 'ai')).toBe(true);
    });
  });

  describe('getUnitCount', () => {
    it('returns 0 for empty board', () => {
      const board = createEmptyBoard();
      expect(getUnitCount(board, 'player')).toBe(0);
      expect(getUnitCount(board, 'ai')).toBe(0);
    });

    it('counts only units for specified player', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));
      board = placeUnit(board, createUnit('p2', 'player', { x: 2, y: 2 }));
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      expect(getUnitCount(board, 'player')).toBe(2);
      expect(getUnitCount(board, 'ai')).toBe(1);
    });
  });

  describe('checkVictory', () => {
    it('returns ongoing when both players have units', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      const result = checkVictory(board);
      expect(result.status).toBe('ongoing');
    });

    it('returns AI victory when player has no units', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      const result = checkVictory(board);
      expect(result.status).toBe('victory');
      expect(result).toHaveProperty('winner', 'ai');
    });

    it('returns player victory when AI has no units', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));

      const result = checkVictory(board);
      expect(result.status).toBe('victory');
      expect(result).toHaveProperty('winner', 'player');
    });

    it('returns draw when both players have no units', () => {
      const board = createEmptyBoard();

      const result = checkVictory(board);
      expect(result.status).toBe('draw');
    });
  });

  describe('getOpponent', () => {
    it('returns ai for player', () => {
      expect(getOpponent('player')).toBe('ai');
    });

    it('returns player for ai', () => {
      expect(getOpponent('ai')).toBe('player');
    });
  });

  describe('hasWon', () => {
    it('returns true when player has won', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));

      expect(hasWon(board, 'player')).toBe(true);
      expect(hasWon(board, 'ai')).toBe(false);
    });

    it('returns false when game is ongoing', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      expect(hasWon(board, 'player')).toBe(false);
      expect(hasWon(board, 'ai')).toBe(false);
    });
  });

  describe('hasLost', () => {
    it('returns true when player has lost', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      expect(hasLost(board, 'player')).toBe(true);
      expect(hasLost(board, 'ai')).toBe(false);
    });

    it('returns false when game is ongoing', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      expect(hasLost(board, 'player')).toBe(false);
      expect(hasLost(board, 'ai')).toBe(false);
    });
  });

  describe('isGameOngoing', () => {
    it('returns true when both players have units', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      expect(isGameOngoing(board)).toBe(true);
    });

    it('returns false when one player has no units', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));

      expect(isGameOngoing(board)).toBe(false);
    });
  });

  describe('getGameSummary', () => {
    it('returns correct summary for ongoing game', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));
      board = placeUnit(board, createUnit('p2', 'player', { x: 2, y: 2 }));
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      const summary = getGameSummary(board);

      expect(summary.playerUnits).toBe(2);
      expect(summary.aiUnits).toBe(1);
      expect(summary.result.status).toBe('ongoing');
    });

    it('returns correct summary when player wins', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));

      const summary = getGameSummary(board);

      expect(summary.playerUnits).toBe(1);
      expect(summary.aiUnits).toBe(0);
      expect(summary.result.status).toBe('victory');
      expect(summary.result).toHaveProperty('winner', 'player');
    });
  });

  describe('Victory condition logic', () => {
    it('eliminating all enemy units wins the game', () => {
      // Start with both players having units
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      expect(isGameOngoing(board)).toBe(true);

      // Remove AI's last unit (simulating elimination)
      board = {
        ...board,
        units: board.units.filter((u) => u.owner !== 'ai'),
      };

      expect(isGameOngoing(board)).toBe(false);
      expect(hasWon(board, 'player')).toBe(true);
    });

    it('losing all your units loses the game', () => {
      let board = createEmptyBoard();
      board = placeUnit(board, createUnit('p1', 'player', { x: 1, y: 1 }));
      board = placeUnit(board, createUnit('a1', 'ai', { x: 8, y: 8 }));

      // Remove player's last unit
      board = {
        ...board,
        units: board.units.filter((u) => u.owner !== 'player'),
      };

      expect(hasLost(board, 'player')).toBe(true);
      expect(hasWon(board, 'ai')).toBe(true);
    });
  });
});
