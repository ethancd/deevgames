import type { GameState, PlayerId } from '../../game/types';
import type { PublicState } from './types';
import { collectObservedEvents } from './eventsLog';

export function extractPublicState(
  state: GameState,
  asPlayer: PlayerId,
  events: PublicState['observedEvents'] = []
): PublicState {
  const opponent: PlayerId = asPlayer === 'player' ? 'ai' : 'player';
  return {
    board: state.board,
    turn: state.turn,
    players: {
      ...state.players,
      [opponent]: {
        ...state.players[opponent],
        resources: 0,
        buildQueue: [],
      },
    },
    phase: state.phase,
    winner: state.winner,
    selectedUnit: state.selectedUnit,
    validMoves: state.validMoves,
    validAttacks: state.validAttacks,
    observedEvents: events,
  };
}

export function extractPrivateState(state: GameState, playerId: PlayerId) {
  return {
    playerId,
    resources: state.players[playerId].resources,
    buildQueue: state.players[playerId].buildQueue,
  };
}

export function observeState(
  prevState: GameState | null,
  nextState: GameState,
  asPlayer: PlayerId
): PublicState {
  const observedEvents = collectObservedEvents(prevState, nextState, asPlayer);
  return extractPublicState(nextState, asPlayer, observedEvents);
}
