import { expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { analyzeHomeDefense, resolveHomeCheckmate } from '../../src/game/homeCheckmate';
import { applyAction } from '../../src/ai/simulate';
import { gameReducer } from '../../src/hooks/useGameState';
import { getAllSpawnPositions } from '../../src/game/spawning';
import { loadGameState, saveGameState } from '../../src/utils/persistence';
import type { PlayerId, Unit } from '../../src/game/types';

const unit = (definition: string, x: number, y: number, owner: PlayerId = 'black') => createUnit(definition, owner, { x, y });
function occupied(definition: string, defenders: Unit[], cash = 0) {
  const state = createInitialGameState();
  state.board.units = [unit(definition, 9, 9, 'white'), ...defenders];
  state.players.black.resources = cash;
  return state;
}
const defense = (state: ReturnType<typeof occupied>) => analyzeHomeDefense(state, 'white', applyAction);

it.each(['white', 'black'] as const)('wins immediately on arrival for %s when no defender can reach home', player => {
  const state = createInitialGameState(), corner = player === 'white' ? 9 : 0, other = player === 'white' ? 'black' : 'white';
  const invader = createUnit('plant_1', player, { x: corner, y: corner === 9 ? 8 : 1 });
  state.turn.currentPlayer = player;
  state.board.units = [invader, createUnit('fire_1', other, { x: 4, y: 4 })];
  const move = { type: 'MOVE' as const, unitId: invader.id, to: { x: corner, y: corner } };
  const result = applyAction(state, move);
  expect(result).toMatchObject({ phase: 'victory', winner: player, victoryReason: 'home-checkmate', turn: { currentPlayer: player, actionsRemaining: 3 } });
  expect(getAllSpawnPositions(other, result.board)).toEqual([]);
  expect(gameReducer(state, move)).toEqual(result);
  expect(gameReducer(state, { type: 'MOVE_AND_ATTACK', unitId: invader.id, to: move.to, targetPosition: { x: 4, y: 4 } })).toEqual(result);
  expect(applyAction(result, { type: 'END_ACTION_PHASE' })).toBe(result);
  saveGameState(result); expect(loadGameState()).toEqual(result);
});

it('preserves a rescue that requires a speed promotion, and charges its actual cost', () => {
  const state = occupied('fire_1', [unit('lightning_1', 0, 7)], 4);
  const original = structuredClone(state);
  expect(defense(state)).toBe('rescue');
  expect(resolveHomeCheckmate(state, applyAction)).toBe(state);
  expect(state).toEqual(original);
  state.players.black.resources = 3;
  expect(defense(state)).toBe('mate');
});

it('accounts for combined damage and resets defenders’ spent attacks and placement flags', () => {
  const state = occupied('metal_3', [unit('fire_1', 9, 7), unit('fire_1', 8, 9)]);
  for (const defender of state.board.units.slice(1)) Object.assign(defender, { hasAttacked: true, canActThisTurn: false, placedThisTurn: true,
    promotedThisPlacement: true, attackedThisTurn: [state.board.units[0].id], lastAttackKilled: false });
  expect(defense(state)).toBe('rescue');
});

it('shares crystals between promotions instead of giving every attacker a free upgrade', () => {
  const state = occupied('water_3', [unit('plant_1', 9, 8), unit('plant_1', 8, 9)], 4);
  expect(defense(state)).toBe('mate');
  state.players.black.resources = 8;
  expect(defense(state)).toBe('rescue');
});

it('charges upkeep before promotion and preserves existing damage on the invader', () => {
  const state = occupied('metal_3', [unit('fire_2', 9, 8)], 8);
  expect(defense(state)).toBe('mate');
  state.players.black.resources = 9;
  expect(defense(state)).toBe('rescue');
  state.players.black.resources = 1;
  state.board.units[0].damageTaken = 1;
  expect(defense(state)).toBe('rescue');
  state.players.black.resources = 0;
  expect(defense(state)).toBe('mate');
});

it('searches legal blocker kills and the extra attack unlocked by a killing blow', () => {
  const state = occupied('plant_3', [unit('fire_2', 9, 7), unit('plant_1', 9, 8, 'white'), unit('metal_3', 8, 9, 'white')], 1);
  expect(defense(state)).toBe('rescue');
  // A nonlethal blow never unlocks a repeat attack against the same occupier.
  expect(defense(occupied('metal_3', [unit('fire_2', 9, 8)], 1))).toBe('mate');
});

it.each([['metal_2', 2], ['plant_3', 3]] as const)('includes voluntarily releasing a %s blocker even when keeping everything is affordable', (blocker, cash) => {
  const state = occupied('plant_3', [unit('fire_2', 9, 7), unit(blocker, 9, 8), unit('metal_3', 8, 8, 'white'), unit('metal_3', 8, 9, 'white')], cash);
  expect(defense(state)).toBe('rescue');
  // Making the same speed-1 blocker mandatory removes the only four-action rescue.
  state.board.units[2].definitionId = 'metal_1';
  expect(defense(state)).toBe('mate');
});

it('proves the five-action attacker rotation cannot rescue a corner in four actions', () => {
  const state = occupied('metal_3', [unit('water_3', 9, 8), unit('water_3', 8, 9), unit('water_3', 8, 8)], 6);
  expect(defense(state)).toBe('mate');
  expect(resolveHomeCheckmate(state, applyAction).victoryReason).toBe('home-checkmate');
});

it('does not declare a win when proof work is exhausted', () => {
  const state = occupied('water_3', [unit('plant_1', 9, 8), unit('plant_1', 8, 9)], 4);
  expect(analyzeHomeDefense(state, 'white', applyAction, 0)).toBe('unknown');
});

it('resolves after killing the last rescuer, while preserving an earlier opposing home occupation', () => {
  const state = occupied('fire_1', [unit('fire_1', 8, 9), unit('plant_1', 3, 3), unit('fire_1', 7, 9, 'white')]);
  expect(defense(state)).toBe('rescue');
  const result = applyAction(state, { type: 'ATTACK', unitId: state.board.units[3].id, targetPosition: { x: 8, y: 9 } });
  expect(result.victoryReason).toBe('home-checkmate');
  const race = occupied('metal_3', [unit('plant_1', 0, 0)]);
  expect(resolveHomeCheckmate(race, applyAction)).toBe(race);
  expect(applyAction(race, { type: 'END_ACTION_PHASE' })).toMatchObject({ winner: 'black', victoryReason: 'home-occupation' });
  const legacy = occupied('metal_3', [unit('plant_1', 3, 3)]);
  legacy.victoryRule = 'elimination';
  expect(resolveHomeCheckmate(legacy, applyAction)).toBe(legacy);
});
