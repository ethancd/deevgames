import type { PlayerId } from '../game/types';
import type { RoomAction } from './types';
import type { ClockPressure, ClockSnapshot } from './timeControl';

/** Private to one seat. Versions increase on every staging transition, including firing. */
export interface PendingStage {
  id: string;
  version: number;
  turnNumber: number;
  createdAtMs: number;
  commitWhenRemainingMs: number;
  triggerAtMs: number;
  actions: RoomAction[];
  fallbacks: RoomAction[][];
}
export interface StageReceipt {
  id: string;
  version: number;
  turnNumber: number;
  status: 'executed' | 'failed' | 'cancelled' | 'replaced' | 'turn_ended' | 'game_ended' | 'expired';
  resolvedAtMs: number;
  revision: number;
  /** Zero is the primary batch; one is the first fallback. */
  candidateIndex?: number;
  appliedActions?: RoomAction[];
  failures?: { candidateIndex: number; code: string; message: string }[];
}
export interface SeatStaging {
  version: number;
  pending: PendingStage | null;
  latestReceipt: StageReceipt | null;
}
export interface StagingStatus extends SeatStaging {
  roomId: string;
  player: PlayerId;
  revision: number;
  serverNowMs: number;
  currentTurn: { player: PlayerId; turnNumber: number };
  clock: ClockSnapshot | null;
  clockPressure: ClockPressure | null;
  /** Present when looking up a particular stage, including an acknowledged retry. */
  requestedStage?: PendingStage | StageReceipt;
}
export interface StageAcknowledgement {
  requestId: string;
  operation: 'stage' | 'cancel';
  stageId: string;
  /** The seat version immediately after accepting this operation, before any firing. */
  acceptedVersion: number;
}
export interface StagingResult extends StagingStatus {
  acknowledgement: StageAcknowledgement;
}
