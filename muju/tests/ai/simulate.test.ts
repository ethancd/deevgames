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
        resources: 20,

        startCorner: { x: 0, y: 0 },
        resourcesGained: 20,


      },
      black: {
        id: 'black',
        resources: 20,

        startCorner: { x: 9, y: 9 },
        resourcesGained: 20,


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

describe('AI State Simulation', () => {
  describe('applyAction - MOVE', () => {
    it('moves unit to target position', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
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
      const unit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      state.turn.actionsRemaining = 4;
      const action: AIAction = { type: 'MOVE', unitId: 'ai-unit', to: { x: 6, y: 5 } };

      const newState = applyAction(state, action);

      expect(newState.turn.actionsRemaining).toBe(3);
    });

    it('does not mutate original state', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
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
      const aiUnit = createTestUnit('ai-unit', 'fire_3', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 5, 6);
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
      const aiUnit = createTestUnit('ai-unit', 'fire_3', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const action: AIAction = {
        type: 'ATTACK',
        unitId: 'ai-unit',
        targetPosition: { x: 5, y: 6 },
      };

      const newState = applyAction(state, action);

      expect(newState.phase).toBe('victory');
      expect(newState.winner).toBe('black');
    });
  });

  describe('applyAction - PROMOTE_UNIT', () => {
    it('upgrades unit tier', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.black.resources = 10;
      const action: AIAction = { type: 'PROMOTE_UNIT', unitId: 'ai-unit' };

      const newState = applyAction(state, action);

      const promotedUnit = newState.board.units.find(u => u.id === 'ai-unit');
      expect(promotedUnit?.definitionId).toBe('fire_2');
    });

    it('deducts promotion cost', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.black.resources = 10;
      const action: AIAction = { type: 'PROMOTE_UNIT', unitId: 'ai-unit' };

      const newState = applyAction(state, action);

      expect(newState.players.black.resources).toBeLessThan(10);
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
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);

      expect(isTerminal(state)).toBe(true);
    });

    it('returns false when both players have units', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 0, 0);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);

      expect(isTerminal(state)).toBe(false);
    });
  });

  describe('getOpponent', () => {
    it('returns ai for player', () => {
      expect(getOpponent('white')).toBe('black');
    });

    it('returns player for ai', () => {
      expect(getOpponent('black')).toBe('white');
    });
  });
});
