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

function createTestState(board: BoardState, currentPlayer: PlayerId = 'ai'): GameState {
  return {
    phase: 'playing',
    board,
    players: {
      player: {
        id: 'player',
        resources: 5,
        buildQueue: [],
        startCorner: { x: 0, y: 0 },
        resourcesGained: 5,
        resourcesSpent: 0,
      },
      ai: {
        id: 'ai',
        resources: 12,
        buildQueue: [
          { id: 'queue-1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'ai' },
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
    const state = createTestState(board, 'player');

    const publicState = extractPublicState(state, 'player');

    expect(publicState.players.ai.resources).toBe(0);
    expect(publicState.players.ai.buildQueue).toHaveLength(0);
    expect(publicState.players.player.resources).toBe(5);
  });

  it('records mining and placement events for the opponent', () => {
    const board = createEmptyBoard();
    const prevState = createTestState(board, 'player');
    const nextBoard = createEmptyBoard();
    nextBoard.units.push(createTestUnit('ai-1', 'fire_1', 'ai', 2, 2));
    nextBoard.cells[2][2].minedDepth = 1;

    const nextState = createTestState(nextBoard, 'player');

    const events = collectObservedEvents(prevState, nextState, 'player');
    const types = events.map((event) => event.type);

    expect(types).toContain('MINE');
    expect(types).toContain('PLACE');
  });

  it('updates belief resources on placement events', () => {
    const belief = createInitialBelief(2, 5, 10);
    const events = [
      { type: 'PLACE', playerId: 'ai', definitionId: 'fire_1', position: { x: 0, y: 0 }, cost: 2 },
    ];

    const updated = updateBelief(belief, events, 'ai');

    expect(updated.minResources).toBeLessThan(belief.minResources);
    expect(updated.maxResources).toBeLessThan(belief.maxResources);
  });
});
