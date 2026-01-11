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
        { id: 'q1', definitionId: 'fire_1', turnsRemaining: 3, owner: 'player' },
        { id: 'q2', definitionId: 'water_1', turnsRemaining: 2, owner: 'player' },
      ];

      const { updatedQueue, readyUnits } = advanceBuildQueue(queue);

      expect(updatedQueue).toHaveLength(2);
      expect(updatedQueue[0].turnsRemaining).toBe(2);
      expect(updatedQueue[1].turnsRemaining).toBe(1);
      expect(readyUnits).toHaveLength(0);
    });

    it('moves units with turnsRemaining 1 to readyUnits', () => {
      const queue: QueuedUnit[] = [
        { id: 'q1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'player' },
        { id: 'q2', definitionId: 'water_1', turnsRemaining: 2, owner: 'player' },
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
        { id: 'q1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'player' },
        { id: 'q2', definitionId: 'water_1', turnsRemaining: 1, owner: 'player' },
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
      const newState = startTurn(state, 'player');

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
          player: {
            ...state.players.player,
            buildQueue: [
              { id: 'q1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'player' as const }
            ]
          }
        }
      };

      const newState = startTurn(state, 'player');

      expect(newState.turn.phase).toBe('place');
    });

    it('sets currentPlayer correctly', () => {
      const state = createInitialGameState();
      const newState = startTurn(state, 'ai');

      expect(newState.turn.currentPlayer).toBe('ai');
    });

    it('resets actionsRemaining to 4', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, actionsRemaining: 1 } };

      const newState = startTurn(state, 'player');

      expect(newState.turn.actionsRemaining).toBe(4);
    });

    it('resets unit action flags', () => {
      let state = createInitialGameState();
      const playerUnits = getPlayerUnits(state.board, 'player');
      state = {
        ...state,
        board: updateUnit(state.board, playerUnits[0].id, {
          hasMoved: true,
          hasAttacked: true,
          hasMined: true,
        }),
      };

      const newState = startTurn(state, 'player');
      const unit = getPlayerUnits(newState.board, 'player')[0];

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
          player: {
            ...state.players.player,
            buildQueue: [
              { id: 'q1', definitionId: 'fire_1', turnsRemaining: 2, owner: 'player' },
            ],
          },
        },
      };

      const newState = startTurn(state, 'player');

      expect(newState.players.player.buildQueue[0].turnsRemaining).toBe(1);
    });

    it('clears selection state', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        selectedUnit: 'some-unit-id',
        validMoves: [{ x: 1, y: 1 }],
        validAttacks: [{ x: 2, y: 2 }],
      };

      const newState = startTurn(state, 'player');

      expect(newState.selectedUnit).toBeNull();
      expect(newState.validMoves).toEqual([]);
      expect(newState.validAttacks).toEqual([]);
    });
  });

  describe('getReadyUnits', () => {
    it('returns units with turnsRemaining 0', () => {
      const playerState = {
        id: 'player' as PlayerId,
        resources: 10,
        startCorner: { x: 0, y: 0 },
        buildQueue: [
          { id: 'q1', definitionId: 'fire_1', turnsRemaining: 0, owner: 'player' as PlayerId },
          { id: 'q2', definitionId: 'water_1', turnsRemaining: 2, owner: 'player' as PlayerId },
        ],
      };

      const ready = getReadyUnits(playerState);

      expect(ready).toHaveLength(1);
      expect(ready[0].definitionId).toBe('fire_1');
    });

    it('returns empty array when no units ready', () => {
      const playerState = {
        id: 'player' as PlayerId,
        resources: 10,
        startCorner: { x: 0, y: 0 },
        buildQueue: [
          { id: 'q1', definitionId: 'fire_1', turnsRemaining: 1, owner: 'player' as PlayerId },
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

    it('startActionPhase resets actions to 4', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, actionsRemaining: 0 } };

      const newState = startActionPhase(state);

      expect(newState.turn.actionsRemaining).toBe(4);
    });

    it('startQueuePhase sets phase to queue', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, phase: 'action' } };

      const newState = startQueuePhase(state);

      expect(newState.turn.phase).toBe('queue');
    });

    it('startQueuePhase clears selection', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        turn: { ...state.turn, phase: 'action' },
        selectedUnit: 'some-id',
      };

      const newState = startQueuePhase(state);

      expect(newState.selectedUnit).toBeNull();
    });
  });

  describe('useAction', () => {
    it('decrements actionsRemaining', () => {
      let state = createInitialGameState();
      state = startActionPhase(state);

      expect(state.turn.actionsRemaining).toBe(4);

      state = useAction(state);
      expect(state.turn.actionsRemaining).toBe(3);

      state = useAction(state);
      expect(state.turn.actionsRemaining).toBe(2);
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
      state = { ...state, turn: { ...state.turn, currentPlayer: 'player' } };

      const newState = endTurn(state);

      expect(newState.turn.currentPlayer).toBe('ai');
    });

    it('AI to player switch increments turn number', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        turn: { ...state.turn, currentPlayer: 'ai', turnNumber: 5 },
      };

      const newState = endTurn(state);

      expect(newState.turn.currentPlayer).toBe('player');
      expect(newState.turn.turnNumber).toBe(6);
    });

    it('player to AI switch does not increment turn number', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        turn: { ...state.turn, currentPlayer: 'player', turnNumber: 5 },
      };

      const newState = endTurn(state);

      expect(newState.turn.currentPlayer).toBe('ai');
      expect(newState.turn.turnNumber).toBe(5);
    });

    it('removes placed units from queue (turnsRemaining 0)', () => {
      let state = createInitialGameState();
      state = {
        ...state,
        players: {
          ...state.players,
          player: {
            ...state.players.player,
            buildQueue: [
              { id: 'q1', definitionId: 'fire_1', turnsRemaining: 0, owner: 'player' },
              { id: 'q2', definitionId: 'water_1', turnsRemaining: 2, owner: 'player' },
            ],
          },
        },
      };

      const newState = endTurn(state);

      // After ending player's turn, player's queue should have ready units removed
      expect(newState.players.player.buildQueue).toHaveLength(1);
      expect(newState.players.player.buildQueue[0].definitionId).toBe('water_1');
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

  describe('isPlayerTurn / isPhase', () => {
    it('isPlayerTurn checks current player', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, currentPlayer: 'player' } };

      expect(isPlayerTurn(state, 'player')).toBe(true);
      expect(isPlayerTurn(state, 'ai')).toBe(false);
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

    it('returns false if all units have exhausted their actions', () => {
      let state = createInitialGameState();
      state = startActionPhase(state);

      // Mark all player units as having done everything
      const playerUnits = getPlayerUnits(state.board, 'player');
      let newBoard = state.board;
      for (const unit of playerUnits) {
        newBoard = updateUnit(newBoard, unit.id, {
          hasMoved: true,
          hasAttacked: true,
          hasMined: true,
        });
      }
      state = { ...state, board: newBoard };

      expect(canCurrentPlayerAct(state)).toBe(false);
    });
  });

  describe('skipToQueuePhase', () => {
    it('sets actionsRemaining to 0 and phase to queue', () => {
      let state = createInitialGameState();
      state = { ...state, turn: { ...state.turn, phase: 'action', actionsRemaining: 3 } };

      const newState = skipToQueuePhase(state);

      expect(newState.turn.actionsRemaining).toBe(0);
      expect(newState.turn.phase).toBe('queue');
    });
  });

  describe('Full turn cycle', () => {
    it('player turn cycle: action -> queue -> end (place skipped when empty)', () => {
      let state = createInitialGameState();

      // Place phase is skipped when there's nothing to do
      // Initial state starts in action phase since no units to place/promote
      expect(state.turn.phase).toBe('action');
      expect(state.turn.currentPlayer).toBe('player');
      expect(state.turn.actionsRemaining).toBe(4);

      // Use some actions
      state = useAction(state);
      state = useAction(state);
      expect(state.turn.actionsRemaining).toBe(2);

      // Move to queue phase
      state = startQueuePhase(state);
      expect(state.turn.phase).toBe('queue');

      // End turn - switches to AI
      state = endTurn(state);
      expect(state.turn.currentPlayer).toBe('ai');
      // AI also has nothing to place/promote, so skips to action
      expect(state.turn.phase).toBe('action');
    });
  });
});
