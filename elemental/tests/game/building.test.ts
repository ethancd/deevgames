import { describe, it, expect } from 'vitest';
import {
  getBuildCost,
  getBuildTime,
  canAfford,
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
    it('tier 1 units cost 1 crystal', () => {
      expect(getBuildCost('fire_1')).toBe(1);
      expect(getBuildCost('water_1')).toBe(1);
    });

    it('tier 2 units cost 2 crystals', () => {
      expect(getBuildCost('fire_2')).toBe(2);
      expect(getBuildCost('lightning_2')).toBe(2);
    });

    it('tier 3 units cost 3 crystals', () => {
      expect(getBuildCost('plant_3')).toBe(3);
      expect(getBuildCost('metal_3')).toBe(3);
    });

    it('tier 4 units cost 4 crystals', () => {
      expect(getBuildCost('wind_4')).toBe(4);
      expect(getBuildCost('water_4')).toBe(4);
    });
  });

  describe('getBuildTime', () => {
    it('tier 1 units take 1 turn', () => {
      expect(getBuildTime('fire_1')).toBe(1);
    });

    it('tier 2 units take 2 turns', () => {
      expect(getBuildTime('fire_2')).toBe(2);
    });

    it('tier 3 units take 3 turns', () => {
      expect(getBuildTime('fire_3')).toBe(3);
    });

    it('tier 4 units take 4 turns', () => {
      expect(getBuildTime('fire_4')).toBe(4);
    });
  });

  describe('canAfford', () => {
    it('returns true when player has enough crystals', () => {
      const state: BuildState = { queue: [], crystals: 3 };
      expect(canAfford(state, 'fire_1')).toBe(true);
      expect(canAfford(state, 'fire_2')).toBe(true);
      expect(canAfford(state, 'fire_3')).toBe(true);
    });

    it('returns false when player lacks crystals', () => {
      const state: BuildState = { queue: [], crystals: 2 };
      expect(canAfford(state, 'fire_3')).toBe(false);
      expect(canAfford(state, 'fire_4')).toBe(false);
    });

    it('returns true for exactly matching crystals', () => {
      const state: BuildState = { queue: [], crystals: 2 };
      expect(canAfford(state, 'fire_2')).toBe(true);
    });
  });

  describe('addToBuildQueue', () => {
    it('adds unit to empty queue and deducts cost', () => {
      const state: BuildState = { queue: [], crystals: 5 };
      const newState = addToBuildQueue(state, 'fire_2');

      expect(newState.crystals).toBe(3); // 5 - 2
      expect(newState.queue.length).toBe(1);
      expect(newState.queue[0].definitionId).toBe('fire_2');
      expect(newState.queue[0].turnsRemaining).toBe(2);
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
      const state: BuildState = { queue: [], crystals: 2 };
      const options = getAvailableBuildOptions(state);

      // Should include all T1 and T2 units
      expect(options).toContain('fire_1');
      expect(options).toContain('fire_2');
      expect(options).not.toContain('fire_3');
      expect(options).not.toContain('fire_4');
    });

    it('returns empty array when player has no crystals', () => {
      const state: BuildState = { queue: [], crystals: 0 };
      const options = getAvailableBuildOptions(state);

      expect(options.length).toBe(0);
    });

    it('returns all units when player has 4+ crystals', () => {
      const state: BuildState = { queue: [], crystals: 4 };
      const options = getAvailableBuildOptions(state);

      // Should include units of all tiers
      expect(options).toContain('fire_1');
      expect(options).toContain('fire_2');
      expect(options).toContain('fire_3');
      expect(options).toContain('fire_4');
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
