import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import { phaseEndAction } from '../../src/game/legality';
import type { GameState } from '../../src/game/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
import type { FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';

/**
 * THE SAFETY STOP ON WHOLE-TURN SEARCHES WITHIN ONE PHASING TURN.
 *
 * `useAI`'s turn loop runs `while (turn.currentPlayer === playerId)` and
 * re-requests a whole-turn search at every segment boundary. A Phasing turn has
 * three searchable segments, so an ordinary turn is two or three searches — but
 * a plan that replays LEGALLY without ever handing the turn off would spin the
 * tab forever, and `MAX_TURN_SEARCHES` is the only thing that stops it.
 *
 * It used to be spelled `MAX_PREVIEW_TURN_SEARCHES` and was consulted only when
 * the retired `?phasingAi=1` preview marked the turn (`previewPhasing &&
 * ++previewSearches >= …`). Deleting the preview naively would have deleted the
 * whole branch with it, unbounding the loop for every shipped AI turn. This
 * file is the regression: the stop must bind on the ruleset, not on a flag that
 * no longer exists.
 *
 * The first test needs a plan that is legal and never advances the turn, which
 * the real rules cannot produce — so legality/simulation are faked for it, and
 * only for it (`fake.on`). The second test runs the REAL reducer and shows the
 * stop is nowhere near an ordinary turn.
 */
const { turnSearch, fake } = vi.hoisted(() => ({ turnSearch: vi.fn(), fake: { on: false } }));
vi.mock('../../src/ai/worker/client', () => ({
  AIWorkerClient: class {
    warning: string | undefined;
    restart() {} cancel() {}
    async findBestTurn(state: GameState, _d: AIDifficulty, decisionMs: number, _r: number, options?: FindTurnOptions) {
      return turnSearch(state, decisionMs, options) as Promise<FindTurnResult>;
    }
    async findBestAction(state: GameState) {
      return { plan: { actions: [phaseEndAction(state)], score: 0 }, nodesSearched: 0, timeMs: 0, depth: 0 };
    }
  },
  SearchCancelled: class extends Error {},
}));
/** Every proposal replays; the phase end is always `END_PLACE_PHASE`. */
vi.mock('../../src/game/legality', async original => {
  const actual = await original<typeof import('../../src/game/legality')>();
  return { ...actual,
    isLegalAction: (state: GameState, action: AIAction) => fake.on || actual.isLegalAction(state, action),
    phaseEndAction: (state: GameState) => fake.on ? { type: 'END_PLACE_PHASE' } as AIAction : actual.phaseEndAction(state) };
});
/** A NEVER-ENDING TURN: every action but the phase end leaves the same mover in
 * the same phase, on a fresh object so nothing else can short-circuit. */
vi.mock('../../src/ai/simulate', async original => {
  const actual = await original<typeof import('../../src/ai/simulate')>();
  return { ...actual, applyAction: (state: GameState, action: AIAction) => {
    if (!fake.on) return actual.applyAction(state, action);
    return action.type === 'END_PLACE_PHASE'
      ? { ...state, turn: { ...state.turn, currentPlayer: 'black' as const } }
      : { ...state, turn: { ...state.turn } };
  } };
});
import { useAI, MAX_TURN_SEARCHES } from '../../src/hooks/useAI';

const NEVER_ENDS: AIAction = { type: 'MOVE', unitId: 'spins-forever', to: { x: 0, y: 0 } };

beforeEach(() => {
  fake.on = false;
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  turnSearch.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { fake.on = false; cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it('stops a Phasing turn after exactly MAX_TURN_SEARCHES searches and then ends it legally', async () => {
  fake.on = true;
  turnSearch.mockImplementation(() => ({ actions: [NEVER_ENDS], scoreCc: 0, depth: 1, work: 0,
    source: 'search', engineUsed: 'v2', timeMs: 0 } as unknown as FindTurnResult));
  const dispatched: AIAction[] = [];
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'medium', thinkingDelay: 0 }));
  await act(async () => {
    await result.current.executeAITurn(createInitialGameState(undefined, 4, 0, 'phasing'),
      action => { dispatched.push(action); }, 'white');
  });
  // Exactly the bound — not one search more, whatever the engine keeps proposing.
  expect(turnSearch).toHaveBeenCalledTimes(MAX_TURN_SEARCHES);
  expect(MAX_TURN_SEARCHES).toBe(64);
  // …and the turn is finished with `phaseEndAction`, not abandoned mid-turn.
  expect(dispatched).toHaveLength(MAX_TURN_SEARCHES + 1);
  expect(dispatched.at(-1)).toEqual({ type: 'END_PLACE_PHASE' });
  expect(dispatched.slice(0, -1).every(a => a === NEVER_ENDS)).toBe(true);
  expect(result.current.error).toBeNull();
  unmount();
});

it('never approaches the bound in an ordinary Phasing turn', async () => {
  let real = createInitialGameState(undefined, 4, 0, 'phasing');
  turnSearch.mockImplementation((state: GameState) => ({ actions: [phaseEndAction(state)], scoreCc: 0,
    depth: 1, work: 0, source: 'search', engineUsed: 'v2', timeMs: 0 } as unknown as FindTurnResult));
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'medium', thinkingDelay: 0 }));
  await act(async () => {
    await result.current.executeAITurn(real, (action: AIAction) => {
      real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action });
    }, 'white');
  });
  // Act and Prepare: two searches, sixty-two short of the stop.
  expect(turnSearch).toHaveBeenCalledTimes(2);
  expect(result.current.lastTurnActions.map(a => a.type)).toEqual(['END_ACTION_PHASE', 'END_PLACE_PHASE']);
  expect(real.turn.currentPlayer).toBe('black');
  unmount();
});
