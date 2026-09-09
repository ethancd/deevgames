import type { GameState } from '../../game/types';
import type { AIDifficulty, AIResult } from '../types';
import { AI_PROTOCOL, sameRequest, type SearchRequest, type SearchResponse } from './protocol';

export class SearchCancelled extends Error { constructor() { super('AI search cancelled'); this.name = 'SearchCancelled'; } }
export interface WorkerLike {
  onmessage: ((event: MessageEvent<SearchResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: SearchRequest): void;
  terminate(): void;
}
const createWorker = (): WorkerLike => new Worker(new URL('./entry.ts', import.meta.url), { type: 'module' });
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
        finish();
        if (data.type === 'error') { this.cancel(); reject(new Error(data.message)); }
        else { this.warning = data.warning; resolve(data.result); }
      };
      this.worker!.onerror = (event) => { finish(); this.cancel(); reject(new Error(event.message || 'AI worker failed')); };
      // Hard cancellation handles even a wedged native call or failed worker
      // module load. Search deadlines are enforced internally; this is recovery.
      this.timer = setTimeout(() => { finish(); this.cancel(); reject(new Error('AI worker timed out. Please retry.')); }, Math.max(2000, decisionMs + 2000));
      this.worker!.postMessage(request);
    });
  }
}
