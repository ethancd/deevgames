import { beforeEach, it, expect, vi, afterEach } from 'vitest';
import {
  HARD_AI_LOG_PREFIX, HARD_AI_MS_MAX, HARD_AI_MS_MIN, HARD_AI_MS_QUERY_PARAM,
  HARD_AI_QUERY_PARAM, HARD_AI_STORAGE_KEY,
  fallbackKindFor, hardDiag, readHardAiOptIn, readHardAiOptOut, readHardTurnBudgetMs,
  recordHardFallback, resetHardDiag, resolveHardAiRoute,
} from '../../src/ai/hardOptIn';
import { hardEnabled } from '../../src/ai/hard/config';

/**
 * The Hard route and its counters. DESIGN §6.4's release flag is ON (the E6
 * release decision of 2026-09-18), so the default is now the real engine and
 * the interesting narrow gate is the OPT-OUT: exactly `'0'`, in exactly two
 * places, and it beats `hardEnabled`.
 */
beforeEach(() => {
  resetHardDiag();
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

it('ships the release flag on', () => {
  expect(hardEnabled).toBe(true);
});

it('routes Hard to the real engine by default', () => {
  expect(resolveHardAiRoute()).toBe(true);
  expect(hardDiag().optIn).toBe(true);
});

it('routes Hard back to AIEngineV2 on ?hardAi=0', () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_QUERY_PARAM}=0`);
  expect(readHardAiOptOut()).toBe(true);
  expect(resolveHardAiRoute()).toBe(false);
  expect(hardDiag().optIn).toBe(false);
});

it('routes Hard back to AIEngineV2 on localStorage["muju.hardAi"] === "0"', () => {
  localStorage.setItem(HARD_AI_STORAGE_KEY, '0');
  expect(readHardAiOptOut()).toBe(true);
  expect(resolveHardAiRoute()).toBe(false);
});

it('lets an explicit opt-out beat a stored opt-in', () => {
  localStorage.setItem(HARD_AI_STORAGE_KEY, '1');
  window.history.replaceState({}, '', `/muju/?${HARD_AI_QUERY_PARAM}=0`);
  expect(resolveHardAiRoute()).toBe(false);
});

it('treats every value that is neither "0" nor "1" as no instruction at all', () => {
  for (const value of ['true', 'yes', '', '2', 'off']) {
    localStorage.setItem(HARD_AI_STORAGE_KEY, value);
    window.history.replaceState({}, '', `/muju/?${HARD_AI_QUERY_PARAM}=${value}`);
    expect(readHardAiOptOut()).toBe(false);
    expect(readHardAiOptIn()).toBe(false);
    // Neither instruction given, so the release flag decides.
    expect(resolveHardAiRoute()).toBe(hardEnabled);
  }
});

// The opt-in is redundant while `hardEnabled` is true, but it is still the
// thing that reaches `HardEngine` on a branch or a revert that turns the
// release flag off, so its reader stays pinned.
it('still reads the opt-in "1" in both places', () => {
  localStorage.setItem(HARD_AI_STORAGE_KEY, '1');
  expect(readHardAiOptIn()).toBe(true);
  expect(hardDiag().optIn).toBe(true);
  localStorage.clear();
  window.history.replaceState({}, '', `/muju/?${HARD_AI_QUERY_PARAM}=1`);
  expect(readHardAiOptIn()).toBe(true);
});

it('stays on the release default rather than throwing when site data is blocked', () => {
  const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
  expect(readHardAiOptOut()).toBe(false);
  expect(readHardAiOptIn()).toBe(false);
  expect(resolveHardAiRoute()).toBe(true);
  blocked.mockRestore();
});

it('logs one [hard-ai] line whichever way the route resolves', () => {
  expect(resolveHardAiRoute()).toBe(true);
  window.history.replaceState({}, '', `/muju/?${HARD_AI_QUERY_PARAM}=0`);
  expect(resolveHardAiRoute()).toBe(false);
  const lines = vi.mocked(console.warn).mock.calls.map(call => String(call[0]));
  expect(lines).toHaveLength(2);
  for (const line of lines) expect(line.startsWith(HARD_AI_LOG_PREFIX)).toBe(true);
});

it('has no ?hardMs override by default', () => {
  expect(readHardTurnBudgetMs()).toBeNull();
  expect(console.warn).not.toHaveBeenCalled();
});

it('reads ?hardMs and logs it once with the [hard-ai] prefix', () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=3000`);
  expect(readHardTurnBudgetMs()).toBe(3000);
  const lines = vi.mocked(console.warn).mock.calls.map(call => String(call[0]));
  expect(lines).toHaveLength(1);
  expect(lines[0].startsWith(HARD_AI_LOG_PREFIX)).toBe(true);
  expect(lines[0]).toContain('3000');
});

it('clamps ?hardMs into [1000, 120000]', () => {
  for (const [raw, expected] of [['0', HARD_AI_MS_MIN], ['999', HARD_AI_MS_MIN], ['1000', 1000],
    ['-5000', HARD_AI_MS_MIN], ['120000', HARD_AI_MS_MAX], ['500000', HARD_AI_MS_MAX]] as const) {
    window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=${raw}`);
    expect(readHardTurnBudgetMs()).toBe(expected);
  }
});

it('ignores a ?hardMs that is not an integer', () => {
  for (const raw of ['', 'soon', '3000ms', '3.5', 'NaN', 'Infinity']) {
    window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=${raw}`);
    expect(readHardTurnBudgetMs()).toBeNull();
  }
});

it('publishes the counters on window.__mujuHardDiag', () => {
  const diag = hardDiag();
  expect((window as unknown as { __mujuHardDiag?: unknown }).__mujuHardDiag).toBe(diag);
});

it('counts each fallback kind, the total, and logs one [hard-ai] line', () => {
  recordHardFallback('packError', 'engine reported pack-error');
  recordHardFallback('invalidSuffix');
  recordHardFallback('invalidSuffix');
  const diag = hardDiag();
  expect(diag.packError).toBe(1);
  expect(diag.invalidSuffix).toBe(2);
  expect(diag.fallbacks).toBe(3);
  expect(diag.lastFallback).toBe('invalidSuffix');
  const lines = vi.mocked(console.warn).mock.calls.map(call => String(call[0]));
  expect(lines).toHaveLength(3);
  for (const line of lines) expect(line.startsWith(HARD_AI_LOG_PREFIX)).toBe(true);
});

it('maps the engine\'s own fallback reasons onto counter names', () => {
  expect(fallbackKindFor('pack-error')).toBe('packError');
  expect(fallbackKindFor('engine-error')).toBe('engineError');
  expect(fallbackKindFor('divergence')).toBe('divergence');
});
