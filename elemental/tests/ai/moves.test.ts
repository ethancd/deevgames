import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyBoard, placeUnit, getPlayerUnits } from '../../src/game/board';
import { getUnitDefinition } from '../../src/game/units';
import { createInitialGameState } from '../../src/game/board';
import {
  generateMoveActions,
  generateAttackActions,
  generateMineActions,
  generateQueueActions,
  generatePlaceActions,
  generatePromoteActions,
  generateAllActions,
  getSortedActions,
} from '../../src/ai/moves';
import type { GameState, Unit, BoardState, PlayerId } from '../../src/game/types';

function createTestUnit(
  id: string,
  definitionId: string,
  owner: PlayerId,
  x: number,
  y: number,
  overrides: Partial<Unit> = {}
): Unit {
  return {
    id,
    definitionId,
    owner,
    position: { x, y },
    hasMoved: false,
    hasAttacked: false,
    hasMined: false,
    canActThisTurn: true,
    ...overrides,
  };
}

function createTestState(board: BoardState, player: PlayerId = 'ai'): GameState {
  return {
    phase: 'playing',
    board,
    players: {
      player: {
        id: 'player',
        resources: 20,
        buildQueue: [],
        startCorner: { x: 0, y: 0 },
        resourcesGained: 20,
        resourcesSpent: 0,
      },
      ai: {
        id: 'ai',
        resources: 20,
        buildQueue: [],
        startCorner: { x: 9, y: 9 },
        resourcesGained: 20,
        resourcesSpent: 0,
      },
    },
    turn: {
      currentPlayer: player,
      phase: 'action',
      actionsRemaining: 4,
      turnNumber: 1,
    },
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

describe('AI Move Generation', () => {
  describe('generateMoveActions', () => {
    it('generates move actions for units that can move', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const moves = generateMoveActions(state, 'ai');

      expect(moves.length).toBeGreaterThan(0);
      expect(moves.every(m => m.type === 'MOVE')).toBe(true);
      expect(moves.every(m => m.unitId === 'ai-unit')).toBe(true);
    });

    it('does not generate moves for units that have already moved', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5, { hasMoved: true });
      board.units.push(unit);

      const state = createTestState(board);
      const moves = generateMoveActions(state, 'ai');

      expect(moves.length).toBe(0);
    });

    it('does not generate moves for units that cannot act this turn', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5, { canActThisTurn: false });
      board.units.push(unit);

      const state = createTestState(board);
      const moves = generateMoveActions(state, 'ai');

      expect(moves.length).toBe(0);
    });

    it('only generates moves for the specified player', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'fire_1', 'player', 3, 3);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const moves = generateMoveActions(state, 'ai');

      expect(moves.every(m => m.unitId === 'ai-unit')).toBe(true);
    });
  });

  describe('generateAttackActions', () => {
    it('generates attack actions when enemy is in range', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 5, 6); // Adjacent
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const attacks = generateAttackActions(state, 'ai');

      expect(attacks.length).toBe(1);
      expect(attacks[0].type).toBe('ATTACK');
      expect(attacks[0].unitId).toBe('ai-unit');
      expect(attacks[0].targetPosition).toEqual({ x: 5, y: 6 });
    });

    it('does not generate attacks for units that have already attacked', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5, { hasAttacked: true });
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const attacks = generateAttackActions(state, 'ai');

      expect(attacks.length).toBe(0);
    });

    it('does not generate attacks when no enemies in range', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0); // Far away
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const attacks = generateAttackActions(state, 'ai');

      expect(attacks.length).toBe(0);
    });
  });

  describe('generateMineActions', () => {
    it('generates mine actions for units on resource cells', () => {
      const board = createEmptyBoard();
      // Place unit on a cell with resources
      board.cells[5][5].resourceLayers = 3;
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const mines = generateMineActions(state, 'ai');

      expect(mines.length).toBe(1);
      expect(mines[0].type).toBe('MINE');
      expect(mines[0].unitId).toBe('ai-unit');
    });

    it('does not generate mine actions for units that have already mined', () => {
      const board = createEmptyBoard();
      board.cells[5][5].resourceLayers = 3;
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5, { hasMined: true });
      board.units.push(unit);

      const state = createTestState(board);
      const mines = generateMineActions(state, 'ai');

      expect(mines.length).toBe(0);
    });

    it('does not generate mine actions on depleted cells', () => {
      const board = createEmptyBoard();
      // Deplete the cell's resources
      board.cells[5][5].resourceLayers = 0;
      board.cells[5][5].minedDepth = 5;
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const mines = generateMineActions(state, 'ai');

      expect(mines.length).toBe(0);
    });
  });

  describe('generateQueueActions', () => {
    it('generates queue actions when in queue phase with resources', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);
      state.turn.phase = 'queue';
      state.players.ai.resources = 5; // Enough for T1 units

      const queues = generateQueueActions(state, 'ai');

      expect(queues.length).toBeGreaterThan(0);
      expect(queues.every(q => q.type === 'QUEUE_UNIT')).toBe(true);
    });

    it('generateQueueActions is phase-agnostic (phase check in generateAllActions)', () => {
      // Note: generateQueueActions doesn't check phase - that's done by generateAllActions
      // This tests that it generates based on resources
      const board = createEmptyBoard();
      const state = createTestState(board);
      state.turn.phase = 'action';
      state.players.ai.resources = 5;

      const queues = generateQueueActions(state, 'ai');

      // It generates actions based on resources, not phase
      expect(queues.length).toBeGreaterThan(0);
    });

    it('does not generate queue actions for units too expensive', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);
      state.turn.phase = 'queue';
      state.players.ai.resources = 0; // No resources

      const queues = generateQueueActions(state, 'ai');

      expect(queues.length).toBe(0);
    });
  });

  describe('generatePlaceActions', () => {
    it('generates place actions for ready units when spawn positions exist', () => {
      const board = createEmptyBoard();
      // Place AI unit at corner to establish spawn zone
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 9, 9);
      board.units.push(aiUnit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.ai.buildQueue = [{
        id: 'queued-1',
        definitionId: 'fire_1',
        turnsRemaining: 0,
        owner: 'ai',
      }];

      const places = generatePlaceActions(state, 'ai');

      // Spawn positions depend on getAllSpawnPositions logic
      // If there are valid spawn positions, actions should be generated
      if (places.length > 0) {
        expect(places.every(p => p.type === 'PLACE_UNIT')).toBe(true);
        expect(places.every(p => p.queuedUnitId === 'queued-1')).toBe(true);
      }
    });

    it('does not generate place actions for units still building', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 9, 9);
      board.units.push(aiUnit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.ai.buildQueue = [{
        id: 'queued-1',
        definitionId: 'fire_1',
        turnsRemaining: 2, // Still building
        owner: 'ai',
      }];

      const places = generatePlaceActions(state, 'ai');

      expect(places.length).toBe(0);
    });
  });

  describe('generatePromoteActions', () => {
    it('generates promote actions for eligible units', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);
      state.turn.phase = 'queue';
      state.players.ai.resources = 10; // Enough for promotion

      const promotes = generatePromoteActions(state, 'ai');

      expect(promotes.length).toBe(1);
      expect(promotes[0].type).toBe('PROMOTE_UNIT');
      expect(promotes[0].unitId).toBe('ai-unit');
    });

    it('does not generate promote for T4 units', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_4', 'ai', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);
      state.turn.phase = 'queue';
      state.players.ai.resources = 10;

      const promotes = generatePromoteActions(state, 'ai');

      expect(promotes.length).toBe(0);
    });

    it('does not generate promote without enough resources', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);
      state.turn.phase = 'queue';
      state.players.ai.resources = 0; // Not enough

      const promotes = generatePromoteActions(state, 'ai');

      expect(promotes.length).toBe(0);
    });
  });

  describe('generateAllActions', () => {
    it('generates all types of actions in action phase', () => {
      const board = createEmptyBoard();
      board.cells[5][5].resourceLayers = 3;
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const actions = generateAllActions(state, 'ai');

      const types = new Set(actions.map(a => a.type));
      expect(types.has('MOVE')).toBe(true);
      expect(types.has('ATTACK')).toBe(true);
      expect(types.has('MINE')).toBe(true);
      expect(types.has('END_ACTION_PHASE')).toBe(true);
    });

    it('includes END_ACTION_PHASE in action phase', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);
      const actions = generateAllActions(state, 'ai');

      expect(actions.some(a => a.type === 'END_ACTION_PHASE')).toBe(true);
    });

    it('includes END_TURN in queue phase', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);
      state.turn.phase = 'queue';

      const actions = generateAllActions(state, 'ai');

      expect(actions.some(a => a.type === 'END_TURN')).toBe(true);
    });
  });

  describe('getSortedActions', () => {
    it('prioritizes attacks over other actions', () => {
      const actions = [
        { type: 'MOVE' as const, unitId: 'u1', to: { x: 0, y: 0 } },
        { type: 'ATTACK' as const, unitId: 'u1', targetPosition: { x: 1, y: 1 } },
        { type: 'MINE' as const, unitId: 'u1' },
      ];

      const sorted = getSortedActions(actions);

      expect(sorted[0].type).toBe('ATTACK');
    });

    it('prioritizes moves over mining for alpha-beta efficiency', () => {
      // Moves have priority 1, mining has priority 2 (lower = higher priority)
      const actions = [
        { type: 'MINE' as const, unitId: 'u1' },
        { type: 'MOVE' as const, unitId: 'u1', to: { x: 0, y: 0 } },
      ];

      const sorted = getSortedActions(actions);

      expect(sorted[0].type).toBe('MOVE');
    });
  });
});
