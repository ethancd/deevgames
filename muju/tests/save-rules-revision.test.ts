/**
 * Local saves across the kill-clock cutover (rules revision `muju-phasing-2`
 * -> `muju-phasing-3`, owner decision 2026-09-22). Every save here is a
 * Phasing save: schema 10 archives anything else instead of resuming it, which
 * `tests/game/standard-save-archive.test.ts` covers.
 *
 * Three clocks are now stacked in history: schema 5-7 (`muju-phasing-1`) drew
 * outright at ten quiet plies; schema 8-9 (`muju-phasing-2`) drew outright at
 * twenty; schema 10 (`muju-phasing-3`) is the live kill clock — ten kill-free
 * plies decide on mined totals, a tie draws. A pre-v10 save is adjudicated
 * ONCE under the limit and verdict it was RECORDED with — `PHASING_1_DRAW_LIMIT`
 * for schema 5-7, `LEGACY_INACTIVITY_LIMIT` for schema 8-9 — so a game that had
 * already drawn keeps that result, and a position that is still playing
 * restarts its clock instead of silently being judged under a rule its players
 * never agreed to. Nothing is thrown away: the board, players and score survive.
 */
import { afterEach, expect, it } from 'vitest';
import { createInitialGameState } from '../src/game/board';
import { startHistory } from '../src/game/analysis';
import { INACTIVITY_LIMIT, INACTIVITY_WARNING, LEGACY_INACTIVITY_LIMIT } from '../src/game/inactivity';
import { loadGameHistory, loadGameState, saveGameState, SCHEMA_VERSION, PHASING_1_DRAW_LIMIT } from '../src/utils/persistence';

const KEY = 'elemental-tactics-save';
afterEach(() => localStorage.clear());
const stored = () => JSON.parse(localStorage.getItem(KEY)!) as { schemaVersion: number; state: { inactivityPlies?: number }; history?: unknown };
const write = (schemaVersion: number, state: unknown, history?: unknown) =>
  localStorage.setItem(KEY, JSON.stringify({ schemaVersion, timestamp: 0, state, history }));

it('pins the schema and the three clocks it can adjudicate a save under', () => {
  expect(SCHEMA_VERSION).toBe(10);
  expect(INACTIVITY_LIMIT).toBe(10);
  expect(INACTIVITY_WARNING).toBe(7);
  expect(LEGACY_INACTIVITY_LIMIT).toBe(20);
  expect(PHASING_1_DRAW_LIMIT).toBe(10);
});

it('restarts the clock of a pre-v8 (muju-phasing-1) game instead of reinterpreting it, keeping board and score', () => {
  for (const schemaVersion of [6, 7]) {
    const state = createInitialGameState(undefined, undefined, 0, 'phasing');
    state.inactivityPlies = PHASING_1_DRAW_LIMIT - 1;
    state.players.white.resources = 11;
    const history = startHistory(state, true);
    write(schemaVersion, state, history);
    const loaded = loadGameState()!;
    // The position survives; only the count whose meaning changed is restarted.
    expect(loaded.board).toEqual(state.board);
    expect(loaded.players).toEqual(state.players);
    expect(loaded.phase).toBe('playing');
    expect(loaded.inactivityPlies).toBe(0);
    // Stamped once, with the score intact, so the restart cannot repeat.
    expect(stored().schemaVersion).toBe(SCHEMA_VERSION);
    expect(stored().state.inactivityPlies).toBe(0);
    expect(loadGameHistory()!.frames).toHaveLength(history.frames.length);
    expect(loadGameHistory()!.complete).toBe(true);
    expect(loadGameState()!.inactivityPlies).toBe(0);
    localStorage.clear();
  }
});

it('keeps a completed pre-v8 (muju-phasing-1) draw as a draw rather than reviving it', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.inactivityPlies = PHASING_1_DRAW_LIMIT;
  state.phase = 'victory'; state.winner = null; state.victoryReason = 'inactivity';
  write(7, state);
  const loaded = loadGameState()!;
  expect(loaded).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'inactivity' });
  // A finished game keeps the clock it finished on; it is evidence, not a live count.
  expect(loaded.inactivityPlies).toBe(PHASING_1_DRAW_LIMIT);
});

it('adjudicates a pre-v8 position at the ten-ply muju-phasing-1 limit it was recorded under', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.inactivityRule = 'on';
  state.inactivityPlies = PHASING_1_DRAW_LIMIT;
  write(7, state);
  const loaded = loadGameState()!;
  expect(loaded).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'inactivity' });
});

it('restarts the clock of a schema-9 (muju-phasing-2) game instead of reinterpreting it, keeping board and score', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.inactivityPlies = LEGACY_INACTIVITY_LIMIT - 1;
  state.players.white.resources = 11;
  const history = startHistory(state, true);
  write(9, state, history);
  const loaded = loadGameState()!;
  expect(loaded.board).toEqual(state.board);
  expect(loaded.players).toEqual(state.players);
  expect(loaded.phase).toBe('playing');
  expect(loaded.inactivityPlies).toBe(0);
  expect(stored().schemaVersion).toBe(SCHEMA_VERSION);
  expect(stored().state.inactivityPlies).toBe(0);
  expect(loadGameHistory()!.frames).toHaveLength(history.frames.length);
  expect(loadGameState()!.inactivityPlies).toBe(0);
});

it('keeps a completed schema-9 (muju-phasing-2) draw as a draw rather than reviving it', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.inactivityPlies = LEGACY_INACTIVITY_LIMIT;
  state.phase = 'victory'; state.winner = null; state.victoryReason = 'inactivity';
  write(9, state);
  const loaded = loadGameState()!;
  expect(loaded).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'inactivity' });
  expect(loaded.inactivityPlies).toBe(LEGACY_INACTIVITY_LIMIT);
});

it('adjudicates a schema-8 position at the twenty-ply muju-phasing-2 limit it was recorded under', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.inactivityRule = 'on';
  state.inactivityPlies = LEGACY_INACTIVITY_LIMIT;
  write(8, state);
  const loaded = loadGameState()!;
  expect(loaded).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'inactivity' });
});

it('leaves a current v10 save alone: its clock is already the live kill clock', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.inactivityPlies = INACTIVITY_LIMIT - 1;
  saveGameState(state);
  expect(stored().schemaVersion).toBe(SCHEMA_VERSION);
  const loaded = loadGameState()!;
  expect(loaded.phase).toBe('playing');
  expect(loaded.inactivityPlies).toBe(INACTIVITY_LIMIT - 1);
  expect(loaded).toEqual(state);
});

// Spec §5(g): a schema-9 unfinished save restarts at 0 and stamps
// `muju-phasing-3`; a finished schema-9 draw stays a draw.
it('(g) a schema-9 unfinished save restarts at 0 and stamps muju-phasing-3; a finished schema-9 draw stays a draw', () => {
  const playing = createInitialGameState(undefined, undefined, 0, 'phasing');
  playing.inactivityPlies = 5;
  write(9, playing);
  const resumed = loadGameState()!;
  expect(resumed.phase).toBe('playing');
  expect(resumed.inactivityPlies).toBe(0);
  expect(resumed.ruleset).toBe('phasing');
  expect(stored().schemaVersion).toBe(SCHEMA_VERSION);
  localStorage.clear();

  const finished = createInitialGameState(undefined, undefined, 0, 'phasing');
  finished.inactivityPlies = LEGACY_INACTIVITY_LIMIT;
  finished.phase = 'victory'; finished.winner = null; finished.victoryReason = 'inactivity';
  write(9, finished);
  const loaded = loadGameState()!;
  expect(loaded).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'inactivity', inactivityPlies: LEGACY_INACTIVITY_LIMIT });
});

it('still refuses save schemas it never supported', () => {
  for (const schemaVersion of [1, 2, 3, 4, 11]) {
    write(schemaVersion, createInitialGameState(undefined, undefined, 0, 'phasing'));
    expect(loadGameState()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  }
});
