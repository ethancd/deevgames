import { describe, it, expect } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import {
  generateMoveActions,
  generateAttackActions,
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

describe('AI Move Generation', () => {
  describe('generateMoveActions', () => {
    it('generates move actions for units that can move', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      board.units.push(unit);

      const state = createTestState(board);
      const moves = generateMoveActions(state, 'black');

      expect(moves.length).toBeGreaterThan(0);
      expect(moves.every(m => m.type === 'MOVE')).toBe(true);
      expect(moves.every(m => m.unitId === 'ai-unit')).toBe(true);
    });

    it('generates moves even for units that have already moved (multiple moves per turn)', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5, { hasMoved: true });
      board.units.push(unit);

      const state = createTestState(board);
      const moves = generateMoveActions(state, 'black');
      // Units can move multiple times per turn, hasMoved is just tracking
      expect(moves.length).toBeGreaterThan(0);
    });

    it('does not generate moves for units that cannot act this turn', () => {
      const board = createEmptyBoard();
      const unit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5, { canActThisTurn: false });
      board.units.push(unit);

      const state = createTestState(board);
      const moves = generateMoveActions(state, 'black');

      expect(moves.length).toBe(0);
    });

    it('only generates moves for the specified player', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'fire_1', 'white', 3, 3);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const moves = generateMoveActions(state, 'black');

      expect(moves.every(m => m.unitId === 'ai-unit')).toBe(true);
    });
  });

  describe('generateAttackActions', () => {
    it('generates attack actions when enemy is in range', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 5, 6); // Adjacent
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const attacks = generateAttackActions(state, 'black');

      expect(attacks.length).toBe(1);
      expect(attacks[0].type).toBe('ATTACK');
      expect(attacks[0].unitId).toBe('ai-unit');
      expect(attacks[0].targetPosition).toEqual({ x: 5, y: 6 });
    });

    it('does not generate a second attack for a spent Tier I', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5, { hasAttacked: true });
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 5, 6);
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const attacks = generateAttackActions(state, 'black');
      expect(attacks).toHaveLength(0);
    });

    it('does not generate attacks when no enemies in range', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      const playerUnit = createTestUnit('player-unit', 'water_1', 'white', 0, 0); // Far away
      board.units.push(aiUnit, playerUnit);

      const state = createTestState(board);
      const attacks = generateAttackActions(state, 'black');

      expect(attacks.length).toBe(0);
    });
  });

  describe('generatePlaceActions', () => {
    it('generates all affordable tier-one purchases on empty spawn squares', () => {
      const board = createEmptyBoard();
      board.units.push(createTestUnit('anchor', 'fire_1', 'black', 8, 8));
      const state = createTestState(board);
      state.turn.phase = 'place';
      const purchases = generatePlaceActions(state, 'black');
      expect(purchases).toHaveLength(18); // six definitions × three empty squares
      expect(purchases.every(a => a.type === 'BUY_UNIT' && a.definitionId.endsWith('_1'))).toBe(true);
      expect(purchases.every(a => a.type === 'BUY_UNIT' && a.position.x >= 8 && a.position.y >= 8)).toBe(true);
    });

    it('generates no purchases when an invader blocks every rectangle', () => {
      const board = createEmptyBoard();
      board.units.push(createTestUnit('anchor', 'fire_1', 'black', 8, 8));
      board.units.push(createTestUnit('invader', 'lightning_1', 'white', 9, 9));
      const state = createTestState(board);
      state.turn.phase = 'place';
      expect(generatePlaceActions(state, 'black')).toEqual([]);
    });
  });

  describe('generatePromoteActions', () => {
    it('generates promote actions for eligible units', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.black.resources = 10; // Enough for promotion

      const promotes = generatePromoteActions(state, 'black');

      expect(promotes.length).toBe(1);
      expect(promotes[0].type).toBe('PROMOTE_UNIT');
      expect(promotes[0].unitId).toBe('ai-unit');
    });

    it('does not generate promote for T3 units', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_3', 'black', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.black.resources = 10;

      const promotes = generatePromoteActions(state, 'black');

      expect(promotes.length).toBe(0);
    });

    it('does not generate promote without enough resources', () => {
      const board = createEmptyBoard();
      const aiUnit = createTestUnit('ai-unit', 'fire_1', 'black', 5, 5);
      board.units.push(aiUnit);

      const state = createTestState(board);
      state.turn.phase = 'place';
      state.players.black.resources = 0; // Not enough

      const promotes = generatePromoteActions(state, 'black');

      expect(promotes.length).toBe(0);
    });
  });

  describe('generateAllActions', () => {

    it('includes END_ACTION_PHASE in action phase', () => {
      const board = createEmptyBoard();
      const state = createTestState(board);
      const actions = generateAllActions(state, 'black');

      expect(actions.some(a => a.type === 'END_ACTION_PHASE')).toBe(true);
    });
  });

  describe('getSortedActions', () => {
    it('prioritizes attacks over other actions', () => {
      const actions = [
        { type: 'MOVE' as const, unitId: 'u1', to: { x: 0, y: 0 } },
        { type: 'ATTACK' as const, unitId: 'u1', targetPosition: { x: 1, y: 1 } },
        { type: 'END_ACTION_PHASE' as const },
      ];

      const sorted = getSortedActions(actions);

      expect(sorted[0].type).toBe('ATTACK');
    });

    it('prioritizes a move before ending the action phase', () => {
      // Ending the phase remains a low-priority candidate.
      const actions = [
        { type: 'END_ACTION_PHASE' as const },
        { type: 'MOVE' as const, unitId: 'u1', to: { x: 0, y: 0 } },
      ];

      const sorted = getSortedActions(actions);

      expect(sorted[0].type).toBe('MOVE');
    });
  });
});
