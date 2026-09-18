import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import { TURN_BUDGET_MS } from '../../src/ai/engine-v2';
import { MIN_TURN_SEARCH_MS } from '../../src/hooks/useAI';
import type { GameState } from '../../src/game/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
import type { FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';
import { isLegalAction } from '../../src/game/legality';
import { HARD_AI_MS_QUERY_PARAM, HARD_AI_QUERY_PARAM, HARD_AI_STORAGE_KEY, hardDiag, resetHardDiag } from '../../src/ai/hardOptIn';

/**
 * The hook side of the Hard route: the gate (now `hardEnabled`-on by default,
 * with the opt-out winning), the `?hardMs` budget override, and the accounting
 * of the three ways a Hard turn can fail (pack/engine error, invalid suffix or
 * empty plan, worker failure). Every one of them must be COUNTED, must drop the
 * rest of the plan, and must finish the turn legally on the v2 path out of what
 * the turn has LEFT — never a fresh `TURN_BUDGET_MS`.
 *
 * The worker client is mocked: this is about the hook's decisions, not about
 * a real search (`tests/ai/worker-turn.test.ts` pins the worker route).
 */
const { turnSearch, actionSearch } = vi.hoisted(() => ({ turnSearch: vi.fn(), actionSearch: vi.fn() }));
vi.mock('../../src/ai/worker/client', () => ({
  AIWorkerClient: class {
    warning: string | undefined;
    restart() {} cancel() {}
    async findBestTurn(state: GameState, _d: AIDifficulty, decisionMs: number, _r: number, options?: FindTurnOptions) {
      return turnSearch(state, decisionMs, options) as Promise<FindTurnResult>;
    }
    async findBestAction(state: GameState, _d: AIDifficulty, allowance: number) {
      return actionSearch(state, allowance);
    }
  },
  SearchCancelled: class extends Error {},
}));
import { useAI } from '../../src/hooks/useAI';

const END_ACTION: AIAction = { type: 'END_ACTION_PHASE' };
const ILLEGAL: AIAction = { type: 'MOVE', unitId: '__does-not-exist__', to: { x: 0, y: 0 } };

/** A `FindTurnResult` with only the fields under test spelled out. */
function turn(partial: Partial<FindTurnResult>): FindTurnResult {
  return { actions: [], scoreCc: 0, depth: 1, work: 0, source: 'search', engineUsed: 'hard', timeMs: 0, ...partial };
}

/** Records every turn-request option and every per-action allowance, and runs
 * one AI turn from the initial position to completion. */
async function runTurn(difficulty: AIDifficulty, initial: GameState = createInitialGameState()) {
  let real = initial;
  const seen: AIAction[] = [];
  const turnOptions: Array<FindTurnOptions | undefined> = [];
  const turnAllowances: number[] = [];
  const actionAllowances: number[] = [];
  const configured = turnSearch.getMockImplementation();
  turnSearch.mockImplementation((state: GameState, decisionMs: number, options?: FindTurnOptions) => {
    turnOptions.push(options);
    turnAllowances.push(decisionMs);
    return configured!(state, decisionMs, options);
  });
  actionSearch.mockImplementation((_state: GameState, allowance: number) => {
    actionAllowances.push(allowance);
    return { plan: { actions: [END_ACTION], score: 0 }, nodesSearched: 0, timeMs: 0, depth: 0 };
  });
  const { result, unmount } = renderHook(() => useAI({ difficulty, thinkingDelay: 0 }));
  await act(async () => {
    await result.current.executeAITurn(real, action => {
      seen.push(action);
      real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action });
    }, 'white');
  });
  return { hook: result, unmount, state: () => real, seen, turnOptions, turnAllowances, actionAllowances };
}

/** Wall clock the hook reads (`performance.now`), driven by the mocks below so
 * "the measured time of a request that threw" is an exact number. */
let clockMs = 0;

beforeEach(() => {
  resetHardDiag();
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  turnSearch.mockReset();
  actionSearch.mockReset();
  clockMs = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clockMs);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

it('sends no engine field at all when the player opts out, on every difficulty', async () => {
  localStorage.setItem(HARD_AI_STORAGE_KEY, '0');
  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION], engineUsed: 'v2' }));
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const run = await runTurn(difficulty);
    expect(run.turnOptions).toEqual([undefined]);
    run.unmount();
  }
  // Nothing about the hard route was even consulted.
  expect(hardDiag().requests).toBe(0);
});

it('lets ?hardAi=0 opt out even against a stored opt-in', async () => {
  localStorage.setItem(HARD_AI_STORAGE_KEY, '1');
  window.history.replaceState({}, '', `/muju/?${HARD_AI_QUERY_PARAM}=0`);
  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION], engineUsed: 'v2' }));
  const run = await runTurn('hard');
  expect(run.turnOptions).toEqual([undefined]);
  expect(hardDiag()).toMatchObject({ optIn: false, requests: 0 });
  run.unmount();
});

it('sends engine:"hard" for difficulty hard by default, and only for hard', async () => {
  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION], engineUsed: 'v2' }));
  const medium = await runTurn('medium');
  expect(medium.turnOptions).toEqual([undefined]);
  medium.unmount();

  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION] }));
  const hard = await runTurn('hard');
  expect(hard.turnOptions).toEqual([{ engine: 'hard' }]);
  expect(hard.seen).toEqual([END_ACTION]);
  expect(hard.hook.current.error).toBeNull();
  const diag = hardDiag();
  expect(diag).toMatchObject({ requests: 1, hardTurns: 1, plansReplayed: 1, fallbacks: 0 });
  hard.unmount();
});

it('counts a pack error and finishes the turn on the v2 path within the turn remainder', async () => {
  // The engine spent 3 s of the turn's 8 s before giving up.
  turnSearch.mockImplementation(() => turn({ actions: [], source: 'fallback', fallback: 'pack-error', timeMs: 3000 }));
  const run = await runTurn('hard');
  expect(hardDiag()).toMatchObject({ requests: 1, packError: 1, fallbacks: 1, lastFallback: 'packError' });
  // Exactly one hard attempt, then the per-action loop — funded out of the
  // REMAINDER (5,000 ms over the four actions the turn has left), never a
  // fresh budget.
  expect(run.turnAllowances).toEqual([TURN_BUDGET_MS.hard]);
  expect(run.actionAllowances).toEqual([(TURN_BUDGET_MS.hard - 3000) / 4]);
  expect(run.seen).toEqual([END_ACTION]);
  expect(run.state().turn.currentPlayer).toBe('black');
  expect(run.hook.current.error).toBeNull();
  run.unmount();
});

it('counts an engine error the same way and never re-funds the turn', async () => {
  turnSearch.mockImplementation(() => turn({ actions: [], source: 'fallback', fallback: 'engine-error', timeMs: 8000 }));
  const run = await runTurn('hard');
  expect(hardDiag()).toMatchObject({ engineError: 1, fallbacks: 1 });
  // The allowance is GONE — the engine spent all 8 s before failing — so the
  // per-action share is floored at the hook's minimum rather than left at 0.
  // A zero-budget search returns an empty plan, which would silently pass the
  // phase; the floor makes it ask for a legal action, and the floor binding
  // is counted because it means the turn overran its allowance.
  expect(run.actionAllowances).toEqual([MIN_TURN_SEARCH_MS]);
  expect(hardDiag().budgetExhausted).toBe(1);
  expect(run.state().turn.currentPlayer).toBe('black');
  run.unmount();
});

// E0.2's third re-funding hole: a request that THROWS reports no `timeMs`, so
// nothing was subtracted and the per-action loop was handed the whole turn
// budget again — worst of all for the client watchdog, which by construction
// waits longer than the entire allowance before it rejects.
it('charges a failed whole-turn request its measured wall time before falling back', async () => {
  turnSearch.mockImplementation(() => { clockMs += 1500; throw new Error('AI worker timed out. Please retry.'); });
  const run = await runTurn('hard');
  expect(hardDiag()).toMatchObject({ workerError: 1, fallbacks: 1, budgetExhausted: 0 });
  // 8000 − 1500 measured, split over the turn's four remaining decisions —
  // NOT 8000 / 4.
  expect(run.actionAllowances).toEqual([(TURN_BUDGET_MS.hard - 1500) / 4]);
  expect(run.actionAllowances[0]).toBeLessThan(TURN_BUDGET_MS.hard / 4);
  expect(run.state().turn.currentPlayer).toBe('black');
  run.unmount();
});

it('floors, and counts, a per-action share left by a request that threw after the whole allowance', async () => {
  turnSearch.mockImplementation(() => { clockMs += TURN_BUDGET_MS.hard * 2; throw new Error('AI worker timed out. Please retry.'); });
  const run = await runTurn('hard');
  // Overspent twice over: the remainder clamps at 0 and the floor takes over.
  expect(run.actionAllowances).toEqual([MIN_TURN_SEARCH_MS]);
  expect(hardDiag()).toMatchObject({ workerError: 1, budgetExhausted: 1 });
  expect(run.state().turn.currentPlayer).toBe('black');
  run.unmount();
});

it('leaves the opted-out v2 path unfloored and uncounted', async () => {
  // Opted out: the per-action arithmetic is byte for byte what it was, zero
  // share included, and nothing is recorded.
  localStorage.setItem(HARD_AI_STORAGE_KEY, '0');
  turnSearch.mockImplementation(() => { throw new Error('worker rejected the turn request'); });
  const run = await runTurn('hard');
  expect(run.actionAllowances).toEqual([TURN_BUDGET_MS.hard / 4]);
  expect(hardDiag()).toMatchObject({ requests: 0, workerError: 0, budgetExhausted: 0 });
  run.unmount();
});

it('counts an empty hard plan as a failure instead of passing the phase', async () => {
  turnSearch.mockImplementation(() => turn({ actions: [], timeMs: 100 }));
  const run = await runTurn('hard');
  expect(hardDiag()).toMatchObject({ emptyPlan: 1, fallbacks: 1 });
  expect(run.actionAllowances).toHaveLength(1);
  expect(run.state().turn.currentPlayer).toBe('black');
  run.unmount();
});

it('counts an invalid suffix, keeps the legal prefix, and drops the rest of the plan', async () => {
  const initial = createInitialGameState();
  const mover = initial.board.units.find(unit => unit.owner === 'white')!;
  const legalFirst = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }]
    .map((d): AIAction => ({ type: 'MOVE', unitId: mover.id, to: { x: mover.position.x + d.x, y: mover.position.y + d.y } }))
    .find(action => isLegalAction(initial, action))!;
  turnSearch.mockImplementation(() => turn({ actions: [legalFirst, ILLEGAL, END_ACTION], timeMs: 2000 }));
  const run = await runTurn('hard', initial);
  expect(hardDiag()).toMatchObject({ invalidSuffix: 1, fallbacks: 1, plansReplayed: 0 });
  // The prefix before the illegal action stands; everything after it is gone.
  expect(run.seen).toEqual([legalFirst, END_ACTION]);
  expect(run.actionAllowances[0]).toBeLessThan(TURN_BUDGET_MS.hard);
  expect(run.state().turn.currentPlayer).toBe('black');
  expect(run.hook.current.error).toBeNull();
  run.unmount();
});

it('counts a worker failure and still completes the turn legally', async () => {
  turnSearch.mockImplementation(() => { clockMs += 10; throw new Error('AI worker timed out. Please retry.'); });
  const run = await runTurn('hard');
  expect(hardDiag()).toMatchObject({ workerError: 1, fallbacks: 1, lastFallback: 'workerError' });
  expect(run.seen).toEqual([END_ACTION]);
  expect(run.state().turn.currentPlayer).toBe('black');
  expect(run.hook.current.error).toBeNull();
  run.unmount();
});

it('re-reads the route on the next game rather than caching it for the session', async () => {
  localStorage.setItem(HARD_AI_STORAGE_KEY, '0');
  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION], engineUsed: 'v2' }));
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', thinkingDelay: 0 }));
  let real = createInitialGameState();
  const dispatch = (action: AIAction) => { real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action }); };
  await act(async () => { await result.current.executeAITurn(real, dispatch, 'white'); });
  expect(hardDiag().requests).toBe(0);

  // A new game (`cancel` is what every restart/undo/load already runs) drops
  // the opt-out without a reload.
  localStorage.clear();
  act(() => { result.current.cancel(); });
  real = createInitialGameState();
  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION] }));
  await act(async () => { await result.current.executeAITurn(real, dispatch, 'white'); });
  expect(hardDiag().requests).toBe(1);
  unmount();
});

// `?hardMs` — the page-URL override of the Hard seat's whole-turn budget. The
// shipped contract is `TURN_BUDGET_MS.hard` (8000, measured at `wall:8000`);
// this only lets a demo or a measurement run ask for a different one.
it('funds the hard turn from ?hardMs instead of TURN_BUDGET_MS.hard', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=3000`);
  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION] }));
  const run = await runTurn('hard');
  expect(run.turnOptions).toEqual([{ engine: 'hard' }]);
  expect(run.turnAllowances).toEqual([3000]);
  run.unmount();
});

it('clamps ?hardMs before it funds anything', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=5`);
  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION] }));
  const run = await runTurn('hard');
  expect(run.turnAllowances).toEqual([1000]);
  run.unmount();
});

it('ignores ?hardMs on easy and medium', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=3000`);
  turnSearch.mockImplementation(() => turn({ actions: [END_ACTION], engineUsed: 'v2' }));
  for (const difficulty of ['easy', 'medium'] as const) {
    const run = await runTurn(difficulty);
    expect(run.turnAllowances).toEqual([TURN_BUDGET_MS[difficulty]]);
    run.unmount();
  }
});

it('reads ?hardMs once per game, and again after cancel', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=2000`);
  const seenAllowances: number[] = [];
  turnSearch.mockImplementation((_s: GameState, decisionMs: number) => {
    seenAllowances.push(decisionMs);
    return turn({ actions: [END_ACTION], timeMs: 500 });
  });
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', thinkingDelay: 0 }));
  let real = createInitialGameState();
  const dispatch = (action: AIAction) => { real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action }); };
  await act(async () => { await result.current.executeAITurn(real, dispatch, 'white'); });
  expect(seenAllowances).toEqual([2000]);

  // A new game re-reads the URL, which now asks for a different budget.
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=6000`);
  act(() => { result.current.cancel(); });
  real = createInitialGameState();
  await act(async () => { await result.current.executeAITurn(real, dispatch, 'white'); });
  expect(seenAllowances).toEqual([2000, 6000]);
  unmount();
});
