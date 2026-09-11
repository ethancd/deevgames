import { expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { findAttackApproach } from '../../src/game/movement';
import { gameReducer } from '../../src/hooks/useGameState';

it('takes a shortest detour around blockers and reserves the attack action', () => {
  const unit = createUnit('fire_1', 'white', {x: 0,y: 0});
  const target = createUnit('plant_1', 'black', {x: 3,y: 0});
  const board = {...createInitialGameState().board, units: [unit, target, createUnit('metal_1', 'white', {x: 1,y: 0})]};
  expect(findAttackApproach(unit, target, board, 3)).toEqual([{x: 0,y: 1}, {x: 1,y: 1}, {x: 2,y: 1}, {x: 3,y: 1}]);
  expect(findAttackApproach(unit, target, board, 2)).toBeNull();
});
it('handles adjacent targets, exhausted attacks, Cleave and completely blocked approaches', () => {
  const unit = createUnit('fire_2', 'white', {x: 0,y: 0});
  const target = createUnit('plant_1', 'black', {x: 1,y: 0});
  const board = {...createInitialGameState().board, units: [unit, target]};
  expect(findAttackApproach(unit, target, board, 1)).toEqual([]);
  expect(findAttackApproach(unit, target, board, 0)).toBeNull();
  expect(findAttackApproach({...unit, hasAttacked: true}, target, board, 6)).toBeNull();
  expect(findAttackApproach({...unit, hasAttacked: true, lastAttackKilled: true}, target, board, 1)).toEqual([]);
  expect(findAttackApproach({...unit, canActThisTurn: false}, target, board, 6)).toBeNull();
  expect(findAttackApproach({...unit, attackedThisTurn: [target.id], lastAttackKilled: true}, target, board, 6)).toBeNull();
  target.position = {x: 3,y: 0};
  board.units.push(createUnit('metal_1','white',{x: 0,y: 1}), createUnit('metal_1','black',{x: 1,y: 0}));
  expect(findAttackApproach(unit, target, board, 6)).toBeNull();
});
it('does not partially apply an invalid local move-and-attack', () => {
  const state = createInitialGameState();
  const unit = state.board.units[0];
  expect(gameReducer(state, {type: 'MOVE_AND_ATTACK', unitId: unit.id, to: {x: 2,y: 0}, targetPosition: {x: 9,y: 9}})).toBe(state);
});
