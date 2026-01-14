import { describe, it, expect } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import { AIEngine, createAI } from '../../src/ai/engine';
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
    damageTaken: 0,
    ...overrides,
  };
}

function createTestState(board: BoardState, currentPlayer: PlayerId = 'black'): GameState {
  return {
    phase: 'playing',
    board,
    players: {
      white: {
        id: 'white',
        resources: 10,
        buildQueue: [],
        startCorner: { x: 0, y: 0 },
        resourcesGained: 10,
        resourcesSpent: 0,
      },
      black: {
        id: 'black',
        resources: 10,
        buildQueue: [],
        startCorner: { x: 9, y: 9 },
        resourcesGained: 10,
        resourcesSpent: 0,
      },
    },
    turn: {
      currentPlayer,
      phase: 'action',
      actionsRemaining: 6,
      turnNumber: 1,
    },
    winner: null,
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

describe('AI Engine', () => {
  describe('AIEngine class', () => {
    it('creates with default difficulty', () => {
      const ai = new AIEngine();
      expect(ai).toBeDefined();
    });

    it('creates with specified difficulty', () => {
      const ai = new AIEngine('hard');
      expect(ai).toBeDefined();
    });

    it('can change difficulty', () => {
      const ai = new AIEngine('easy');
      ai.setDifficulty('hard');
      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('findBestAction', () => {
    it('returns a result with plan', async () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('easy');

      const result = await ai.findBestAction(state);

      expect(result.plan).toBeDefined();
      expect(result.nodesSearched).toBeGreaterThan(0);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    it('difficulty presets scale search configs', async () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const easyAI = new AIEngine('easy');
      const hardAI = new AIEngine('hard');

      const easyResult = await easyAI.findBestAction(state);
      const hardResult = await hardAI.findBestAction(state);

      expect(easyResult.debug?.config.mctsIterations).toBeLessThan(
        hardResult.debug?.config.mctsIterations ?? Infinity
      );
    });

    it('prefers killing enemy when possible', async () => {
      const board = createEmptyBoard();
      // AI has advantage - should attack
      const aiUnit = createTestUnit('ai-unit', 'fire_3', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'plant_1', 'white', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('medium');

      const result = await ai.findBestAction(state);

      expect(result.plan.actions[0].type).toBe('ATTACK');
    });

    it('includes debug info for top plans', async () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('medium');

      const result = await ai.findBestAction(state);

      expect(result.debug?.topPlans.length).toBeGreaterThan(0);
    });
  });

  describe('createAI', () => {
    it('creates AI with default difficulty', () => {
      const ai = createAI();
      expect(ai).toBeInstanceOf(AIEngine);
    });

    it('creates AI with specified difficulty', () => {
      const ai = createAI('hard');
      expect(ai).toBeInstanceOf(AIEngine);
    });
  });

  describe('AI decision quality', () => {
    it('takes winning move when available', async () => {
      const board = createEmptyBoard();
      // Set up guaranteed kill
      const aiUnit = createTestUnit('ai-unit', 'fire_4', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('hard');
      const result = await ai.findBestAction(state);

      expect(result.plan.actions[0].type).toBe('ATTACK');
    });

    it('takes a valid action when resources available and no threats', async () => {
      const board = createEmptyBoard();
      board.cells[5][5].resourceLayers = 5;
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('medium');
      const result = await ai.findBestAction(state);

      // AI should take some action - could be mine, move, or end action phase
      // depending on evaluation weights
      const validActions = ['MINE', 'MOVE', 'END_ACTION_PHASE'];
      expect(validActions.includes(result.plan.actions[0].type)).toBe(true);
    });

    it('takes some action when enemy is far away', async () => {
      const board = createEmptyBoard();
      // Deplete resources so mining is not an option
      board.cells[9][9].resourceLayers = 0;
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 9, 9);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('medium');
      const result = await ai.findBestAction(state);

      // With no mining option, should move toward enemy or end action phase
      expect(['MOVE', 'END_ACTION_PHASE'].includes(result.plan.actions[0].type)).toBe(true);
    });
  });
});
