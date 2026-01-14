import { describe, it, expect } from 'vitest';
import { createEmptyBoard } from '../../src/game/board';
import type { GameState, Unit, BoardState, PlayerId } from '../../src/game/types';
import { extractPublicState } from '../../src/ai/state/observation';
import { collectObservedEvents } from '../../src/ai/state/eventsLog';
import { createInitialBelief, updateBelief } from '../../src/ai/belief/update';

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
        resources: 5,
        buildQueue: [],
        startCorner: { x: 0, y: 0 },
        resourcesGained: 5,
        resourcesSpent: 0,
      },
      black: {
        id: 'black',
        resources: 12,
        buildQueue: [
          { id: 'queue-1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'black' },
        ],
        startCorner: { x: 9, y: 9 },
        resourcesGained: 12,
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

describe('AI observation & belief', () => {
  it('hides opponent resources and queue in public state', () => {
    const board = createEmptyBoard();
    const state = createTestState(board, 'white');

    const publicState = extractPublicState(state, 'white');

    expect(publicState.players.black.resources).toBe(0);
    expect(publicState.players.black.buildQueue).toHaveLength(0);
    expect(publicState.players.white.resources).toBe(5);
  });

  it('records mining and placement events for the opponent', () => {
    const board = createEmptyBoard();
    const prevState = createTestState(board, 'white');
    const nextBoard = createEmptyBoard();
    nextBoard.units.push(createTestUnit('ai-1', 'fire_1', 'black', 2, 2));
    nextBoard.cells[2][2].minedDepth = 1;

    const nextState = createTestState(nextBoard, 'white');

    const events = collectObservedEvents(prevState, nextState, 'white');
    const types = events.map((event) => event.type);

    expect(types).toContain('MINE');
    expect(types).toContain('PLACE');
  });

  it('updates belief resources on placement events', () => {
    const belief = createInitialBelief(2, 5, 10);
    const events = [
      { type: 'PLACE', playerId: 'black', definitionId: 'fire_1', position: { x: 0, y: 0 }, cost: 2 },
    ];

    const updated = updateBelief(belief, events, 'black');

    expect(updated.minResources).toBeLessThan(belief.minResources);
    expect(updated.maxResources).toBeLessThan(belief.maxResources);
  });
});
