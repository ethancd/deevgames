// @vitest-environment node
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import type { GameState } from '../../src/game/types';

/**
 * E5.1 / E0.2: a wall-funded `searchTurn` that FAILS must still report what it
 * cost. `useAI.ts` debits the turn's remaining allowance by
 * `stats.elapsedMs` (via `client.ts`'s `timeMs`), so a `pack-error` or
 * `engine-error` fallback that reports 0 hands the v2 path the WHOLE turn
 * budget a second time — the turn is then funded twice over.
 *
 * The engine's clock is mocked so the assertion is an exact number rather than
 * "at least zero": `Date.now()` has 1 ms resolution and both failures happen
 * far inside one tick on a real box.
 */
const { clock } = vi.hoisted(() => ({ clock: { readings: [] as number[], index: 0 } }));
vi.mock('../../src/ai/hard/search/time', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/ai/hard/search/time')>();
  return { ...actual, now: () => clock.readings[Math.min(clock.index++, clock.readings.length - 1)] };
});
const { searchRootSpy } = vi.hoisted(() => ({ searchRootSpy: vi.fn() }));
vi.mock('../../src/ai/hard/search/root', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/ai/hard/search/root')>();
  return { ...actual, searchRoot: (...args: unknown[]) => searchRootSpy(...args) };
});
const { HardEngine } = await import('../../src/ai/hard/engine');
const { searchRoot: realSearchRoot } = await vi.importActual<typeof import('../../src/ai/hard/search/root')>('../../src/ai/hard/search/root');

function script(...readings: number[]): void { clock.readings = readings; clock.index = 0; }

beforeEach(() => {
  script(0);
  searchRootSpy.mockReset();
  searchRootSpy.mockImplementation((...args: Parameters<typeof realSearchRoot>) => realSearchRoot(...args));
});
afterEach(() => { vi.restoreAllMocks(); });

it('reports the cost of a failed pack instead of zero', async () => {
  // Two readings: the call opens, then the pack throws and is measured.
  script(1_000, 1_120);
  const engine = new HardEngine();
  const result = await engine.searchTurn({} as GameState, { targetMs: 3000 });
  expect(result.source).toBe('fallback');
  expect(result.fallback === 'pack-error' || result.fallback === 'engine-error').toBe(true);
  expect(result.actions).toEqual([]);
  expect(result.stats.elapsedMs).toBe(120);
});

it('reports the cost of a search that threw, measured from the search start', async () => {
  // Open, arm the watchdog, then measure the throw. The search's own clock
  // starts at the SECOND reading, which is what the elapsed must come from.
  script(1_000, 1_050, 1_300);
  searchRootSpy.mockImplementation(() => { throw new Error('boom inside searchRoot'); });
  const engine = new HardEngine();
  const result = await engine.searchTurn(createInitialGameState(), { targetMs: 3000 });
  expect(result.source).toBe('fallback');
  expect(result.fallback).toBe('engine-error');
  expect(result.stats.elapsedMs).toBe(250);
});

it('still reads no clock at all in fixed-work mode, failure included', async () => {
  script(7_777);
  searchRootSpy.mockImplementation(() => { throw new Error('boom inside searchRoot'); });
  const engine = new HardEngine();
  const result = await engine.searchTurn(createInitialGameState(), { work: 25_000 });
  expect(result.fallback).toBe('engine-error');
  // The lab, the ladder and CI always pass `work`; their results stay machine
  // independent, so the fallback measures nothing and leaves the field at 0.
  expect(clock.index).toBe(0);
  expect(result.stats.elapsedMs).toBe(0);
});
