// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialGameState } from '../../src/game/board';
import { createSearchHandler, type HardEngineFactory } from '../../src/ai/worker/handler';
import { AI_PROTOCOL, type SearchRequest, type TurnResult } from '../../src/ai/worker/protocol';
import { AIWorkerClient, type WorkerLike } from '../../src/ai/worker/client';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';

/**
 * THE WORKER'S PHASING GUARD, from both sides.
 *
 * No release gate has passed for either engine under the Phasing ruleset, so
 * the worker refuses a Phasing state — unless the REQUEST ITSELF carries the
 * preview marker, which only `useAI` sets and only from the personal
 * `?phasingAi=1` opt-in. The worker reads no flag, storage or URL of its own,
 * which is the property these tests pin: the refusal does not depend on how the
 * page was loaded, only on what was sent.
 */
let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });

const REFUSAL = 'AI supports Standard rules only. Phasing is available for human play.';

function phasingRequest(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    version: AI_PROTOCOL, type: 'search', gameId: 'preview', requestId: 1, revision: 0,
    player: 'white', state: createInitialGameState(undefined, 4, 0, 'phasing'),
    difficulty: 'easy', seed: 17, decisionMs: 200, fixedWork: 3000, ...overrides,
  };
}

const STUB_TURN: TurnResult = {
  actions: [{ type: 'END_ACTION_PHASE' }], scoreCc: 3, depth: 2, work: 1000,
  stats: { nodes: 0, qnodes: 0, turnNodes: 0, evals: 0, ttHits: 0, ttProbes: 0, depth: 2, seldepth: 2,
    byClass: new Int32Array(9), proverCalls: 0, dfpnCalls: 0, catalogRebuilds: 0, replicaDivergences: 0,
    work: 1000, elapsedMs: 4, stopReason: 'complete' },
  source: 'search', endKey: 'preview-stub',
};
const hardStub: HardEngineFactory = () => ({ async searchTurn() { return STUB_TURN; }, setSeed() {} });

it('refuses an unmarked Phasing request, in every mode, exactly as before', async () => {
  const handler = createSearchHandler(solver, undefined, hardStub);
  for (const request of [
    phasingRequest(),                                              // per-action (protocol 2 shape)
    phasingRequest({ mode: 'turn' }),                              // whole-turn, v2
    phasingRequest({ mode: 'turn', engine: 'hard' }),              // whole-turn, hard
    phasingRequest({ version: 2 }),                                // legacy protocol
    phasingRequest({ phasingPreview: false }),                     // explicitly not a preview
  ]) {
    const response = await handler(request);
    expect(response.type).toBe('error');
    if (response.type !== 'error') return;
    expect(response.message).toBe(REFUSAL);
  }
});

it('accepts a Phasing request that carries the preview marker', async () => {
  const handler = createSearchHandler(solver, undefined, hardStub);
  const action = await handler(phasingRequest({ phasingPreview: true }));
  expect(action.type).toBe('result');

  const turn = await handler(phasingRequest({ requestId: 2, mode: 'turn', phasingPreview: true }));
  expect(turn.type).toBe('result');
  if (turn.type !== 'result') return;
  expect(turn.engineUsed).toBe('v2');
  expect(turn.result.turnActions?.length).toBeGreaterThan(0);

  const hard = await handler(phasingRequest({ requestId: 3, mode: 'turn', engine: 'hard', phasingPreview: true }));
  expect(hard.type).toBe('turn');
  if (hard.type !== 'turn') return;
  expect(hard.engineUsed).toBe('hard');
  expect(hard.result.actions).toEqual(STUB_TURN.actions);
});

it('leaves a Standard request untouched whatever the marker says', async () => {
  const handler = createSearchHandler(solver, undefined, hardStub);
  const state = createInitialGameState();
  const plain = await handler({ ...phasingRequest(), state, mode: 'turn' });
  const marked = await handler({ ...phasingRequest(), requestId: 2, state, mode: 'turn', phasingPreview: true });
  expect(plain.type).toBe('result');
  expect(marked.type).toBe('result');
  if (plain.type !== 'result' || marked.type !== 'result') return;
  expect(marked.result.turnActions).toEqual(plain.result.turnActions);
});

class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null; onerror: WorkerLike['onerror'] = null;
  sent: SearchRequest[] = [];
  postMessage(r: SearchRequest) { this.sent.push(r); }
  terminate() {}
}

it('the client sends no marker unless it is asked for, on either path', async () => {
  const workers: FakeWorker[] = [];
  const client = new AIWorkerClient(() => { const w = new FakeWorker(); workers.push(w); return w; }, 'game', 1);
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  client.findBestTurn(state, 'easy', 100, 0).catch(() => {});
  client.findBestTurn(state, 'easy', 100, 0, { phasingPreview: true }).catch(() => {});
  client.findBestAction(state, 'easy', 100, 0).catch(() => {});
  client.findBestAction(state, 'easy', 100, 0, { phasingPreview: true }).catch(() => {});
  const sent = workers.flatMap(w => w.sent);
  expect(sent.map(r => r.phasingPreview)).toEqual([undefined, true, undefined, true]);
  client.cancel();
});
