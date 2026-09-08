import { upkeepDue, settleUpkeep } from './upkeep';
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
import { checkVictory, getHomeOccupier } from './victory';
import { getPromotableUnits } from './promotion';
import { getAllSpawnPositions } from './spawning';
import { UNIT_DEFINITIONS } from './units';
import { canBuildUnit, meetsTechRequirement } from './building';

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
 * - Set phase to 'place' (or 'action' if nothing to do in place phase)
 */
export function startTurn(state: GameState, player: PlayerId): GameState {
  // Resolve before queue advancement, healing, placement or promotion. Entering
  // the corner during the previous turn was only a threat; the defender got a reply.
  if (state.phase === 'victory') return state;
  if (state.victoryRule !== 'elimination' && getHomeOccupier(state.board, player)) {
    return { ...state, phase: 'victory', winner: player, victoryReason: 'home-occupation',
      turn: { ...state.turn, currentPlayer: player, phase: 'place', actionsRemaining: MAX_ACTIONS_PER_TURN },
      selectedUnit: null, validMoves: [], validAttacks: [] };
  }
  const elimination = checkVictory(state.board);
  if(elimination.status !== 'ongoing') return {...state,phase:'victory',winner:elimination.status==='victory'?elimination.winner:null,victoryReason:'elimination'};
  if(state.inactivityRule !== 'off' && (state.inactivityPlies ?? 0) >= 20) return {...state,phase:'victory',winner:null,victoryReason:'inactivity'};
  const pending: GameState = {...state,upkeepPending:true,turn:{...state.turn,currentPlayer:player,phase:'place',actionsRemaining:MAX_ACTIONS_PER_TURN},selectedUnit:null,validMoves:[],validAttacks:[]};
  const due=upkeepDue(pending,player);
  if(due>state.players[player].resources || state.reviewUpkeep?.[player])return pending;
  return completeUpkeep(pending,pending.board.units.filter(u=>u.owner===player).map(u=>u.id));
}

/** Called only after a validated selection, or automatic affordable payment. */
export function completeUpkeep(state: GameState, keepUnitIds: string[]): GameState {
  const paid=settleUpkeep(state,keepUnitIds),result=checkVictory(paid.board);
  if(result.status!=='ongoing')return {...paid,phase:'victory',winner:result.status==='victory'?result.winner:null,victoryReason:'upkeep-elimination'};
  return finishTurnStart(paid,paid.turn.currentPlayer);
}

function finishTurnStart(state: GameState, player: PlayerId): GameState {
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

  // Create intermediate state to check if place phase is needed
  const intermediateState: GameState = {
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

  // Skip place phase if player can't do anything in it
  if (!canActInPlacePhase(intermediateState, player)) {
    return startActionPhase(intermediateState);
  }

  return intermediateState;
}

/**
 * Get units ready to be placed (turnsRemaining === 0)
 */
export function getReadyUnits(playerState: PlayerState): QueuedUnit[] {
  return playerState.buildQueue.filter((u) => u.turnsRemaining === 0);
}

/**
 * Transition from place phase to action phase
 * Resets promotedThisPlacement flag on all units
 */
export function startActionPhase(state: GameState): GameState {
  if(state.upkeepPending)return state;
  // Reset the promotedThisPlacement flag on all units
  const newBoard = {
    ...state.board,
    units: state.board.units.map(u => ({ ...u, promotedThisPlacement: false })),
  };

  return {
    ...state,
    board: newBoard,
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
 * Auto-ends turn if nothing can be done in queue phase
 */
export function startQueuePhase(state: GameState): GameState {
  const queueState: GameState = {
    ...state,
    turn: {
      ...state.turn,
      phase: 'queue',
    },
    selectedUnit: null,
    validMoves: [],
    validAttacks: [],
  };

  // Auto-end if player can't do anything in queue phase
  if (!canActInQueuePhase(queueState, state.turn.currentPlayer)) {
    return endTurn(queueState);
  }

  return queueState;
}

/**
 * Check if a player can do anything in queue phase
 * (can afford a tech-legal queued unit; promotion is only in place phase)
 */
export function canActInQueuePhase(state: GameState, player: PlayerId): boolean {
  const playerState = state.players[player];

  return UNIT_DEFINITIONS.some(d => canBuildUnit(d.id, player, state.board,
    { queue: [], crystals: playerState.resources }));
}

/**
 * End the current player's turn and start the opponent's
 */
export function endTurn(state: GameState): GameState {
  if(state.phase === 'victory' || state.upkeepPending)return state;
  const currentPlayer = state.turn.currentPlayer;
  const nextPlayer: PlayerId = currentPlayer === 'white' ? 'black' : 'white';

  const isNewRound = nextPlayer === 'white';

  // Keep all units in queue - ready units persist until actually placed
  // (build queue persistence: units are never auto-deleted)
  const stateWithCleanedQueue: GameState = {
    ...state,
    inactivityPlies: state.progressThisTurn ? 0 : (state.inactivityPlies ?? 0) + 1,
    progressThisTurn: false,
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
  return player === 'white' ? 'black' : 'white';
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
  return playerUnits.some((u) => u.canActThisTurn);
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

/**
 * Check if a player can do anything in place phase
 * (has placeable units OR can promote any units)
 */
export function canActInPlacePhase(state: GameState, player: PlayerId): boolean {
  if(state.upkeepPending)return true;
  const playerState = state.players[player];

  // Check for ready units to place
  const readyUnits = getReadyUnits(playerState).filter(q => meetsTechRequirement(q.definitionId, player, state.board));
  if (readyUnits.length > 0) {
    // Check if there are valid spawn positions
    const spawnPositions = getAllSpawnPositions(player, state.board);
    if (spawnPositions.length > 0) {
      return true;
    }
  }

  // Check for promotable units
  const buildState = { queue: [], crystals: playerState.resources };
  const promotableUnits = getPromotableUnits(state.board, player, buildState);

  return promotableUnits.length > 0;
}

/**
 * Skip place phase and go directly to action phase
 */
export function skipPlacePhase(state: GameState): GameState {
  return startActionPhase(state);
}
