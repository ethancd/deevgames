import type { SolverWorkerLike } from '../../src/learn/worker/client';
import type { SolverRequest, SolverResponse } from '../../src/learn/worker/protocol';
import { solve } from '../../src/learn/worker/solve';

/** A solver worker that answers only when told, so a test can hold a search "running". */
export class HeldWorker implements SolverWorkerLike {
  onmessage: ((event: MessageEvent<SolverResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  received: SolverRequest[] = [];
  terminated = false;
  postMessage(request: SolverRequest) { this.received.push(request); }
  terminate() { this.terminated = true; }
  answer(request: SolverRequest) { this.onmessage?.({ data: { id: request.id, result: solve(request) } } as MessageEvent<SolverResponse>); }
}

/** A factory that keeps every worker it made. */
export function heldWorkers() {
  const workers: HeldWorker[] = [];
  return { workers, factory: () => { const w = new HeldWorker(); workers.push(w); return w; } };
}
