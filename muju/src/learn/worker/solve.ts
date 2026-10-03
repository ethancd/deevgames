import { makeContext, type PuzzleContext } from '../goals';
import { canStillWin, chooseReply, solutionLine } from '../solver';
import type { PuzzleSpec } from '../types';
import type { SolverRequest, SolverResult } from './protocol';

/** Contexts are rebuilt per spec id; a spec is immutable once shipped. */
const contexts = new Map<string, PuzzleContext>();
export function contextFor(spec: PuzzleSpec): PuzzleContext {
  const key = `${spec.id}\n${spec.board.join('\n')}\n${JSON.stringify(spec.goal)}`;
  let ctx = contexts.get(key);
  if (!ctx) { ctx = makeContext(spec); contexts.set(key, ctx); }
  return ctx;
}

/** The one place a request becomes a search, shared by the worker and the inline fallback. */
export function solve(request: SolverRequest): SolverResult {
  const ctx = contextFor(request.spec);
  const options = { nodeLimit: request.nodeLimit };
  switch (request.kind) {
    case 'win': return { kind: 'win', verdict: canStillWin(ctx, request.state, options) };
    case 'reply': return { kind: 'reply', ...chooseReply(ctx, request.state, options) };
    case 'line': return { kind: 'line', line: solutionLine(ctx, request.state, options) };
  }
}
