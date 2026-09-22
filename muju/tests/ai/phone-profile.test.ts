/**
 * THE PHONE PROFILE, WHICH NOTHING EVER SELECTED (A-F2, 2026-09-21).
 *
 * `src/ai/hard/config.ts` has carried a DESKTOP / MIDRANGE / PHONE table and a
 * `profileFor` trigger since M4, and until this change `profileFor` was called
 * from no production module at all: every device — a phone on a bus included —
 * built its engine from `DESKTOP` (`K 24`, widths `[6,4,3,2]`, a 19-bit macro
 * table) inside the same whole-turn clock as a workstation.
 *
 * Two claims, and the second is the one that keeps the release honest:
 *
 *   1. A phone hint reaches the engine and it is built from the PHONE tables,
 *      with the SHIPPED weight vector rather than the version-0 placeholder
 *      every profile constant carries.
 *   2. NO HINT CHANGES NOTHING. `'desktop'` puts no field on the wire, so the
 *      request, the engine and `hard@desktop`'s resolved configuration — the
 *      identity every ladder row and `tests/lab/ablate.test.ts`'s frozen hash
 *      are keyed on — are byte-for-byte what they were.
 *
 * The device RULE itself is `resolveHardDeviceProfile()`'s, and the last group
 * below pins each of its arms plus the `?hardProfile` override, because a rule
 * nobody can see is a rule nobody can correct.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DESKTOP, PHONE, deviceProfilePatch, type DeviceProfileName } from '../../src/ai/hard/config';
import {
  HARD_AI_LOG_PREFIX, HARD_AI_PROFILE_QUERY_PARAM, HARD_AI_PROFILE_STORAGE_KEY, resolveHardDeviceProfile,
} from '../../src/ai/hardOptIn';
import { HardEngine } from '../../src/ai/hard/engine';
import { DEFAULT_WEIGHTS } from '../../src/ai/hard/eval/weights';

/** Two `HardEngine` constructions (one per profile) dominate this file; both
 * allocate their transposition tables up front. Measured at ~1.2 s together on
 * the development box, so the repo's 10 s floor already covers it and no
 * per-file ceiling is declared. */

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  for (const key of ['deviceMemory', 'hardwareConcurrency', 'maxTouchPoints'] as const) {
    delete (navigator as unknown as Record<string, unknown>)[key];
  }
  for (const key of ['innerWidth', 'innerHeight'] as const) {
    delete (window as unknown as Record<string, unknown>)[key];
  }
});

/** Everything `detectDeviceProfile` can read, stubbed on the jsdom globals it
 * reads them from. `coarse: undefined` leaves `matchMedia` absent, which is
 * jsdom's own state and the one every other test in the repo runs in. */
function stubDevice(hints: { coarse?: boolean; width?: number; height?: number; cores?: number; memoryGb?: number; touchPoints?: number }): void {
  if (hints.coarse !== undefined) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('pointer: coarse') ? hints.coarse! : false,
      media: query, onchange: null, addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    }));
  }
  const define = (target: object, key: string, value: unknown) =>
    Object.defineProperty(target, key, { value, configurable: true });
  if (hints.width !== undefined) define(window, 'innerWidth', hints.width);
  if (hints.height !== undefined) define(window, 'innerHeight', hints.height);
  if (hints.cores !== undefined) define(navigator, 'hardwareConcurrency', hints.cores);
  if (hints.memoryGb !== undefined) define(navigator, 'deviceMemory', hints.memoryGb);
  if (hints.touchPoints !== undefined) define(navigator, 'maxTouchPoints', hints.touchPoints);
}

/* ------------------------- 1. what goes on the wire ----------------------- */

it('sends nothing at all for a desktop, so the request that shipped is unchanged', () => {
  expect(deviceProfilePatch('desktop')).toBeUndefined();
});

it('sends the PHONE search tables, and only the tables', () => {
  const patch = deviceProfilePatch('phone')!;
  expect(patch).toBeDefined();
  // The shape the engine is built from, field for field against the profile
  // constant — a table edit that forgets this path fails here.
  expect(patch.K).toBe(PHONE.K);
  expect(patch.kInterior).toBe(PHONE.kInterior);
  expect(patch.ttBits).toBe(PHONE.ttBits);
  expect(patch.ttBitsMacro).toBe(PHONE.ttBitsMacro);
  expect(patch.ttBitsTurn).toBe(PHONE.ttBitsTurn);
  expect(patch.gen!.K).toBe(PHONE.gen.K);
  expect(patch.gen!.maxPlacePlans).toBe(PHONE.gen.maxPlacePlans);
  expect(Array.from(patch.gen!.action.widths)).toEqual(Array.from(PHONE.gen.action.widths));
  expect(patch.genInterior!.K).toBe(PHONE.genInterior.K);
  expect(patch.quiesce).toEqual(PHONE.quiesce);
  expect(patch.time).toEqual(PHONE.time);
  // These two are the smaller tables, spelled out so the point of the patch is
  // legible without opening the profile table.
  expect(patch.K).toBe(12);
  expect(patch.ttBitsMacro).toBe(15);

  // WEIGHTS AND BOOK ARE ABSENT BY DESIGN: the constructor substitutes
  // `DEFAULT_WEIGHTS` only when the patch names no `weights` key at all, so
  // sending the profile's version-0 placeholder would buy a material-only
  // evaluation on phones alone.
  expect('weights' in patch).toBe(false);
  expect('book' in patch).toBe(false);
});

it('hands out a fresh object every call and never touches the profile constants', () => {
  const first = deviceProfilePatch('phone')!, second = deviceProfilePatch('phone')!;
  expect(first).not.toBe(second);
  expect(first.gen).not.toBe(second.gen);
  first.K = 999; (first.gen as { K: number }).K = 999;
  expect(PHONE.K).toBe(12);
  expect(PHONE.gen.K).toBe(12);
  expect(DESKTOP.K).toBe(24);
  expect(DESKTOP.gen.K).toBe(24);
  expect(deviceProfilePatch('phone')!.K).toBe(12);
});

/* ---------------------- 2. what the engine is built from ------------------ */

it('builds the phone engine on the small tables and the SHIPPED weights', () => {
  const phone = new HardEngine(deviceProfilePatch('phone'));
  expect(phone.config.K).toBe(PHONE.K);
  expect(phone.config.gen.K).toBe(PHONE.gen.K);
  expect(phone.config.ttBitsMacro).toBe(PHONE.ttBitsMacro);
  expect(phone.config.quiesce.maxPly).toBe(PHONE.quiesce.maxPly);
  // Not the placeholder: a phone plays the same evaluation as a desktop.
  expect(phone.config.weights.version).not.toBe(0);
  expect(phone.config.weights.label).toBe(DEFAULT_WEIGHTS.label);
});

it('builds the desktop engine exactly as an absent patch always did', () => {
  const fromHint = new HardEngine(deviceProfilePatch('desktop'));
  expect(fromHint.config.K).toBe(DESKTOP.K);
  expect(fromHint.config.gen.K).toBe(DESKTOP.gen.K);
  expect(fromHint.config.ttBitsMacro).toBe(DESKTOP.ttBitsMacro);
  expect(fromHint.config.quiesce).toEqual(DESKTOP.quiesce);
  expect(fromHint.config.time).toEqual(DESKTOP.time);
  expect(fromHint.config.weights.label).toBe(DEFAULT_WEIGHTS.label);
});

/* --------------------------- 3. the device rule --------------------------- */

it('answers desktop when the device says nothing (and in every other test file)', () => {
  expect(resolveHardDeviceProfile()).toBe('desktop');
  const lines = vi.mocked(console.warn).mock.calls.map(call => String(call[0]));
  expect(lines).toHaveLength(1);
  expect(lines[0].startsWith(HARD_AI_LOG_PREFIX)).toBe(true);
  expect(lines[0]).toContain('desktop');
});

it('reads a phone from its memory alone, whatever the pointer says', () => {
  stubDevice({ memoryGb: 2, cores: 8, width: 1440, height: 900 });
  expect(resolveHardDeviceProfile()).toBe('phone');
});

const rule: [string, Parameters<typeof stubDevice>[0], DeviceProfileName][] = [
  ['a handheld in portrait', { coarse: true, width: 390, height: 844, cores: 8 }, 'phone'],
  ['the same handheld turned sideways', { coarse: true, width: 844, height: 390, cores: 8 }, 'phone'],
  ['a 10" tablet in portrait', { coarse: true, width: 810, height: 1080, cores: 6 }, 'phone'],
  ['a large tablet on a small core count', { coarse: true, width: 1024, height: 1366, cores: 4 }, 'phone'],
  ['a large, fast tablet', { coarse: true, width: 1024, height: 1366, cores: 8 }, 'desktop'],
  ['a touchscreen laptop driven by a mouse', { coarse: false, width: 1366, height: 768, cores: 4, touchPoints: 10 }, 'desktop'],
  ['a workstation', { coarse: false, width: 2560, height: 1440, cores: 16 }, 'desktop'],
  ['an old touch browser with no media queries', { width: 390, height: 844, touchPoints: 5 }, 'phone'],
];
for (const [name, hints, expected] of rule) {
  it(`reads ${name} as ${expected}`, () => {
    stubDevice(hints);
    expect(resolveHardDeviceProfile()).toBe(expected);
  });
}

/* ----------------------------- 4. the override ---------------------------- */

it('lets the page URL force either profile, in both spellings', () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_PROFILE_QUERY_PARAM}=phone`);
  expect(resolveHardDeviceProfile()).toBe('phone');
  expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain('forced by');

  stubDevice({ coarse: true, width: 390, height: 844, cores: 4 });
  window.history.replaceState({}, '', `/muju/?${HARD_AI_PROFILE_QUERY_PARAM}=desktop`);
  expect(resolveHardDeviceProfile()).toBe('desktop');

  window.history.replaceState({}, '', '/muju/');
  localStorage.setItem(HARD_AI_PROFILE_STORAGE_KEY, 'desktop');
  expect(resolveHardDeviceProfile()).toBe('desktop');
});

it('ignores a value that is neither profile rather than guessing', () => {
  // A desktop-shaped device, so "ignored" is visibly different from "forced".
  stubDevice({ coarse: false, width: 2560, height: 1440, cores: 16 });
  for (const raw of ['', 'tablet', '1', 'true', 'phone-ish']) {
    window.history.replaceState({}, '', `/muju/?${HARD_AI_PROFILE_QUERY_PARAM}=${encodeURIComponent(raw)}`);
    expect(resolveHardDeviceProfile()).toBe('desktop');
  }
  // Only the two names count, and they are trimmed and case-folded first.
  window.history.replaceState({}, '', `/muju/?${HARD_AI_PROFILE_QUERY_PARAM}=${encodeURIComponent(' PHONE ')}`);
  expect(resolveHardDeviceProfile()).toBe('phone');
});
