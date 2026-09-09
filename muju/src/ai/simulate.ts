import type { GameState, PlayerId, Position } from '../game/types';
import type { AIAction } from './types';
import { getUnitById, placeUnit } from '../game/board';
import { getNextTierDefinition, getUnitDefinition } from '../game/units';
import { resolveCombat } from '../game/combat';
import { createUnitFromDefinition } from '../game/building';
import { completeUpkeep, useAction, endTurn, startActionPhase, canActInPlacePhase } from '../game/turn';
import { isLegalAction } from '../game/legality';
import { getMoveCost } from '../game/movement';
import { checkVictory } from '../game/victory';

/** Deterministic IDs agree in the reducer, worker, and every simulated state. */
function nextUnitId(state: GameState): string {
  const ids = new Set(state.board.units.map(u => u.id));
  const prefix = `unit-${state.turn.currentPlayer}-${state.turn.turnNumber}-`;
  let n = 0;
  while (ids.has(prefix + n)) n++;
  return prefix + n;
}

/** Authoritative immutable transition, used by real play AND search.
 * Rejected actions return the original object without charging an action/resource.
 */
export function applyAction(state: GameState, action: AIAction): GameState {
  if (!isLegalAction(state, action)) return state;
  const next = applyLegalAction(state, action);
  return next === state ? state : { ...next, selectedUnit: null, validMoves: [], validAttacks: [] };
}

function applyLegalAction(state: GameState, action: AIAction): GameState {
  switch (action.type) {
    case 'PAY_UPKEEP': return completeUpkeep(state,action.keepUnitIds);
    case 'MOVE':
      return applyMove(state, action.unitId, action.to);

    case 'ATTACK':
      return applyAttack(state, action.unitId, action.targetPosition);

    case 'END_PLACE_PHASE':
      return startActionPhase(state);

    case 'END_ACTION_PHASE':
      return endTurn(state);

    case 'BUY_UNIT':
      return finishPlacement(applyBuyUnit(state, action.definitionId, action.position));

    case 'PROMOTE_UNIT':
      return finishPlacement(applyPromoteUnit(state, action.unitId));

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
    victoryReason: 'resignation',
  };
}

function applyMove(state: GameState, unitId: string, to: Position): GameState {
  const newBoard = {
    ...state.board,
    units: state.board.units.map((u) =>
      u.id === unitId ? { ...u, position: to, hasMoved: true } : u
    ),
  };

  const unit = getUnitById(state.board, unitId)!;
  const cost = getMoveCost(unit.position, to, getUnitDefinition(unit.definitionId).speed, state.board)!;
  let newState = state;
  for (let i = 0; i < cost; i++) newState = useAction(newState);
  return { ...newState, board: newBoard };
}

function applyAttack(state: GameState, unitId: string, targetPosition: Position): GameState {
  const { board: newBoard } = resolveCombat(state.board, unitId, targetPosition);
  const killed = newBoard.units.filter(u => u.owner !== state.turn.currentPlayer).length < state.board.units.filter(u => u.owner !== state.turn.currentPlayer).length;
  const newState = useAction(killed ? {...state,inactivityPlies:0,progressThisTurn:true} : state);

  // Check victory
  const victory = checkVictory(newBoard);
  if (victory.status === 'victory') {
    return {
      ...newState,
      board: newBoard,
      phase: 'victory',
      winner: victory.winner,
      victoryReason: 'elimination',
    };
  }

  return { ...newState, board: newBoard };
}

function finishPlacement(state: GameState): GameState {
  return canActInPlacePhase(state, state.turn.currentPlayer) ? state : startActionPhase(state);
}

function applyBuyUnit(state: GameState, definitionId: string, position: Position): GameState {
  const player = state.turn.currentPlayer;
  const me = state.players[player];
  const unit = createUnitFromDefinition(definitionId, player, position, nextUnitId(state));
  return { ...state, board: placeUnit(state.board, unit),
    players: { ...state.players, [player]: { ...me, resources: me.resources - getUnitDefinition(definitionId).cost } } };
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


  // Find next tier unit of same element
  const nextTierDef = getNextTierDefinition(def.id);
  if (!nextTierDef) return state;
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
      },
    },
  };
}

/**
 * Apply a sequence of actions
 */
export function applyActions(state: GameState, actions: AIAction[]): GameState {
  let currentState = state;
  const player = state.turn.currentPlayer;
  for (const action of actions) {
    if (currentState.turn.currentPlayer !== player || !isLegalAction(currentState, action)) break;
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
