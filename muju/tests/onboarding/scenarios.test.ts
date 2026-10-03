import { describe, expect, it } from 'vitest';
import { transitionWithoutCheckmate } from '../../src/ai/simulate';
import { getUnitById } from '../../src/game/board';
import { calculateAttackPower, calculateDefense } from '../../src/game/combat';
import { analyzeHomeDefense } from '../../src/game/homeCheckmate';
import { findAttackApproach, getMoveCost, movementActionCost } from '../../src/game/movement';
import { getUnitDefinition } from '../../src/game/units';
import { activeUnitId, buildScenarioState, goalSquare, hopsAlong, playScenario, scenarioById, scenarioPlan, SCENARIOS, targetUnitId, unitId } from '../../src/onboarding/scenarios';

/** Every expectation is computed from the live catalogue, not hard-coded costs. */
const muju = scenarioById('muju')!, hono = scenarioById('hono')!, irumbu = scenarioById('irumbu')!;

describe('onboarding scenarios', () => {
  it('build White-to-move positions with four actions, no kill clock and an empty Black bank', () => {
    for (const scenario of SCENARIOS) {
      const state = buildScenarioState(scenario);
      expect(state.board.cells).toHaveLength(scenario.size);
      expect(state.turn).toMatchObject({ currentPlayer: 'white', phase: 'action', actionsRemaining: 4 });
      expect(state.inactivityRule).toBe('off');
      expect(state.players.black.resources).toBe(0);
    }
  });

  it('puzzle 1: the Muju reaches the far corner with exactly the whole turn and mines from 8 crystals', () => {
    const state = buildScenarioState(muju);
    const unit = getUnitById(state.board, activeUnitId(muju))!;
    expect(getMoveCost(unit.position, goalSquare(muju), getUnitDefinition(unit.definitionId).speed, state.board)).toBe(4);
    const { frames, final, mined } = playScenario(muju);
    expect(frames.at(-1)!.turn.actionsRemaining).toBe(0);
    expect(mined).toBe(Math.min(8, getUnitDefinition('plant_1').mining));
    expect(final.board.cells[2][2].resourceLayers).toBe(8 - mined);
  });

  it('puzzle 2: the Honō approaches in three actions and its fourth eliminates the black Muju', () => {
    const state = buildScenarioState(hono);
    const attacker = getUnitById(state.board, activeUnitId(hono))!, prey = getUnitById(state.board, targetUnitId(hono)!)!;
    const path = findAttackApproach(attacker, prey, state.board, 4)!;
    expect(path).not.toBeNull();
    expect(movementActionCost(path.length, getUnitDefinition(attacker.definitionId).speed)).toBe(3);
    expect(calculateAttackPower(attacker, prey)).toBeGreaterThanOrEqual(calculateDefense(prey));
    expect(calculateAttackPower(attacker, prey)).toBe(getUnitDefinition('fire_2').attack + 1); // the vulnerable case
    const { frames } = playScenario(hono);
    expect(frames.at(-1)!.turn.actionsRemaining).toBe(0);
    expect(getUnitById(frames.at(-1)!.board, prey.id)).toBeNull();
  });

  it('puzzle 3: the Irumbu reaches the black home in exactly four actions and the prover reports checkmate', () => {
    const state = buildScenarioState(irumbu);
    const unit = getUnitById(state.board, activeUnitId(irumbu))!;
    expect(getMoveCost(unit.position, goalSquare(irumbu), getUnitDefinition(unit.definitionId).speed, state.board)).toBe(4);
    const { frames, checkmate } = playScenario(irumbu);
    const invaded = frames.at(-1)!;
    expect(invaded.turn.actionsRemaining).toBe(0);
    expect(getUnitById(invaded.board, unit.id)!.position).toEqual({ x: 9, y: 9 });
    expect(analyzeHomeDefense(invaded, 'white', transitionWithoutCheckmate)).toBe('mate');
    expect(checkmate).toBe(true);
  });

  it('carries earlier pieces and reserves into the larger boards exactly where they finished', () => {
    const one = playScenario(muju).final, two = playScenario(hono).frames.at(-1)!;
    const twoStart = buildScenarioState(hono), threeStart = buildScenarioState(irumbu);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) expect(twoStart.board.cells[y][x].resourceLayers).toBe(one.board.cells[y][x].resourceLayers);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) expect(threeStart.board.cells[y][x].resourceLayers).toBe(two.board.cells[y][x].resourceLayers);
    const at = (state: typeof one, id: string) => getUnitById(state.board, id)!.position;
    expect(at(twoStart, unitId({ id: 'muju', owner: 'white' }))).toEqual(at(one, activeUnitId(muju)));
    expect(at(threeStart, unitId({ id: 'muju', owner: 'white' }))).toEqual(at(one, activeUnitId(muju)));
    expect(at(threeStart, unitId({ id: 'hono', owner: 'white' }))).toEqual(at(two, activeUnitId(hono)));
    for (const scenario of [hono, irumbu]) expect(scenario.pieces.filter(p => p.owner === 'white' && p.id !== scenario.active).every(p => p.inert)).toBe(true);
  });

  it('splits paths into speed-sized hops of one action each', () => {
    expect(hopsAlong([{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }], 2)).toEqual([{ x: 0, y: 2 }, { x: 0, y: 3 }]);
    for (const scenario of SCENARIOS) {
      const state = buildScenarioState(scenario);
      expect(scenarioPlan(state, scenario).actions).toHaveLength(4);
    }
  });
});
