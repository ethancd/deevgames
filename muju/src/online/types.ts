import type { TurnReplay } from '../game/replay';
import type { AIAction } from '../ai/types';
import type { GameState, PlayerId } from '../game/types';
import type { ClockPressure, ClockSnapshot, TimeControl } from './timeControl';
import type { SeatStaging } from './staging';

export type RoomAction = AIAction | { type: 'SET_UPKEEP_REVIEW'; enabled: boolean } | { type: 'UNDO' };
/** Public lobby metadata, without board snapshots or seat credentials. */
export interface ActiveRoom {
  id: string;
  ready: boolean;
  seats: Record<PlayerId, string | null>;
  turnNumber: number;
  currentPlayer: PlayerId;
  updatedAt: string;
}
export interface RoomSnapshot {
  id: string;
  revision: number;
  ready: boolean;
  canUndo?: boolean;
  timeControl?: TimeControl | null;
  clock?: ClockSnapshot | null;
  clockPressure?: ClockPressure | null;
  /** Only on authenticated reads and command responses; never public observations/waits. */
  staging?: SeatStaging;
  lastTurnReplay?: TurnReplay | null;
  seats: Record<PlayerId, string | null>;
  state: GameState;
  updatedAt: string;
  history: { revision: number; player: PlayerId; actions: RoomAction[]; result?: { winner: PlayerId; reason: 'timeout' } }[];
}
export type RoomChange = { changed: false; revision: number; phase: GameState['phase']; clock?: ClockSnapshot; clockPressure?: ClockPressure }
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
