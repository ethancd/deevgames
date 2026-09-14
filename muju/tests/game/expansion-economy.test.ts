import { describe, expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { endOfTurnIncome } from '../../src/game/mining';

describe('expansion economy', () => {
  it('collects 3, 5 and 8 through a legal Plant promotion climb on one 16-square', () => {
    let state = createInitialGameState();
    const plant = { ...createUnit('plant_1', 'white', { x: 7, y: 1 }), placedThisTurn: true };
    state.board.units = [plant, createUnit('lightning_1', 'black', { x: 9, y: 9 })];
    // Money from the rest of the economy, after purchasing this miner.
    state.players.white.resources = 20;
    const takes: number[] = [];
    for (let tier = 1; tier <= 3; tier++) {
      if (tier > 1) {
        state = applyAction(state, { type: 'PROMOTE_UNIT', unitId: plant.id });
        expect(state.board.units[0].definitionId).toBe(`plant_${tier}`);
        expect(state.turn.actionsRemaining).toBe(4);
        state = applyAction(state, { type: 'END_PLACE_PHASE' });
      }
      state = applyAction(state, { type: 'END_ACTION_PHASE' });
      takes.push(state.lastIncome!.takes.find(t => t.unitId === plant.id)!.amount);
      if (tier < 3) state = applyAction(state, { type: 'END_ACTION_PHASE' });
    }
    expect(takes).toEqual([3, 5, 8]);
    expect(state.board.cells[1][7].resourceLayers).toBe(0);
    expect(state.players.white).toMatchObject({ resources: 23, resourcesGained: 16, resourcesUpkeep: 1 });
  });

  it.each([
    ['plant_1', [3, 3, 3, 3, 3, 1]],
    ['plant_2', [5, 5, 5, 1]],
    ['plant_3', [8, 8]],
  ] as const)('%s exhausts a fresh expansion without over-collecting', (definition, expected) => {
    let state = createInitialGameState();
    state.board.units = [createUnit(definition, 'white', { x: 7, y: 1 })];
    const takes = [];
    for (let i = 0; i <= expected.length; i++) {
      const result = endOfTurnIncome(state, 'white');
      takes.push(result.total); state = result.state;
    }
    expect(takes).toEqual([...expected, 0]);
    expect(state.players.white.resourcesGained).toBe(16);
    expect(state.board.cells[1][7].resourceLayers).toBe(0);
  });

  it('accepts every reserve through 16 and rejects values outside the map contract', () => {
    for (let reserve = 0; reserve <= 16; reserve++) {
      expect(createInitialGameState(Array(100).fill(reserve)).board.cells[0][0].resourceLayers).toBe(reserve);
    }
    for (const reserve of [-1, 16.5, 17, NaN]) {
      expect(() => createInitialGameState(Array(100).fill(reserve))).toThrow('Invalid starting resource layout');
    }
  });
});
