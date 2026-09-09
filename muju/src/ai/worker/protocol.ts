import type { GameState } from '../../game/types';
import type { AIDifficulty, AIResult } from '../types';
import type { PlayerId } from '../../game/types';
export const AI_PROTOCOL = 2;
export interface Identity { version: 2; gameId: string; requestId: number; revision: number; player: PlayerId }
export interface SearchRequest extends Identity {
  type: 'search'; state: GameState; difficulty: AIDifficulty;
  seed: number; decisionMs: number; fixedWork?: number;
}
export type SearchResponse = Identity & (
  { type: 'result'; result: AIResult; warning?: string } | { type: 'error'; message: string }
);
export function sameRequest(a: Identity, b: Identity): boolean {
  return a.version === b.version && a.gameId === b.gameId && a.requestId === b.requestId && a.revision === b.revision && a.player === b.player;
}
