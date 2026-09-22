import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import { isLegalAction, phaseEndAction } from '../../src/game/legality';
import { HARD_AI_LOG_PREFIX, hardDiag, resetHardDiag } from '../../src/ai/hardOptIn';
import type { GameState } from '../../src/game/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
import type { FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';

/**
 * THE THREE FALLBACKS THAT USED TO BE SILENT.
 *
 * `hardOptIn.ts` promises that "an engine failure is counted and diagnosable
 * even if the player gets a graceful fallback". Before 2026-09-21 that was
 * three fifths true: `emptyPlan` and `invalidSuffix` were counted and logged
 * but raised no banner (the `setWarning` above them had already run for this
 * search and cleared it), and `budgetExhausted` was counted with no log at all.
 * With Phasing the only ruleset, these are the failures a player actually meets,
 * so each one now leaves a trace the player or a bug report can see.
 *
 * The banner is asserted WHILE THE FALLBACK IS RUNNING: the per-action loop
 * re-reads `client.warning` at its first decision and clears it there, exactly
 * as it always has for a pack error.
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

const phasing = () => createInitialGameState(undefined, 4, 0, 'phasing');
const ILLEGAL: AIAction = { type: 'MOVE', unitId: '__does-not-exist__', to: { x: 0, y: 0 } };

/** The per-action fallback: its FIRST search stays in flight until released, so
 * the banner can be read at the moment the fallback raised it. */
function pendingFirstFallback() {
  let release!: () => void;
  let calls = 0;
  actionSearch.mockImplementation((state: GameState) => {
    const value = { plan: { actions: [phaseEndAction(state)], score: 0 }, nodesSearched: 0, timeMs: 0, depth: 0 };
    if (++calls > 1) return value;
    return new Promise(resolve => { release = () => resolve(value); });
  });
  return () => release();
}

let clockMs = 0;
beforeEach(() => {
  resetHardDiag();
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  turnSearch.mockReset(); actionSearch.mockReset();
  clockMs = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clockMs);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it('raises a banner when the hard engine proposes nothing at all', async () => {
  turnSearch.mockImplementation(() => ({ actions: [], scoreCc: 0, depth: 1, work: 0,
    source: 'search', engineUsed: 'hard', timeMs: 100 } as unknown as FindTurnResult));
  const release = pendingFirstFallback();
  let real = phasing();
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', thinkingDelay: 0 }));
  let turn!: Promise<void>;
  await act(async () => {
    turn = result.current.executeAITurn(real, action => {
      real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action });
    }, 'white');
  });
  await waitFor(() => expect(result.current.warning).toBe('AI engine fell back (empty plan).'));
  expect(hardDiag()).toMatchObject({ emptyPlan: 1, fallbacks: 1, lastFallback: 'emptyPlan' });
  await act(async () => { release(); await turn; });
  expect(real.turn.currentPlayer).toBe('black');
  expect(result.current.error).toBeNull();
  unmount();
});

it('raises a banner when an action inside the plan is refused by the rules', async () => {
  const initial = phasing();
  const mover = initial.board.units.find(unit => unit.owner === 'white')!;
  const legalFirst = [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }]
    .map((d): AIAction => ({ type: 'MOVE', unitId: mover.id, to: { x: mover.position.x + d.x, y: mover.position.y + d.y } }))
    .find(action => isLegalAction(initial, action))!;
  turnSearch.mockImplementation(() => ({ actions: [legalFirst, ILLEGAL, { type: 'END_ACTION_PHASE' }],
    scoreCc: 0, depth: 1, work: 0, source: 'search', engineUsed: 'hard', timeMs: 100 } as unknown as FindTurnResult));
  const release = pendingFirstFallback();
  let real = initial;
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', thinkingDelay: 0 }));
  let turn!: Promise<void>;
  await act(async () => {
    turn = result.current.executeAITurn(real, action => {
      real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action });
    }, 'white');
  });
  await waitFor(() => expect(result.current.warning).toBe('AI engine fell back (invalid plan suffix).'));
  expect(hardDiag()).toMatchObject({ invalidSuffix: 1, fallbacks: 1, plansReplayed: 0 });
  await act(async () => { release(); await turn; });
  // The legal prefix stands; the rest of the plan is gone.
  expect(result.current.lastTurnActions[0]).toEqual(legalFirst);
  expect(result.current.lastTurnActions).not.toContainEqual(ILLEGAL);
  expect(real.turn.currentPlayer).toBe('black');
  unmount();
});

it('logs ONE [hard-ai] line per turn that overruns its whole allowance', async () => {
  // The engine reports having spent more than the turn was funded with, so the
  // per-action share is floored at `MIN_TURN_SEARCH_MS` — the one fallback kind
  // that used to leave no trace anywhere.
  //
  // COUNTED PER DECISION, LOGGED ONCE PER TURN (2026-09-21). Under Phasing
  // `fallbackDecisionsRemaining` is `actionsRemaining + 3`, so an overrunning
  // opening turn floors up to seven decisions; logging each one put seven
  // byte-identical lines in the console every turn for the rest of the game,
  // which is how a real signal becomes unreadable. The counter still takes all
  // of them — `e2e/hard-ai.spec.ts` reads the total — and the line says the one
  // thing that is true of the whole turn.
  const exhausted = () => vi.mocked(console.warn).mock.calls.map(call => String(call[0]))
    .filter(line => line.startsWith(`${HARD_AI_LOG_PREFIX} turn budget exhausted`));
  turnSearch.mockImplementation((_s: GameState, decisionMs: number) => ({ actions: [], source: 'fallback',
    fallback: 'engine-error', scoreCc: 0, depth: 1, work: 0, engineUsed: 'hard',
    timeMs: decisionMs * 2 } as unknown as FindTurnResult));
  actionSearch.mockImplementation((state: GameState) => ({ plan: { actions: [phaseEndAction(state)], score: 0 },
    nodesSearched: 0, timeMs: 0, depth: 0 }));
  let real = phasing();
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', thinkingDelay: 0 }));
  await act(async () => {
    await result.current.executeAITurn(real, action => {
      real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action });
    }, 'white');
  });
  expect(hardDiag().budgetExhausted).toBeGreaterThan(1);
  expect(exhausted()).toHaveLength(1);
  expect(exhausted()[0]).toContain('overran its allowance');
  expect(exhausted()[0]).toContain('logged once per turn');
  expect(real.turn.currentPlayer).toBe('black');

  // PER TURN, not per game: the next overrunning turn says so again.
  const spentOnTurnOne = hardDiag().budgetExhausted;
  let second = phasing();
  await act(async () => {
    await result.current.executeAITurn(second, action => {
      second = gameReducer(second, { type: 'APPLY_AI_ACTION', aiAction: action });
    }, 'white');
  });
  expect(hardDiag().budgetExhausted).toBeGreaterThan(spentOnTurnOne);
  expect(exhausted()).toHaveLength(2);
  unmount();
});
