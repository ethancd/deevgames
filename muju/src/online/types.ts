import type { TurnReplay } from '../game/replay';
import type { AIAction } from '../ai/types';
import type { GameState, PlayerId } from '../game/types';
import type { ClockSnapshot, TimeControl } from './timeControl';

export type RoomAction = AIAction | { type: 'SET_UPKEEP_REVIEW'; enabled: boolean } | { type: 'UNDO' };
export interface RoomSnapshot {
  id: string;
  revision: number;
  ready: boolean;
  canUndo?: boolean;
  timeControl?: TimeControl | null;
  clock?: ClockSnapshot | null;
  lastTurnReplay?: TurnReplay | null;
  seats: Record<PlayerId, string | null>;
  state: GameState;
  updatedAt: string;
  history: { revision: number; player: PlayerId; actions: RoomAction[]; result?: { winner: PlayerId; reason: 'timeout' } }[];
}
export type RoomChange = { changed: false; revision: number; phase: GameState['phase']; clock?: ClockSnapshot }
  | { changed: true; revision: number; phase: GameState['phase']; room: RoomSnapshot };
export interface SeatCredentials { roomId: string; player: PlayerId; token: string }
export interface RoomConnection extends SeatCredentials { serverUrl: string }
export interface ObserverConnection { roomId: string; serverUrl: string; player?: never; token?: never }
export type OnlineConnection = RoomConnection | ObserverConnection;
export interface RoomAdmission {
  credentials: SeatCredentials;
  room: RoomSnapshot;
  inviteCode?: string;
}
export interface ActionRequest {
  expectedRevision: number;
  requestId: string;
  actions: RoomAction[];
}
