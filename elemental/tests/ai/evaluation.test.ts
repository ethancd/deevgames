import { describe, it, expect } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import {
  evaluatePosition,
  quickEvaluate,
  evaluateUnitPosition,
  scoreAction,
} from '../../src/ai/evaluation';
import { DEFAULT_WEIGHTS } from '../../src/ai/types';
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

describe('AI Evaluation', () => {
  describe('evaluatePosition', () => {
    it('returns positive score when AI has more units', () => {
      const board = createEmptyBoard();
      const aiUnit1 = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      const aiUnit2 = createTestUnit('ai-2', 'fire_1', 'ai', 6, 6);
      const playerUnit = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit1, aiUnit2, playerUnit);

      const state = createTestState(board);
      const score = evaluatePosition(state, 'ai');

      expect(score).toBeGreaterThan(0);
    });

    it('returns lower score when AI has fewer units than opponent', () => {
      const board1 = createEmptyBoard();
      const aiUnit1 = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      const playerUnit1 = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      board1.units.push(aiUnit1, playerUnit1);

      const board2 = createEmptyBoard();
      const aiUnit2 = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      const playerUnit2 = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      const playerUnit3 = createTestUnit('player-2', 'water_1', 'player', 1, 1);
      board2.units.push(aiUnit2, playerUnit2, playerUnit3);

      const scoreEqual = evaluatePosition(createTestState(board1), 'ai');
      const scoreDisadvantage = evaluatePosition(createTestState(board2), 'ai');

      // Having fewer units should result in a lower score
      expect(scoreDisadvantage).toBeLessThan(scoreEqual);
    });

    it('returns very high score for victory state', () => {
      const board = createEmptyBoard();
      // Only AI has units - victory!
      const aiUnit = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);
      const score = evaluatePosition(state, 'ai');

      expect(score).toBeGreaterThan(10000);
    });

    it('returns very low score for loss state', () => {
      const board = createEmptyBoard();
      // Only player has units - loss for AI
      const playerUnit = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      board.units.push(playerUnit);

      const state = createTestState(board);
      const score = evaluatePosition(state, 'ai');

      expect(score).toBeLessThan(-10000);
    });

    it('considers resource advantage', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      // AI has more resources
      const stateRich = createTestState(board);
      stateRich.players.ai.resources = 50;
      stateRich.players.player.resources = 10;

      const statePoor = createTestState(board);
      statePoor.players.ai.resources = 10;
      statePoor.players.player.resources = 50;

      const scoreRich = evaluatePosition(stateRich, 'ai');
      const scorePoor = evaluatePosition(statePoor, 'ai');

      expect(scoreRich).toBeGreaterThan(scorePoor);
    });

    it('values higher tier units more', () => {
      const board1 = createEmptyBoard();
      const aiT1 = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      const playerT1 = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      board1.units.push(aiT1, playerT1);

      const board2 = createEmptyBoard();
      const aiT3 = createTestUnit('ai-1', 'fire_3', 'ai', 5, 5);
      const playerT1_2 = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      board2.units.push(aiT3, playerT1_2);

      const scoreT1 = evaluatePosition(createTestState(board1), 'ai');
      const scoreT3 = evaluatePosition(createTestState(board2), 'ai');

      expect(scoreT3).toBeGreaterThan(scoreT1);
    });

    it('values center control', () => {
      const boardCenter = createEmptyBoard();
      const aiCenter = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      const playerCorner = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      boardCenter.units.push(aiCenter, playerCorner);

      const boardEdge = createEmptyBoard();
      const aiEdge = createTestUnit('ai-1', 'fire_1', 'ai', 9, 9);
      const playerCorner2 = createTestUnit('player-1', 'water_1', 'player', 0, 0);
      boardEdge.units.push(aiEdge, playerCorner2);

      const scoreCenter = evaluatePosition(createTestState(boardCenter), 'ai');
      const scoreEdge = evaluatePosition(createTestState(boardEdge), 'ai');

      expect(scoreCenter).toBeGreaterThan(scoreEdge);
    });
  });

  describe('quickEvaluate', () => {
    it('returns higher score for more AI unit value', () => {
      // Use higher tier AI unit for clear material advantage
      const board = createEmptyBoard();
      const aiUnit1 = createTestUnit('ai-1', 'fire_3', 'ai', 5, 5); // T3 = cost 7
      const playerUnit = createTestUnit('player-1', 'water_1', 'player', 0, 0); // T1 = cost 2
      board.units.push(aiUnit1, playerUnit);

      const state = createTestState(board);
      const score = quickEvaluate(state, 'ai');

      // AI T3 (cost 7) vs player T1 (cost 2) = +5 advantage
      expect(score).toBeGreaterThan(0);
    });

    it('handles victory conditions', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);
      const score = quickEvaluate(state, 'ai');

      expect(score).toBeGreaterThan(10000);
    });
  });

  describe('evaluateUnitPosition', () => {
    it('returns higher score for center positions', () => {
      const board = createEmptyBoard();
      const centerUnit = createTestUnit('center', 'fire_1', 'ai', 5, 5);
      const edgeUnit = createTestUnit('edge', 'fire_1', 'ai', 0, 0);
      board.units.push(centerUnit, edgeUnit);

      const state = createTestState(board);
      const centerScore = evaluateUnitPosition(centerUnit, state);
      const edgeScore = evaluateUnitPosition(edgeUnit, state);

      expect(centerScore).toBeGreaterThan(edgeScore);
    });

    it('returns higher score for units with attack options', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      const nearEnemy = createTestUnit('player-1', 'water_1', 'player', 5, 6);
      board.units.push(aiUnit, nearEnemy);

      const boardNoEnemy = createEmptyBoard();
      const aiAlone = createTestUnit('ai-1', 'fire_1', 'ai', 5, 5);
      boardNoEnemy.units.push(aiAlone);

      const stateWithEnemy = createTestState(board);
      const stateAlone = createTestState(boardNoEnemy);

      const scoreWithEnemy = evaluateUnitPosition(aiUnit, stateWithEnemy);
      const scoreAlone = evaluateUnitPosition(aiAlone, stateAlone);

      expect(scoreWithEnemy).toBeGreaterThan(scoreAlone);
    });
  });

  describe('scoreAction', () => {
    it('scores attacks highest', () => {
      const board = createEmptyBoard();
      const playerUnit = createTestUnit('player-1', 'fire_3', 'player', 5, 5);
      board.units.push(playerUnit);

      const state = createTestState(board);

      const attackScore = scoreAction(
        { type: 'ATTACK', unitId: 'ai-1', targetPosition: { x: 5, y: 5 } },
        state
      );
      const mineScore = scoreAction({ type: 'MINE', unitId: 'ai-1' }, state);
      const moveScore = scoreAction(
        { type: 'MOVE', unitId: 'ai-1', targetPosition: { x: 3, y: 3 } },
        state
      );

      expect(attackScore).toBeGreaterThan(mineScore);
      expect(mineScore).toBeGreaterThan(moveScore);
    });

    it('scores attacks by target value', () => {
      const board = createEmptyBoard();
      const t1Unit = createTestUnit('player-t1', 'fire_1', 'player', 1, 1);
      const t3Unit = createTestUnit('player-t3', 'fire_3', 'player', 2, 2);
      board.units.push(t1Unit, t3Unit);

      const state = createTestState(board);

      const attackT1 = scoreAction(
        { type: 'ATTACK', unitId: 'ai-1', targetPosition: { x: 1, y: 1 } },
        state
      );
      const attackT3 = scoreAction(
        { type: 'ATTACK', unitId: 'ai-1', targetPosition: { x: 2, y: 2 } },
        state
      );

      expect(attackT3).toBeGreaterThan(attackT1);
    });

    it('returns 0 for unknown action types', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);

      const score = scoreAction({ type: 'END_TURN' }, state);

      expect(score).toBe(0);
    });
  });
});
