/**
 * THE DEVICE HINT ON THE WIRE (A-F2, 2026-09-21).
 *
 * `tests/ai/phone-profile.test.ts` pins the rule and the tables; this pins the
 * one thing only the hook can promise — that the hint is resolved ONCE per game
 * and rides on the request the worker already knows how to read, and that a
 * desktop game's request is still the request that shipped.
 *
 * The worker client is mocked: what is under test is the object `useAI` hands
 * it, not a search.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import { phaseEndAction } from '../../src/game/legality';
import { HARD_AI_PROFILE_QUERY_PARAM, HARD_AI_PROFILE_STORAGE_KEY } from '../../src/ai/hardOptIn';
import { PHONE } from '../../src/ai/hard/config';
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
  // The engine always proposes the canonical phase end, which is a legal turn:
  // Act and Prepare are two searches inside one turn and one allowance.
  turnSearch.mockImplementation((state: GameState) => ({ actions: [phaseEndAction(state)], scoreCc: 0,
    depth: 1, work: 0, source: 'search', engineUsed: 'hard', timeMs: 1 } as unknown as FindTurnResult));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

/** Runs whole turns on one hook instance — i.e. inside ONE game, since only
 * `cancel` clears what the hook caches per game. */
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

const deviceLines = () => vi.mocked(console.warn).mock.calls
  .map(call => String(call[0])).filter(line => line.includes('device profile'));

it('sends no configuration at all from a desktop', async () => {
  const options = await playTurns('hard');
  expect(options.length).toBeGreaterThanOrEqual(2);
  // Byte-for-byte the request that shipped: `engine` and nothing else.
  for (const opts of options) expect(opts).toEqual({ engine: 'hard' });
  for (const opts of options) expect('hard' in opts!).toBe(false);
});

it('sends the phone tables from a phone, on every search of the turn', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_PROFILE_QUERY_PARAM}=phone`);
  const options = await playTurns('hard');
  expect(options.length).toBeGreaterThanOrEqual(2);
  for (const opts of options) {
    expect(opts!.engine).toBe('hard');
    expect(opts!.hard!.K).toBe(PHONE.K);
    expect(opts!.hard!.gen!.K).toBe(PHONE.gen.K);
    // Never the placeholder vector — see `deviceProfilePatch`.
    expect('weights' in opts!.hard!).toBe(false);
  }
});

it('resolves the device once per game, not once per search', async () => {
  localStorage.setItem(HARD_AI_PROFILE_STORAGE_KEY, 'phone');
  const options = await playTurns('hard', 2);
  expect(options.length).toBeGreaterThanOrEqual(4);
  expect(deviceLines()).toHaveLength(1);
});

it('asks nothing about the device for a seat that never reaches the hard engine', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_PROFILE_QUERY_PARAM}=phone`);
  for (const difficulty of ['easy', 'medium'] as const) {
    turnSearch.mockClear();
    const options = await playTurns(difficulty);
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const opts of options) expect(opts).toBeUndefined();
  }
  expect(deviceLines()).toHaveLength(0);
});
