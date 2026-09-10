import type { AIAction } from '../ai/types';
import type { GameState, PlayerId } from '../game/types';

export type RoomAction = AIAction | { type: 'SET_UPKEEP_REVIEW'; enabled: boolean };
export interface RoomSnapshot {
  id: string;
  revision: number;
  ready: boolean;
  seats: Record<PlayerId, string | null>;
  state: GameState;
  updatedAt: string;
  history: { revision: number; player: PlayerId; actions: RoomAction[] }[];
}
export type RoomChange = { changed: false; revision: number; phase: GameState['phase'] }
  | { changed: true; revision: number; phase: GameState['phase']; room: RoomSnapshot };
export interface SeatCredentials { roomId: string; player: PlayerId; token: string }
export interface RoomConnection extends SeatCredentials { serverUrl: string }
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
