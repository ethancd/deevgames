import { describe, it, expect } from 'vitest';
import {
  getSpawnRectangle,
  hasEnemyInRectangle,
  isSpawnBlocked,
  getSpawnZone,
  getValidAnchors,
  getAllSpawnPositions,
  isValidSpawnPosition,
  getLargestSpawnZone,
} from '../../src/game/spawning';
import { createEmptyBoard, placeUnit, getStartCorner } from '../../src/game/board';
import type { BoardState, Unit, Position } from '../../src/game/types';

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

describe('Spawning System', () => {
  describe('getSpawnRectangle', () => {
    it('creates rectangle from player start corner (0,0) to anchor', () => {
      const startCorner = { x: 0, y: 0 };
      const anchor = { x: 2, y: 3 };
      const rectangle = getSpawnRectangle(startCorner, anchor);

      // Should include all positions in the 3x4 rectangle
      expect(rectangle.length).toBe(12); // 3 * 4 = 12
      expect(rectangle).toContainEqual({ x: 0, y: 0 });
      expect(rectangle).toContainEqual({ x: 2, y: 3 });
      expect(rectangle).toContainEqual({ x: 1, y: 2 });
    });

    it('creates rectangle from AI start corner (9,9) to anchor', () => {
      const startCorner = { x: 9, y: 9 };
      const anchor = { x: 7, y: 7 };
      const rectangle = getSpawnRectangle(startCorner, anchor);

      // Should include all positions in the 3x3 rectangle
      expect(rectangle.length).toBe(9); // 3 * 3 = 9
      expect(rectangle).toContainEqual({ x: 9, y: 9 });
      expect(rectangle).toContainEqual({ x: 7, y: 7 });
      expect(rectangle).toContainEqual({ x: 8, y: 8 });
    });

    it('handles single-cell rectangle when anchor is at start corner', () => {
      const startCorner = { x: 0, y: 0 };
      const rectangle = getSpawnRectangle(startCorner, startCorner);

      expect(rectangle.length).toBe(1);
      expect(rectangle).toContainEqual({ x: 0, y: 0 });
    });

    it('only includes valid board positions', () => {
      const startCorner = { x: 0, y: 0 };
      const anchor = { x: 3, y: 3 };
      const rectangle = getSpawnRectangle(startCorner, anchor);

      // All positions should be valid (within 10x10 board)
      for (const pos of rectangle) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThan(10);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThan(10);
      }
    });
  });

  describe('hasEnemyInRectangle', () => {
    it('returns false for empty rectangle', () => {
      const board = createEmptyBoard();
      const rectangle = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];

      expect(hasEnemyInRectangle(rectangle, board, 'player')).toBe(false);
    });

    it('returns false when only friendly units in rectangle', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 1, y: 1 });
      board = placeUnit(board, unit);
      const rectangle = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];

      expect(hasEnemyInRectangle(rectangle, board, 'player')).toBe(false);
    });

    it('returns true when enemy unit is in rectangle', () => {
      let board = createEmptyBoard();
      const enemy = createUnit('e1', 'ai', { x: 1, y: 1 });
      board = placeUnit(board, enemy);
      const rectangle = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];

      expect(hasEnemyInRectangle(rectangle, board, 'player')).toBe(true);
    });

    it('detects enemies from AI perspective', () => {
      let board = createEmptyBoard();
      const player = createUnit('p1', 'player', { x: 8, y: 8 });
      board = placeUnit(board, player);
      const rectangle = [{ x: 7, y: 7 }, { x: 8, y: 8 }, { x: 9, y: 9 }];

      expect(hasEnemyInRectangle(rectangle, board, 'ai')).toBe(true);
    });
  });

  describe('isSpawnBlocked', () => {
    it('returns false when spawn zone has no enemies', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, anchor);

      expect(isSpawnBlocked(anchor, 'player', board)).toBe(false);
    });

    it('returns true when enemy is in spawn rectangle', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 3, y: 3 });
      const enemy = createUnit('e1', 'ai', { x: 1, y: 1 });
      board = placeUnit(board, anchor);
      board = placeUnit(board, enemy);

      expect(isSpawnBlocked(anchor, 'player', board)).toBe(true);
    });

    it('works for AI spawn zones', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('a1', 'ai', { x: 7, y: 7 });
      const player = createUnit('p1', 'player', { x: 8, y: 8 });
      board = placeUnit(board, anchor);
      board = placeUnit(board, player);

      expect(isSpawnBlocked(anchor, 'ai', board)).toBe(true);
    });
  });

  describe('getSpawnZone', () => {
    it('returns empty positions in spawn rectangle', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, anchor);

      const zone = getSpawnZone(anchor, 'player', board);

      // 3x3 rectangle minus the anchor position = 8 positions
      expect(zone.length).toBe(8);
      expect(zone).not.toContainEqual({ x: 2, y: 2 }); // Anchor position excluded
    });

    it('returns empty array when spawn is blocked by enemy', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 3, y: 3 });
      const enemy = createUnit('e1', 'ai', { x: 1, y: 1 });
      board = placeUnit(board, anchor);
      board = placeUnit(board, enemy);

      const zone = getSpawnZone(anchor, 'player', board);
      expect(zone.length).toBe(0);
    });

    it('excludes positions with friendly units', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 2, y: 2 });
      const friendly = createUnit('p2', 'player', { x: 1, y: 1 });
      board = placeUnit(board, anchor);
      board = placeUnit(board, friendly);

      const zone = getSpawnZone(anchor, 'player', board);

      // 3x3 rectangle minus anchor minus friendly = 7 positions
      expect(zone.length).toBe(7);
      expect(zone).not.toContainEqual({ x: 1, y: 1 });
      expect(zone).not.toContainEqual({ x: 2, y: 2 });
    });
  });

  describe('getValidAnchors', () => {
    it('returns all player units when none are blocked', () => {
      let board = createEmptyBoard();
      const unit1 = createUnit('p1', 'player', { x: 2, y: 2 });
      const unit2 = createUnit('p2', 'player', { x: 3, y: 1 });
      board = placeUnit(board, unit1);
      board = placeUnit(board, unit2);

      const anchors = getValidAnchors('player', board);
      expect(anchors.length).toBe(2);
    });

    it('excludes units whose spawn zones are blocked', () => {
      let board = createEmptyBoard();
      const unit1 = createUnit('p1', 'player', { x: 4, y: 4 }); // Blocked by enemy
      const unit2 = createUnit('p2', 'player', { x: 1, y: 0 }); // Not blocked
      const enemy = createUnit('e1', 'ai', { x: 2, y: 2 }); // Blocks unit1
      board = placeUnit(board, unit1);
      board = placeUnit(board, unit2);
      board = placeUnit(board, enemy);

      const anchors = getValidAnchors('player', board);
      expect(anchors.length).toBe(1);
      expect(anchors[0].id).toBe('p2');
    });

    it('returns empty array when all spawn zones are blocked', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('e1', 'ai', { x: 2, y: 2 });
      board = placeUnit(board, unit);
      board = placeUnit(board, enemy);

      const anchors = getValidAnchors('player', board);
      expect(anchors.length).toBe(0);
    });
  });

  describe('getAllSpawnPositions', () => {
    it('returns all empty positions from valid spawn zones', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, unit);

      const positions = getAllSpawnPositions('player', board);

      // 3x3 rectangle minus the unit = 8 positions
      expect(positions.length).toBe(8);
    });

    it('deduplicates overlapping spawn zones', () => {
      let board = createEmptyBoard();
      // Two units with overlapping spawn zones
      const unit1 = createUnit('p1', 'player', { x: 2, y: 2 });
      const unit2 = createUnit('p2', 'player', { x: 3, y: 3 });
      board = placeUnit(board, unit1);
      board = placeUnit(board, unit2);

      const positions = getAllSpawnPositions('player', board);

      // Check no duplicates
      const positionStrings = positions.map((p) => `${p.x},${p.y}`);
      const uniqueStrings = new Set(positionStrings);
      expect(positionStrings.length).toBe(uniqueStrings.size);
    });

    it('returns empty array when all zones are blocked', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('e1', 'ai', { x: 2, y: 2 });
      board = placeUnit(board, unit);
      board = placeUnit(board, enemy);

      const positions = getAllSpawnPositions('player', board);
      expect(positions.length).toBe(0);
    });
  });

  describe('isValidSpawnPosition', () => {
    it('returns true for empty position in valid spawn zone', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, anchor);

      expect(isValidSpawnPosition({ x: 1, y: 1 }, 'player', board)).toBe(true);
    });

    it('returns false for occupied position', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, anchor);

      expect(isValidSpawnPosition({ x: 2, y: 2 }, 'player', board)).toBe(false);
    });

    it('returns false for position outside all spawn zones', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, anchor);

      expect(isValidSpawnPosition({ x: 5, y: 5 }, 'player', board)).toBe(false);
    });

    it('returns false when spawn zone is blocked', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 3, y: 3 });
      const enemy = createUnit('e1', 'ai', { x: 1, y: 1 });
      board = placeUnit(board, anchor);
      board = placeUnit(board, enemy);

      // Position would be in spawn zone but zone is blocked
      expect(isValidSpawnPosition({ x: 2, y: 2 }, 'player', board)).toBe(false);
    });
  });

  describe('getLargestSpawnZone', () => {
    it('returns the largest available spawn zone', () => {
      let board = createEmptyBoard();
      // Unit at (1,1) has 4-cell spawn zone (2x2)
      const unit1 = createUnit('p1', 'player', { x: 1, y: 1 });
      // Unit at (3,3) has 16-cell spawn zone (4x4)
      const unit2 = createUnit('p2', 'player', { x: 3, y: 3 });
      board = placeUnit(board, unit1);
      board = placeUnit(board, unit2);

      const { anchor, zone } = getLargestSpawnZone('player', board);

      expect(anchor?.id).toBe('p2');
      // 4x4 = 16 minus the two units = 14
      expect(zone.length).toBe(14);
    });

    it('returns null anchor when no valid zones exist', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('e1', 'ai', { x: 2, y: 2 });
      board = placeUnit(board, unit);
      board = placeUnit(board, enemy);

      const { anchor, zone } = getLargestSpawnZone('player', board);

      expect(anchor).toBeNull();
      expect(zone.length).toBe(0);
    });
  });

  describe('Start corner positions', () => {
    it('player starts at (0,0)', () => {
      expect(getStartCorner('player')).toEqual({ x: 0, y: 0 });
    });

    it('AI starts at (9,9)', () => {
      expect(getStartCorner('ai')).toEqual({ x: 9, y: 9 });
    });
  });
});
