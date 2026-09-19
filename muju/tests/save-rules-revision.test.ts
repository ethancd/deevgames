/**
 * Local saves across the twenty-ply inactivity clock (rules revision
 * `muju-phasing-2`, owner decision 2026-09-19).
 *
 * A save written under the ten-ply clock carries a quiet count that means
 * something else now, so schema v8 exists to tell the two apart. A pre-v8 save is
 * adjudicated once under the limit it was RECORDED with — `LEGACY_INACTIVITY_LIMIT`
 * — so a game that had already drawn keeps that result, and a position that is
 * still playing restarts its clock instead of silently gaining ten extra quiet
 * plies. Nothing is thrown away: the board, players and score survive.
 */
import { afterEach, expect, it } from 'vitest';
import { createInitialGameState } from '../src/game/board';
import { startHistory } from '../src/game/analysis';
import { INACTIVITY_LIMIT, LEGACY_INACTIVITY_LIMIT } from '../src/game/inactivity';
import { loadGameHistory, loadGameState, saveGameState, SCHEMA_VERSION } from '../src/utils/persistence';

const KEY = 'elemental-tactics-save';
afterEach(() => localStorage.clear());
const stored = () => JSON.parse(localStorage.getItem(KEY)!) as { schemaVersion: number; state: { inactivityPlies?: number }; history?: unknown };
const write = (schemaVersion: number, state: unknown, history?: unknown) =>
  localStorage.setItem(KEY, JSON.stringify({ schemaVersion, timestamp: 0, state, history }));

it('pins the schema that records which inactivity clock wrote a save', () => {
  expect(SCHEMA_VERSION).toBe(8);
  expect(INACTIVITY_LIMIT).toBe(20);
  expect(LEGACY_INACTIVITY_LIMIT).toBe(10);
});

it('restarts the quiet clock of a pre-v8 game instead of reinterpreting it, keeping board and score', () => {
  for (const schemaVersion of [6, 7]) {
    const state = createInitialGameState();
    state.inactivityPlies = LEGACY_INACTIVITY_LIMIT - 1;
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

it('keeps a completed pre-v8 draw as a draw rather than reviving it', () => {
  const state = createInitialGameState();
  state.inactivityPlies = LEGACY_INACTIVITY_LIMIT;
  state.phase = 'victory'; state.winner = null; state.victoryReason = 'inactivity';
  write(7, state);
  const loaded = loadGameState()!;
  expect(loaded).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'inactivity' });
  // A finished game keeps the clock it finished on; it is evidence, not a live count.
  expect(loaded.inactivityPlies).toBe(LEGACY_INACTIVITY_LIMIT);
});

it('adjudicates a pre-v8 position at the limit it was recorded under, not the new one', () => {
  const state = createInitialGameState();
  state.inactivityRule = 'on';
  state.inactivityPlies = LEGACY_INACTIVITY_LIMIT;
  write(7, state);
  const loaded = loadGameState()!;
  expect(loaded).toMatchObject({ phase: 'victory', winner: null, victoryReason: 'inactivity' });
});

it('leaves a current save alone: its clock is already the twenty-ply one', () => {
  const state = createInitialGameState();
  state.inactivityPlies = LEGACY_INACTIVITY_LIMIT + 1;
  saveGameState(state);
  expect(stored().schemaVersion).toBe(SCHEMA_VERSION);
  const loaded = loadGameState()!;
  expect(loaded.phase).toBe('playing');
  expect(loaded.inactivityPlies).toBe(LEGACY_INACTIVITY_LIMIT + 1);
  expect(loaded).toEqual(state);
});

it('still refuses save schemas it never supported', () => {
  for (const schemaVersion of [1, 2, 3, 4, 9]) {
    write(schemaVersion, createInitialGameState());
    expect(loadGameState()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  }
});
