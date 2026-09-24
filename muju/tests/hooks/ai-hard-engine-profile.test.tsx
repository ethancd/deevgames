/**
 * THE ENGINE PROFILE ON THE WIRE (STRATEGOS W1.14, plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, B.1b).
 *
 * `tests/ai/hard-engine-profile.test.ts` pins the `?hardEngine` rule and the
 * strategos patch's own shape; this pins the one thing only the hook can
 * promise — that the profile is resolved ONCE per game, merges onto whatever
 * the device hint already put on the wire, and that an ordinary (`?hardEngine`
 * absent) game's request is BYTE-IDENTICAL to what it was before this flag
 * existed (`tests/hooks/ai-device-profile.test.tsx`'s own claim, re-asserted
 * here so a future change to either flag cannot break the other's default
 * silently).
 *
 * The worker client is mocked: what is under test is the object `useAI` hands
 * it, not a search.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import { phaseEndAction } from '../../src/game/legality';
import { HARD_AI_PROFILE_QUERY_PARAM, HARD_ENGINE_QUERY_PARAM, HARD_ENGINE_STORAGE_KEY } from '../../src/ai/hardOptIn';
import { PHONE, strategosPatch } from '../../src/ai/hard/config';
import type { GameState } from '../../src/game/types';
import type { AIDifficulty } from '../../src/ai/types';
import type { FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';

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

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  turnSearch.mockReset(); actionSearch.mockReset();
  turnSearch.mockImplementation((state: GameState) => ({ actions: [phaseEndAction(state)], scoreCc: 0,
    depth: 1, work: 0, source: 'search', engineUsed: 'hard', timeMs: 1 } as unknown as FindTurnResult));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

/** Runs whole turns on one hook instance, exactly as `ai-device-profile.test.tsx` does. */
async function playTurns(difficulty: AIDifficulty, turns = 1) {
  const hook = renderHook(() => useAI({ difficulty, thinkingDelay: 0 }));
  for (let i = 0; i < turns; i++) {
    let real = phasing();
    await act(async () => {
      await hook.result.current.executeAITurn(real, action => {
        real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action });
      }, 'white');
    });
  }
  const options = turnSearch.mock.calls.map(([, , opts]: [GameState, number, FindTurnOptions | undefined]) => opts);
  hook.unmount();
  return options;
}

const engineLines = () => vi.mocked(console.warn).mock.calls
  .map(call => String(call[0])).filter(line => line.includes('engine profile'));

it('sends no configuration at all when ?hardEngine is absent, byte-identical to before this flag', async () => {
  const options = await playTurns('hard');
  expect(options.length).toBeGreaterThanOrEqual(2);
  for (const opts of options) expect(opts).toEqual({ engine: 'hard' });
  for (const opts of options) expect('hard' in opts!).toBe(false);
});

it('merges the strategos patch onto the wire on ?hardEngine=strategos', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_ENGINE_QUERY_PARAM}=strategos`);
  const options = await playTurns('hard');
  expect(options.length).toBeGreaterThanOrEqual(2);
  const patch = strategosPatch();
  for (const opts of options) {
    expect(opts!.engine).toBe('hard');
    expect(opts!.hard!.searchFix).toEqual(patch.searchFix);
    expect(opts!.hard!.evalFix).toEqual(patch.evalFix);
    // No device tables were asked for, so nothing else rides along.
    expect('K' in opts!.hard!).toBe(false);
    expect('weights' in opts!.hard!).toBe(false);
  }
});

it('merges onto the device patch rather than replacing it, in either order of precedence', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_PROFILE_QUERY_PARAM}=phone&${HARD_ENGINE_QUERY_PARAM}=strategos`);
  const options = await playTurns('hard');
  expect(options.length).toBeGreaterThanOrEqual(2);
  for (const opts of options) {
    // The phone tables are still there...
    expect(opts!.hard!.K).toBe(PHONE.K);
    expect(opts!.hard!.gen!.K).toBe(PHONE.gen.K);
    // ...next to the strategos flags, not instead of them.
    expect(opts!.hard!.searchFix?.strategyPlans).toBe(true);
    expect(opts!.hard!.evalFix?.clockLedger).toBe(true);
    // Still no placeholder weights smuggled in by either patch.
    expect('weights' in opts!.hard!).toBe(false);
  }
});

it('resolves the engine profile once per game, not once per search', async () => {
  localStorage.setItem(HARD_ENGINE_STORAGE_KEY, 'strategos');
  const options = await playTurns('hard', 2);
  expect(options.length).toBeGreaterThanOrEqual(4);
  expect(engineLines()).toHaveLength(1);
});

it('asks nothing about the engine profile for a seat that never reaches the hard engine', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_ENGINE_QUERY_PARAM}=strategos`);
  for (const difficulty of ['easy', 'medium'] as const) {
    turnSearch.mockClear();
    const options = await playTurns(difficulty);
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const opts of options) expect(opts).toBeUndefined();
  }
  expect(engineLines()).toHaveLength(0);
});
