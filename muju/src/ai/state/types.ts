import type {
  BoardState,
  TurnState,
  QueuedUnit,
  PlayerId,
  GameState,
  GamePhase,
  Position,
} from '../../game/types';
import type { GameEvent } from './events';
import type { BeliefState } from '../belief/types';

export interface PublicState {
  board: BoardState;
  turn: TurnState;
  players: GameState['players'];
  phase: GamePhase;
  winner: PlayerId | null;
  selectedUnit: string | null;
  validMoves: Position[];
  validAttacks: Position[];
  observedEvents: GameEvent[];
}

export interface PrivateState {
  playerId: PlayerId;
  resources: number;
  buildQueue: QueuedUnit[];
}

export interface FullKnowledge {
  public: PublicState;
  own: PrivateState;
  opponentBelief: BeliefState;
}
