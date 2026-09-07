import { AIEngineV2 } from '../engine-v2';
import { AI_PROTOCOL, type SearchRequest, type SearchResponse } from './protocol';
import type { TacticalSolver } from '../wasm/kernel';

/** Browser-free message handler, also exercised with real WASM by Node tests. */
export function createSearchHandler(solver?: TacticalSolver, warning?: string) {
  const contexts = new Map<string, AIEngineV2>();
  return async (request: SearchRequest): Promise<SearchResponse> => {
    const { version, gameId, requestId, revision, player } = request;
    const identity = { version, gameId, requestId, revision, player };
    try {
      if (version !== AI_PROTOCOL || request.own.playerId !== player || request.observation.turn.currentPlayer !== player) throw new Error('Invalid AI request identity');
      const opponent = player === 'white' ? 'black' : 'white';
      const enemy = request.observation.players[opponent];
      if (enemy.resources !== 0 || enemy.buildQueue.length !== 0 || enemy.resourcesSpent !== (enemy.resourcesManifested ?? 0)) throw new Error('Unmasked opponent state in worker request');
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
      const state = { ...request.observation, players: { ...request.observation.players,
        [player]: { ...request.observation.players[player], resources: request.own.resources, buildQueue: request.own.buildQueue } } };
      return { ...identity, type: 'result', result: await engine.findBestAction(state, request.decisionMs), warning };
    } catch (error) { return { ...identity, type: 'error', message: error instanceof Error ? error.message : String(error) }; }
  };
}
