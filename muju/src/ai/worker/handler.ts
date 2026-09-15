import { AIEngineV2 } from '../engine-v2';
import type { SearchRequest, SearchResponse } from './protocol';
import type { TacticalSolver } from '../wasm/kernel';
import { isLegalAction } from '../../game/legality';
import { applyAction } from '../simulate';
import type { AIAction } from '../types';
import type { GameState } from '../../game/types';

/**
 * Truncates a whole-turn plan to its longest prefix that replays legally from
 * `state` (DESIGN §6.1: "`turnActions` = the plan's legal prefix"). The v2
 * planner should already emit fully legal turns — this is a defensive
 * backstop for the worker boundary, not a replica-grade verifier (that's
 * `verify/replay.ts`'s `verifyTurn`, M14+, for the hard engine).
 */
export function legalPrefix(state: GameState, actions: readonly AIAction[]): AIAction[] {
  const prefix: AIAction[] = [];
  let current = state;
  for (const action of actions) {
    if (!isLegalAction(current, action)) break;
    prefix.push(action);
    current = applyAction(current, action);
  }
  return prefix;
}

/** Browser-free message handler, also exercised with real WASM by Node tests. */
export function createSearchHandler(solver?: TacticalSolver, warning?: string) {
  const contexts = new Map<string, AIEngineV2>();
  return async (request: SearchRequest): Promise<SearchResponse> => {
    const { version, gameId, requestId, revision, player } = request;
    const identity = { version, gameId, requestId, revision, player };
    try {
      if ((version !== 2 && version !== 3) || request.state.turn.currentPlayer !== player) throw new Error('Invalid AI request identity');
      const key = `${gameId}:${player}`;
      let engine = contexts.get(key);
      if (!engine) {
        // Bound contexts even if a caller forgets to recreate the worker on restart.
        if (contexts.size >= 2) contexts.clear();
        engine = new AIEngineV2(request.difficulty); engine.setSeed(request.seed);
        if (solver) engine.setTacticalSolver(solver); contexts.set(key, engine);
      }
      engine.setDifficulty(request.difficulty);
      if (request.fixedWork) engine.setConfig({ fixedWork: request.fixedWork });

      if (request.mode === 'turn') {
        // engine:'hard' routes to a packed-replica HardEngine context (DESIGN
        // §6.1); that engine doesn't exist until M15. `absent` also resolves
        // to 'v2' here, since the `hardEnabled` gate this milestone's `engine`
        // default describes has no reader before M15 wires one up.
        const engineKind = request.engine ?? 'v2';
        if (engineKind !== 'v2') throw new Error(`AI worker: mode "turn" with engine "${engineKind}" is not available until M15 (src/ai/hard/engine.ts)`);
        const result = await engine.findBestAction(request.state, request.decisionMs);
        const turnActions = legalPrefix(request.state, result.plan.actions);
        return { ...identity, type: 'result', result: { ...result, turnActions }, warning };
      }

      return { ...identity, type: 'result', result: await engine.findBestAction(request.state, request.decisionMs), warning };
    } catch (error) { return { ...identity, type: 'error', message: error instanceof Error ? error.message : String(error) }; }
  };
}
