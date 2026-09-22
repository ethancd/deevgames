import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import { aiTurnBudgetMs } from '../../src/ai/turnTime';
/** What the hook funds a turn with now: the seat's PACE, not `engine-v2`'s
 * pre-pace `TURN_BUDGET_MS`. These tests drive `useAI` without a pace, so
 * every allowance below is the default `quick` one (`ai/turnTime.ts`). */
const QUICK_TURN_MS: Record<AIDifficulty, number> = { easy: aiTurnBudgetMs('easy'), medium: aiTurnBudgetMs('medium'), hard: aiTurnBudgetMs('hard') };
import { MIN_TURN_SEARCH_MS } from '../../src/hooks/useAI';
import type { GameState } from '../../src/game/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
import type { FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';
import { isLegalAction, phaseEndAction } from '../../src/game/legality';
import { PREPARE_RESERVE_DIVISOR } from '../../src/ai/turnFunding';
import { HARD_AI_MS_QUERY_PARAM, HARD_AI_QUERY_PARAM, HARD_AI_STORAGE_KEY, hardDiag, resetHardDiag } from '../../src/ai/hardOptIn';

/**
 * The hook side of the Hard route: the gate (now `hardEnabled`-on by default,
 * with the opt-out winning), the `?hardMs` budget override, and the accounting
 * of the three ways a Hard turn can fail (pack/engine error, invalid suffix or
 * empty plan, worker failure). Every one of them must be COUNTED, must drop the
 * rest of the plan, and must finish the turn legally on the v2 path out of what
 * the turn has LEFT — never a fresh `QUICK_TURN_MS`.
 *
 * The worker client is mocked: this is about the hook's decisions, not about
 * a real search (`tests/ai/worker-turn.test.ts` pins the worker route).
 *
 * EVERY TURN HERE IS A PHASING TURN, because since 2026-09-21 there is no other
 * kind. That changes the arithmetic these tests pin, and the change is the
 * point: one turn spans Act → (upkeep) → Prepare, so the whole-turn path
 * searches it twice out of one allowance (`firstSearch` below reserves an
 * eighth for each later segment), and the per-action fallback divides what is
 * left by the decisions still to come — seven in the opening Act (four actions
 * plus the end of Act, the upkeep decision and Prepare), two in Prepare.
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

/** The engine proposes the canonical end of whatever segment it is asked about,
 * which is a legal, complete Phasing turn across two searches. */
function plansPhaseEnd(partial: Partial<FindTurnResult> = {}): void {
  turnSearch.mockImplementation((state: GameState) => turn({ actions: [phaseEndAction(state)], ...partial }));
}

/** What the FIRST search of a Phasing turn is funded with: the whole allowance
 * less the eighth reserved for the upkeep decision and the eighth for Prepare. */
const firstSearch = (budget: number) => budget - 2 * Math.floor(budget / PREPARE_RESERVE_DIVISOR);
/** The two per-action shares of a fallback that starts in the opening Act. */
const fallbackShares = (remaining: number) => [remaining / 7, remaining / 2];

/** Records every turn-request option and every per-action allowance, and runs
 * one AI turn from the initial position to completion. */
async function runTurn(difficulty: AIDifficulty, initial: GameState = createInitialGameState(undefined, 4, 0, 'phasing')) {
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
  actionSearch.mockImplementation((state: GameState, allowance: number) => {
    actionAllowances.push(allowance);
    return { plan: { actions: [phaseEndAction(state)], score: 0 }, nodesSearched: 0, timeMs: 0, depth: 0 };
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
  plansPhaseEnd({ engineUsed: 'v2' });
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const run = await runTurn(difficulty);
    expect(run.turnOptions).toEqual([undefined, undefined]);
    run.unmount();
  }
  // Nothing about the hard route was even consulted.
  expect(hardDiag().requests).toBe(0);
});

it('lets ?hardAi=0 opt out even against a stored opt-in', async () => {
  localStorage.setItem(HARD_AI_STORAGE_KEY, '1');
  window.history.replaceState({}, '', `/muju/?${HARD_AI_QUERY_PARAM}=0`);
  plansPhaseEnd({ engineUsed: 'v2' });
  const run = await runTurn('hard');
  expect(run.turnOptions).toEqual([undefined, undefined]);
  expect(hardDiag()).toMatchObject({ optIn: false, requests: 0 });
  run.unmount();
});

it('sends engine:"hard" for difficulty hard by default, and only for hard', async () => {
  plansPhaseEnd({ engineUsed: 'v2' });
  const medium = await runTurn('medium');
  expect(medium.turnOptions).toEqual([undefined, undefined]);
  medium.unmount();

  plansPhaseEnd();
  const hard = await runTurn('hard');
  // Two segments of ONE turn, each its own request, both on the hard route.
  expect(hard.turnOptions).toEqual([{ engine: 'hard' }, { engine: 'hard' }]);
  expect(hard.seen).toEqual([END_ACTION, { type: 'END_PLACE_PHASE' }]);
  expect(hard.hook.current.error).toBeNull();
  const diag = hardDiag();
  expect(diag).toMatchObject({ requests: 2, hardTurns: 2, plansReplayed: 2, fallbacks: 0 });
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
  expect(run.turnAllowances).toEqual([firstSearch(QUICK_TURN_MS.hard)]);
  expect(run.actionAllowances).toEqual(fallbackShares(QUICK_TURN_MS.hard - 3000));
  expect(run.seen).toEqual([END_ACTION, { type: 'END_PLACE_PHASE' }]);
  expect(run.state().turn.currentPlayer).toBe('black');
  expect(run.hook.current.error).toBeNull();
  run.unmount();
});

it('counts an engine error the same way and never re-funds the turn', async () => {
  turnSearch.mockImplementation(() => turn({ actions: [], source: 'fallback', fallback: 'engine-error', timeMs: QUICK_TURN_MS.hard }));
  const run = await runTurn('hard');
  expect(hardDiag()).toMatchObject({ engineError: 1, fallbacks: 1 });
  // The allowance is GONE — the engine spent the whole turn clock before it
  // failed — so the share is floored at the hook's minimum rather than left at 0.
  // A zero-budget search returns an empty plan, which would silently pass the
  // phase; the floor makes it ask for a legal action, and the floor binding
  // is counted because it means the turn overran its allowance.
  expect(run.actionAllowances).toEqual([MIN_TURN_SEARCH_MS, MIN_TURN_SEARCH_MS]);
  expect(hardDiag().budgetExhausted).toBe(2);
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
  // The allowance less the 1500 ms measured, split over the decisions the turn
  // has left — NOT the whole allowance again.
  expect(run.actionAllowances).toEqual(fallbackShares(QUICK_TURN_MS.hard - 1500));
  expect(run.actionAllowances[0]).toBeLessThan(QUICK_TURN_MS.hard / 7);
  expect(run.state().turn.currentPlayer).toBe('black');
  run.unmount();
});

it('floors, and counts, a per-action share left by a request that threw after the whole allowance', async () => {
  turnSearch.mockImplementation(() => { clockMs += QUICK_TURN_MS.hard * 2; throw new Error('AI worker timed out. Please retry.'); });
  const run = await runTurn('hard');
  // Overspent twice over: the remainder clamps at 0 and the floor takes over.
  expect(run.actionAllowances).toEqual([MIN_TURN_SEARCH_MS, MIN_TURN_SEARCH_MS]);
  expect(hardDiag()).toMatchObject({ workerError: 1, budgetExhausted: 2 });
  expect(run.state().turn.currentPlayer).toBe('black');
  run.unmount();
});

it('leaves the opted-out v2 path unfloored and uncounted', async () => {
  // Opted out: the per-action arithmetic is byte for byte what it was, zero
  // share included, and nothing is recorded.
  localStorage.setItem(HARD_AI_STORAGE_KEY, '0');
  turnSearch.mockImplementation(() => { throw new Error('worker rejected the turn request'); });
  const run = await runTurn('hard');
  expect(run.actionAllowances).toEqual(fallbackShares(QUICK_TURN_MS.hard));
  expect(hardDiag()).toMatchObject({ requests: 0, workerError: 0, budgetExhausted: 0 });
  run.unmount();
});

it('counts an empty hard plan as a failure instead of passing the phase', async () => {
  turnSearch.mockImplementation(() => turn({ actions: [], timeMs: 100 }));
  const run = await runTurn('hard');
  expect(hardDiag()).toMatchObject({ emptyPlan: 1, fallbacks: 1 });
  expect(run.actionAllowances).toHaveLength(2);
  expect(run.state().turn.currentPlayer).toBe('black');
  run.unmount();
});

it('counts an invalid suffix, keeps the legal prefix, and drops the rest of the plan', async () => {
  const initial = createInitialGameState(undefined, 4, 0, 'phasing');
  const mover = initial.board.units.find(unit => unit.owner === 'white')!;
  const legalFirst = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }]
    .map((d): AIAction => ({ type: 'MOVE', unitId: mover.id, to: { x: mover.position.x + d.x, y: mover.position.y + d.y } }))
    .find(action => isLegalAction(initial, action))!;
  turnSearch.mockImplementation(() => turn({ actions: [legalFirst, ILLEGAL, END_ACTION], timeMs: 2000 }));
  const run = await runTurn('hard', initial);
  expect(hardDiag()).toMatchObject({ invalidSuffix: 1, fallbacks: 1, plansReplayed: 0 });
  // The prefix before the illegal action stands; everything after it is gone.
  expect(run.seen).toEqual([legalFirst, END_ACTION, { type: 'END_PLACE_PHASE' }]);
  expect(run.actionAllowances[0]).toBeLessThan(QUICK_TURN_MS.hard);
  expect(run.state().turn.currentPlayer).toBe('black');
  expect(run.hook.current.error).toBeNull();
  run.unmount();
});

it('counts a worker failure and still completes the turn legally', async () => {
  turnSearch.mockImplementation(() => { clockMs += 10; throw new Error('AI worker timed out. Please retry.'); });
  const run = await runTurn('hard');
  expect(hardDiag()).toMatchObject({ workerError: 1, fallbacks: 1, lastFallback: 'workerError' });
  expect(run.seen).toEqual([END_ACTION, { type: 'END_PLACE_PHASE' }]);
  expect(run.state().turn.currentPlayer).toBe('black');
  expect(run.hook.current.error).toBeNull();
  run.unmount();
});

it('re-reads the route on the next game rather than caching it for the session', async () => {
  localStorage.setItem(HARD_AI_STORAGE_KEY, '0');
  plansPhaseEnd({ engineUsed: 'v2' });
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', thinkingDelay: 0 }));
  let real = createInitialGameState(undefined, 4, 0, 'phasing');
  const dispatch = (action: AIAction) => { real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action }); };
  await act(async () => { await result.current.executeAITurn(real, dispatch, 'white'); });
  expect(hardDiag().requests).toBe(0);

  // A new game (`cancel` is what every restart/undo/load already runs) drops
  // the opt-out without a reload.
  localStorage.clear();
  act(() => { result.current.cancel(); });
  real = createInitialGameState(undefined, 4, 0, 'phasing');
  plansPhaseEnd();
  await act(async () => { await result.current.executeAITurn(real, dispatch, 'white'); });
  // One turn, two segments, two requests.
  expect(hardDiag().requests).toBe(2);
  unmount();
});

// `?hardMs` — the page-URL override of the Hard seat's whole-turn budget. The
// shipped contract is the hard seat's paced allowance (`quick` = 10 s; the
// 8000 ms measured at `wall:8000` was the pre-pace budget);
// this only lets a demo or a measurement run ask for a different one.
it('funds the hard turn from ?hardMs instead of QUICK_TURN_MS.hard', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=3000`);
  plansPhaseEnd();
  const run = await runTurn('hard');
  expect(run.turnOptions).toEqual([{ engine: 'hard' }, { engine: 'hard' }]);
  expect(run.turnAllowances).toEqual([firstSearch(3000), 3000]);
  run.unmount();
});

it('clamps ?hardMs before it funds anything', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=5`);
  plansPhaseEnd();
  const run = await runTurn('hard');
  expect(run.turnAllowances).toEqual([firstSearch(1000), 1000]);
  run.unmount();
});

it('ignores ?hardMs on easy and medium', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=3000`);
  plansPhaseEnd({ engineUsed: 'v2' });
  for (const difficulty of ['easy', 'medium'] as const) {
    const run = await runTurn(difficulty);
    expect(run.turnAllowances).toEqual([firstSearch(QUICK_TURN_MS[difficulty]), QUICK_TURN_MS[difficulty]]);
    run.unmount();
  }
});

it('reads ?hardMs once per game, and again after cancel', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=2000`);
  const seenAllowances: number[] = [];
  turnSearch.mockImplementation((state: GameState, decisionMs: number) => {
    seenAllowances.push(decisionMs);
    return turn({ actions: [phaseEndAction(state)], timeMs: 500 });
  });
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', thinkingDelay: 0 }));
  let real = createInitialGameState(undefined, 4, 0, 'phasing');
  const dispatch = (action: AIAction) => { real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action }); };
  await act(async () => { await result.current.executeAITurn(real, dispatch, 'white'); });
  // The turn's two searches, both funded from the `?hardMs` allowance: Act less
  // the two reserved eighths, then Prepare with what the 500 ms left of it.
  expect(seenAllowances).toEqual([firstSearch(2000), 2000 - 500]);

  // A new game re-reads the URL, which now asks for a different budget.
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=6000`);
  act(() => { result.current.cancel(); });
  real = createInitialGameState(undefined, 4, 0, 'phasing');
  await act(async () => { await result.current.executeAITurn(real, dispatch, 'white'); });
  expect(seenAllowances).toEqual([firstSearch(2000), 1500, firstSearch(6000), 6000 - 500]);
  unmount();
});
