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
  owner: 'white' | 'black',
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

    canActThisTurn: true,
  };
}

describe('Promotion System', () => {
  describe('getPromotionCost', () => {
    it('Fire T1 → T2 costs 4 crystals', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_1');
      expect(getPromotionCost(unit)).toBe(4);
    });

    it('Fire T2 → T3 costs 6 crystals', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_2');
      expect(getPromotionCost(unit)).toBe(6);
    });

    it('Plant T2 → T3 costs 12 crystals', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'plant_2');
      expect(getPromotionCost(unit)).toBe(12);
    });

    it('T3 cannot be promoted (returns null)', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_3');
      expect(getPromotionCost(unit)).toBeNull();
    });
  });

  describe('getPromotedDefinitionId', () => {
    it('promotes fire-t1 to fire-t2', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_1');
      expect(getPromotedDefinitionId(unit)).toBe('fire_2');
    });

    it('promotes water-t2 to water-t3', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'water_2');
      expect(getPromotedDefinitionId(unit)).toBe('water_3');
    });

    it('promotes lightning-t2 to lightning-t3', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'lightning_2');
      expect(getPromotedDefinitionId(unit)).toBe('lightning_3');
    });

    it('returns null for T3 units', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'metal_3');
      expect(getPromotedDefinitionId(unit)).toBeNull();
    });

    it('preserves element through promotion', () => {
      const elements = ['fire', 'water', 'plant', 'lightning', 'metal', 'shadow'];
      for (const element of elements) {
        const unit = createUnit('p1', 'white', { x: 0, y: 0 }, `${element}_1`);
        const promoted = getPromotedDefinitionId(unit);
        expect(promoted).toBe(`${element}_2`);
      }
    });
  });

  describe('canPromote', () => {
    it('returns true when player has enough crystals', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_1');
      const buildState: BuildState = { crystals: 5 };
      expect(canPromote(unit, buildState)).toBe(true);
    });

    it('returns false when player lacks crystals', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_1');
      const buildState: BuildState = { crystals: 3 };
      expect(canPromote(unit, buildState)).toBe(false);
    });

    it('returns false for T3 units regardless of crystals', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_3');
      const buildState: BuildState = { crystals: 100 };
      expect(canPromote(unit, buildState)).toBe(false);
    });

    it('returns true for exact crystal match', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_1');
      const buildState: BuildState = { crystals: 4 };
      expect(canPromote(unit, buildState)).toBe(true);
    });

    it('returns false if unit was already promoted this placement phase', () => {
      const unit: Unit = {
        ...createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_2'),
        promotedThisPlacement: true,
        damageTaken: 0,
      };
      const buildState: BuildState = { crystals: 100 };
      expect(canPromote(unit, buildState)).toBe(false);
    });

    it('returns true if unit has not been promoted this placement phase', () => {
      const unit: Unit = {
        ...createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_1'),
        promotedThisPlacement: false,
        damageTaken: 0,
      };
      const buildState: BuildState = { crystals: 5 };
      expect(canPromote(unit, buildState)).toBe(true);
    });
  });

  describe('isMaxTier', () => {
    it('returns false for T1 units', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_1');
      expect(isMaxTier(unit)).toBe(false);
    });

    it('returns false for T2 units', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_2');
      expect(isMaxTier(unit)).toBe(false);
    });

    it('returns true for terminal Plant units', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'plant_3');
      expect(isMaxTier(unit)).toBe(true);
    });

    it('returns true for T3 units', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_3');
      expect(isMaxTier(unit)).toBe(true);
    });
  });

  describe('promoteUnit', () => {
    it('upgrades unit to next tier and deducts crystals', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'white', { x: 1, y: 1 }, 'fire_1');
      board = placeUnit(board, unit);
      const buildState: BuildState = { crystals: 5 };

      const result = promoteUnit(board, 'p1', buildState);

      expect(result).not.toBeNull();
      expect(result!.buildState.crystals).toBe(1); // 5 - 4
      const promotedUnit = result!.board.units.find((u) => u.id === 'p1');
      expect(promotedUnit?.definitionId).toBe('fire_2');
    });

    it('preserves unit position and owner', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'white', { x: 3, y: 4 }, 'fire_2');
      board = placeUnit(board, unit);
      const buildState: BuildState = { crystals: 6 }; // fire_2→fire_3 costs 6

      const result = promoteUnit(board, 'p1', buildState);

      const promotedUnit = result!.board.units.find((u) => u.id === 'p1');
      expect(promotedUnit?.position).toEqual({ x: 3, y: 4 });
      expect(promotedUnit?.owner).toBe('white');
    });

    it('returns null when unit not found', () => {
      const board = createEmptyBoard();
      const buildState: BuildState = { crystals: 5 };

      const result = promoteUnit(board, 'nonexistent', buildState);

      expect(result).toBeNull();
    });

    it('returns null when insufficient crystals', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'white', { x: 1, y: 1 }, 'fire_1');
      board = placeUnit(board, unit);
      const buildState: BuildState = { crystals: 3 };

      const result = promoteUnit(board, 'p1', buildState);

      expect(result).toBeNull();
    });

    it('returns null when unit is already T3', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'white', { x: 1, y: 1 }, 'fire_3');
      board = placeUnit(board, unit);
      const buildState: BuildState = { crystals: 100 };

      const result = promoteUnit(board, 'p1', buildState);

      expect(result).toBeNull();
    });

    it('sets promotedThisPlacement flag after promotion', () => {
      let board = createEmptyBoard();
      const unit: Unit = {
        ...createUnit('p1', 'white', { x: 1, y: 1 }, 'fire_1'),
        damageTaken: 0,
        promotedThisPlacement: false,
      };
      board = placeUnit(board, unit);
      const buildState: BuildState = { crystals: 5 };

      const result = promoteUnit(board, 'p1', buildState);

      expect(result).not.toBeNull();
      const promotedUnit = result!.board.units.find((u) => u.id === 'p1');
      expect(promotedUnit?.promotedThisPlacement).toBe(true);
    });
  });

  describe('getPromotableUnits', () => {
    it('returns units that can be promoted', () => {
      let board = createEmptyBoard();
      const unit1 = createUnit('p1', 'white', { x: 1, y: 1 }, 'fire_1'); // costs 4
      const unit2 = createUnit('p2', 'white', { x: 2, y: 2 }, 'fire_2'); // costs 6
      board = placeUnit(board, unit1);
      board = placeUnit(board, unit2);
      const buildState: BuildState = { crystals: 6 };

      const promotable = getPromotableUnits(board, 'white', buildState);

      expect(promotable.length).toBe(2);
    });

    it('excludes units player cannot afford to promote', () => {
      let board = createEmptyBoard();
      const unit1 = createUnit('p1', 'white', { x: 1, y: 1 }, 'fire_1'); // needs 4 (6-2)
      const unit2 = createUnit('p2', 'white', { x: 2, y: 2 }, 'fire_2'); // needs 6 (12-6)
      board = placeUnit(board, unit1);
      board = placeUnit(board, unit2);
      const buildState: BuildState = { crystals: 4 };

      const promotable = getPromotableUnits(board, 'white', buildState);

      expect(promotable.length).toBe(1);
      expect(promotable[0].id).toBe('p1');
    });

    it('excludes T3 units', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'white', { x: 1, y: 1 }, 'fire_3');
      board = placeUnit(board, unit);
      const buildState: BuildState = { crystals: 100 };

      const promotable = getPromotableUnits(board, 'white', buildState);

      expect(promotable.length).toBe(0);
    });

    it('only returns units belonging to specified player', () => {
      let board = createEmptyBoard();
      const playerUnit = createUnit('p1', 'white', { x: 1, y: 1 }, 'fire_1');
      const aiUnit = createUnit('a1', 'black', { x: 8, y: 8 }, 'water_1');
      board = placeUnit(board, playerUnit);
      board = placeUnit(board, aiUnit);
      const buildState: BuildState = { crystals: 10 };

      const promotable = getPromotableUnits(board, 'white', buildState);

      expect(promotable.length).toBe(1);
      expect(promotable[0].owner).toBe('white');
    });
  });

  describe('getPromotionInfo', () => {
    it('returns promotion details for T1 unit', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_1');
      const info = getPromotionInfo(unit);

      expect(info.currentTier).toBe(1);
      expect(info.nextTier).toBe(2);
      expect(info.cost).toBe(4);
      expect(info.currentName).toBeTruthy();
      expect(info.promotedName).toBeTruthy();
    });

    it('returns null values for T3 unit', () => {
      const unit = createUnit('p1', 'white', { x: 0, y: 0 }, 'fire_3');
      const info = getPromotionInfo(unit);

      expect(info.currentTier).toBe(3);
      expect(info.nextTier).toBeNull();
      expect(info.cost).toBeNull();
      expect(info.promotedName).toBeNull();
    });
  });
});
