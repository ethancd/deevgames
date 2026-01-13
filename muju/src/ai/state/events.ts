import type { PlayerId, Position } from '../../game/types';

export type GameEvent =
  | {
      type: 'MINE';
      playerId: PlayerId;
      amount: number;
      position: Position;
    }
  | {
      type: 'PLACE';
      playerId: PlayerId;
      definitionId: string;
      position: Position;
      cost: number;
    }
  | {
      type: 'PROMOTE';
      playerId: PlayerId;
      fromDefinitionId: string;
      toDefinitionId: string;
      cost: number;
    }
  | {
      type: 'TURN_END';
      playerId: PlayerId;
    };
