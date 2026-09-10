// @vitest-environment node
import { expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import type { PlayerId } from '../../src/game/types';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
import { getUnitDefinition } from '../../src/game/units';

function adjacentCapture(player: PlayerId) {
  const state = createInitialGameState();
  const opponent = player === 'white' ? 'black' : 'white';
  const attacker = createUnit('fire_1', player, { x: 4, y: 4 });
  const target = createUnit('fire_1', opponent, { x: 4, y: 3 });
  state.board.units = [attacker, target, createUnit('plant_1', opponent, { x: 8, y: 8 })];
  state.turn.currentPlayer = player;
  state.turn.actionsRemaining = 1;
  return { state, attacker, target };
}

for (const player of ['white', 'black'] as const) {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    it(`${difficulty} ${player} finishes a nonwinning capture with no search time left`, async () => {
      const { state, attacker, target } = adjacentCapture(player);
      const before = structuredClone(state);
      const result = await new AIEngineV2(difficulty).findBestAction(state, 0);
      const action = result.plan.actions[0];
      expect(action).toEqual({ type: 'ATTACK', unitId: attacker.id, targetPosition: target.position });
      expect(isLegalAction(state, action)).toBe(true);
      const next = applyAction(state, action);
      expect(next.board.units.some(unit => unit.id === target.id)).toBe(false);
      expect(next.phase).toBe('playing');
      expect(next.turn.actionsRemaining).toBe(0);
      expect(state).toEqual(before);
    });
  }
}

for (const unavailable of ['no actions', 'spent attack', 'cannot act', 'not lethal'] as const) {
  it(`does not invent a deadline capture with ${unavailable}`, async () => {
    const { state, attacker, target } = adjacentCapture('black');
    if (unavailable === 'no actions') state.turn.actionsRemaining = 0;
    if (unavailable === 'spent attack') {
      attacker.hasAttacked = true;
      attacker.attackedThisTurn = ['previously-captured-unit'];
      attacker.lastAttackKilled = true;
    }
    if (unavailable === 'cannot act') attacker.canActThisTurn = false;
    if (unavailable === 'not lethal') target.definitionId = 'water_3';
    const result = await new AIEngineV2('hard').findBestAction(state, 0);
    expect(result.plan.actions).toEqual([{ type: 'END_ACTION_PHASE' }]);
    expect(isLegalAction(state, result.plan.actions[0])).toBe(true);
  });
}

it('uses a deadline capture to clear home before taking a more expensive piece', async () => {
  const { state, attacker, target } = adjacentCapture('white');
  attacker.position = { x: 1, y: 0 };
  target.position = { x: 0, y: 0 };
  const expensive = state.board.units[2];
  expensive.definitionId = 'plant_3';
  expensive.position = { x: 2, y: 0 };
  expensive.damageTaken = getUnitDefinition(expensive.definitionId).defense - 1;
  const result = await new AIEngineV2('hard').findBestAction(state, 0);
  expect(result.plan.actions[0]).toEqual({ type: 'ATTACK', unitId: attacker.id, targetPosition: target.position });
  expect(applyAction(state, result.plan.actions[0]).board.units.some(unit => unit.id === expensive.id)).toBe(true);
});
