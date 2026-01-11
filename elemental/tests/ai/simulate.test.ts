import { describe, it, expect } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import {
  applyAction,
  applyActions,
  isTerminal,
  getOpponent,
} from '../../src/ai/simulate';
import type { GameState, Unit, BoardState, PlayerId } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';

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

describe('AI State Simulation', () => {
  describe('applyAction - MOVE', () => {
    it('moves unit to target position', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const action: AIAction = { type: 'MOVE', unitId: 'ai-unit', to: { x: 6, y: 5 } };

      const newState = applyAction(state, action);

      const movedUnit = newState.board.units.find(u => u.id === 'ai-unit');
      expect(movedUnit?.position).toEqual({ x: 6, y: 5 });
      expect(movedUnit?.hasMoved).toBe(true);
    });

    it('decrements actions remaining', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      state.turn.actionsRemaining = 4;
      const action: AIAction = { type: 'MOVE', unitId: 'ai-unit', to: { x: 6, y: 5 } };

      const newState = applyAction(state, action);

      expect(newState.turn.actionsRemaining).toBe(3);
    });

    it('does not mutate original state', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const action: AIAction = { type: 'MOVE', unitId: 'ai-unit', to: { x: 6, y: 5 } };

      applyAction(state, action);

      const originalUnit = state.board.units.find(u => u.id === 'ai-unit');
      expect(originalUnit?.position).toEqual({ x: 5, y: 5 });
    });
  });

  describe('applyAction - ATTACK', () => {
    it('removes defender when attacker wins', () => {
      const board = createEmptyBoard();
      // Fire T3 (attack 4) vs Water T1 (defense 2) - Fire should win
      const aiUnit = createTestUnit('ai-unit', 'fire_3', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const action: AIAction = {
        type: 'ATTACK',
        unitId: 'ai-unit',
        targetPosition: { x: 5, y: 6 },
      };

      const newState = applyAction(state, action);

      expect(newState.board.units.find(u => u.id === 'player-unit')).toBeUndefined();
    });

    it('sets victory when eliminating last enemy unit', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_3', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const action: AIAction = {
        type: 'ATTACK',
        unitId: 'ai-unit',
        targetPosition: { x: 5, y: 6 },
      };

      const newState = applyAction(state, action);

      expect(newState.phase).toBe('victory');
      expect(newState.winner).toBe('ai');
    });
  });

  describe('applyAction - MINE', () => {
    it('increases resources and marks unit as mined', () => {
      const board = createEmptyBoard();
      board.cells[5][5].resourceLayers = 3;
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const initialResources = state.players.ai.resources;
      const action: AIAction = { type: 'MINE', unitId: 'ai-unit' };

      const newState = applyAction(state, action);

      expect(newState.players.ai.resources).toBeGreaterThan(initialResources);
      expect(newState.players.ai.resourcesGained).toBeGreaterThan(
        state.players.ai.resourcesGained
      );
      const minedUnit = newState.board.units.find(u => u.id === 'ai-unit');
      expect(minedUnit?.hasMined).toBe(true);
    });

    it('depletes resource layers', () => {
      const board = createEmptyBoard();
      board.cells[5][5].resourceLayers = 3;
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const action: AIAction = { type: 'MINE', unitId: 'ai-unit' };

      const newState = applyAction(state, action);

      expect(newState.board.cells[5][5].resourceLayers).toBeLessThan(3);
    });
  });

  describe('applyAction - END_ACTION_PHASE', () => {
    it('transitions to queue phase', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);
      state.turn.phase = 'action';
      const action: AIAction = { type: 'END_ACTION_PHASE' };

      const newState = applyAction(state, action);

      expect(newState.turn.phase).toBe('queue');
    });
  });

  describe('applyAction - END_TURN', () => {
    it('switches current player', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board, 'ai');
      state.turn.phase = 'queue';
      const action: AIAction = { type: 'END_TURN' };

      const newState = applyAction(state, action);

      expect(newState.turn.currentPlayer).toBe('player');
    });
  });

  describe('applyAction - QUEUE_UNIT', () => {
    it('adds unit to build queue and deducts resources', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);
      state.turn.phase = 'queue';
      const initialResources = state.players.ai.resources;
      const action: AIAction = { type: 'QUEUE_UNIT', definitionId: 'fire_1' };

      const newState = applyAction(state, action);

      expect(newState.players.ai.buildQueue.length).toBe(1);
      expect(newState.players.ai.buildQueue[0].definitionId).toBe('fire_1');
      expect(newState.players.ai.resources).toBeLessThan(initialResources);
    });
  });

  describe('applyAction - PLACE_UNIT', () => {
    it('places unit on board from queue', () => {
      const board = createEmptyBoard();
      const existingUnit = createTestUnit('ai-existing', 'fire_1', 'ai', 9, 9);
      board.units.push(existingUnit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.ai.buildQueue = [{
        id: 'queued-1',
        definitionId: 'fire_1',
        turnsRemaining: 0,
        owner: 'ai',
      }];

      const action: AIAction = {
        type: 'PLACE_UNIT',
        queuedUnitId: 'queued-1',
        position: { x: 8, y: 9 },
      };

      const newState = applyAction(state, action);

      expect(newState.players.ai.buildQueue.length).toBe(0);
      const newUnits = newState.board.units.filter(u => u.owner === 'ai');
      expect(newUnits.length).toBe(2);
    });

    it('updates resourcesSpent', () => {
      const board = createEmptyBoard();
      const existingUnit = createTestUnit('ai-existing', 'fire_1', 'ai', 9, 9);
      board.units.push(existingUnit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.ai.buildQueue = [{
        id: 'queued-1',
        definitionId: 'fire_1',
        turnsRemaining: 0,
        owner: 'ai',
      }];
      state.players.ai.resourcesSpent = 0;

      const action: AIAction = {
        type: 'PLACE_UNIT',
        queuedUnitId: 'queued-1',
        position: { x: 8, y: 9 },
      };

      const newState = applyAction(state, action);

      expect(newState.players.ai.resourcesSpent).toBeGreaterThan(0);
    });
  });

  describe('applyAction - PROMOTE_UNIT', () => {
    it('upgrades unit tier', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      state.turn.phase = 'queue';
      state.players.ai.resources = 10;
      const action: AIAction = { type: 'PROMOTE_UNIT', unitId: 'ai-unit' };

      const newState = applyAction(state, action);

      const promotedUnit = newState.board.units.find(u => u.id === 'ai-unit');
      expect(promotedUnit?.definitionId).toBe('fire_2');
    });

    it('deducts promotion cost', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      state.turn.phase = 'queue';
      state.players.ai.resources = 10;
      const action: AIAction = { type: 'PROMOTE_UNIT', unitId: 'ai-unit' };

      const newState = applyAction(state, action);

      expect(newState.players.ai.resources).toBeLessThan(10);
    });
  });

  describe('applyActions', () => {
    it('applies sequence of actions', () => {
      const board = createEmptyBoard();
      board.cells[5][5].resourceLayers = 3;
      const unit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const actions: AIAction[] = [
        { type: 'MINE', unitId: 'ai-unit' },
        { type: 'MOVE', unitId: 'ai-unit', to: { x: 6, y: 5 } },
      ];

      const newState = applyActions(state, actions);

      const movedUnit = newState.board.units.find(u => u.id === 'ai-unit');
      expect(movedUnit?.position).toEqual({ x: 6, y: 5 });
      expect(movedUnit?.hasMined).toBe(true);
      expect(movedUnit?.hasMoved).toBe(true);
    });
  });

  describe('isTerminal', () => {
    it('returns true when game is in victory phase', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);
      state.phase = 'victory';

      expect(isTerminal(state)).toBe(true);
    });

    it('returns true when one player has no units', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);

      expect(isTerminal(state)).toBe(true);
    });

    it('returns false when both players have units', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'ai', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'player', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);

      expect(isTerminal(state)).toBe(false);
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
});
