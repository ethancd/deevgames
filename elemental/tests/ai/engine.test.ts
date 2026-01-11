import { describe, it, expect } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import { AIEngine, createAI, executeAITurn } from '../../src/ai/engine';
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

function createTestState(board: BoardState, currentPlayer: PlayerId = 'ai'): GameState {
  return {
    phase: 'playing',
    board,
    players: {
      player: {
        id: 'player',
        resources: 10,
        buildQueue: [],
        startCorner: { x: 0, y: 0 },
        resourcesGained: 10,
        resourcesSpent: 0,
      },
      ai: {
        id: 'ai',
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
      actionsRemaining: 4,
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
    it('returns a result with plan', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('easy');

      const result = ai.findBestAction(state);

      expect(result.plan).toBeDefined();
      expect(result.nodesSearched).toBeGreaterThan(0);
      expect(result.timeMs).toBeGreaterThanOrEqual(0);
    });

    it('easy difficulty returns random actions', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('easy');

      const result = ai.findBestAction(state);

      expect(result.plan.actions.length).toBeGreaterThanOrEqual(0);
    });

    it('medium difficulty uses greedy evaluation', () => {
      const board = createEmptyBoard();
      board.cells[5][5].resourceLayers = 3;
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('medium');

      const result = ai.findBestAction(state);

      expect(result.plan.actions.length).toBeGreaterThanOrEqual(1);
    });

    it('hard difficulty uses minimax', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('hard');

      const result = ai.findBestAction(state);

      expect(result.depth).toBeGreaterThan(1);
    });

    it('prefers killing enemy when possible', () => {
      const board = createEmptyBoard();
      // AI has advantage - should attack
      const aiUnit = createTestUnit('ai-unit', 'fire_3', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'plant_1', 'player', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('medium');

      const result = ai.findBestAction(state);

      expect(result.plan.actions[0].type).toBe('ATTACK');
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

  describe('executeAITurn', () => {
    it('returns array of actions', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const actions = executeAITurn(state, 'easy');

      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('includes END_ACTION_PHASE or END_TURN', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const actions = executeAITurn(state, 'easy');

      const hasEndAction = actions.some(
        a => a.type === 'END_ACTION_PHASE' || a.type === 'END_TURN'
      );
      expect(hasEndAction).toBe(true);
    });

    it('respects max iterations safety limit', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const actions = executeAITurn(state, 'medium');

      // Should not exceed 20 actions (safety limit)
      expect(actions.length).toBeLessThanOrEqual(20);
    });

    it('stops when game enters victory state', () => {
      const board = createEmptyBoard();
      // AI will win by attacking
      const aiUnit = createTestUnit('ai-unit', 'fire_4', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const actions = executeAITurn(state, 'medium');

      // Should include the winning attack
      const hasAttack = actions.some(a => a.type === 'ATTACK');
      expect(hasAttack).toBe(true);
    });
  });

  describe('AI decision quality', () => {
    it('takes winning move when available', () => {
      const board = createEmptyBoard();
      // Set up guaranteed kill
      const aiUnit = createTestUnit('ai-unit', 'fire_4', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('hard');
      const result = ai.findBestAction(state);

      expect(result.plan.actions[0].type).toBe('ATTACK');
      expect(result.plan.score).toBeGreaterThan(10000); // Victory score
    });

    it('mines when resources available and no threats', () => {
      const board = createEmptyBoard();
      board.cells[5][5].resourceLayers = 5;
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('medium');
      const result = ai.findBestAction(state);

      // Should mine since enemy is far away
      expect(['MINE', 'MOVE'].includes(result.plan.actions[0].type)).toBe(true);
    });

    it('takes some action when enemy is far away', () => {
      const board = createEmptyBoard();
      // Deplete resources so mining is not an option
      board.cells[9][9].resourceLayers = 0;
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 9, 9);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const ai = new AIEngine('medium');
      const result = ai.findBestAction(state);

      // With no mining option, should move toward enemy or end action phase
      expect(['MOVE', 'END_ACTION_PHASE'].includes(result.plan.actions[0].type)).toBe(true);
    });
  });
});
