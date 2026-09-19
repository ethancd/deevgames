// @vitest-environment node
import { it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialGameState } from '../../src/game/board';
import { phaseEndAction } from '../../src/game/legality';
import { AIWorkerClient, type WorkerLike } from '../../src/ai/worker/client';
import { createSearchHandler, legalPrefix, type HardEngineFactory } from '../../src/ai/worker/handler';
import { AI_PROTOCOL, type SearchRequest, type SearchResponse, type HardSearchStats, type TurnResult } from '../../src/ai/worker/protocol';
import { placeholderWeights } from '../../src/ai/hard/config';
import type { HardConfig } from '../../src/ai/hard/config';
import type { GameState } from '../../src/game/types';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { AI_PACES, aiTurnBudgetMs } from '../../src/ai/turnTime';

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

/**
 * E5.1's `engine: 'hard'` route. A recording stub stands in for `HardEngine`
 * so these pin the ROUTING — one engine per game, the turn's remaining
 * allowance as `targetMs`, `engineUsed`/`fallback` reported — without paying
 * for a real search (`tests/ai/hard/*` owns the engine itself).
 */
const STUB_TURN: TurnResult = {
  actions: [{ type: 'END_PLACE_PHASE' }], scoreCc: 7, depth: 2, work: 400000,
  stats: { nodes: 0, qnodes: 0, turnNodes: 0, evals: 0, ttHits: 0, ttProbes: 0, depth: 2, seldepth: 2,
    byClass: new Int32Array(9), proverCalls: 0, dfpnCalls: 0, catalogRebuilds: 0, replicaDivergences: 0,
    work: 400000, elapsedMs: 9, stopReason: 'complete' },
  source: 'search', endKey: 'stub-end-key',
};

function hardStub(overrides: Partial<TurnResult> = {}) {
  const calls: Array<{ state: GameState; opts?: { work?: number; targetMs?: number; deadlineMs?: number } }> = [];
  const patches: Array<Partial<HardConfig> | undefined> = [];
  const seeds: number[] = [];
  const factory: HardEngineFactory = patch => {
    patches.push(patch);
    return {
      async searchTurn(state, opts) { calls.push({ state, opts }); return { ...STUB_TURN, ...overrides }; },
      setSeed(seed: number) { seeds.push(seed); },
    };
  };
  return { factory, calls, patches, seeds };
}

it('mode:"turn", engine:"hard" routes to the HardEngine, funds it with the turn remainder, and reports engineUsed', async () => {
  const r = request();
  const stub = hardStub();
  const response = await createSearchHandler(solver, undefined, stub.factory)({ ...r, mode: 'turn', engine: 'hard', decisionMs: 1234 });
  expect(response.type).toBe('turn');
  if (response.type !== 'turn') return;
  expect(response.engineUsed).toBe('hard');
  expect(response.result.actions).toEqual(STUB_TURN.actions);
  expect(response.result.endKey).toBe('stub-end-key');
  // `decisionMs` IS the turn's remaining allowance (E0.2): the handler passes
  // it straight through as `targetMs` and never invents a budget of its own.
  // It is ALSO the deadline (A11), so the engine's watchdog is the allowance
  // rather than `abortFactor ×` it — otherwise the client's own
  // `decisionMs + 2000` watchdog kills a cold first search, the hook counts a
  // worker error, and v2 replays the turn.
  expect(stub.calls).toHaveLength(1);
  expect(stub.calls[0].opts).toEqual({ targetMs: 1234, deadlineMs: 1234 });
  expect(stub.seeds).toEqual([r.seed]);
});

/**
 * THE PACED SEAM. `useAI.ts` funds one turn with `aiTurnBudgetMs(difficulty,
 * pace)` and sends what is left of it as `decisionMs`; this is the other half
 * of that sentence — the player's own allowance reaches `searchTurn` unmangled,
 * all the way up to the deep 60 s the owner asked for on a phone. What the
 * engine then BUYS with it (a bigger work rung on every device profile) is
 * `tests/ai/hard/turn-pace.test.ts`; what is pinned here is that no layer
 * between the menu and the engine re-invents the number.
 */
it('funds a hard turn with the pace the player chose, up to the deep 60 s', async () => {
  const stub = hardStub();
  const handler = createSearchHandler(solver, undefined, stub.factory);
  for (const [index, pace] of AI_PACES.entries()) {
    const ms = aiTurnBudgetMs('hard', pace);
    await handler({ ...request(), mode: 'turn', engine: 'hard', requestId: index + 1, decisionMs: ms });
    expect(stub.calls[index].opts).toEqual({ targetMs: ms, deadlineMs: ms });
  }
  expect(stub.calls.map(call => call.opts?.targetMs)).toEqual([10_000, 30_000, 60_000]);
});

it('a hard engine that fell back reports engineUsed:"hard" with the fallback reason', async () => {
  const stub = hardStub({ actions: [], source: 'fallback', fallback: 'pack-error' });
  const response = await createSearchHandler(solver, undefined, stub.factory)({ ...request(), mode: 'turn', engine: 'hard' });
  expect(response.type).toBe('turn');
  if (response.type !== 'turn') return;
  // Both facts are reported, and they are different facts: the hard engine DID
  // answer this request, and it gave up while answering it.
  expect(response.engineUsed).toBe('hard');
  expect(response.result.fallback).toBe('pack-error');
  expect(response.result.actions).toEqual([]);
});

it('owns one HardEngine per game and a fresh one for a new gameId', async () => {
  const stub = hardStub();
  const handler = createSearchHandler(solver, undefined, stub.factory);
  const r = { ...request(), mode: 'turn' as const, engine: 'hard' as const };
  await handler(r);
  await handler({ ...r, requestId: 2 });
  expect(stub.patches).toHaveLength(1);       // reused across the game's turns
  await handler({ ...r, gameId: 'restarted', requestId: 3 });
  expect(stub.patches).toHaveLength(2);       // `AIWorkerClient.restart()` mints a new gameId
});

it('an explicit work override bypasses the wall-clock allowance and the deadline entirely', async () => {
  const stub = hardStub();
  await createSearchHandler(solver, undefined, stub.factory)({ ...request(), mode: 'turn', engine: 'hard', work: 25_000 });
  // Fixed work reads no clock at all, so a deadline would be meaningless (and
  // `searchTurn` ignores one): the lab/CI arms stay machine independent.
  expect(stub.calls[0].opts).toEqual({ work: 25_000 });
});

it('strips a placeholder weight vector so the engine substitutes its trained weights', async () => {
  const stub = hardStub();
  const handler = createSearchHandler(solver, undefined, stub.factory);
  await handler({ ...request(), mode: 'turn', engine: 'hard', hard: { maxDepth: 3, weights: placeholderWeights() } });
  expect(stub.patches[0]).toEqual({ maxDepth: 3 });
  const trained = { ...placeholderWeights(), version: 7, label: 'trained' };
  await handler({ ...request(), gameId: 'other', mode: 'turn', engine: 'hard', hard: { weights: trained } });
  expect(stub.patches[1]).toEqual({ weights: trained });
});

it('engine:"hard" without mode:"turn" still takes the unchanged per-action v2 path', async () => {
  const never: HardEngineFactory = () => { throw new Error('the hard engine must not be constructed for a per-action request'); };
  const response = await createSearchHandler(solver, undefined, never)({ ...request(), engine: 'hard' });
  expect(response.type).toBe('result');
  if (response.type !== 'result') return;
  expect(response.engineUsed).toBe('v2');
  expect(response.result.turnActions).toBeUndefined();
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

// E5.1 race safety (E5.2 owns the full lifecycle): the client already keys
// every reply to the request it belongs to, so a plan that arrives for a
// SUPERSEDED request — the state changed and a new search was issued — can
// never be dispatched. This pins that guard directly rather than assuming it.
it('ignores a response whose identity does not match the in-flight request', async () => {
  const workers: FakeWorker[] = [];
  const c = new AIWorkerClient(() => { const w = new FakeWorker(); workers.push(w); return w; }, 'game', 1);
  const pending = c.findBestTurn(createInitialGameState(), 'hard', 1000, 0, { engine: 'hard' });
  const posted = workers[0].sent[0];
  expect(posted.engine).toBe('hard');
  let settled = false;
  pending.then(() => { settled = true; }, () => { settled = true; });
  const staleTurn: TurnResult = { actions: [{ type: 'END_PLACE_PHASE' }], scoreCc: 1, depth: 1, work: 1, stats: STUB_STATS, source: 'search', endKey: 'stale' };
  // Same worker, wrong request: a reply for the previous revision and one for
  // an older requestId. Both belong to a superseded search.
  workers[0].reply({ ...posted, revision: posted.revision + 1, type: 'turn', result: staleTurn, engineUsed: 'hard' });
  workers[0].reply({ ...posted, requestId: posted.requestId - 1, type: 'turn', result: staleTurn, engineUsed: 'hard' });
  await Promise.resolve(); await Promise.resolve();
  expect(settled).toBe(false);
  const fresh: TurnResult = { ...staleTurn, endKey: 'fresh' };
  workers[0].reply({ ...posted, type: 'turn', result: fresh, engineUsed: 'hard' });
  const result = await pending;
  expect(result.endKey).toBe('fresh');
  expect(result.engineUsed).toBe('hard');
  c.cancel();
});
