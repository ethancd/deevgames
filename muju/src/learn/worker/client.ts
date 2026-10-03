import type { AIAction } from '../../ai/types';
import type { GameState } from '../../game/types';
import type { Verdict } from '../solver';
import type { PuzzleSpec } from '../types';
import type { SolverRequest, SolverResponse, SolverResult } from './protocol';
import { solve } from './solve';

export interface SolverWorkerLike {
  onmessage: ((event: MessageEvent<SolverResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: SolverRequest): void;
  terminate(): void;
}

/** Node budgets for the live searches. About 50 nodes/ms, so these are sub-second to a couple of seconds, off the main thread. */
export const LIVE_BUDGET = { win: 30_000, reply: 120_000, line: 100_000 } as const;

/** A module worker, or null where workers do not exist (tests, jsdom). */
function createWorker(): SolverWorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  try { return new Worker(new URL('./entry.ts', import.meta.url), { type: 'module' }); }
  catch { return null; }
}

/**
 * Puzzle searches for the screen: "can I still win?", the enemy's reply and
 * the hint line. Each call is a promise; a request that is superseded (the
 * player moved again, or restarted) can be dropped with `cancel`. Without a
 * Worker the same search runs inline, so tests and old browsers behave the
 * same, only slower.
 */
export class LearnSolverClient {
  private worker: SolverWorkerLike | null | undefined;
  private next = 0;
  private pending = new Map<number, { resolve: (r: SolverResult) => void; reject: (e: Error) => void; request: SolverRequest }>();

  constructor(private readonly factory: () => SolverWorkerLike | null = createWorker) {}

  canStillWin(spec: PuzzleSpec, state: GameState, nodeLimit = LIVE_BUDGET.win): Promise<Verdict> {
    return this.ask({ kind: 'win', spec, state, nodeLimit }).then(r => r.kind === 'win' ? r.verdict : 'unknown');
  }
  chooseReply(spec: PuzzleSpec, state: GameState, nodeLimit = LIVE_BUDGET.reply): Promise<{ line: AIAction[]; refutes: boolean }> {
    return this.ask({ kind: 'reply', spec, state, nodeLimit }).then(r => r.kind === 'reply' ? r : { line: [], refutes: false });
  }
  solutionLine(spec: PuzzleSpec, state: GameState, nodeLimit = LIVE_BUDGET.line): Promise<AIAction[] | null> {
    return this.ask({ kind: 'line', spec, state, nodeLimit }).then(r => r.kind === 'line' ? r.line : null);
  }

  /** Drop every unanswered request (their promises reject with `SolverCancelled`). */
  cancel(): void {
    for (const { reject } of this.pending.values()) reject(new SolverCancelled());
    this.pending.clear();
  }
  dispose(): void {
    this.cancel();
    this.worker?.terminate();
    this.worker = undefined;
  }

  private ask(partial: Omit<SolverRequest, 'id'>): Promise<SolverResult> {
    const request = { ...partial, id: ++this.next } as SolverRequest;
    if (this.worker === undefined) this.worker = this.factory();
    if (!this.worker) return new Promise(resolve => setTimeout(() => resolve(solve(request)), 0));
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject, request });
      this.attach(this.worker!);
      this.worker!.postMessage(request);
    });
  }

  private attach(worker: SolverWorkerLike) {
    worker.onmessage = ({ data }) => {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      this.pending.delete(data.id);
      if ('error' in data) entry.reject(new Error(data.error)); else entry.resolve(data.result);
    };
    worker.onerror = event => {
      // A worker that cannot even load (old browser, blocked module) answers inline from now on.
      worker.terminate();
      this.worker = null;
      const waiting = [...this.pending.values()];
      this.pending.clear();
      console.warn('[learn] solver worker failed, searching inline:', event.message);
      for (const { request, resolve, reject } of waiting) {
        try { resolve(solve(request)); } catch (e) { reject(e as Error); }
      }
    };
  }
}

export class SolverCancelled extends Error { constructor() { super('Solver request cancelled'); this.name = 'SolverCancelled'; } }
