import type {
  GameState,
  PlayerId,
  TurnPhase,
  QueuedUnit,
  PlayerState,
} from './types';
import {
  resetUnitActions,
  MAX_ACTIONS_PER_TURN,
  getPlayerUnits,
} from './board';

/**
 * Advance build queues for a player, returning units ready to place
 */
export function advanceBuildQueue(queue: QueuedUnit[]): {
  updatedQueue: QueuedUnit[];
  readyUnits: QueuedUnit[];
} {
  const readyUnits: QueuedUnit[] = [];
  const updatedQueue: QueuedUnit[] = [];

  for (const item of queue) {
    if (item.turnsRemaining <= 1) {
      readyUnits.push(item);
    } else {
      updatedQueue.push({
        ...item,
        turnsRemaining: item.turnsRemaining - 1,
      });
    }
  }

  return { updatedQueue, readyUnits };
}

/**
 * Start a new turn for the specified player
 * - Advance their build queue
 * - Reset their units' action flags
 * - Set phase to 'place'
 */
export function startTurn(state: GameState, player: PlayerId): GameState {
  const playerState = state.players[player];

  // Advance build queue
  const { updatedQueue, readyUnits } = advanceBuildQueue(playerState.buildQueue);

  // Reset unit actions
  const newBoard = resetUnitActions(state.board, player);

  // Store ready units somewhere (they'll be placed in place phase)
  // For now, we keep them in the queue with turnsRemaining = 0
  const finalQueue = [
    ...readyUnits.map((u) => ({ ...u, turnsRemaining: 0 })),
    ...updatedQueue,
  ];

  return {
    ...state,
    board: newBoard,
    players: {
      ...state.players,
      [player]: {
        ...playerState,
        buildQueue: finalQueue,
      },
    },
    turn: {
      ...state.turn,
      currentPlayer: player,
      phase: 'place',
      actionsRemaining: MAX_ACTIONS_PER_TURN,
    },
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

/**
 * Get units ready to be placed (turnsRemaining === 0)
 */
export function getReadyUnits(playerState: PlayerState): QueuedUnit[] {
  return playerState.buildQueue.filter((u) => u.turnsRemaining === 0);
}

/**
 * Transition from place phase to action phase
 */
export function startActionPhase(state: GameState): GameState {
  return {
    ...state,
    turn: {
      ...state.turn,
      phase: 'action',
      actionsRemaining: MAX_ACTIONS_PER_TURN,
    },
  };
}

/**
 * Use one action step
 */
export function useAction(state: GameState): GameState {
  return {
    ...state,
    turn: {
      ...state.turn,
      actionsRemaining: Math.max(0, state.turn.actionsRemaining - 1),
    },
  };
}

/**
 * Check if there are actions remaining
 */
export function hasActionsRemaining(state: GameState): boolean {
  return state.turn.actionsRemaining > 0;
}

/**
 * Transition from action phase to queue phase
 */
export function startQueuePhase(state: GameState): GameState {
  return {
    ...state,
    turn: {
      ...state.turn,
      phase: 'queue',
    },
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };
}

/**
 * End the current player's turn and start the opponent's
 */
export function endTurn(state: GameState): GameState {
  const currentPlayer = state.turn.currentPlayer;
  const nextPlayer: PlayerId = currentPlayer === 'player' ? 'ai' : 'player';

  const isNewRound = nextPlayer === 'player';

  // Remove placed units from queue (turnsRemaining === 0)
  const currentPlayerState = state.players[currentPlayer];
  const remainingQueue = currentPlayerState.buildQueue.filter(
    (u) => u.turnsRemaining > 0
  );

  const stateWithCleanedQueue: GameState = {
    ...state,
    players: {
      ...state.players,
      [currentPlayer]: {
        ...currentPlayerState,
        buildQueue: remainingQueue,
      },
    },
    turn: {
      ...state.turn,
      turnNumber: isNewRound ? state.turn.turnNumber + 1 : state.turn.turnNumber,
    },
  };

  // Start the next player's turn
  return startTurn(stateWithCleanedQueue, nextPlayer);
}

/**
 * Get the opponent of a player
 */
export function getOpponent(player: PlayerId): PlayerId {
  return player === 'player' ? 'ai' : 'player';
}

/**
 * Check if it's a specific player's turn
 */
export function isPlayerTurn(state: GameState, player: PlayerId): boolean {
  return state.turn.currentPlayer === player;
}

/**
 * Check if currently in a specific phase
 */
export function isPhase(state: GameState, phase: TurnPhase): boolean {
  return state.turn.phase === phase;
}

/**
 * Check if the current player can still act (has units and actions)
 */
export function canCurrentPlayerAct(state: GameState): boolean {
  if (state.turn.phase !== 'action') return false;
  if (state.turn.actionsRemaining === 0) return false;

  const playerUnits = getPlayerUnits(state.board, state.turn.currentPlayer);

  // Check if any unit can still do something
  return playerUnits.some(
    (u) =>
      u.canActThisTurn && (!u.hasMoved || !u.hasAttacked || !u.hasMined)
  );
}

/**
 * Skip directly to the end of action phase (forfeit remaining actions)
 */
export function skipToQueuePhase(state: GameState): GameState {
  return startQueuePhase({
    ...state,
    turn: {
      ...state.turn,
      actionsRemaining: 0,
    },
  });
}
