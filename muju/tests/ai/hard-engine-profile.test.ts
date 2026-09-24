/**
 * THE ENGINE PROFILE OVERRIDE (STRATEGOS W1.14, plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, B.1b).
 *
 * `resolveHardEngineProfile()` is the SEPARATE axis from `resolveHardDeviceProfile()`
 * (`tests/ai/phone-profile.test.ts`): that one picks the search TABLES a
 * device runs; this one picks which STRATEGY PATCH (`strategosPatch()`,
 * `src/ai/hard/config.ts`) rides along with them. Same two-form override
 * (`?hardEngine=` first, `localStorage['muju.hardEngine']` otherwise), same
 * "ignore what is not one of the two names" rule, same one-line-per-game log —
 * this file pins the rule the same way `phone-profile.test.ts` pins the device
 * one; `tests/hooks/ai-hard-engine-profile.test.tsx` pins what reaches the wire.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DESKTOP, strategosPatch } from '../../src/ai/hard/config';
import {
  HARD_AI_LOG_PREFIX, HARD_ENGINE_QUERY_PARAM, HARD_ENGINE_STORAGE_KEY, resolveHardEngineProfile,
} from '../../src/ai/hardOptIn';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

/* --------------------------- 1. the strategos patch ------------------------ */

it('sets exactly the six strategos flags, and no weights key', () => {
  const patch = strategosPatch();
  expect(patch.searchFix?.pruneZeroDamage).toBe(true);
  expect(patch.searchFix?.strategyPlans).toBe(true);
  expect(patch.searchFix?.strategyVeto).toBe(true);
  expect(patch.searchFix?.killClockPolicy).toBe('ledger');
  expect(patch.evalFix?.clockLedger).toBe(true);
  expect(patch.evalFix?.promoteExhaustive).toBe(true);
  // No tables, no weights: merging it onto a device patch never overwrites
  // either (`useAI.ts`'s `{ ...devicePatch, ...enginePatch }`).
  expect('weights' in patch).toBe(false);
  expect('K' in patch).toBe(false);
  expect('gen' in patch).toBe(false);
  // DESKTOP itself is untouched by the patch's existence.
  expect(DESKTOP.searchFix).toBeUndefined();
});

/* ------------------------------ 2. the rule -------------------------------- */

it('answers desktop when nothing is set (and in every other test file)', () => {
  expect(resolveHardEngineProfile()).toBe('desktop');
  const lines = vi.mocked(console.warn).mock.calls.map(call => String(call[0]));
  expect(lines).toHaveLength(1);
  expect(lines[0].startsWith(HARD_AI_LOG_PREFIX)).toBe(true);
  expect(lines[0]).toContain('desktop');
});

it('reads ?hardEngine=strategos', () => {
  window.history.replaceState({}, '', `/muju/?${HARD_ENGINE_QUERY_PARAM}=strategos`);
  expect(resolveHardEngineProfile()).toBe('strategos');
  expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain('forced by');
});

it('reads localStorage["muju.hardEngine"] = "strategos" when the query string is silent', () => {
  localStorage.setItem(HARD_ENGINE_STORAGE_KEY, 'strategos');
  expect(resolveHardEngineProfile()).toBe('strategos');
});

it('reads the query string first, over a stored value', () => {
  localStorage.setItem(HARD_ENGINE_STORAGE_KEY, 'strategos');
  window.history.replaceState({}, '', `/muju/?${HARD_ENGINE_QUERY_PARAM}=desktop`);
  expect(resolveHardEngineProfile()).toBe('desktop');
});

it('ignores a value that is neither name rather than guessing', () => {
  for (const raw of ['', 'strategy', '1', 'true', 'strategos-ish']) {
    window.history.replaceState({}, '', `/muju/?${HARD_ENGINE_QUERY_PARAM}=${encodeURIComponent(raw)}`);
    expect(resolveHardEngineProfile()).toBe('desktop');
  }
  // Only the two names count, and they are trimmed and case-folded first.
  window.history.replaceState({}, '', `/muju/?${HARD_ENGINE_QUERY_PARAM}=${encodeURIComponent(' STRATEGOS ')}`);
  expect(resolveHardEngineProfile()).toBe('strategos');
});

it('is a genuinely separate axis from ?hardProfile: the two names never collide', () => {
  // `?hardProfile=strategos` is not a recognised device name, and `?hardEngine=phone`
  // is not a recognised engine name; each flag answers only for its own axis.
  window.history.replaceState({}, '', `/muju/?hardProfile=strategos&${HARD_ENGINE_QUERY_PARAM}=phone`);
  expect(resolveHardEngineProfile()).toBe('desktop');
});
