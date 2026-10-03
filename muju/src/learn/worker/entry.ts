/// <reference lib="webworker" />
import type { SolverRequest, SolverResponse } from './protocol';
import { solve } from './solve';

/** Module worker: puzzle searches off the main thread, one message per request. */
self.onmessage = ({ data }: MessageEvent<SolverRequest>) => {
  let response: SolverResponse;
  try { response = { id: data.id, result: solve(data) }; }
  catch (e) { response = { id: data.id, error: (e as Error).message }; }
  self.postMessage(response);
};
