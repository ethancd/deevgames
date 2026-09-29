import type { GameState, PlayerId } from '../game/types';
import type { AIAction } from '../ai/types';

export interface ExplorerPlayer { provider: 'codex' | 'claude'; model: string; effort: 'high' }
export interface ExplorerConfig {
  handicap: number; maxGames: number; maxPlies: number; maxModelCalls: number;
  terminalOnly: boolean; consensus: number; confirmations: number; retryThreshold: number;
  players: Record<PlayerId, ExplorerPlayer>;
}
export interface Assessment {
  whiteWin: number;
  pressure: 'white-dominating' | 'white-edge' | 'balanced' | 'black-edge' | 'black-dominating';
  counterplay: string; explanation: string;
}
export interface Checkpoint {
  id: string; state: GameState; hash: string; assessments: Partial<Record<PlayerId, Assessment>>;
}
export interface ExplorerGame {
  id: string; parentId: string | null; forkCheckpoint: string | null; forkReason: string;
  checkpoints: string[];
  turns: { checkpointId: string; player: PlayerId; actions: AIAction[]; resultHash: string; explanation: string }[];
  outcome?: { kind: 'rules' | 'consensus' | 'budget' | 'stopped' | 'no-alternative'; winner: PlayerId | null; reason: string };
}
export interface ExplorerSnapshot {
  id: string; version: number; createdAt: string; updatedAt: string; rulesRevision: string; setupRevision: string;
  sourceIdentity: { commit: string | null; sha256: string };
  config: ExplorerConfig; status: 'running' | 'paused' | 'complete'; stopReason: string | null;
  plies: number; modelCalls: number; games: ExplorerGame[]; checkpoints: Checkpoint[];
  activeGameId: string; runnerBusy: boolean; review: string; conclusion?: string;
  usage: { player: PlayerId; provider: string; model: string; inputTokens?: number; outputTokens?: number; elapsedMs: number }[];
}
export interface ExplorerJob {
  id: string; kind: 'assess' | 'turn' | 'branch'; player: PlayerId; checkpointId: string;
  leaseUntil: number; config: ExplorerConfig; prompt: string;
}
