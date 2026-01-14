import { describe, it, expect } from 'vitest';
import {
  advanceBuildQueue,
  startTurn,
  getReadyUnits,
  startActionPhase,
  useAction,
  hasActionsRemaining,
  startQueuePhase,
  endTurn,
  getOpponent,
  isPlayerTurn,
  isPhase,
  canCurrentPlayerAct,
  skipToQueuePhase,
} from '../../src/game/turn';
import {
  createInitialGameState,
  createUnit,
  addUnit,
  updateUnit,
  getPlayerUnits,
  MAX_ACTIONS_PER_TURN,
} from '../../src/game/board';
import type { GameState, QueuedUnit, PlayerId } from '../../src/game/types';

describe('Turn Module', () => {
  describe('advanceBuildQueue', () => {
    it('decrements turnsRemaining for queued units', () => {
      const queue: QueuedUnit[] = [
        { id: 'q1', definitionId: 'fire_1', turnsRemaining: 3, owner: 'white' },
        { id: 'q2', definitionId: 'water_1', turnsRemaining: 2, owner: 'white' },
      ];

      const { updatedQueue, readyUnits } = advanceBuildQueue(queue);

      expect(updatedQueue).toHaveLength(2);
      expect(updatedQueue[0].turnsRemaining).toBe(2);
      expect(updatedQueue[1].turnsRemaining).toBe(1);
      expect(readyUnits).toHaveLength(0);
    });

    it('moves units with turnsRemaining 1 to readyUnits', () => {
      const queue: QueuedUnit[] = [
        { id: 'q1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'white' },
        { id: 'q2', definitionId: 'water_1', turnsRemaining: 2, owner: 'white' },
      ];

      const { updatedQueue, readyUnits } = advanceBuildQueue(queue);

      expect(updatedQueue).toHaveLength(1);
      expect(updatedQueue[0].definitionId).toBe('water_1');
      expect(readyUnits).toHaveLength(1);
      expect(readyUnits[0].definitionId).toBe('fire_1');
    });

    it('handles empty queue', () => {
      const { updatedQueue, readyUnits } = advanceBuildQueue([]);

      expect(updatedQueue).toHaveLength(0);
      expect(readyUnits).toHaveLength(0);
    });

    it('handles all units ready at once', () => {
      const queue: QueuedUnit[] = [
        { id: 'q1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'white' },
        { id: 'q2', definitionId: 'water_1', turnsRemaining: 1, owner: 'white' },
      ];

      const { updatedQueue, readyUnits } = advanceBuildQueue(queue);

      expect(updatedQueue).toHaveLength(0);
      expect(readyUnits).toHaveLength(2);
    });
  });

  describe('startTurn', () => {
    it('skips to action when nothing to do in place phase', () => {
      // Initial state has no units to place and no resources to promote
      const state = createInitialGameState();
      const newState = startTurn(state, 'white');

      // Place phase is skipped when there's nothing to do
      expect(newState.turn.phase).toBe('action');
    });

    it('stays in place when there are units to place', () => {
      let state = createInitialGameState();

      // Add a ready unit to the queue
      state = {
        ...state,
        players: {
          ...state.players,
          white: {
            ...state.players.white,
            buildQueue: [
              { id: 'q1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'white' as const }
            ]
          }
        }
      };

      const newState = startTurn(state, 'white');

      expect(newState.turn.phase).toBe('place');
    });

    it('sets currentPlayer correctly', () => {
      const state = createInitialGameState();
      const newState = startTurn(state, 'black');

      expect(newState.turn.currentPlayer).toBe('black');
    });

    it('resets actionsRemaining to 6', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, actionsRemaining: 1 } };

      const newState = startTurn(state, 'white');

      expect(newState.turn.actionsRemaining).toBe(6);
    });

    it('resets unit action flags', () => {
      let state = createInitialGameState();
      const whiteUnits = getPlayerUnits(state.board, 'white');
      state = {
        ...state,
        board: updateUnit(state.board, whiteUnits[0].id, {
          hasMoved: true,
          hasAttacked: true,
          hasMined: true,
        }),
      };

      const newState = startTurn(state, 'white');
      const unit = getPlayerUnits(newState.board, 'white')[0];

      expect(unit.hasMoved).toBe(false);
      expect(unit.hasAttacked).toBe(false);
      expect(unit.hasMined).toBe(false);
    });

    it('advances build queue', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          white: {
            ...state.players.white,
            buildQueue: [
              { id: 'q1', definitionId: 'fire_1', turnsRemaining: 2, owner: 'white' },
            ],
          },
        },
      };

      const newState = startTurn(state, 'white');

      expect(newState.players.white.buildQueue[0].turnsRemaining).toBe(1);
    });

    it('clears selection state', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        selectedUnit: 'some-unit-id',
        validMoves: [{ x: 1, y: 1 }],
        validAttacks: [{ x: 2, y: 2 }],
      };

      const newState = startTurn(state, 'white');

      expect(newState.selectedUnit).toBeNull();
      expect(newState.validMoves).toEqual([]);
      expect(newState.validAttacks).toEqual([]);
    });
  });

  describe('getReadyUnits', () => {
    it('returns units with turnsRemaining 0', () => {
      const playerState = {
        id: 'white' as PlayerId,
        resources: 10,
        startCorner: { x: 0, y: 0 },
        buildQueue: [
          { id: 'q1', definitionId: 'fire_1', turnsRemaining: 0, owner: 'white' as PlayerId },
          { id: 'q2', definitionId: 'water_1', turnsRemaining: 2, owner: 'white' as PlayerId },
        ],
      };

      const ready = getReadyUnits(playerState);

      expect(ready).toHaveLength(1);
      expect(ready[0].definitionId).toBe('fire_1');
    });

    it('returns empty array when no units ready', () => {
      const playerState = {
        id: 'white' as PlayerId,
        resources: 10,
        startCorner: { x: 0, y: 0 },
        buildQueue: [
          { id: 'q1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'white' as PlayerId },
        ],
      };

      const ready = getReadyUnits(playerState);
      expect(ready).toHaveLength(0);
    });
  });

  describe('Phase transitions', () => {
    it('startActionPhase sets phase to action', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, phase: 'place' } };

      const newState = startActionPhase(state);

      expect(newState.turn.phase).toBe('action');
    });

    it('startActionPhase resets actions to 6', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, actionsRemaining: 0 } };

      const newState = startActionPhase(state);

      expect(newState.turn.actionsRemaining).toBe(6);
    });

    it('startQueuePhase sets phase to queue', () => {
      let state = createInitialGameState();
      // Give player resources so queue phase doesn't auto-end
      state = {
        ...state,
        turn: { ...state.turn, phase: 'action' },
        players: { ...state.players, white: { ...state.players.white, resources: 10 } },
      };

      const newState = startQueuePhase(state);

      expect(newState.turn.phase).toBe('queue');
    });

    it('startQueuePhase clears selection', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        turn: { ...state.turn, phase: 'action' },
        selectedUnit: 'some-id',
        players: { ...state.players, white: { ...state.players.white, resources: 10 } },
      };

      const newState = startQueuePhase(state);

      expect(newState.selectedUnit).toBeNull();
    });

    it('startQueuePhase auto-ends turn when no resources', () => {
      let state = createInitialGameState();
      // No resources = can't queue anything = auto-end
      state = { ...state, turn: { ...state.turn, phase: 'action' } };

      const newState = startQueuePhase(state);

      // Should have switched to AI's turn
      expect(newState.turn.currentPlayer).toBe('black');
    });
  });

  describe('useAction', () => {
    it('decrements actionsRemaining', () => {
      let state = createInitialGameState();
      state = startActionPhase(state);

      expect(state.turn.actionsRemaining).toBe(6);

      state = useAction(state);
      expect(state.turn.actionsRemaining).toBe(5);

      state = useAction(state);
      expect(state.turn.actionsRemaining).toBe(4);
    });

    it('does not go below 0', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, actionsRemaining: 0 } };

      state = useAction(state);

      expect(state.turn.actionsRemaining).toBe(0);
    });
  });

  describe('hasActionsRemaining', () => {
    it('returns true when actions available', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, actionsRemaining: 2 } };

      expect(hasActionsRemaining(state)).toBe(true);
    });

    it('returns false when no actions left', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, actionsRemaining: 0 } };

      expect(hasActionsRemaining(state)).toBe(false);
    });
  });

  describe('endTurn', () => {
    it('switches to opponent', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, currentPlayer: 'white' } };

      const newState = endTurn(state);

      expect(newState.turn.currentPlayer).toBe('black');
    });

    it('AI to player switch increments turn number', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        turn: { ...state.turn, currentPlayer: 'black', turnNumber: 5 },
      };

      const newState = endTurn(state);

      expect(newState.turn.currentPlayer).toBe('white');
      expect(newState.turn.turnNumber).toBe(6);
    });

    it('player to AI switch does not increment turn number', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        turn: { ...state.turn, currentPlayer: 'white', turnNumber: 5 },
      };

      const newState = endTurn(state);

      expect(newState.turn.currentPlayer).toBe('black');
      expect(newState.turn.turnNumber).toBe(5);
    });

    it('preserves ready units in queue (build queue persistence)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          white: {
            ...state.players.white,
            buildQueue: [
              { id: 'q1', definitionId: 'fire_1', turnsRemaining: 0, owner: 'white' },
              { id: 'q2', definitionId: 'water_1', turnsRemaining: 2, owner: 'white' },
            ],
          },
        },
      };

      const newState = endTurn(state);

      // Ready units persist in queue until actually placed (build queue persistence)
      expect(newState.players.white.buildQueue).toHaveLength(2);
      expect(newState.players.white.buildQueue[0].definitionId).toBe('fire_1');
      expect(newState.players.white.buildQueue[1].definitionId).toBe('water_1');
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

  describe('isPlayerTurn / isPhase', () => {
    it('isPlayerTurn checks current player', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, currentPlayer: 'white' } };

      expect(isPlayerTurn(state, 'white')).toBe(true);
      expect(isPlayerTurn(state, 'black')).toBe(false);
    });

    it('isPhase checks current phase', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, phase: 'action' } };

      expect(isPhase(state, 'action')).toBe(true);
      expect(isPhase(state, 'place')).toBe(false);
      expect(isPhase(state, 'queue')).toBe(false);
    });
  });

  describe('canCurrentPlayerAct', () => {
    it('returns false if not in action phase', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, phase: 'place' } };

      expect(canCurrentPlayerAct(state)).toBe(false);
    });

    it('returns false if no actions remaining', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        turn: { ...state.turn, phase: 'action', actionsRemaining: 0 },
      };

      expect(canCurrentPlayerAct(state)).toBe(false);
    });

    it('returns true if player has actions and units that can act', () => {
      let state = createInitialGameState();
      state = startActionPhase(state);

      expect(canCurrentPlayerAct(state)).toBe(true);
    });

    it('returns false if all units cannot act this turn', () => {
      let state = createInitialGameState();
      state = startActionPhase(state);

      // Mark all player units as unable to act (e.g., newly placed units)
      // Note: hasMoved/hasAttacked/hasMined don't block actions; only canActThisTurn does
      const whiteUnits = getPlayerUnits(state.board, 'white');
      let newBoard = state.board;
      for (const unit of whiteUnits) {
        newBoard = updateUnit(newBoard, unit.id, {
          canActThisTurn: false,
        });
      }
      state = { ...state, board: newBoard };

      expect(canCurrentPlayerAct(state)).toBe(false);
    });
  });

  describe('skipToQueuePhase', () => {
    it('sets actionsRemaining to 0 and phase to queue', () => {
      let state = createInitialGameState();
      // Give player resources so queue phase doesn't auto-end
      state = {
        ...state,
        turn: { ...state.turn, phase: 'action', actionsRemaining: 3 },
        players: { ...state.players, white: { ...state.players.white, resources: 10 } },
      };

      const newState = skipToQueuePhase(state);

      expect(newState.turn.actionsRemaining).toBe(0);
      expect(newState.turn.phase).toBe('queue');
    });
  });

  describe('Full turn cycle', () => {
    it('player turn cycle: action -> queue -> end (place skipped when empty)', () => {
      let state = createInitialGameState();
      // Give player resources to stay in queue phase
      state = {
        ...state,
        players: { ...state.players, white: { ...state.players.white, resources: 10 } },
      };

      // Place phase is skipped when there's nothing to do
      // Initial state starts in action phase since no units to place/promote
      expect(state.turn.phase).toBe('action');
      expect(state.turn.currentPlayer).toBe('white');
      expect(state.turn.actionsRemaining).toBe(6);

      // Use some actions
      state = useAction(state);
      state = useAction(state);
      expect(state.turn.actionsRemaining).toBe(4);

      // Move to queue phase
      state = startQueuePhase(state);
      expect(state.turn.phase).toBe('queue');

      // End turn - switches to AI
      state = endTurn(state);
      expect(state.turn.currentPlayer).toBe('black');
      // AI also has nothing to place/promote, so skips to action
      expect(state.turn.phase).toBe('action');
    });
  });
});
