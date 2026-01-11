import { describe, it, expect } from 'vitest';
import {
  getBuildCost,
  getBuildTime,
  canAfford,
  meetsTechRequirement,
  getRequiredTier,
  canBuildUnit,
  addToBuildQueue,
  processBuildQueue,
  createUnitFromDefinition,
  placeBuiltUnit,
  getAvailableBuildOptions,
  hasValidSpawnPositions,
  createInitialBuildState,
  addCrystals,
  getQueueSummary,
  type BuildState,
} from '../../src/game/building';
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

describe('Building System', () => {
  describe('getBuildCost', () => {
    it('returns cost from unit definition, not tier', () => {
      // Fire T1 costs 1, Water T1 costs 2 (different from tier)
      expect(getBuildCost('fire_1')).toBe(1);
      expect(getBuildCost('water_1')).toBe(2);
    });

    it('tier 2 units have varied costs', () => {
      // Fire T2 costs 3, Water T2 costs 4
      expect(getBuildCost('fire_2')).toBe(3);
      expect(getBuildCost('water_2')).toBe(4);
    });

    it('tier 3 units have element-based costs', () => {
      expect(getBuildCost('fire_3')).toBe(6);
      expect(getBuildCost('plant_3')).toBe(12);
    });

    it('tier 4 units have element-based costs', () => {
      expect(getBuildCost('fire_4')).toBe(10);
      expect(getBuildCost('metal_4')).toBe(20);
    });
  });

  describe('getBuildTime', () => {
    it('tier 1 units take 1 turn', () => {
      expect(getBuildTime('fire_1')).toBe(1);
      expect(getBuildTime('water_1')).toBe(1);
    });

    it('tier 2 units take 1-2 turns', () => {
      expect(getBuildTime('fire_2')).toBe(1);
      expect(getBuildTime('water_2')).toBe(2);
    });

    it('tier 3 units take 2 turns', () => {
      expect(getBuildTime('fire_3')).toBe(2);
      expect(getBuildTime('water_3')).toBe(2);
    });

    it('tier 4 units take 2-3 turns', () => {
      expect(getBuildTime('fire_4')).toBe(2);
      expect(getBuildTime('water_4')).toBe(3);
    });
  });

  describe('canAfford', () => {
    it('returns true when player has enough crystals', () => {
      const state: BuildState = { queue: [], crystals: 6 };
      expect(canAfford(state, 'fire_1')).toBe(true); // cost 1
      expect(canAfford(state, 'fire_2')).toBe(true); // cost 3
      expect(canAfford(state, 'fire_3')).toBe(true); // cost 6
    });

    it('returns false when player lacks crystals', () => {
      const state: BuildState = { queue: [], crystals: 5 };
      expect(canAfford(state, 'fire_3')).toBe(false); // cost 6
      expect(canAfford(state, 'fire_4')).toBe(false); // cost 10
    });

    it('returns true for exactly matching crystals', () => {
      const state: BuildState = { queue: [], crystals: 3 };
      expect(canAfford(state, 'fire_2')).toBe(true); // cost 3
    });
  });

  describe('meetsTechRequirement', () => {
    it('T1 units are always available', () => {
      const board = createEmptyBoard();
      // T1 units don't need any existing units
      expect(meetsTechRequirement('fire_1', 'player', board)).toBe(true);
      expect(meetsTechRequirement('water_1', 'player', board)).toBe(true);
    });

    it('T2 units require T1+ of same element', () => {
      let board = createEmptyBoard();
      // No fire units - can't build fire_2
      expect(meetsTechRequirement('fire_2', 'player', board)).toBe(false);

      // Add fire_1 - now can build fire_2
      const fireT1 = createUnit('p1', 'player', { x: 2, y: 2 }, 'fire_1');
      board = placeUnit(board, fireT1);
      expect(meetsTechRequirement('fire_2', 'player', board)).toBe(true);
    });

    it('T3 units require T2+ of same element', () => {
      let board = createEmptyBoard();
      const fireT1 = createUnit('p1', 'player', { x: 2, y: 2 }, 'fire_1');
      board = placeUnit(board, fireT1);

      // T1 not enough for T3
      expect(meetsTechRequirement('fire_3', 'player', board)).toBe(false);

      // Add fire_2
      const fireT2 = createUnit('p2', 'player', { x: 3, y: 3 }, 'fire_2');
      board = placeUnit(board, fireT2);
      expect(meetsTechRequirement('fire_3', 'player', board)).toBe(true);
    });

    it('higher tier units satisfy lower tier requirements', () => {
      let board = createEmptyBoard();
      // Have fire_3 on the board
      const fireT3 = createUnit('p1', 'player', { x: 2, y: 2 }, 'fire_3');
      board = placeUnit(board, fireT3);

      // Can build fire_2 (needs T1+, fire_3 is T3 >= T1)
      expect(meetsTechRequirement('fire_2', 'player', board)).toBe(true);
      // Can build fire_3 (needs T2+, fire_3 is T3 >= T2)
      expect(meetsTechRequirement('fire_3', 'player', board)).toBe(true);
      // Can build fire_4 (needs T3+, fire_3 is T3 >= T3)
      expect(meetsTechRequirement('fire_4', 'player', board)).toBe(true);
    });

    it('different elements do not satisfy requirements', () => {
      let board = createEmptyBoard();
      const waterT3 = createUnit('p1', 'player', { x: 2, y: 2 }, 'water_3');
      board = placeUnit(board, waterT3);

      // Water T3 doesn't help with fire T2
      expect(meetsTechRequirement('fire_2', 'player', board)).toBe(false);
      // But does help with water T2 and higher
      expect(meetsTechRequirement('water_3', 'player', board)).toBe(true);
    });

    it('checks correct player ownership', () => {
      let board = createEmptyBoard();
      // AI has fire_1
      const aiFireT1 = createUnit('ai1', 'ai', { x: 5, y: 5 }, 'fire_1');
      board = placeUnit(board, aiFireT1);

      // Player cannot use AI's units for tech
      expect(meetsTechRequirement('fire_2', 'player', board)).toBe(false);
      // AI can
      expect(meetsTechRequirement('fire_2', 'ai', board)).toBe(true);
    });
  });

  describe('getRequiredTier', () => {
    it('returns 0 for T1 units', () => {
      expect(getRequiredTier('fire_1')).toBe(0);
    });

    it('returns tier-1 for higher tier units', () => {
      expect(getRequiredTier('fire_2')).toBe(1);
      expect(getRequiredTier('fire_3')).toBe(2);
      expect(getRequiredTier('fire_4')).toBe(3);
    });
  });

  describe('canBuildUnit', () => {
    it('requires both affordability and tech', () => {
      let board = createEmptyBoard();
      const fireT1 = createUnit('p1', 'player', { x: 2, y: 2 }, 'fire_1');
      board = placeUnit(board, fireT1);

      // Have fire_1, so can build fire_2 tech-wise
      // fire_2 costs 3
      const richState: BuildState = { queue: [], crystals: 5 };
      expect(canBuildUnit('fire_2', 'player', board, richState)).toBe(true);

      // Can't afford
      const poorState: BuildState = { queue: [], crystals: 2 };
      expect(canBuildUnit('fire_2', 'player', board, poorState)).toBe(false);

      // Can afford but no tech for fire_3 (need T2+)
      const richState2: BuildState = { queue: [], crystals: 10 };
      expect(canBuildUnit('fire_3', 'player', board, richState2)).toBe(false);
    });
  });

  describe('addToBuildQueue', () => {
    it('adds unit to empty queue and deducts cost', () => {
      const state: BuildState = { queue: [], crystals: 5 };
      const newState = addToBuildQueue(state, 'fire_2');

      expect(newState.crystals).toBe(2); // 5 - 3 (fire_2 costs 3)
      expect(newState.queue.length).toBe(1);
      expect(newState.queue[0].definitionId).toBe('fire_2');
      expect(newState.queue[0].turnsRemaining).toBe(1); // fire_2 buildTime is 1
    });

    it('appends to existing queue', () => {
      const state: BuildState = {
        queue: [{ definitionId: 'water_1', turnsRemaining: 1 }],
        crystals: 5,
      };
      const newState = addToBuildQueue(state, 'fire_1');

      expect(newState.queue.length).toBe(2);
      expect(newState.queue[1].definitionId).toBe('fire_1');
    });
  });

  describe('processBuildQueue', () => {
    it('returns ready units when turns reach 0', () => {
      const state: BuildState = {
        queue: [{ definitionId: 'fire_1', turnsRemaining: 1 }],
        crystals: 0,
      };
      const { readyUnits, newBuildState } = processBuildQueue(state);

      expect(readyUnits).toEqual(['fire_1']);
      expect(newBuildState.queue.length).toBe(0);
    });

    it('decrements turn counters for units not ready', () => {
      const state: BuildState = {
        queue: [{ definitionId: 'fire_2', turnsRemaining: 2 }],
        crystals: 0,
      };
      const { readyUnits, newBuildState } = processBuildQueue(state);

      expect(readyUnits).toEqual([]);
      expect(newBuildState.queue.length).toBe(1);
      expect(newBuildState.queue[0].turnsRemaining).toBe(1);
    });

    it('handles multiple units at different stages', () => {
      const state: BuildState = {
        queue: [
          { definitionId: 'fire_1', turnsRemaining: 1 },
          { definitionId: 'water_2', turnsRemaining: 3 },
          { definitionId: 'plant_1', turnsRemaining: 1 },
        ],
        crystals: 0,
      };
      const { readyUnits, newBuildState } = processBuildQueue(state);

      expect(readyUnits).toEqual(['fire_1', 'plant_1']);
      expect(newBuildState.queue.length).toBe(1);
      expect(newBuildState.queue[0].definitionId).toBe('water_2');
      expect(newBuildState.queue[0].turnsRemaining).toBe(2);
    });
  });

  describe('createUnitFromDefinition', () => {
    it('creates a unit with correct properties', () => {
      const unit = createUnitFromDefinition('fire_1', 'player', { x: 1, y: 1 }, 'unit-1');

      expect(unit.id).toBe('unit-1');
      expect(unit.definitionId).toBe('fire_1');
      expect(unit.owner).toBe('player');
      expect(unit.position).toEqual({ x: 1, y: 1 });
      expect(unit.canActThisTurn).toBe(false); // New units can't act
    });

    it('creates units with fresh action states', () => {
      const unit = createUnitFromDefinition('water_2', 'ai', { x: 5, y: 5 }, 'unit-2');

      expect(unit.hasMoved).toBe(false);
      expect(unit.hasAttacked).toBe(false);
      expect(unit.hasMined).toBe(false);
    });
  });

  describe('placeBuiltUnit', () => {
    it('places unit at valid spawn position', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, anchor);

      const newBoard = placeBuiltUnit(board, 'fire_1', 'player', { x: 1, y: 1 }, 'new-unit');

      expect(newBoard).not.toBeNull();
      expect(newBoard!.units.length).toBe(2);
      expect(newBoard!.units.find((u) => u.id === 'new-unit')).toBeDefined();
    });

    it('returns null for invalid spawn position', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, anchor);

      // Position outside spawn zone
      const newBoard = placeBuiltUnit(board, 'fire_1', 'player', { x: 5, y: 5 }, 'new-unit');

      expect(newBoard).toBeNull();
    });

    it('returns null when spawn zone is blocked', () => {
      let board = createEmptyBoard();
      const anchor = createUnit('p1', 'player', { x: 3, y: 3 });
      const enemy = createUnit('e1', 'ai', { x: 1, y: 1 });
      board = placeUnit(board, anchor);
      board = placeUnit(board, enemy);

      const newBoard = placeBuiltUnit(board, 'fire_1', 'player', { x: 2, y: 2 }, 'new-unit');

      expect(newBoard).toBeNull();
    });
  });

  describe('getAvailableBuildOptions', () => {
    it('returns units player can afford', () => {
      const state: BuildState = { queue: [], crystals: 3 };
      const options = getAvailableBuildOptions(state);

      // Can afford: fire_1(1), lightning_1(1), water_1(2), wind_1(2), plant_1(3), metal_1(3), fire_2(3), lightning_2(3)
      expect(options).toContain('fire_1');
      expect(options).toContain('fire_2'); // costs 3
      expect(options).not.toContain('fire_3'); // costs 6
      expect(options).not.toContain('water_2'); // costs 4
    });

    it('returns empty array when player has no crystals', () => {
      const state: BuildState = { queue: [], crystals: 0 };
      const options = getAvailableBuildOptions(state);

      expect(options.length).toBe(0);
    });

    it('returns more units with higher crystals', () => {
      const state: BuildState = { queue: [], crystals: 20 };
      const options = getAvailableBuildOptions(state);

      // Should include units of all tiers with 20 crystals
      expect(options).toContain('fire_1');
      expect(options).toContain('fire_2');
      expect(options).toContain('fire_3'); // costs 6
      expect(options).toContain('fire_4'); // costs 10
      expect(options).toContain('metal_4'); // costs 20 (most expensive)
    });
  });

  describe('hasValidSpawnPositions', () => {
    it('returns true when player has valid spawn zones', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 2, y: 2 });
      board = placeUnit(board, unit);

      expect(hasValidSpawnPositions('player', board)).toBe(true);
    });

    it('returns false when all spawn zones are blocked', () => {
      let board = createEmptyBoard();
      const unit = createUnit('p1', 'player', { x: 5, y: 5 });
      const enemy = createUnit('e1', 'ai', { x: 2, y: 2 });
      board = placeUnit(board, unit);
      board = placeUnit(board, enemy);

      expect(hasValidSpawnPositions('player', board)).toBe(false);
    });
  });

  describe('createInitialBuildState', () => {
    it('creates empty build state', () => {
      const state = createInitialBuildState();

      expect(state.queue).toEqual([]);
      expect(state.crystals).toBe(0);
    });
  });

  describe('addCrystals', () => {
    it('adds crystals to build state', () => {
      const state: BuildState = { queue: [], crystals: 3 };
      const newState = addCrystals(state, 2);

      expect(newState.crystals).toBe(5);
    });

    it('preserves queue when adding crystals', () => {
      const state: BuildState = {
        queue: [{ definitionId: 'fire_1', turnsRemaining: 1 }],
        crystals: 3,
      };
      const newState = addCrystals(state, 2);

      expect(newState.queue.length).toBe(1);
    });
  });

  describe('getQueueSummary', () => {
    it('returns summary of queued units', () => {
      const state: BuildState = {
        queue: [
          { definitionId: 'fire_1', turnsRemaining: 1 },
          { definitionId: 'water_2', turnsRemaining: 2 },
        ],
        crystals: 0,
      };
      const summary = getQueueSummary(state);

      expect(summary.length).toBe(2);
      expect(summary[0].element).toBe('fire');
      expect(summary[0].tier).toBe(1);
      expect(summary[0].turnsRemaining).toBe(1);
      expect(summary[1].element).toBe('water');
      expect(summary[1].tier).toBe(2);
    });
  });
});
