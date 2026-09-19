// @vitest-environment node
import { expect, it } from 'vitest';
import { generateAllActions, generatePlaceActions, generatePlacePhaseActions } from '../../src/ai/moves';
import { legalActions } from '../../lab/harness/legal';
import { placementPlans, preferSafePurchases } from '../../src/ai/planner/placement';
import { beamSearchPlans } from '../../src/ai/planner/beam';
import { summonDisruptable } from '../../src/ai/planner/summons';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction } from '../../src/game/legality';
import { actionKeys, exhaustivePrepare, mixedPrepare } from '../fixtures/prepare-legality';

it.each(['standard', 'phasing'] as const)('matches exhaustive ordinary Prepare legality for %s and both seats', ruleset => {
  for (const player of ['white', 'black'] as const) for (const cash of [0, 2, 3, 5, 20]) {
    const state = mixedPrepare(ruleset, player);
    state.players[player].resources = cash;
    if (ruleset === 'phasing') state.pendingSummons = [
      { id: 'reserved-own', owner: player, definitionId: 'fire_1', position: state.players[player].startCorner, cost: 3 },
      { id: 'reserved-other', owner: player === 'white' ? 'black' : 'white', definitionId: 'fire_1', position: { x: 2, y: 2 }, cost: 3 },
    ];
    const expected = exhaustivePrepare(state);
    expect(actionKeys(generatePlaceActions(state, player))).toEqual(actionKeys(expected.filter(a => a.type === 'BUY_UNIT')));
    for (const actual of [generatePlacePhaseActions(state, player), generateAllActions(state, player), legalActions(state, player)]) {
      expect(actionKeys(actual)).toEqual(actionKeys(expected));
      expect(new Set(actionKeys(actual)).size).toBe(actual.length);
    }
    if (ruleset === 'standard') expect(actionKeys(preferSafePurchases(state, player, expected))).toEqual(actionKeys(expected));
  }
});

it('keeps mixed safe/risky buys in the oracle while both V2 candidate paths prefer safe buys', () => {
  const state = mixedPrepare(), expected = exhaustivePrepare(state);
  const buys = expected.filter(a => a.type === 'BUY_UNIT');
  expect(buys).toHaveLength(132);
  const safe = buys.filter(a => !summonDisruptable(state, 'white', a.position));
  expect(safe.length).toBeGreaterThan(0); expect(safe.length).toBeLessThan(buys.length);
  expect(actionKeys(generateAllActions(state, 'white'))).toEqual(actionKeys(expected));
  expect(actionKeys(legalActions(state, 'white'))).toEqual(actionKeys(expected));
  const candidates = preferSafePurchases(state, 'white', expected);
  expect(actionKeys(candidates.filter(a => a.type === 'BUY_UNIT'))).toEqual(actionKeys(safe));
  expect(actionKeys(candidates.filter(a => a.type !== 'BUY_UNIT'))).toEqual(actionKeys(expected.filter(a => a.type !== 'BUY_UNIT')));
  for (const plans of [placementPlans(state, 'white'), beamSearchPlans(state, 'white', {
    maxSteps: 1, beamWidth: expected.length, outputPlans: expected.length, templates: false,
  })]) {
    const searched = plans.flatMap(p => p.actions).filter(a => a.type === 'BUY_UNIT');
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every(a => !summonDisruptable(state, 'white', a.position))).toBe(true);
  }
});

it('retains all risky legal buys in placement and beam after the final safe squares are reserved', () => {
  let state = mixedPrepare(); state.players.white.resources = 1000;
  const safeSquares = new Map(exhaustivePrepare(state).filter(a => a.type === 'BUY_UNIT').filter(a => !summonDisruptable(state, 'white', a.position))
    .map(a => [JSON.stringify(a.position), a.position]));
  expect(safeSquares.size).toBeGreaterThan(0);
  for (const position of safeSquares.values()) {
    const buy = { type: 'BUY_UNIT' as const, definitionId: 'fire_1', position };
    expect(isLegalAction(state, buy)).toBe(true); state = applyAction(state, buy);
  }
  const legal = exhaustivePrepare(state), buys = legal.filter(a => a.type === 'BUY_UNIT');
  expect(buys.length).toBeGreaterThan(0);
  expect(buys.every(a => summonDisruptable(state, 'white', a.position))).toBe(true);
  expect(actionKeys(preferSafePurchases(state, 'white', legal))).toEqual(actionKeys(legal));
  expect(actionKeys(generatePlaceActions(state, 'white'))).toEqual(actionKeys(buys));
  const beam = beamSearchPlans(state, 'white', { maxSteps: 1, beamWidth: legal.length, outputPlans: legal.length, templates: false });
  expect(actionKeys(beam.flatMap(p => p.actions).filter(a => a.type === 'BUY_UNIT'))).toEqual(actionKeys(buys));
  expect(placementPlans(state, 'white').some(p => p.actions.some(a => a.type === 'BUY_UNIT'))).toBe(true);
});
