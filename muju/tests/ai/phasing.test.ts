// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { INACTIVITY_LIMIT } from '../../src/game/inactivity';
import { LADDER_RULES_VERSION, rulesetForRevision } from '../../lab/hard-ai/ladder/ruleset';
import { getUnitDefinition } from '../../src/game/units';
import { isLegalAction } from '../../src/game/legality';
import { applyAction, applyActions } from '../../src/ai/simulate';
import { passTurn } from '../../src/ai/planner/turn';
import { placementPlans, preferSafePurchases } from '../../src/ai/planner/placement';
import { summonDisruptable, pendingMaterial, pendingIncome, disruptionPressure } from '../../src/ai/planner/summons';
import { evaluatePosition, quickEvaluate } from '../../src/ai/evaluation';
import { scorePartialPlan } from '../../src/ai/planner/scoring';
import { generateAllActions, generatePlaceActions } from '../../src/ai/moves';
import { beamSearchPlans } from '../../src/ai/planner/beam';
import { generateTemplatePlans } from '../../src/ai/planner/templates';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { playPhasingSmoke } from '../../lab/ai/phasing-selfplay';

const initial = () => createInitialGameState(undefined, 4, 0, 'phasing');
let solver: TacticalSolver;
beforeAll(async () => { solver = await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm')); });

it('passes the full Act/upkeep/Prepare turn, mining once and resolving incoming summons', () => {
  const state = initial();
  state.reviewUpkeep = { white: true };
  const cost = getUnitDefinition('fire_1').cost;
  state.pendingSummons = [{ id: 'incoming', owner: 'black', definitionId: 'fire_1', position: { x: 9, y: 9 }, cost }];
  const before = structuredClone(state);
  const prepare = applyAction(state, { type: 'END_ACTION_PHASE' });
  expect(prepare.turn.currentPlayer).toBe('white');
  expect(prepare.upkeepPending).toBe(true);
  const reply = passTurn(state);
  expect(reply.turn).toMatchObject({ currentPlayer: 'black', phase: 'action', actionsRemaining: 4 });
  expect(reply.players.white.resourcesGained).toBe(prepare.players.white.resourcesGained);
  expect(reply.inactivityPlies).toBe(1);
  expect(reply.pendingSummons).toEqual([]);
  expect(reply.board.units.find(u => u.id === 'incoming')).toMatchObject({ canActThisTurn: true });
  expect(state).toEqual(before);
  expect(passTurn(prepare)).toEqual(reply);
});

it('does not hand off or resolve summons after a kill-clock terminal', () => {
  const state = initial(); state.inactivityPlies = INACTIVITY_LIMIT - 1;
  const result = passTurn(state);
  // White mines this turn and Black has not moved yet, so the kill clock
  // decides on mined totals rather than drawing.
  expect(result).toMatchObject({ phase: 'victory', winner: 'white', victoryReason: 'kill-clock' });
  expect(result.turn.currentPlayer).toBe('white');
});

it('values delayed public capital and discounted income without adding an actual miner', () => {
  const state = applyAction(initial(), { type: 'END_ACTION_PHASE' });
  const action = { type: 'BUY_UNIT' as const, definitionId: 'plant_1', position: { x: 0, y: 0 } };
  const bought = applyAction(state, action), cost = getUnitDefinition('plant_1').cost;
  expect(bought).not.toBe(state);
  expect(bought.board.units).toEqual(state.board.units);
  expect(bought.players.white.resourcesGained).toBe(state.players.white.resourcesGained);
  expect(pendingMaterial(bought, 'white')).toBeCloseTo(0.9 * cost);
  expect(pendingIncome(bought, 'white')).toBeGreaterThan(0);
  expect(quickEvaluate(bought, 'white') - quickEvaluate(state, 'white')).toBeCloseTo(0.9 * cost);
  expect(evaluatePosition(bought, 'white')).toBeGreaterThan(evaluatePosition(state, 'white'));
  expect(generateAllActions(bought, 'white').some(a => a.type === 'BUY_UNIT' && a.position.x === 0 && a.position.y === 0)).toBe(false);
  expect(placementPlans(bought, 'white').flatMap(p => p.actions).some(a => a.type === 'ATTACK')).toBe(false);
});

it('does not count Prepare income a second time', () => {
  const state = applyAction(initial(), { type: 'END_ACTION_PHASE' });
  const action = { type: 'PROMOTE_UNIT' as const, unitId: state.board.units.find(u => u.owner === 'white' && u.definitionId === 'plant_1')!.id };
  state.players.white.resources = 20;
  const next = applyAction(state, action);
  const score = scorePartialPlan({ id: 'promote', actions: [action], score: 0, tags: [] }, state, 'white', next);
  expect(score).toBeCloseTo(evaluatePosition(next, 'white') - 0.1);
});

it('prunes reachable commitments only in the planner using next-turn flags and values disruption as tempo', () => {
  const state = initial(); state.turn.phase = 'place'; state.players.white.resources = 20;
  state.board.units = [createUnit('plant_1', 'white', { x: 4, y: 4 }), createUnit('fire_1', 'black', { x: 5, y: 4 })];
  state.board.units[1].canActThisTurn = false;
  const sq = { x: 3, y: 3 };
  expect(summonDisruptable(state, 'white', sq)).toBe(true);
  const legal = generateAllActions(state, 'white');
  expect(legal.some(a => a.type === 'BUY_UNIT' && a.position.x === sq.x && a.position.y === sq.y)).toBe(true);
  expect(preferSafePurchases(state, 'white', legal).some(a => a.type === 'BUY_UNIT' && a.position.x === sq.x && a.position.y === sq.y)).toBe(false);
  const pending = { id: 'pending', owner: 'white' as const, definitionId: 'fire_1', position: sq, cost: 3 };
  state.pendingSummons = [pending];
  expect(pendingMaterial(state, 'white')).toBe(1.5);
  const invaded = { ...state, board: { ...state.board, units: state.board.units.map(u => u.owner === 'black' ? { ...u, position: sq } : u) } };
  expect(disruptionPressure(invaded, 'black')).toBeCloseTo(1.8);
  expect(pendingIncome(invaded, 'white')).toBe(0);
});

it.each([79, 96])('keeps and searches risky purchases in the zero-buy Rush replay at ply %i', async ply => {
  const replay = JSON.parse(readFileSync('lab/ai/results/t2b-gate1-pilot-2026-09-19/replays/Rush-h0-p0-black.json', 'utf8'));
  let state = initial();
  state.board.units.forEach((u, i) => { u.id = `initial-${i}`; });
  for (const step of replay.steps.slice(1)) {
    if (step.ply === ply) break;
    expect(isLegalAction(state, step.action)).toBe(true);
    state = applyAction(state, step.action);
  }
  expect(state.turn).toMatchObject({ currentPlayer: 'black', phase: 'place' });
  expect(state.players.black.resources).toBe(ply === 79 ? 4 : 7);
  const buys = generatePlaceActions(state, 'black');
  expect(buys).toHaveLength(ply === 79 ? 96 : 174);
  for (const buy of buys) {
    expect(isLegalAction(state, buy)).toBe(true);
    if (buy.type === 'BUY_UNIT') expect(summonDisruptable(state, 'black', buy.position)).toBe(true);
  }
  expect(placementPlans(state, 'black').some(p => p.actions.some(a => a.type === 'BUY_UNIT'))).toBe(true);
  const engine = new AIEngineV2('hard');
  engine.setSeed(2113312924); engine.setTacticalSolver(solver);
  engine.setConfig({ fixedWork: 857 }); // The original replay's Prepare slice.
  const result = await engine.findBestAction(state, Infinity);
  expect(result.plan.actions[0].type).toBe('BUY_UNIT');
  expect(isLegalAction(state, result.plan.actions[0])).toBe(true);
  expect(applyAction(state, result.plan.actions[0]).board.units).toEqual(state.board.units);
});

it('uses risky legal squares after the last safe square is reserved by a pending summon', () => {
  const replay = JSON.parse(readFileSync('lab/ai/results/t2b-gate1-pilot-2026-09-19/replays/Rush-h0-p0-black.json', 'utf8'));
  let state = initial();
  state.board.units.forEach((u, i) => { u.id = `initial-${i}`; });
  for (const step of replay.steps.slice(1)) {
    if (step.ply === 14) break;
    state = applyAction(state, step.action);
  }
  const safe = preferSafePurchases(state, 'black', generatePlaceActions(state, 'black'));
  expect(safe).toHaveLength(6);
  for (const a of safe) if (a.type === 'BUY_UNIT') expect(summonDisruptable(state, 'black', a.position)).toBe(false);
  const next = applyAction(state, safe.find(a => a.type === 'BUY_UNIT' && a.definitionId === 'fire_1')!);
  const fallback = preferSafePurchases(next, 'black', generatePlaceActions(next, 'black'));
  expect(fallback.length).toBeGreaterThan(0);
  for (const a of fallback) {
    expect(isLegalAction(next, a)).toBe(true);
    if (a.type === 'BUY_UNIT') expect(summonDisruptable(next, 'black', a.position)).toBe(true);
  }
});

it('beam crosses Act then upkeep then Prepare without purchasing before Act', () => {
  const state = initial(); state.turn.actionsRemaining = 0; state.reviewUpkeep = { white: true };
  state.board.cells = state.board.cells.map(row => row.map(cell => ({ ...cell, resourceLayers: 0 })));
  const plans = beamSearchPlans(state, 'white', { beamWidth: 2, outputPlans: 2, templates: false });
  expect(plans.length).toBeGreaterThan(0);
  for (const plan of plans) {
    expect(plan.actions.map(a => a.type)).toEqual(['END_ACTION_PHASE', 'PAY_UPKEEP', 'END_PLACE_PHASE']);
    expect(applyActions(state, plan.actions).turn.currentPlayer).toBe('black');
  }
  const prepare = applyAction(initial(), { type: 'END_ACTION_PHASE' });
  expect(generateTemplatePlans(prepare, 'white')).toEqual([]);
});

it('the engine pays mid-turn upkeep and makes only legal Prepare decisions', async () => {
  const state = initial(); state.reviewUpkeep = { white: true };
  let next = applyAction(state, { type: 'END_ACTION_PHASE' });
  const engine = new AIEngineV2('medium'); engine.setConfig({ fixedWork: 400 });
  engine.setTacticalSolver(() => { throw new Error('Prepare is outside Act proof scope'); });
  const upkeep = await engine.findBestAction(next);
  expect(upkeep.plan.actions[0].type).toBe('PAY_UPKEEP');
  next = applyActions(next, upkeep.plan.actions);
  // Prepare skips tactical work entirely, including opponent raids.
  const prepared = await engine.findBestAction(next);
  for (const action of prepared.plan.actions) {
    expect(isLegalAction(next, action)).toBe(true);
    next = applyAction(next, action);
  }
});

it('fixed-work Phasing self-play is reproducible, purchases and terminates legally', async () => {
  const a = await playPhasingSmoke('easy', 20260918, 0, solver, 500);
  const b = await playPhasingSmoke('easy', 20260918, 0, solver, 500);
  expect(a.traceSha256).toBe(b.traceSha256);
  expect(a.purchases).toBeGreaterThan(0);
  expect(a.arrivals).toBeGreaterThan(0);
  expect(a.illegalActions).toBe(0);
  expect(a.turns).toBeLessThan(400);
  // The screening row must label itself with the revision it was actually played
  // under, keyed on the clock's limit, its verdict AND the Cleave chain (10 plies
  // + mined-total + unbounded -> `muju-phasing-4`), never guessed from the limit
  // alone — a limit of 10 also matched `muju-phasing-1`'s draw verdict and
  // `muju-phasing-3`'s tier-capped chain, so a numeric-only check would have
  // silently mislabeled a screening row.
  expect(a.rules).toBe(LADDER_RULES_VERSION);
  expect(a.rules).toBe('muju-phasing-4');
  expect(rulesetForRevision(a.rules, 'phasing self-play smoke')).toBe('phasing');
}, 30000);
