import type { GameState } from '../../game/types';
import type { AIAction, AIDebugInfo, AIDifficulty, AIResult } from '../types';
import { AI_PROTOCOL, sameRequest, type SearchProgress, type SearchRequest, type SearchResponse, type TurnResult } from './protocol';

export class SearchCancelled extends Error { constructor() { super('AI search cancelled'); this.name = 'SearchCancelled'; } }
export interface WorkerLike {
  onmessage: ((event: MessageEvent<SearchResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: SearchRequest): void;
  terminate(): void;
}
const createWorker = (): WorkerLike => new Worker(new URL('./entry.ts', import.meta.url), { type: 'module' });

/**
 * Normalized whole-turn result (DESIGN §6.2's `result.actions`): flattens
 * both wire shapes — `type: 'result'` from the v2 turn path (M3) and
 * `type: 'turn'` from the hard engine (M15+) — into one shape so `useAI`'s
 * turn loop is engine-agnostic.
 */
export interface FindTurnResult {
  actions: AIAction[];
  scoreCc: number;
  depth: number;
  work: number;
  source: TurnResult['source'] | 'v2';
  endKey?: string;
  fallback?: TurnResult['fallback'];
  timeMs: number;
  debug?: AIDebugInfo;
}

export interface FindTurnOptions {
  engine?: SearchRequest['engine'];
  work?: SearchRequest['work'];
  hard?: SearchRequest['hard'];
  onProgress?: (p: SearchProgress) => void;
}

function fromAIResult(result: AIResult): FindTurnResult {
  return {
    actions: result.turnActions ?? [],
    scoreCc: result.plan.score,
    depth: result.depth,
    work: result.nodesSearched,
    source: 'v2',
    endKey: result.endKey,
    timeMs: result.timeMs,
    debug: result.debug,
  };
}
function fromTurnResult(result: TurnResult): FindTurnResult {
  return {
    actions: result.actions, scoreCc: result.scoreCc, depth: result.depth, work: result.work,
    source: result.source, endKey: result.endKey, fallback: result.fallback, timeMs: result.stats.elapsedMs,
  };
}

export class AIWorkerClient {
  private worker: WorkerLike | null = null;
  private rejectPending: ((error: Error) => void) | null = null;
  private nextRequest = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  warning: string | undefined;
  constructor(private readonly factory = createWorker, private gameId = crypto.randomUUID(), private seed = 1) {}
  cancel(): void {
    this.worker?.terminate(); this.worker = null;
    clearTimeout(this.timer); this.rejectPending?.(new SearchCancelled()); this.rejectPending = null;
  }
  restart(): void { this.cancel(); this.gameId = crypto.randomUUID(); }
  async findBestAction(state: GameState, difficulty: AIDifficulty, decisionMs: number, revision: number): Promise<AIResult> {
    if (this.rejectPending) this.cancel();
    this.worker ??= this.factory();
    const request: SearchRequest = { version: AI_PROTOCOL, type: 'search', gameId: this.gameId,
      requestId: ++this.nextRequest, revision, player: state.turn.currentPlayer, state,
      difficulty, decisionMs, seed: this.seed };
    return new Promise((resolve, reject) => {
      this.rejectPending = reject;
      const finish = () => { clearTimeout(this.timer); this.rejectPending = null; };
      this.worker!.onmessage = ({ data }) => {
        if (!sameRequest(data, request)) return;
        if (data.type === 'progress') return; // the per-action path never streams progress; ignore defensively
        finish();
        if (data.type === 'error') { this.cancel(); reject(new Error(data.message)); return; }
        if (data.type === 'turn') { this.cancel(); reject(new Error('AI worker: unexpected "turn" response for an action-mode request')); return; }
        this.warning = data.warning; resolve(data.result);
      };
      this.worker!.onerror = (event) => { finish(); this.cancel(); reject(new Error(event.message || 'AI worker failed')); };
      // Hard cancellation handles even a wedged native call or failed worker
      // module load. Search deadlines are enforced internally; this is recovery.
      this.timer = setTimeout(() => { finish(); this.cancel(); reject(new Error('AI worker timed out. Please retry.')); }, Math.max(2000, decisionMs + 2000));
      this.worker!.postMessage(request);
    });
  }

  /** Whole-turn search (DESIGN §6.1/§6.2, protocol 3): one request per turn
   * instead of one per action. Keeps the promise open across `type:'progress'`
   * messages (M14+ hard-engine iterative deepening); resolves once a
   * `'result'` (v2) or `'turn'` (hard) message arrives. */
  async findBestTurn(state: GameState, difficulty: AIDifficulty, decisionMs: number, revision: number, options: FindTurnOptions = {}): Promise<FindTurnResult> {
    if (this.rejectPending) this.cancel();
    this.worker ??= this.factory();
    const request: SearchRequest = { version: AI_PROTOCOL, type: 'search', gameId: this.gameId,
      requestId: ++this.nextRequest, revision, player: state.turn.currentPlayer, state,
      difficulty, decisionMs, seed: this.seed, mode: 'turn',
      engine: options.engine, work: options.work, hard: options.hard };
    return new Promise((resolve, reject) => {
      this.rejectPending = reject;
      const finish = () => { clearTimeout(this.timer); this.rejectPending = null; };
      this.worker!.onmessage = ({ data }) => {
        if (!sameRequest(data, request)) return;
        if (data.type === 'progress') { options.onProgress?.(data); return; }
        finish();
        if (data.type === 'error') { this.cancel(); reject(new Error(data.message)); return; }
        this.warning = data.warning;
        resolve(data.type === 'turn' ? fromTurnResult(data.result) : fromAIResult(data.result));
      };
      this.worker!.onerror = (event) => { finish(); this.cancel(); reject(new Error(event.message || 'AI worker failed')); };
      this.timer = setTimeout(() => { finish(); this.cancel(); reject(new Error('AI worker timed out. Please retry.')); }, Math.max(2000, decisionMs + 2000));
      this.worker!.postMessage(request);
    });
  }
}
