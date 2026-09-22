import type { GameState } from '../../game/types';
import type { AIAction, AIDifficulty, AIResult } from '../types';
import type { PlayerId } from '../../game/types';
import type { HardConfig } from '../hard/config';

/** Protocol 3 (DESIGN §6.1, additive over 2): adds `mode`/`engine`/`work`/`hard`
 * to `SearchRequest` and a `'turn'` / `'progress'` branch to `SearchResponse`.
 * Every field protocol 2 relied on keeps its exact shape and meaning, so a
 * `version: 2` request with no `mode` (`tests/ai/worker.test.ts:16`) is still
 * byte-compatible and produces the unchanged per-action `type: 'result'` reply.
 *
 * E5.1 adds one OPTIONAL response field, `engineUsed`, and no request field —
 * the version stays 3. A protocol-3 reader that does not know the field
 * ignores it; a reader that does know it treats `undefined` as `'v2'`, which
 * is what every pre-E5.1 responder meant. */
export const AI_PROTOCOL = 3;

export interface Identity { version: 2 | 3; gameId: string; requestId: number; revision: number; player: PlayerId }

export interface SearchRequest extends Identity {
  type: 'search';
  state: GameState;
  difficulty: AIDifficulty;
  seed: number;
  decisionMs: number;
  fixedWork?: number;
  /** absent ≡ 'action' (protocol-2 behaviour, byte-compatible). */
  mode?: 'action' | 'turn';
  /** absent ≡ `'v2'`. The CALLER resolves the gate — `useAI.ts` sends
   * `'hard'` for `difficulty === 'hard'` unless the player opted out, which is
   * `resolveHardAiRoute()`'s `optOut ? false : hardEnabled || optIn`
   * (`src/ai/hardOptIn.ts`; DESIGN §6.4's release flag `hardEnabled` is true
   * since 2026-09-18). The worker never reads a global flag itself, only this
   * field. */
  engine?: 'v2' | 'hard';
  /** hard only: overrides the device rung (CI/SPRT/lab always set it). */
  work?: number;
  /** hard only. */
  hard?: Partial<HardConfig>;
}

/**
 * `search/pvs.ts` (M14) is the canonical home for `HardSearchStats` (DESIGN
 * §4.16); it does not exist yet, so this milestone declares the identical
 * shape here, the same way `src/ai/hard/config.ts` (M4) pre-declares shapes
 * owned by modules that land later (see that file's top-of-file comment).
 * Structurally compatible with the real export once M14 lands it — see
 * `docs/hard-ai/design/DEVIATIONS.md` under M3.
 */
export interface HardSearchStats {
  nodes: number; qnodes: number; turnNodes: number; evals: number; ttHits: number; ttProbes: number;
  depth: number; seldepth: number; byClass: Int32Array; proverCalls: number; dfpnCalls: number;
  catalogRebuilds: number; replicaDivergences: number; work: number; elapsedMs: number;
  stopReason: 'complete' | 'work' | 'abort';
}

/** `search/root.ts` (M14) `RootResult['source']`; declared locally for the same reason as `HardSearchStats` above. */
export type RootSource = 'search' | 'home-race' | 'mate' | 'rescue' | 'dfpn' | 'book' | 'fallback';

export interface TurnResult {
  actions: AIAction[];
  scoreCc: number;
  depth: number;
  work: number;
  stats: HardSearchStats;
  source: RootSource;
  endKey: string;
  fallback?: 'pack-error' | 'engine-error' | 'divergence';
}

/** Shape of a `type: 'progress'` message, factored out so `client.ts` can name it. */
export interface SearchProgress { depth: number; scoreCc: number; work: number; firstAction: AIAction | null }

/** Which engine actually answered (E5.1). `undefined` ≡ `'v2'`: every
 * responder before E5.1 was the v2 engine, and every `engine` default in
 * `SearchRequest` resolves to `'v2'` when absent. It is reported SEPARATELY
 * from `TurnResult['fallback']`, which says the hard engine ran and gave up:
 * `engineUsed: 'hard'` with `fallback: 'pack-error'` is a real hard request
 * that produced no plan, and `engineUsed: 'v2'` is a request the hard engine
 * never saw. */
export type EngineUsed = 'v2' | 'hard';

export type SearchResponse = Identity & (
  | { type: 'result'; result: AIResult; engineUsed?: EngineUsed; warning?: string }   // AIResult gains turnActions?: AIAction[]; endKey?: string
  | { type: 'turn'; result: TurnResult; engineUsed?: EngineUsed; warning?: string }
  | ({ type: 'progress' } & SearchProgress)
  | { type: 'error'; message: string }
);

export function sameRequest(a: Identity, b: Identity): boolean {
  return a.version === b.version && a.gameId === b.gameId && a.requestId === b.requestId && a.revision === b.revision && a.player === b.player;
}
