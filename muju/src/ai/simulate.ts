import type { GameState, PlayerId, Position } from '../game/types';
import type { AIAction } from './types';
import { getUnitById, placeUnit } from '../game/board';
import { getUnitDefinition } from '../game/units';
import { resolveCombat } from '../game/combat';
import { executeMine } from '../game/mining';
import { useAction, endTurn } from '../game/turn';
import { checkVictory } from '../game/victory';

/**
 * Monotonic counter folded into generated IDs. Date.now() + a short random
 * suffix alone is NOT unique: two units queued/placed in the same millisecond
 * can collide (observed in lab seed 1720018195 — a MOVE then teleported both
 * units to one square, SPEC_AUDIT divergence D13).
 */
let idCounter = 0;

/**
 * Apply an action to a game state and return the new state
 * This is a simulation - doesn't affect the real game
 */
export function applyAction(state: GameState, action: AIAction): GameState {
  switch (action.type) {
    case 'MOVE':
      return applyMove(state, action.unitId, action.to);

    case 'ATTACK':
      return applyAttack(state, action.unitId, action.targetPosition);

    case 'MINE':
      return applyMine(state, action.unitId);

    case 'END_ACTION_PHASE':
      return applyEndActionPhase(state);

    case 'END_TURN':
      return endTurn(state);

    case 'QUEUE_UNIT':
      return applyQueueUnit(state, action.definitionId);

    case 'PLACE_UNIT':
      return applyPlaceUnit(state, action.queuedUnitId, action.position);

    case 'PROMOTE_UNIT':
      return applyPromoteUnit(state, action.unitId);

    case 'RESIGN':
      return applyResign(state);

    default:
      return state;
  }
}

function applyResign(state: GameState): GameState {
  const winner = state.turn.currentPlayer === 'white' ? 'black' : 'white';
  return {
    ...state,
    phase: 'victory',
    winner,
  };
}

function applyMove(state: GameState, unitId: string, to: Position): GameState {
  const newBoard = {
    ...state.board,
    units: state.board.units.map((u) =>
      u.id === unitId ? { ...u, position: to, hasMoved: true } : u
    ),
  };

  const newState = useAction(state);
  return { ...newState, board: newBoard };
}

function applyAttack(state: GameState, unitId: string, targetPosition: Position): GameState {
  const { board: newBoard } = resolveCombat(state.board, unitId, targetPosition);
  const newState = useAction(state);

  // Check victory
  const victory = checkVictory(newBoard);
  if (victory.status === 'victory') {
    return {
      ...newState,
      board: newBoard,
      phase: 'victory',
      winner: victory.winner,
    };
  }

  return { ...newState, board: newBoard };
}

function applyMine(state: GameState, unitId: string): GameState {
  const unit = getUnitById(state.board, unitId);
  if (!unit) return state;

  const currentPlayer = unit.owner;
  const currentResources = state.players[currentPlayer].resources;
  const { board: newBoard, newResources, amountMined } = executeMine(
    state.board,
    unitId,
    currentResources
  );

  if (amountMined === 0) return state;

  const newPlayers = {
    ...state.players,
    [currentPlayer]: {
      ...state.players[currentPlayer],
      resources: newResources,
      resourcesGained: state.players[currentPlayer].resourcesGained + amountMined,
    },
  };

  const newState = useAction(state);
  return { ...newState, board: newBoard, players: newPlayers };
}

function applyEndActionPhase(state: GameState): GameState {
  return {
    ...state,
    turn: {
      ...state.turn,
      phase: 'queue',
    },
  };
}

function applyQueueUnit(state: GameState, definitionId: string): GameState {
  const def = getUnitDefinition(definitionId);
  const currentPlayer = state.turn.currentPlayer;
  const playerState = state.players[currentPlayer];

  if (playerState.resources < def.cost) {
    return state;
  }

  const queuedUnit = {
    id: `queued_${definitionId}_${Date.now()}_${++idCounter}_${Math.random().toString(36).slice(2, 7)}`,
    definitionId,
    turnsRemaining: def.buildTime,
    owner: currentPlayer,
  };

  return {
    ...state,
    players: {
      ...state.players,
      [currentPlayer]: {
        ...playerState,
        resources: playerState.resources - def.cost,
        buildQueue: [...playerState.buildQueue, queuedUnit],
      },
    },
  };
}

function applyPlaceUnit(state: GameState, queuedUnitId: string, position: Position): GameState {
  const currentPlayer = state.turn.currentPlayer;
  const playerState = state.players[currentPlayer];

  const queuedUnit = playerState.buildQueue.find((u) => u.id === queuedUnitId);
  if (!queuedUnit) return state;

  const def = getUnitDefinition(queuedUnit.definitionId);

  // Create the new unit
  const newUnit = {
    id: `${currentPlayer}_${queuedUnit.definitionId}_${Date.now()}_${++idCounter}_${Math.random().toString(36).slice(2, 7)}`,
    definitionId: queuedUnit.definitionId,
    owner: currentPlayer,
    position,
    hasMoved: false,
    hasAttacked: false,
    hasMined: false,
    canActThisTurn: true, // Can act immediately (no summoning sickness)
    damageTaken: 0,
    promotedThisPlacement: false,
    placedThisTurn: true, // Can't be promoted on the same turn it's placed
  };

  const newBoard = placeUnit(state.board, newUnit);

  // Remove from queue, update resourcesSpent
  const newQueue = playerState.buildQueue.filter((u) => u.id !== queuedUnitId);

  return {
    ...state,
    board: newBoard,
    players: {
      ...state.players,
      [currentPlayer]: {
        ...playerState,
        buildQueue: newQueue,
        resourcesSpent: playerState.resourcesSpent + def.cost,
        resourcesManifested: playerState.resourcesManifested + def.cost,
      },
    },
  };
}

function applyPromoteUnit(state: GameState, unitId: string): GameState {
  const unit = getUnitById(state.board, unitId);
  if (!unit) return state;

  // Check if placed this turn (can't promote same turn as placement)
  if (unit.placedThisTurn) return state;

  // Check if already promoted this placement phase
  if (unit.promotedThisPlacement) return state;

  const currentPlayer = unit.owner;
  const playerState = state.players[currentPlayer];
  const def = getUnitDefinition(unit.definitionId);

  if (def.tier >= 4) return state;

  // Find next tier unit of same element
  const nextTierDef = getUnitDefinition(`${def.element}_${def.tier + 1}`);
  // Promotion cost is the difference between next tier and current tier costs
  const promotionCost = nextTierDef.cost - def.cost;

  if (playerState.resources < promotionCost) return state;

  const newBoard = {
    ...state.board,
    units: state.board.units.map((u) =>
      u.id === unitId
        ? { ...u, definitionId: nextTierDef.id, promotedThisPlacement: true }
        : u
    ),
  };

  return {
    ...state,
    board: newBoard,
    players: {
      ...state.players,
      [currentPlayer]: {
        ...playerState,
        resources: playerState.resources - promotionCost,
        resourcesSpent: playerState.resourcesSpent + promotionCost,
        resourcesManifested: playerState.resourcesManifested + promotionCost,
      },
    },
  };
}

/**
 * Apply a sequence of actions
 */
export function applyActions(state: GameState, actions: AIAction[]): GameState {
  let currentState = state;
  for (const action of actions) {
    currentState = applyAction(currentState, action);
  }
  return currentState;
}

/**
 * Check if the game is in a terminal state
 */
export function isTerminal(state: GameState): boolean {
  return state.phase === 'victory' || checkVictory(state.board).status !== 'ongoing';
}

/**
 * Get the opponent player
 */
export function getOpponent(player: PlayerId): PlayerId {
  return player === 'white' ? 'black' : 'white';
}
