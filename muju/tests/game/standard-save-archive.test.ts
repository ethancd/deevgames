/**
 * Retiring Standard on this device (schema 9, 2026-09-21).
 *
 * The content DAG's `persistence` node forbids reinterpreting a stored state
 * under different rules, and a local Standard save is the one artefact that
 * would have been reinterpreted: before this change `loadGameState()` returned
 * it and `ModeSelect` resumed it, so deleting the Standard turn from the
 * reducer would have resumed that exact position under Phasing.
 *
 * Schema 9 answers with "archive read-only": the payload is MOVED byte-for-byte
 * to `elemental-tactics-save-retired`, `loadGameState()` reports no saved game,
 * and `loadRetiredSave` / `loadRetiredHistory` still read it so the analysis
 * screen can show the game. Nothing is ever deleted, converted or re-stamped.
 *
 * `tests/fixtures/standard-save-v8.json` is the captured retired-rules fixture
 * the DAG asks for: a real schema-8 Standard save with six played turns and a
 * 63-frame score, generated at the commit before this change, where
 * `loadGameState()` still resumed it.
 */
import { afterEach, expect, it } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { startHistory } from '../../src/game/analysis';
import {
  loadAIPace, loadGameHistory, loadGameState, loadRetiredHistory, loadRetiredSave,
  RETIRED_STORAGE_KEY, saveAIPace, saveGameState, SCHEMA_VERSION,
} from '../../src/utils/persistence';
import capturedStandardSave from '../fixtures/standard-save-v8.json';

const KEY = 'elemental-tactics-save';
afterEach(() => localStorage.clear());
const write = (schemaVersion: number, state: unknown, history?: unknown) => {
  const raw = JSON.stringify({ schemaVersion, timestamp: 1758400000000, state, history });
  localStorage.setItem(KEY, raw);
  return raw;
};
const standardState = (ruleset?: 'standard') => {
  const state = createInitialGameState(undefined, undefined, 0, 'standard');
  if (ruleset === undefined) delete (state as { ruleset?: unknown }).ruleset;
  return state;
};

// A save with no `ruleset` at all predates the field, which meant Standard.
it.each([[5, 'standard'], [6, undefined], [7, 'standard'], [8, undefined], [8, 'standard']] as const)(
  'never resumes a schema-%s %s save and never deletes it', (schemaVersion, ruleset) => {
    const state = standardState(ruleset);
    const raw = write(schemaVersion, state, startHistory(state, true));

    expect(loadGameState()).toBeNull();
    expect(loadGameHistory()).toBeNull();
    // Moved, not rewritten: the retired slot holds the original bytes exactly.
    expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(KEY)).toBeNull();
    // And the archive still reads back as the game it was.
    const archived = loadRetiredSave()!;
    expect(archived.schemaVersion).toBe(schemaVersion);
    expect(archived.state.ruleset).toBe(ruleset);
  });

// A half-written or truncated payload has no `ruleset` either, so the retirement
// gate on its own would read it as retired rules. Archiving it would put unreadable
// bytes in the one slot the real retired game needs — and, because an occupied slot
// is never overwritten, would strand every later retired save in the main key. It is
// cleared instead, which is what this build did with it before schema 9.
it.each([
  ['a truncated save', '{"schemaVersion":8,"timestamp":0,"state":{"phase":"playing"}}'],
  ['a Standard save with no board', JSON.stringify({
    schemaVersion: 8, timestamp: 1758400000000,
    state: { ...standardState('standard'), board: undefined },
  })],
])('clears %s instead of archiving it', (_label, raw) => {
  localStorage.setItem(KEY, raw);

  expect(loadGameState()).toBeNull();
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBeNull();
  expect(loadRetiredSave()).toBeNull();

  // And the slot it did not poison is still free for the real retired game.
  const retired = standardState('standard');
  const retiredRaw = write(8, retired, startHistory(retired, true));
  expect(loadGameState()).toBeNull();
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(retiredRaw);
});

it('writes a new Phasing game while the retired save survives untouched', () => {
  const retired = standardState('standard');
  const raw = write(8, retired, startHistory(retired, true));
  expect(loadGameState()).toBeNull();

  const fresh = createInitialGameState(undefined, undefined, 0, 'phasing');
  saveGameState(fresh, startHistory(fresh, true));
  expect(loadGameState()).toEqual(fresh);
  expect(JSON.parse(localStorage.getItem(KEY)!).schemaVersion).toBe(SCHEMA_VERSION);
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(raw);
  expect(loadRetiredSave()!.state.ruleset).toBe('standard');
});

it('keeps a captured Standard save reviewable instead of playable', () => {
  const raw = JSON.stringify(capturedStandardSave);
  localStorage.setItem(KEY, raw);

  // The fixture resumed at the commit before this one. It does not now.
  expect(loadGameState()).toBeNull();
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(raw);

  const archived = loadRetiredSave()!;
  expect(archived.schemaVersion).toBe(8);
  expect(archived.state.ruleset).toBe('standard');
  expect(archived.state.phase).toBe('playing');
  const history = loadRetiredHistory()!;
  expect(history.frames.length).toBeGreaterThan(1);
  expect(history.frames.every(frame => frame.state.ruleset !== 'phasing')).toBe(true);
});

it('never lets a pace preference touch the retired save', () => {
  const retired = standardState('standard');
  const raw = write(8, retired);
  expect(loadGameState()).toBeNull();

  saveAIPace({ white: 'normal', black: 'deep' });
  // No current save, so there is nothing to record the preference on, and the
  // archive is not a place to record it.
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(raw);
  expect(localStorage.getItem(KEY)).toBeNull();

  const fresh = createInitialGameState(undefined, undefined, 0, 'phasing');
  saveGameState(fresh);
  saveAIPace({ white: 'normal', black: 'deep' });
  expect(loadAIPace()).toEqual({ white: 'normal', black: 'deep' });
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(raw);
});

it('resumes a Phasing schema-8 save and re-stamps it to the current schema, restarting the clock', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.players.white.resources = 7;
  state.inactivityPlies = 3;
  write(8, state, startHistory(state, true));

  const loaded = loadGameState()!;
  expect(loaded.ruleset).toBe('phasing');
  expect(loaded.players.white.resources).toBe(7);
  // Schema 8 recorded the twenty-ply `muju-phasing-2` draw clock, which is now
  // a legacy limit: the position (well under 20) is still playing, so its
  // count is restarted at 0 for the live ten-ply kill clock, same as schema 9.
  expect(loaded.inactivityPlies).toBe(0);
  expect(JSON.parse(localStorage.getItem(KEY)!).schemaVersion).toBe(SCHEMA_VERSION);
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBeNull();
  expect(loadGameHistory()!.frames).toHaveLength(1);
});

it('never overwrites an occupied retired slot, and never deletes the save it could not move', () => {
  const first = standardState('standard');
  const firstRaw = write(8, first, startHistory(first, true));
  expect(loadGameState()).toBeNull();
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(firstRaw);

  const second = standardState('standard');
  second.players.black.resources = 42;
  const secondRaw = write(7, second);
  expect(loadGameState()).toBeNull();
  // The archive is the only copy of the first game, so it wins; and the second
  // save is left exactly where it is rather than being thrown away — until the
  // next new game overwrites the main key, which is unreachable in practice:
  // once a device has archived, only Phasing saves are ever written there.
  expect(localStorage.getItem(RETIRED_STORAGE_KEY)).toBe(firstRaw);
  expect(localStorage.getItem(KEY)).toBe(secondRaw);
});
