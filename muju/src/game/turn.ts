import { resolveInactivityDraw } from './inactivity';
import { getActionsPerTurn } from './rules';
import { upkeepDue, settleUpkeep } from './upkeep';
import type {
  GameState,
  PlayerId,
  TurnPhase,
} from './types';
import {
  resetUnitActions,
  getPlayerUnits,
} from './board';
import { checkVictory, getHomeOccupier } from './victory';
import { getPromotableUnits } from './promotion';
import { getAllSpawnPositions } from './spawning';
import { getAffordablePurchases } from './building';
import { endOfTurnIncome } from './mining';

export function startTurn(state: GameState, player: PlayerId): GameState {
  // Resolve before healing, placement or promotion. Entering
  // the corner during the previous turn was only a threat; the defender got a reply.
  if (state.phase === 'victory') return state;
  if (state.victoryRule !== 'elimination' && getHomeOccupier(state.board, player)) {
    return { ...state, phase: 'victory', winner: player, victoryReason: 'home-occupation',
      turn: { ...state.turn, currentPlayer: player, phase: 'place', actionsRemaining: getActionsPerTurn(state) },
      selectedUnit: null, validMoves: [], validAttacks: [] };
  }
  const elimination = checkVictory(state.board);
  if(elimination.status !== 'ongoing') return {...state,phase:'victory',winner:elimination.status==='victory'?elimination.winner:null,victoryReason:'elimination'};
  const pending: GameState = {...state,upkeepPending:true,turn:{...state.turn,currentPlayer:player,phase:'place',actionsRemaining:getActionsPerTurn(state)},selectedUnit:null,validMoves:[],validAttacks:[]};
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
  const next: GameState = { ...state, board: resetUnitActions(state.board, player),
    turn: { ...state.turn, currentPlayer: player, phase: 'place', actionsRemaining: getActionsPerTurn(state) },
    selectedUnit: null, validMoves: [], validAttacks: [] };
  return canActInPlacePhase(next, player) ? next : startActionPhase(next);
}

export function startActionPhase(state: GameState): GameState {
  if (state.upkeepPending || state.turn.phase !== 'place') return state;
  return { ...state, turn: { ...state.turn, phase: 'action', actionsRemaining: getActionsPerTurn(state) } };
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

/** Income precedes the quiet-turn clock, then the opponent's home/upkeep checks. */
export function endTurn(state: GameState): GameState {
  if (state.phase !== 'playing' || state.upkeepPending) return state;
  const player = state.turn.currentPlayer;
  const income = endOfTurnIncome(state, player);
  const completed = resolveInactivityDraw({ ...income.state,
    inactivityPlies: state.progressThisTurn ? 0 : (state.inactivityPlies ?? 0) + 1,
    progressThisTurn: false,
  });
  if (completed.phase === 'victory') return completed;
  const next = getOpponent(player);
  return startTurn({ ...completed, turn: { ...completed.turn,
    turnNumber: state.turn.turnNumber + (next === 'white' ? 1 : 0) } }, next);
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

/** Purchases and promotions share the place phase, in either order. */
export function canActInPlacePhase(state: GameState, player: PlayerId): boolean {
  if (state.upkeepPending) return true;
  return (getAffordablePurchases(state.players[player].resources).length > 0 && getAllSpawnPositions(player, state.board).length > 0)
    || getPromotableUnits(state.board, player, { crystals: state.players[player].resources }).length > 0;
}

export const skipPlacePhase = startActionPhase;
