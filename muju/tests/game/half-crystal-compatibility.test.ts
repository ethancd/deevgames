import { afterEach, expect, it } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { BLACK_CRYSTAL_HANDICAPS } from '../../src/game/rules';
import { resolveKillClock, minedTotal, INACTIVITY_LIMIT } from '../../src/game/inactivity';
import { saveGameState, loadGameState } from '../../src/utils/persistence';
import { gameReducer } from '../../src/hooks/useGameState';
import { Replica, PackError } from '../../src/ai/hard/core/state';

afterEach(() => localStorage.clear());

it.each(BLACK_CRYSTAL_HANDICAPS)('preserves %s through save/load and resolves the exact mined-total score', amount => {
  const state = createInitialGameState(undefined, 4, amount, 'phasing');
  saveGameState(state);
  expect(loadGameState()?.players.black.resources).toBe(amount);
  state.players.white.resourcesGained = 10;
  state.players.black.resourcesGained = 10;
  state.inactivityPlies = INACTIVITY_LIMIT;
  expect(minedTotal(state, 'black')).toBe(10 + amount);
  expect(resolveKillClock(state).winner).toBe(amount === 0 ? null : 'black');
});

it('loads a legacy integer grant unchanged, but restarting uses 0.5 komi', () => {
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  state.blackCrystalHandicap = 20;
  state.players.black.resources = 17;
  saveGameState(state);
  const saved = loadGameState()!;
  expect(saved.blackCrystalHandicap).toBe(20);
  expect(saved.players.black.resources).toBe(17);
  expect(gameReducer(saved, { type: 'RESET_GAME' }).blackCrystalHandicap).toBe(0.5);
});

it('refuses fractional packed state before an integer buffer can truncate the grant', () => {
  const state = createInitialGameState(undefined, 4, 0.5, 'phasing');
  expect(() => new Replica().pack(state)).toThrow(PackError);
  expect(() => new Replica().pack(state)).toThrow(/fractional/);
});


it.each([0, 19.5])('preserves retired %s grants when loading, but resets new games to 0.5', amount => {
  const state = createInitialGameState(undefined, 4, amount, 'phasing');
  state.players.black.resources = 4.5;
  saveGameState(state);
  const saved = loadGameState()!;
  expect(saved.blackCrystalHandicap).toBe(amount);
  expect(saved.players.black.resources).toBe(4.5);
  expect(gameReducer(saved, { type: 'RESET_GAME' }).blackCrystalHandicap).toBe(0.5);
});

it.each(BLACK_CRYSTAL_HANDICAPS)('cannot tie on any integral mined-income difference with %s komi', amount => {
  const state = createInitialGameState(undefined, 4, amount, 'phasing');
  state.inactivityPlies = INACTIVITY_LIMIT;
  for (let difference = -30; difference <= 30; difference++) {
    state.players.white.resourcesGained = 50 + difference;
    state.players.black.resourcesGained = 50;
    expect(resolveKillClock(state).winner).not.toBeNull();
  }
});
