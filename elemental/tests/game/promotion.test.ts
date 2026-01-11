import { describe, it, expect } from 'vitest';
import {
  getPromotionCost,
  getPromotedDefinitionId,
  canPromote,
  isMaxTier,
  promoteUnit,
  getPromotableUnits,
  getPromotionInfo,
} from '../../src/game/promotion';
import { createEmptyBoard, placeUnit } from '../../src/game/board';
import type { Unit, Position } from '../../src/game/types';
import type { BuildState } from '../../src/game/building';

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

describe('Promotion System', () => {
  describe('getPromotionCost', () => {
    it('T1 → T2 costs 2 crystals', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_1');
      expect(getPromotionCost(unit)).toBe(2);
    });

    it('T2 → T3 costs 3 crystals', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_2');
      expect(getPromotionCost(unit)).toBe(3);
    });

    it('T3 → T4 costs 4 crystals', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_3');
      expect(getPromotionCost(unit)).toBe(4);
    });

    it('T4 cannot be promoted (returns null)', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_4');
      expect(getPromotionCost(unit)).toBeNull();
    });
  });

  describe('getPromotedDefinitionId', () => {
    it('promotes fire-t1 to fire-t2', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_1');
      expect(getPromotedDefinitionId(unit)).toBe('fire_2');
    });

    it('promotes water-t2 to water-t3', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'water_2');
      expect(getPromotedDefinitionId(unit)).toBe('water_3');
    });

    it('promotes lightning-t3 to lightning-t4', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'lightning_3');
      expect(getPromotedDefinitionId(unit)).toBe('lightning_4');
    });

    it('returns null for T4 units', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'metal_4');
      expect(getPromotedDefinitionId(unit)).toBeNull();
    });

    it('preserves element through promotion', () => {
      const elements = ['fire', 'water', 'plant', 'lightning', 'metal', 'wind'];
      for (const element of elements) {
        const unit = createUnit('p1', 'player', { x: 0, y: 0 }, `${element}_1`);
        const promoted = getPromotedDefinitionId(unit);
        expect(promoted).toBe(`${element}_2`);
      }
    });
  });

  describe('canPromote', () => {
    it('returns true when player has enough crystals', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_1');
      const buildState: BuildState = { queue: [], crystals: 5 };
      expect(canPromote(unit, buildState)).toBe(true);
    });

    it('returns false when player lacks crystals', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_1');
      const buildState: BuildState = { queue: [], crystals: 1 };
      expect(canPromote(unit, buildState)).toBe(false);
    });

    it('returns false for T4 units regardless of crystals', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_4');
      const buildState: BuildState = { queue: [], crystals: 100 };
      expect(canPromote(unit, buildState)).toBe(false);
    });

    it('returns true for exact crystal match', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_1');
      const buildState: BuildState = { queue: [], crystals: 2 };
      expect(canPromote(unit, buildState)).toBe(true);
    });
  });

  describe('isMaxTier', () => {
    it('returns false for T1 units', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_1');
      expect(isMaxTier(unit)).toBe(false);
    });

    it('returns false for T2 units', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_2');
      expect(isMaxTier(unit)).toBe(false);
    });

    it('returns false for T3 units', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_3');
      expect(isMaxTier(unit)).toBe(false);
    });

    it('returns true for T4 units', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_4');
      expect(isMaxTier(unit)).toBe(true);
    });
  });

  describe('promoteUnit', () => {
    it('upgrades unit to next tier and deducts crystals', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 1, y: 1 }, 'fire_1');
      board = placeUnit(board, unit);
      const buildState: BuildState = { queue: [], crystals: 5 };

      const result = promoteUnit(board, 'p1', buildState);

      expect(result).not.toBeNull();
      expect(result!.buildState.crystals).toBe(3); // 5 - 2
      const promotedUnit = result!.board.units.find((u) => u.id === 'p1');
      expect(promotedUnit?.definitionId).toBe('fire_2');
    });

    it('preserves unit position and owner', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 3, y: 4 }, 'water_2');
      board = placeUnit(board, unit);
      const buildState: BuildState = { queue: [], crystals: 5 };

      const result = promoteUnit(board, 'p1', buildState);

      const promotedUnit = result!.board.units.find((u) => u.id === 'p1');
      expect(promotedUnit?.position).toEqual({ x: 3, y: 4 });
      expect(promotedUnit?.owner).toBe('player');
    });

    it('returns null when unit not found', () => {
      const board = createEmptyBoard();
      const buildState: BuildState = { queue: [], crystals: 5 };

      const result = promoteUnit(board, 'nonexistent', buildState);

      expect(result).toBeNull();
    });

    it('returns null when insufficient crystals', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 1, y: 1 }, 'fire_1');
      board = placeUnit(board, unit);
      const buildState: BuildState = { queue: [], crystals: 1 };

      const result = promoteUnit(board, 'p1', buildState);

      expect(result).toBeNull();
    });

    it('returns null when unit is already T4', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 1, y: 1 }, 'fire_4');
      board = placeUnit(board, unit);
      const buildState: BuildState = { queue: [], crystals: 100 };

      const result = promoteUnit(board, 'p1', buildState);

      expect(result).toBeNull();
    });
  });

  describe('getPromotableUnits', () => {
    it('returns units that can be promoted', () => {
      let board = createEmptyBoard();
      const unit1 = createUnit('p1', 'player', { x: 1, y: 1 }, 'fire_1');
      const unit2 = createUnit('p2', 'player', { x: 2, y: 2 }, 'water_2');
      board = placeUnit(board, unit1);
      board = placeUnit(board, unit2);
      const buildState: BuildState = { queue: [], crystals: 3 };

      const promotable = getPromotableUnits(board, 'player', buildState);

      expect(promotable.length).toBe(2);
    });

    it('excludes units player cannot afford to promote', () => {
      let board = createEmptyBoard();
      const unit1 = createUnit('p1', 'player', { x: 1, y: 1 }, 'fire_1'); // needs 2
      const unit2 = createUnit('p2', 'player', { x: 2, y: 2 }, 'water_3'); // needs 4
      board = placeUnit(board, unit1);
      board = placeUnit(board, unit2);
      const buildState: BuildState = { queue: [], crystals: 2 };

      const promotable = getPromotableUnits(board, 'player', buildState);

      expect(promotable.length).toBe(1);
      expect(promotable[0].id).toBe('p1');
    });

    it('excludes T4 units', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 1, y: 1 }, 'fire_4');
      board = placeUnit(board, unit);
      const buildState: BuildState = { queue: [], crystals: 100 };

      const promotable = getPromotableUnits(board, 'player', buildState);

      expect(promotable.length).toBe(0);
    });

    it('only returns units belonging to specified player', () => {
      let board = createEmptyBoard();
      const playerUnit = createUnit('p1', 'player', { x: 1, y: 1 }, 'fire_1');
      const aiUnit = createUnit('a1', 'ai', { x: 8, y: 8 }, 'water_1');
      board = placeUnit(board, playerUnit);
      board = placeUnit(board, aiUnit);
      const buildState: BuildState = { queue: [], crystals: 10 };

      const promotable = getPromotableUnits(board, 'player', buildState);

      expect(promotable.length).toBe(1);
      expect(promotable[0].owner).toBe('player');
    });
  });

  describe('getPromotionInfo', () => {
    it('returns promotion details for T1 unit', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_1');
      const info = getPromotionInfo(unit);

      expect(info.currentTier).toBe(1);
      expect(info.nextTier).toBe(2);
      expect(info.cost).toBe(2);
      expect(info.currentName).toBeTruthy();
      expect(info.promotedName).toBeTruthy();
    });

    it('returns null values for T4 unit', () => {
      const unit = createUnit('p1', 'player', { x: 0, y: 0 }, 'fire_4');
      const info = getPromotionInfo(unit);

      expect(info.currentTier).toBe(4);
      expect(info.nextTier).toBeNull();
      expect(info.cost).toBeNull();
      expect(info.promotedName).toBeNull();
    });
  });
});
