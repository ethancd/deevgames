// @vitest-environment node
import { it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialGameState } from '../../src/game/board';
import { phaseEndAction } from '../../src/game/legality';
import { AIWorkerClient, type WorkerLike } from '../../src/ai/worker/client';
import { createSearchHandler, legalPrefix } from '../../src/ai/worker/handler';
import { AI_PROTOCOL, type SearchRequest, type SearchResponse, type HardSearchStats, type TurnResult } from '../../src/ai/worker/protocol';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { AIEngineV2 } from '../../src/ai/engine-v2';

let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });

function request(): SearchRequest {
  const state = createInitialGameState();
  return { version: AI_PROTOCOL, type: 'search', gameId: 'test', requestId: 1, revision: 0, player: 'white', state, difficulty: 'easy', seed: 831, decisionMs: 1000, fixedWork: 5000 };
}

it('AI_PROTOCOL is 3', () => {
  expect(AI_PROTOCOL).toBe(3);
});

it('mode:"turn", engine:"v2" returns the direct engine plan as turnActions', async () => {
  const r = request();
  const direct = new AIEngineV2(r.difficulty);
  direct.setTacticalSolver(solver); direct.setSeed(r.seed); direct.setConfig({ fixedWork: r.fixedWork });
  const a = await direct.findBestAction(r.state, r.decisionMs);

  const b = await createSearchHandler(solver)({ ...r, mode: 'turn' });
  expect(b.type).toBe('result'); if (b.type !== 'result') return;
  // The v2 planner already emits legal turns, so the legal-prefix backstop is a no-op here.
  expect(b.result.turnActions).toEqual(a.plan.actions);
  expect(b.result.plan).toEqual(a.plan);
});

it('mode:"turn" with a non-"v2" engine is rejected until M15', async () => {
  const r = request();
  const result = await createSearchHandler(solver)({ ...r, mode: 'turn', engine: 'hard' });
  expect(result.type).toBe('error');
  if (result.type !== 'error') return;
  expect(result.message).toMatch(/M15/);
});

it('a version:2 request still ignores mode/engine and returns the unchanged per-action result', async () => {
  const r = { ...request(), version: 2 as const };
  const result = await createSearchHandler(solver)(r);
  expect(result.type).toBe('result');
  if (result.type !== 'result') return;
  expect(result.result.turnActions).toBeUndefined();
});

it('legalPrefix truncates at the first illegal action, keeping the legal actions before and dropping everything after', () => {
  const state = createInitialGameState();
  const legalFirst = phaseEndAction(state); // {type:'END_PLACE_PHASE'} — always legal on the initial position
  const illegal = { type: 'MOVE' as const, unitId: 'does-not-exist', to: { x: 0, y: 0 } };
  const wouldBeLegalLater = { type: 'END_ACTION_PHASE' as const };
  const prefix = legalPrefix(state, [legalFirst, illegal, wouldBeLegalLater]);
  expect(prefix).toEqual([legalFirst]);
});

it('legalPrefix returns every action of an already-legal sequence unchanged', () => {
  const state = createInitialGameState();
  const legalFirst = phaseEndAction(state);
  const prefix = legalPrefix(state, [legalFirst]);
  expect(prefix).toEqual([legalFirst]);
});

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null; onerror: WorkerLike['onerror'] = null;
  sent: SearchRequest[] = []; terminated = false;
  postMessage(r: SearchRequest) { this.sent.push(r); }
  terminate() { this.terminated = true; }
  reply(data: SearchResponse) { this.onmessage?.({ data } as MessageEvent<SearchResponse>); }
}

const STUB_STATS: HardSearchStats = {
  nodes: 0, qnodes: 0, turnNodes: 0, evals: 0, ttHits: 0, ttProbes: 0, depth: 3, seldepth: 3,
  byClass: new Int32Array(9), proverCalls: 0, dfpnCalls: 0, catalogRebuilds: 0, replicaDivergences: 0,
  work: 400000, elapsedMs: 12, stopReason: 'complete',
};

it('findBestTurn sends mode:"turn" and resolves a normalized result from a type:"result" (v2) response', async () => {
  const workers: FakeWorker[] = [];
  const c = new AIWorkerClient(() => { const w = new FakeWorker(); workers.push(w); return w; }, 'game', 1);
  const s = createInitialGameState();
  const pending = c.findBestTurn(s, 'easy', 1000, 0);
  const posted = workers[0].sent[0];
  expect(posted.mode).toBe('turn');
  expect(posted.type).toBe('search');
  workers[0].reply({ ...posted, type: 'result', result: { plan: { actions: [{ type: 'END_PLACE_PHASE' }], score: 5 }, nodesSearched: 10, timeMs: 3, depth: 1, turnActions: [{ type: 'END_PLACE_PHASE' }] } });
  const result = await pending;
  expect(result.actions).toEqual([{ type: 'END_PLACE_PHASE' }]);
  expect(result.source).toBe('v2');
  expect(result.scoreCc).toBe(5);
  c.cancel();
});

it('findBestTurn forwards progress events without resolving, then resolves on the terminal message', async () => {
  const workers: FakeWorker[] = [];
  const c = new AIWorkerClient(() => { const w = new FakeWorker(); workers.push(w); return w; }, 'game', 1);
  const s = createInitialGameState();
  const progressEvents: number[] = [];
  const pending = c.findBestTurn(s, 'hard', 1000, 0, { onProgress: p => progressEvents.push(p.depth) });
  const posted = workers[0].sent[0];
  let resolved = false; pending.then(() => { resolved = true; });
  workers[0].reply({ ...posted, type: 'progress', depth: 1, scoreCc: 0, work: 1000, firstAction: null });
  workers[0].reply({ ...posted, type: 'progress', depth: 2, scoreCc: 10, work: 2000, firstAction: null });
  await Promise.resolve(); await Promise.resolve();
  expect(resolved).toBe(false);
  expect(progressEvents).toEqual([1, 2]);
  const turnResult: TurnResult = { actions: [{ type: 'END_ACTION_PHASE' }], scoreCc: 42, depth: 3, work: 400000, stats: STUB_STATS, source: 'search', endKey: 'abc' };
  workers[0].reply({ ...posted, type: 'turn', result: turnResult });
  const result = await pending;
  expect(resolved).toBe(true);
  expect(result.actions).toEqual([{ type: 'END_ACTION_PHASE' }]);
  expect(result.source).toBe('search');
  expect(result.endKey).toBe('abc');
  c.cancel();
});

it('findBestTurn rejects on a type:"error" response', async () => {
  const workers: FakeWorker[] = [];
  const c = new AIWorkerClient(() => { const w = new FakeWorker(); workers.push(w); return w; }, 'game', 1);
  const pending = c.findBestTurn(createInitialGameState(), 'medium', 1000, 0);
  const posted = workers[0].sent[0];
  workers[0].reply({ ...posted, type: 'error', message: 'boom' });
  await expect(pending).rejects.toThrow('boom');
});
