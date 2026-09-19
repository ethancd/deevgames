import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import { phaseEndAction } from '../../src/game/legality';
import { AI_PACES, AI_TURN_SECONDS, aiTurnBudgetMs, type AIPace } from '../../src/ai/turnTime';
import { PREPARE_RESERVE_DIVISOR } from '../../src/ai/turnFunding';
import { PHASING_AI_STORAGE_KEY } from '../../src/ai/phasingPreview';
import type { GameState, PlayerId } from '../../src/game/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
import type { FindActionOptions, FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';

/**
 * ONE ALLOWANCE PER TURN, ACROSS A WHOLE PHASING TURN.
 *
 * A Phasing turn is Act → END_ACTION_PHASE (mine, then upkeep) → Prepare →
 * END_PLACE_PHASE, all under the same mover — so `useAI`'s turn loop, which
 * runs `while (turn.currentPlayer === playerId)`, searches it two or three
 * times and MUST fund all of those searches out of the single allowance the
 * pace bought (`src/ai/turnFunding.ts`).
 *
 * WHAT WENT WRONG BEFORE. The loop asked for the whole remainder at every
 * segment boundary, and the remainder is debited by MEASURED SEARCH TIME. A
 * greedy Act search that used its whole request therefore left Prepare on the
 * `MIN_TURN_SEARCH_MS` floor — an unfunded promotion/summon decision — while a
 * cheap one left the remainder nearly full and re-funded Prepare with what
 * looked like a second whole turn (an independent review recorded a turn
 * requesting `[3000, 3000]`). The per-action fallback had the same shape: it
 * divided the remainder by the ACT actions alone, so nothing was left over for
 * the upkeep decision or Prepare.
 *
 * The engines are mocked here. What is under test is the allowance reaching
 * them, the phases it is split across, and the single dial spanning the turn.
 */
const { turnSearch, actionSearch } = vi.hoisted(() => ({ turnSearch: vi.fn(), actionSearch: vi.fn() }));
vi.mock('../../src/ai/worker/client', () => ({
  AIWorkerClient: class {
    warning: string | undefined;
    restart() {} cancel() {}
    async findBestTurn(state: GameState, _d: AIDifficulty, decisionMs: number, _r: number, options?: FindTurnOptions) {
      return turnSearch(state, decisionMs, options) as Promise<FindTurnResult>;
    }
    async findBestAction(state: GameState, _d: AIDifficulty, decisionMs: number, _r: number, options?: FindActionOptions) {
      return actionSearch(state, decisionMs, options);
    }
  },
  SearchCancelled: class extends Error {},
}));
import { useAI, MIN_TURN_SEARCH_MS } from '../../src/hooks/useAI';

/** One recorded search: where in the turn it happened and what it was funded with. */
interface Search {
  phase: 'action' | 'upkeep' | 'prepare';
  decisionMs: number;
  preview: boolean | undefined;
}

const segmentOf = (state: GameState): Search['phase'] =>
  state.upkeepPending ? 'upkeep' : state.turn.phase === 'action' ? 'action' : 'prepare';

interface RunOptions {
  difficulty?: AIDifficulty;
  pace?: AIPace;
  initial?: GameState;
  player?: PlayerId;
  /** What each search reports having spent. Default: nothing at all. */
  spend?: (decisionMs: number) => number;
}

/** Plays one whole AI turn through the REAL reducer and reports every search.
 * The mocked engine always proposes the canonical phase-ending action for
 * wherever the turn currently is, which is a legal, complete Phasing turn. */
async function runTurn({ difficulty = 'medium', pace, initial, player = 'white', spend = () => 0 }: RunOptions = {}) {
  let real = initial ?? createInitialGameState(undefined, 4, 0, 'phasing');
  const searches: Search[] = [];
  turnSearch.mockImplementation((state: GameState, decisionMs: number, options?: FindTurnOptions) => {
    searches.push({ phase: segmentOf(state), decisionMs, preview: options?.phasingPreview });
    return { actions: [phaseEndAction(state)], scoreCc: 0, depth: 1, work: 0, source: 'search',
      engineUsed: 'v2', timeMs: spend(decisionMs) } as unknown as FindTurnResult;
  });
  const { result, unmount } = renderHook(() => useAI({ difficulty, pace, thinkingDelay: 0 }));
  await act(async () => {
    await result.current.executeAITurn(real, (action: AIAction) => {
      real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action });
    }, player);
  });
  unmount();
  return { searches, final: real, actions: result.current.lastTurnActions };
}

/** The floor each later segment of the turn keeps for itself. */
const eighth = (budgetMs: number) => Math.floor(budgetMs / PREPARE_RESERVE_DIVISOR);

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  turnSearch.mockReset(); actionSearch.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it('plays a complete Phasing turn out of one allowance, at every pace', async () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (const pace of AI_PACES) {
      const budget = aiTurnBudgetMs(difficulty, pace);
      const { searches, final, actions } = await runTurn({ difficulty, pace });
      // Act and Prepare — the turn's upkeep is affordable on the opening
      // position, so the reducer settles it without a decision to search.
      expect([difficulty, pace, searches.map(s => s.phase)]).toEqual([difficulty, pace, ['action', 'prepare']]);
      // Act may not touch the floor reserved for the upkeep decision and
      // Prepare; Prepare, the LAST segment, asks for the whole remainder so
      // nothing is stranded. (Nothing was spent here, so the remainder is the
      // whole budget: the allowance is SEARCH time, and these searches were free.)
      expect(searches.map(s => s.decisionMs)).toEqual([budget - 2 * eighth(budget), budget]);
      expect(actions.map(a => a.type)).toEqual(['END_ACTION_PHASE', 'END_PLACE_PHASE']);
      expect(final.turn.currentPlayer).toBe('black');
    }
  }
});

it('funds the upkeep decision as a third segment of the same turn', async () => {
  // Upkeep review makes the payment an explicit decision rather than an
  // automatic settlement, which is the three-segment shape of a Phasing turn.
  const initial = createInitialGameState(undefined, 4, 0, 'phasing');
  const budget = aiTurnBudgetMs('medium', 'normal');
  const { searches, final, actions } = await runTurn({
    difficulty: 'medium', pace: 'normal',
    initial: { ...initial, reviewUpkeep: { white: true } },
  });
  expect(searches.map(s => s.phase)).toEqual(['action', 'upkeep', 'prepare']);
  expect(searches.map(s => s.decisionMs)).toEqual([budget - 2 * eighth(budget), budget - eighth(budget), budget]);
  expect(actions.map(a => a.type)).toEqual(['END_ACTION_PHASE', 'PAY_UPKEEP', 'END_PLACE_PHASE']);
  expect(final.upkeepPending).toBe(false);
  expect(final.turn.currentPlayer).toBe('black');
});

/**
 * THE PROPERTY THAT ACTUALLY MATTERS: a turn cannot outspend its clock, and
 * Prepare cannot be starved by a greedy Act. Here every search spends its whole
 * request, which is the worst case for both.
 */
it('never outspends the turn allowance, and still funds Prepare, when every search spends all of it', async () => {
  const initial = createInitialGameState(undefined, 4, 0, 'phasing');
  for (const [difficulty, pace] of [['easy', 'quick'], ['medium', 'normal'], ['hard', 'deep']] as const) {
    const budget = aiTurnBudgetMs(difficulty, pace);
    const { searches } = await runTurn({ difficulty, pace, spend: ms => ms,
      initial: { ...initial, reviewUpkeep: { white: true } } });
    const total = searches.reduce((sum, s) => sum + s.decisionMs, 0);
    expect([difficulty, pace, total]).toEqual([difficulty, pace, budget]);
    // Every segment, including the last, got real time rather than the
    // `MIN_TURN_SEARCH_MS` floor a starved turn would fall back to.
    for (const search of searches) expect(search.decisionMs).toBeGreaterThan(MIN_TURN_SEARCH_MS);
    expect(searches.at(-1)!.phase).toBe('prepare');
  }
});

it('keeps ONE dial for the whole Phasing turn, spanning both phase boundaries', async () => {
  const budget = AI_TURN_SECONDS.hard.normal * 1000;
  let real: GameState = { ...createInitialGameState(undefined, 4, 0, 'phasing'), reviewUpkeep: { white: true } };
  const seen: GameState[] = [];
  const release: Array<(result: FindTurnResult) => void> = [];
  turnSearch.mockImplementation((state: GameState) => {
    seen.push(state);
    return new Promise<FindTurnResult>(resolve => release.push(resolve));
  });
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', pace: 'normal', thinkingDelay: 0 }));
  let turn!: Promise<void>;
  await act(async () => {
    turn = result.current.executeAITurn(real, action => { real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action }); }, 'white');
  });

  // Segment 1, Act: the dial is funded with the whole turn and running.
  expect(result.current.turnBudgetMs).toBe(budget);
  expect(result.current.turnSpentMs).toBe(0);
  expect(typeof result.current.turnSearchingSince).toBe('number');

  // Three segments, each spending 2500 ms of the SAME allowance. The budget is
  // never re-funded at a phase boundary and the debit only ever rises.
  const segments: Array<'action' | 'upkeep' | 'prepare'> = [];
  for (const spentSoFar of [2500, 5000, 7500]) {
    const index = release.length - 1;
    segments.push(segmentOf(seen[index]));
    await act(async () => {
      release[index]({ actions: [phaseEndAction(seen[index])], scoreCc: 0, depth: 1, work: 0,
        source: 'search', engineUsed: 'v2', timeMs: 2500 } as unknown as FindTurnResult);
    });
    if (spentSoFar < 7500) {
      expect(result.current.turnBudgetMs).toBe(budget);
      expect(result.current.turnSpentMs).toBe(spentSoFar);
      // The NEXT segment's search is already in flight on the same dial — one
      // stopwatch, handed straight across the phase boundary.
      expect(typeof result.current.turnSearchingSince).toBe('number');
    }
  }
  expect(segments).toEqual(['action', 'upkeep', 'prepare']);

  await act(async () => { await turn; });
  // The turn is over, so the dial goes with it — exactly once, at the hand-off.
  expect(real.turn.currentPlayer).toBe('black');
  expect(result.current.turnBudgetMs).toBeNull();
  expect(result.current.turnSpentMs).toBeNull();
  unmount();
});

/* ------------------------------------------------------------------ *
 * STANDARD IS UNCHANGED.
 * ------------------------------------------------------------------ */

it('funds a Standard turn exactly as before: the whole remainder, no reserve', async () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (const pace of AI_PACES) {
      const budget = aiTurnBudgetMs(difficulty, pace);
      const { searches } = await runTurn({ difficulty, pace, initial: createInitialGameState() });
      expect([difficulty, pace, searches.map(s => s.decisionMs)]).toEqual([difficulty, pace, [budget]]);
    }
  }
});

it('gives a Standard turn that needs a second search the entire remainder', async () => {
  // A Standard turn opening in the PLACE phase also spans two phases, and its
  // second search must still be funded with everything the turn has left —
  // there is no Phasing reserve to withhold.
  const initial = createInitialGameState();
  const place: GameState = { ...initial, turn: { ...initial.turn, phase: 'place' } };
  const budget = aiTurnBudgetMs('medium', 'normal');
  const { searches, actions } = await runTurn({ difficulty: 'medium', pace: 'normal', initial: place, spend: () => 1000 });
  expect(actions.map(a => a.type)).toEqual(['END_PLACE_PHASE', 'END_ACTION_PHASE']);
  expect(searches.map(s => s.decisionMs)).toEqual([budget, budget - 1000]);
});

/* ------------------------------------------------------------------ *
 * THE PREVIEW MARKER.
 * ------------------------------------------------------------------ */

it('marks a Phasing request only with the opt-in, and never marks a Standard one', async () => {
  // Off (the default): the request goes out unmarked, and the real worker
  // refuses it exactly as it always did.
  expect((await runTurn({})).searches.map(s => s.preview)).toEqual([undefined, undefined]);

  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  expect((await runTurn({})).searches.map(s => s.preview)).toEqual([true, true]);
  // The opt-in says nothing about Standard, which never carries a marker.
  expect((await runTurn({ initial: createInitialGameState() })).searches.map(s => s.preview)).toEqual([undefined]);
});

it('carries the marker onto the per-action fallback path as well', async () => {
  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  let real = createInitialGameState(undefined, 4, 0, 'phasing');
  const fallbackCalls: Array<{ decisionMs: number; preview: boolean | undefined; segment: string }> = [];
  // The whole-turn search proposes something the canonical rules refuse, which
  // is what drops the rest of the turn onto the per-action loop.
  turnSearch.mockImplementation(() => ({ actions: [{ type: 'MOVE', unitId: 'no-such-unit', to: { x: 0, y: 0 } }],
    scoreCc: 0, depth: 1, work: 0, source: 'search', engineUsed: 'v2', timeMs: 0 } as unknown as FindTurnResult));
  actionSearch.mockImplementation((state: GameState, decisionMs: number, options?: FindActionOptions) => {
    fallbackCalls.push({ decisionMs, preview: options?.phasingPreview, segment: segmentOf(state) });
    return { plan: { actions: [phaseEndAction(state)], score: 0 }, nodesSearched: 0, timeMs: 0, depth: 1 };
  });
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'medium', pace: 'quick', thinkingDelay: 0 }));
  await act(async () => {
    await result.current.executeAITurn(real, action => { real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action }); }, 'white');
  });
  unmount();
  expect(fallbackCalls.length).toBeGreaterThan(0);
  for (const call of fallbackCalls) expect(call.preview).toBe(true);
  // Act's share is one of `actionsRemaining + 3` decisions, not one of four
  // Act actions: the upkeep decision and Prepare are counted too, so the turn
  // cannot hand its whole remainder out before it reaches them.
  // The opening Act position has 4 actions left, so the share is one seventh
  // (4 + the upkeep decision, Prepare and the end of Act), not one quarter.
  const budget = aiTurnBudgetMs('medium', 'quick');
  expect(fallbackCalls[0].segment).toBe('action');
  expect(fallbackCalls[0].decisionMs).toBe(budget / 7);
  expect(fallbackCalls.at(-1)!.segment).toBe('prepare');
  expect(real.turn.currentPlayer).toBe('black');
});
