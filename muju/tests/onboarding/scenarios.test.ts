import { describe, expect, it } from 'vitest';
import { applyAction, transitionWithoutCheckmate } from '../../src/ai/simulate';
import { getUnitById } from '../../src/game/board';
import { calculateAttackPower, calculateDefense } from '../../src/game/combat';
import { analyzeHomeDefense } from '../../src/game/homeCheckmate';
import { findAttackApproach, getMoveCost, movementActionCost } from '../../src/game/movement';
import { getUnitDefinition } from '../../src/game/units';
import { upkeepForTier } from '../../src/game/upkeep';
import { finishScenario, scenarioStops, activeUnitId, buildScenarioState, goalSquare, hopsAlong, playScenario, scenarioById, scenarioPlan, SCENARIOS, targetUnitId, unitId } from '../../src/onboarding/scenarios';

/** Every expectation is computed from the live catalogue, not hard-coded costs. */
const muju = scenarioById('muju')!, hono = scenarioById('hono')!, irumbu = scenarioById('irumbu')!;

describe('onboarding scenarios', () => {
  it('uses three pieces in all and gives each puzzle to its piece\'s side: White, Black, White', () => {
    expect(SCENARIOS.map(s => buildScenarioState(s).turn.currentPlayer)).toEqual(['white', 'black', 'white']);
    expect(new Set(SCENARIOS.flatMap(s => s.pieces.map(p => unitId(p))))).toEqual(new Set(['tutorial-white-muju', 'tutorial-black-hono', 'tutorial-white-irumbu']));
  });

  it('build positions with four actions, no kill clock and only the listed banks', () => {
    for (const scenario of SCENARIOS) {
      const state = buildScenarioState(scenario);
      expect(state.board.cells).toHaveLength(scenario.size);
      expect(state.turn).toMatchObject({ phase: 'action', actionsRemaining: 4 });
      expect(state.inactivityRule).toBe('off');
      expect(state.players.black.resources).toBe(0);
      expect(state.players.white.resources).toBe(scenario.banks?.white ?? 0);
    }
  });

  it('places crystals only where the scenario lists them; puzzle 1 has one reserve of 8 in the far corner', () => {
    for (const scenario of SCENARIOS) {
      const state = buildScenarioState(scenario);
      for (const cell of state.board.cells.flat()) {
        const listed = scenario.reserves.find(r => r.x === cell.position.x && r.y === cell.position.y)?.crystals ?? 0;
        expect(cell.resourceLayers).toBe(listed);
      }
    }
    expect(buildScenarioState(muju).board.cells.flat().map(c => c.resourceLayers)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 8]);
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

  it('puzzle 2: the black Honō approaches in three actions and its fourth eliminates the white Muju', () => {
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
    // The only defender is the Honō, and it cannot pierce the Irumbu's defense.
    const defender = state.board.units.find(u => u.owner === 'black')!;
    expect(calculateAttackPower(defender, unit)).toBeLessThan(calculateDefense(unit));
    // White mines nothing, so its bank must cover exactly the Irumbu's upkeep.
    expect(irumbu.banks?.white).toBe(upkeepForTier(getUnitDefinition('metal_3').tier));
    const { frames, checkmate } = playScenario(irumbu);
    const invaded = frames.at(-1)!;
    expect(invaded.turn.actionsRemaining).toBe(0);
    expect(getUnitById(invaded.board, unit.id)!.position).toEqual({ x: 9, y: 9 });
    expect(analyzeHomeDefense(invaded, 'white', transitionWithoutCheckmate)).toBe('mate');
    expect(checkmate).toBe(true);
  });

  it('carries pieces and reserves into the larger boards exactly where they finished', () => {
    const one = playScenario(muju).final, two = playScenario(hono).frames.at(-1)!;
    const twoStart = buildScenarioState(hono), threeStart = buildScenarioState(irumbu);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) expect(twoStart.board.cells[y][x].resourceLayers).toBe(one.board.cells[y][x].resourceLayers);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) expect(threeStart.board.cells[y][x].resourceLayers).toBe(two.board.cells[y][x].resourceLayers);
    const at = (state: typeof one, id: string) => getUnitById(state.board, id)?.position;
    const mujuId = activeUnitId(muju), honoId = activeUnitId(hono);
    expect(at(twoStart, mujuId)).toEqual(at(one, mujuId));
    expect(targetUnitId(hono)).toBe(mujuId); // the Honō eats the Muju from puzzle 1
    expect(at(two, mujuId)).toBeUndefined();
    expect(at(threeStart, mujuId)).toBeUndefined();
    expect(at(threeStart, honoId)).toEqual(at(two, honoId));
    expect(irumbu.pieces.find(p => p.id === 'hono')!.inert).toBe(true);
  });

  it('offers gold-dot stops only where the puzzle stays winnable', () => {
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    // Speed 1 wastes nothing: every square of the Muju's walk is a stop.
    const one = buildScenarioState(muju);
    expect(scenarioStops(one, muju).map(key)).toEqual(scenarioPlan(one, muju).path.map(key));
    // Speed 2 with an exact budget: the Irumbu may only stop on even squares.
    const three = buildScenarioState(irumbu);
    expect(scenarioStops(three, irumbu).map(key)).toEqual(['9,3', '9,5', '9,7', '9,9']);
  });

  it('wins from every chain of stops: always stopping at the first or last dot still finishes the puzzle', () => {
    for (const scenario of SCENARIOS) for (const pick of ['first', 'last'] as const) {
      let state = buildScenarioState(scenario);
      for (let guard = 0; guard < 8; guard++) {
        const stops = scenarioStops(state, scenario).filter(p => p.x !== goalSquare(scenario).x || p.y !== goalSquare(scenario).y);
        if (!stops.length) break;
        const to = pick === 'first' ? stops[0] : stops.at(-1)!;
        const next = applyAction(state, { type: 'MOVE', unitId: activeUnitId(scenario), to });
        expect(next).not.toBe(state);
        state = next;
      }
      for (const action of scenarioPlan(state, scenario).actions) state = applyAction(state, action);
      const finished = finishScenario(state, scenario);
      if (scenario.goal.kind === 'invade') expect(finished.checkmate).toBe(true);
      if (scenario.goal.kind === 'kill') expect(getUnitById(state.board, targetUnitId(scenario)!)).toBeNull();
      if (scenario.goal.kind === 'move') expect(getUnitById(state.board, activeUnitId(scenario))!.position).toEqual(goalSquare(scenario));
    }
  });

  it('shows homes only on the full board', () => {
    expect(SCENARIOS.map(s => s.hideHomeMarkers)).toEqual([true, true, false]);
  });

  it('splits paths into speed-sized hops of one action each', () => {
    expect(hopsAlong([{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }], 2)).toEqual([{ x: 0, y: 2 }, { x: 0, y: 3 }]);
    for (const scenario of SCENARIOS) {
      const state = buildScenarioState(scenario);
      expect(scenarioPlan(state, scenario).actions).toHaveLength(4);
    }
  });
});
