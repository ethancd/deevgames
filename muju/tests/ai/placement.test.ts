// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { isLegalAction } from '../../src/game/legality';
import { placementPlans, incomeMovePriority } from '../../src/ai/planner/placement';
import { applyAction } from '../../src/ai/simulate';

describe('public placement planning', () => {
  it('keeps summon-and-strike candidates legal through buys, phase change and attacks', () => {
    const state = createInitialGameState();
    state.turn.phase = 'place';
    state.players.white.resources = state.players.white.resourcesGained = 6;
    state.board.units.push(createUnit('water_1', 'white', { x: 4, y: 4 }));
    state.board.units.push(createUnit('plant_2', 'black', { x: 5, y: 3 }));
    const plans = placementPlans(state, 'white');
    const strikes = plans.filter(p => p.actions.some(a => a.type === 'BUY_UNIT') && p.actions.some(a => a.type === 'ATTACK'));
    expect(strikes.length).toBeGreaterThan(0);
    for (const plan of plans) {
      let next = state;
      for (const action of plan.actions) {
        expect(isLegalAction(next, action)).toBe(true);
        next = applyAction(next, action);
        expect(next.players.white.resources).toBeGreaterThanOrEqual(0);
      }
    }
    expect(plans.some(p => p.actions.some(a => a.type === 'PROMOTE_UNIT'))).toBe(true);
    expect(plans.some(p => p.actions.some(a => a.type === 'BUY_UNIT' && a.definitionId === 'plant_1'))).toBe(true);
  });

  it('does not generate purchases while an enemy occupies home', () => {
    const state = createInitialGameState();
    state.turn.phase = 'place';
    state.players.white.resources = state.players.white.resourcesGained = 20;
    state.board.units.push(createUnit('lightning_1', 'black', { x: 0, y: 0 }));
    const plans = placementPlans(state, 'white');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.flatMap(p => p.actions).some(a => a.type === 'BUY_UNIT')).toBe(false);
  });

  it('prioritizes leaving exhausted ground by the actual final-position income difference', () => {
    const state = createInitialGameState();
    const miner = state.board.units.find(u => u.owner === 'white' && u.definitionId === 'plant_1')!;
    state.board.cells[miner.position.y][miner.position.x].resourceLayers = 0;
    expect(incomeMovePriority(state, { type: 'MOVE', unitId: miner.id, to: { x: 0, y: 2 } })).toBe(3);
    state.board.cells[miner.position.y][miner.position.x].resourceLayers = 2;
    expect(incomeMovePriority(state, { type: 'MOVE', unitId: miner.id, to: { x: 0, y: 2 } })).toBe(1);
  });
});
