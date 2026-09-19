// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { isValidSpawnPosition } from '../../../src/game/spawning';
import { CONFIG_FEATURE_COUNT, PHASING_EVAL_SCHEMA } from '../../../src/ai/hard/config';
import { Replica } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { GAMMA_Q16 } from '../../../src/ai/hard/core/income';
import { Result, type Side } from '../../../src/ai/hard/types';
import { allocTables, buildTables, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8 } from '../../../src/ai/hard/tables/context';
import * as tablesModule from '../../../src/ai/hard/tables/context';
import { PhasingEconomyProofCutoff } from '../../../src/ai/hard/tables/phasing-economy';
import { KILL_IMPOSSIBLE, KILL_PENDING_ATTACKER, killTable, minActionsToKill, newKillPlan, newKillTable, type KillOpts } from '../../../src/ai/hard/tables/kill';
import { F, FEATURE_COUNT, FEATURE_NAMES, STAGE_OF, boundStage2 } from '../../../src/ai/hard/eval/features';
import { DEFAULT_WEIGHTS, cloneWeights, loadWeights, serializeWeights, WEIGHTS_VERSION, weightsHash } from '../../../src/ai/hard/eval/weights';
import { Evaluator, WORK_CLASS_EVAL1, WORK_CLASS_EVAL2, WORK_CLASS_PROVER } from '../../../src/ai/hard/eval/evaluate';
import { newPendingDiagnostics, pendingDiagnostics } from '../../../src/ai/hard/eval/pending';
import { EVAL_GROUPS, GROUP_OF, INVARIANT_FEATURES } from '../../../lab/hard-ai/audit/eval-groups';
import { buildState, type StateSpec } from './game-fixture';
import { prepare } from './search-fixture';
import { evaluateLeaf, generateAt, pvs } from '../../../src/ai/hard/search/pvs';
import { quiesce } from '../../../src/ai/hard/search/quiesce';
import { WORK_COST, WorkClass } from '../../../src/ai/hard/search/time';

vi.setConfig({ testTimeout: 10_000 });
const rep = new Replica();
const sc = new Scratch(2, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);
const empty = () => new Array<number>(100).fill(0);
const base = (overrides: Partial<StateSpec> = {}): StateSpec => ({
  units: [{ id: 'anchor', def: 'metal_1', owner: 'white', x: 2, y: 2 }, { id: 'enemy', def: 'fire_1', owner: 'black', x: 4, y: 2 }],
  pendingSummons: [{ id: 'paid', def: 'fire_1', owner: 'white', x: 1, y: 1 }],
  current: 'black', phase: 'place', actions: 0, white: 0, black: 0,
  reserves: empty(), victoryRule: 'elimination', inactivityRule: 'off', ...overrides,
});
function inspect(spec: StateSpec) {
  const state = buildState(spec), p = rep.pack(state), t = buildTables(p, sc, 0, 2, allocTables());
  return { state, p, t, d: pendingDiagnostics(p, t, sc, 0, newPendingDiagnostics()) };
}
function vector(spec: StateSpec, side: Side = 0) {
  const p = rep.pack(buildState(spec)), ev = new Evaluator(rep), f = new Int32Array(FEATURE_COUNT);
  return { p, ev, f, score: ev.full(p, side, sc, 0, f) };
}

describe('frozen Phasing accounting schema and sparse weights', () => {
  it('preserves old indices, appends four features and never absorbs them into invariants', () => {
    expect([F.Material, F.EconDelta, F.Inv1SpawnZero, F.Inv20StrandNoRetreat]).toEqual([0, 23, 38, 57]);
    expect([F.PendingValue, F.ArrivalThreat, F.DisruptPressure, F.RentShortfall]).toEqual([58, 59, 60, 61]);
    expect(FEATURE_COUNT).toBe(62); expect(CONFIG_FEATURE_COUNT).toBe(62);
    expect(new Set(FEATURE_NAMES).size).toBe(62);
    expect([...STAGE_OF.slice(58)]).toEqual([2, 2, 2, 2]);
    expect(INVARIANT_FEATURES).toHaveLength(20);
    expect(INVARIANT_FEATURES.at(-1)).toBe(57);
    expect(GROUP_OF).toHaveLength(62);
    expect(EVAL_GROUPS.economy).toContain(58); expect(EVAL_GROUPS.economy).toContain(61);
    expect(EVAL_GROUPS.safety).toContain(59); expect(EVAL_GROUPS.safety).toContain(60);
    const nonzero = [...DEFAULT_WEIGHTS.w].flatMap((w, i) => w ? [[i, w]] : []);
    expect(nonzero).toEqual([[0, 100], [2, 100], [3, 100], [23, 100], [58, 1]]);
  });
  it('requires explicit schema/version and rejects historical shape, wrapped integers and runtime stale vectors', () => {
    const saved = JSON.parse(serializeWeights(DEFAULT_WEIGHTS));
    expect(saved.featureSchema).toBe(PHASING_EVAL_SCHEMA); expect(saved.version).toBe(WEIGHTS_VERSION);
    expect(weightsHash(loadWeights(saved))).toBe(weightsHash(DEFAULT_WEIGHTS));
    expect(() => loadWeights({ ...saved, featureSchema: undefined })).toThrow(/schema/);
    expect(() => loadWeights({ ...saved, version: 1 })).toThrow(/version/);
    expect(() => loadWeights({ ...saved, w: saved.w.slice(0, 58) })).toThrow(/62/);
    const overflow = structuredClone(saved); overflow.w[2] = 2 ** 32 + 100;
    expect(() => loadWeights(overflow)).toThrow(/integer/);
    const stale = cloneWeights(DEFAULT_WEIGHTS); delete stale.featureSchema;
    expect(() => new Evaluator(rep, stale)).toThrow(/schema/);
    const ev = new Evaluator(rep); expect(() => ev.setWeights(stale)).toThrow(/schema/);
  });
  it('has no cash cliff at eight and preserves exact catalogue principal', () => {
    const a = vector(base({ pendingSummons: [], white: 8 })), b = vector(base({ pendingSummons: [], white: 9 }));
    expect(b.score - a.score).toBe(100);
    expect(a.ev.stage0(a.p, 0)).toBe(500 - 300 + 800);
  });
});

describe('escrow and delayed service have one accounting owner', () => {
  it('prices paid pending principal, canonical arrival and canonical refund once each', () => {
    const { state } = inspect(base());
    const before = vector(base());
    expect(before.f[F.PendingValue]).toBe(300);
    const arrived = applyAction(state, { type: 'END_PLACE_PHASE' });
    expect(arrived.board.units.some(u => u.id === 'paid')).toBe(true);
    const ev = new Evaluator(rep), f = new Int32Array(FEATURE_COUNT);
    expect(ev.full(rep.pack(arrived), 0, sc, 0, f)).toBe(before.score);
    expect(f[F.PendingValue]).toBe(0);
    const disruptedSpec = base({ units: [...base().units, { id: 'block', def: 'plant_1', owner: 'black', x: 0, y: 1 }] });
    const disrupted = vector(disruptedSpec), root = buildState(disruptedSpec);
    const refund = applyAction(root, { type: 'END_PLACE_PHASE' });
    expect(refund.lastSummoning?.disrupted.map(u => u.id)).toEqual(['paid']);
    expect(refund.players.white.resources).toBe(3);
    expect(ev.full(rep.pack(refund), 0, sc, 0, f)).toBe(disrupted.score);
    expect(disrupted.f[F.PendingValue]).toBe(300);
  });
  it('attributes two finite harvests only to pending service and never mines during Prepare', () => {
    const reserves = empty(); reserves[11] = 2;
    const spec = base({ reserves }), out = vector(spec);
    const service = Math.trunc((GAMMA_Q16[1] + GAMMA_Q16[2]) * 100 / 65536);
    expect(out.f[F.PendingValue]).toBe(300 + service);
    expect(out.f[F.EconDelta]).toBe(0);
    expect(out.score).toBe(200 + 300 + service);
    let state = buildState(spec);
    for (const type of ['END_PLACE_PHASE', 'END_ACTION_PHASE', 'END_PLACE_PHASE', 'END_ACTION_PHASE', 'END_PLACE_PHASE', 'END_ACTION_PHASE'] as const) {
      const action = { type }; expect(isLegalAction(state, action)).toBe(true); state = applyAction(state, action);
    }
    expect(state.players.white.resources).toBe(2);
    expect(state.board.cells[1][1].resourceLayers).toBe(0);
  });
  it('distinguishes the actual movement window and current flags from next-Act reset', () => {
    const reserves = empty(); reserves[11] = 2;
    const prepare = inspect(base({ reserves }));
    const oneAP = inspect(base({ reserves, phase: 'action', actions: 1 }));
    const twoAP = inspect(base({ reserves, phase: 'action', actions: 2 }));
    expect(prepare.d.risk[11]).toBe(0); expect(oneAP.d.risk[11]).toBe(0);
    expect(twoAP.d.risk[11]).toBe(1);
    expect(twoAP.d.valueCc[0]).toBe(300);
    expect(twoAP.d.disruptPressureCc[1]).toBeGreaterThan(0);
    const disabled = inspect(base({ reserves, phase: 'action', actions: 4, units: [base().units[0], { ...base().units[1], canAct: false }] }));
    expect(disabled.d.risk[11]).toBe(0);
    const future = inspect(base({ reserves, current: 'white', units: [base().units[0], { ...base().units[1], canAct: false }] }));
    expect(future.d.risk[11]).toBe(1); // enemy's incoming reset, not its stale flag
  });
  it('preserves an alternative anchor under an actual legal enemy intrusion', () => {
    const spec = base({ current: 'black', phase: 'action', actions: 1, units: [
      { id: 'anchor', def: 'metal_1', owner: 'white', x: 2, y: 2 },
      { id: 'alternative', def: 'metal_1', owner: 'white', x: 1, y: 4 },
      { id: 'enemy', def: 'water_1', owner: 'black', x: 3, y: 1 },
    ] });
    const { state, d } = inspect(spec), move = { type: 'MOVE' as const, unitId: 'enemy', to: { x: 2, y: 1 } };
    expect(isLegalAction(state, move)).toBe(true);
    expect(isValidSpawnPosition({ x: 1, y: 1 }, 'white', applyAction(state, move).board)).toBe(true);
    expect(d.risk[11]).toBe(0);
    const without = { ...spec, units: spec.units.filter(u => u.id !== 'alternative') };
    expect(inspect(without).d.risk[11]).toBe(1);
    expect(isValidSpawnPosition({ x: 1, y: 1 }, 'white', applyAction(buildState(without), move).board)).toBe(false);
  });
  for (const mirrored of [false, true]) it(`uses surviving anchors after forced rent release (${mirrored ? 'black' : 'white'} victim)`, () => {
    const victim = mirrored ? 'black' : 'white', enemy = mirrored ? 'white' : 'black';
    const side = mirrored ? 1 : 0, other = 1 - side;
    const at = (x: number, y: number) => mirrored ? { x: 9 - x, y: 9 - y } : { x, y };
    const q = at(1, 1), reserves = empty(); reserves[q.y * 10 + q.x] = 16;
    const spec: StateSpec = { current: victim, phase: 'action', actions: 4, white: 0, black: 0,
      victoryRule: 'elimination', inactivityRule: 'off', reserves, units: [
        { id: 'released', def: 'fire_2', owner: victim, ...at(6, 1) },
        { id: 'surviving-anchor', def: 'plant_1', owner: victim, ...at(1, 6) },
        { id: 'intruder', def: 'plant_1', owner: enemy, ...at(3, 7) },
      ], pendingSummons: [{ id: 'paid', def: 'plant_1', owner: victim, ...q }] };
    const { state, t, d } = inspect(spec), index = side * 100 + q.y * 10 + q.x;
    expect(t.econ[side].pendingArrival[q.y * 10 + q.x]).toBe(1); // no-move control does arrive
    expect(t.econ[side].pendingServicePVcc[q.y * 10 + q.x]).toBeGreaterThan(0);
    expect(d.risk[index]).toBe(1); expect(d.valueCc[side]).toBe(500);
    expect(d.disruptPressureCc[other]).toBeGreaterThan(0);
    let actual = applyAction(state, { type: 'END_ACTION_PHASE' });
    expect(actual.upkeepPending).toBe(true);
    const keep = { type: 'PAY_UPKEEP' as const, keepUnitIds: ['surviving-anchor'] };
    expect(isLegalAction(actual, keep)).toBe(true); actual = applyAction(actual, keep);
    expect(actual.lastUpkeep?.released.map(u => u.id)).toEqual(['released']);
    actual = applyAction(actual, { type: 'END_PLACE_PHASE' });
    const window = t.econ[side].pendingEnemyAct!;
    expect(window.side).toBe(other);
    expect(rep.unpack(window).board.units.map(u => u.id)).toEqual(actual.board.units.map(u => u.id));
    const move = { type: 'MOVE' as const, unitId: 'intruder', to: at(1, 5) };
    expect(isLegalAction(actual, move)).toBe(true); actual = applyAction(actual, move);
    expect(isValidSpawnPosition(q, victim, actual.board)).toBe(false);
    actual = applyAction(actual, { type: 'END_ACTION_PHASE' });
    actual = applyAction(actual, { type: 'END_PLACE_PHASE' });
    expect(actual.lastSummoning?.disrupted.map(s => s.id)).toEqual(['paid']);
    expect(actual.players[victim].resources).toBe(5);
    // One actual crystal funds the alternate anchor through this window;
    // no endpoint within four AP can also reach its distant rectangle.
    const funded = inspect({ ...spec, ...(victim === 'white' ? { white: 1 } : { black: 1 }) });
    expect(funded.d.risk[index]).toBe(0);
    expect(funded.d.valueCc[side]).toBeGreaterThan(500);
  });
  for (const mirrored of [false, true]) it(`requires an intruding renter to survive its next bill (${mirrored ? 'white' : 'black'} mover)`, () => {
    const victim = mirrored ? 'black' : 'white', enemy = mirrored ? 'white' : 'black';
    const side = mirrored ? 1 : 0, other = 1 - side;
    const at = (x: number, y: number) => mirrored ? { x: 9 - x, y: 9 - y } : { x, y };
    const q = at(1, 1), reserves = empty(); reserves[q.y * 10 + q.x] = 16;
    const spec: StateSpec = { current: enemy, phase: 'action', actions: 4, white: 0, black: 0,
      victoryRule: 'elimination', inactivityRule: 'off', reserves, units: [
        { id: 'anchor', def: 'plant_1', owner: victim, ...at(7, 7) },
        { id: 'renter', def: 'fire_2', owner: enemy, ...at(9, 9) },
        { id: 'free', def: 'metal_1', owner: enemy, ...at(9, 8) },
      ], pendingSummons: [{ id: 'paid', def: 'plant_1', owner: victim, ...q }] };
    const { state, d } = inspect(spec), index = side * 100 + q.y * 10 + q.x;
    expect(d.risk[index]).toBe(0); expect(d.disruptPressureCc[other]).toBe(0);
    expect(d.valueCc[side]).toBeGreaterThan(500);
    const move = { type: 'MOVE' as const, unitId: 'renter', to: at(6, 7) };
    expect(isLegalAction(state, move)).toBe(true);
    let actual = applyAction(state, move);
    expect(isValidSpawnPosition(q, victim, actual.board)).toBe(false);
    actual = applyAction(actual, { type: 'END_ACTION_PHASE' });
    expect(actual.lastIncome?.total).toBe(0); expect(actual.upkeepPending).toBe(true);
    expect(isLegalAction(actual, { type: 'PAY_UPKEEP', keepUnitIds: ['free', 'renter'] })).toBe(false);
    actual = applyAction(actual, { type: 'PAY_UPKEEP', keepUnitIds: ['free'] });
    actual = applyAction(actual, { type: 'END_PLACE_PHASE' });
    expect(actual.lastSummoning?.summoned.map(s => s.id)).toEqual(['paid']);
    // A real crystal makes the exact same endpoint retainable; refusing it
    // merely because other renters could exist would be too restrictive.
    const funded = inspect({ ...spec, ...(enemy === 'white' ? { white: 1 } : { black: 1 }) });
    expect(funded.d.risk[index]).toBe(1);
    expect(funded.d.disruptPressureCc[other]).toBeGreaterThan(0);
  });
  it('distinguishes income-before-rent from an already-mined unpaid Prepare bill', () => {
    const reserves = empty(); reserves[22] = 1;
    const spec = base({ current: 'white', phase: 'action', actions: 4, pendingSummons: [], reserves, units: [
      { id: 'renter', def: 'water_2', owner: 'white', x: 2, y: 2 },
      { id: 'free', def: 'metal_1', owner: 'white', x: 0, y: 0 },
      { id: 'enemy', def: 'metal_1', owner: 'black', x: 9, y: 9 },
    ] });
    const act = vector(spec), unpaid = vector({ ...spec, phase: 'place', actions: 0, upkeepPending: true });
    expect(act.f[F.RentShortfall]).toBe(0);
    expect(unpaid.f[F.RentShortfall]).toBe(1);
    const closed = applyAction(buildState(spec), { type: 'END_ACTION_PHASE' });
    expect(closed.lastIncome?.total).toBe(1); expect(closed.lastUpkeep?.paid).toBe(1);
    expect(closed.upkeepPending).toBe(false);
    const paid = applyAction(buildState({ ...spec, phase: 'place', actions: 0, upkeepPending: true }), { type: 'PAY_UPKEEP', keepUnitIds: ['free'] });
    expect(paid.lastUpkeep?.released.map(u => u.id)).toEqual(['renter']);
    expect(paid.players.white.resources).toBe(0);
    expect(unpaid.f[F.EconDelta]).toBe(-8); // immediate root-live principal loss, no second income
  });
});

describe('paid-arrival kill provenance is a same-occupancy table comparison', () => {
  const options: KillOpts = { actionBudget: 4, crystalBudget: 0, allowBuys: false, allowPromotes: false, maxLanes: 4, horizon: 'nextAct' };
  const tactical = (liveAlternative = false): StateSpec => base({ current: 'black', phase: 'place', units: [
    { id: 'anchor', def: 'metal_1', owner: 'white', x: 6, y: 5 },
    { id: 'victim', def: 'plant_1', owner: 'black', x: 5, y: 6 },
    { id: 'survivor', def: 'metal_1', owner: 'black', x: 9, y: 9 },
    ...(liveAlternative ? [{ id: 'live', def: 'fire_1', owner: 'white' as const, x: 6, y: 7 }] : []),
  ], pendingSummons: [{ id: 'paid', def: 'fire_1', owner: 'white', x: 5, y: 5 }] });
  it('finds zero-bank arrival dependence while current queries cannot invent an attacker', () => {
    const { p, t, d } = inspect(tactical());
    expect(p.bank[0]).toBe(0); expect(d.arrivalThreatCc[0]).toBe(500);
    const diagnostic = vector(tactical());
    expect(diagnostic.f[F.HangingBuy]).toBe(-5); // victim-side diagnostic, coefficient remains zero
    const current = killTable(p, t, 0, { ...options, horizon: 'current' }, sc, 0, newKillTable());
    expect(current.entry[1].minActions).toBe(KILL_IMPOSSIBLE);
    const live = killTable(p, t, 0, { ...options, includePendingAttackers: false }, sc, 0, newKillTable());
    expect(live.entry[1].minActions).toBe(KILL_IMPOSSIBLE);
  });
  it('uses identical target healing in both arrival-enabled and disabled next-Act queries', () => {
    const spec = base({ units: [
      { id: 'anchor', def: 'plant_1', owner: 'white', x: 5, y: 5 },
      { id: 'victim', def: 'metal_3', owner: 'black', x: 6, y: 4, damage: 4 },
    ], black: 20, pendingSummons: [{ id: 'paid', def: 'water_1', owner: 'white', x: 5, y: 4 }] });
    // Explicit damaged diagrams isolate horizon semantics; no initial-game
    // reachability claim is made for the alternate turn-owner spelling.
    const imminent = inspect({ ...spec, current: 'black' });
    expect(imminent.d.arrivalThreatCc[0]).toBe(1700);
    const following = inspect({ ...spec, current: 'white' });
    expect(following.d.arrivalThreatCc[0]).toBe(0);
    for (const includePendingAttackers of [false, true]) {
      const result = killTable(following.p, following.t, 0, { ...options, includePendingAttackers }, sc, 0, newKillTable());
      expect(result.entry[1].minActions).toBe(KILL_IMPOSSIBLE);
    }
  });
  it('does not infer dependence merely because the selected cheap plan uses an arrival', () => {
    const { p, t, d } = inspect(tactical(true)), plan = newKillPlan();
    expect(minActionsToKill(p, t, 0, 1, options, sc, 0, plan)).toBe(true);
    expect([...plan.attackers]).toContain(KILL_PENDING_ATTACKER);
    const live = killTable(p, t, 0, { ...options, includePendingAttackers: false }, sc, 0, newKillTable());
    expect(live.entry[1].minActions).toBeLessThanOrEqual(4);
    expect(d.arrivalThreatCc[0]).toBe(0);
  });
  it('does not invent an attacker after the only supporting anchor is released and escrow refunds', () => {
    const spec = tactical();
    spec.current = 'white'; spec.phase = 'action'; spec.actions = 4;
    spec.units = [{ id: 'released-anchor', def: 'metal_2', owner: 'white', x: 6, y: 5 },
      { id: 'victim', def: 'plant_1', owner: 'black', x: 5, y: 6 },
      { id: 'enemy-survivor', def: 'metal_1', owner: 'black', x: 9, y: 9 },
      { id: 'free', def: 'metal_1', owner: 'white', x: 0, y: 0 }];
    const { state, p, t, d } = inspect(spec);
    // The old same-board table really does invent this opportunity; the
    // chronological feature must disagree for a concrete lifecycle reason.
    const old = killTable(p, t, 0, options, sc, 0, newKillTable());
    expect(old.entry[1].minActions).toBe(1);
    const live = killTable(p, t, 0, { ...options, includePendingAttackers: false }, sc, 0, newKillTable());
    expect(live.entry[1].minActions).toBe(KILL_IMPOSSIBLE);
    let actual = applyAction(state, { type: 'END_ACTION_PHASE' });
    expect(actual.upkeepPending).toBe(true);
    actual = applyAction(actual, { type: 'PAY_UPKEEP', keepUnitIds: ['free'] });
    expect(actual.lastUpkeep?.released.map(u => u.id)).toEqual(['released-anchor']);
    for (const type of ['END_PLACE_PHASE', 'END_ACTION_PHASE', 'END_PLACE_PHASE'] as const) {
      const action = { type }; expect(isLegalAction(actual, action)).toBe(true); actual = applyAction(actual, action);
    }
    expect(actual.lastSummoning?.disrupted.map(s => s.id)).toEqual(['paid']);
    expect(actual.players.white.resources).toBe(3);
    expect(t.econ[0].pendingOwnAct).not.toBeNull();
    expect(rep.unpack(t.econ[0].pendingOwnAct!).board.units.map(u => u.id)).toEqual(actual.board.units.map(u => u.id));
    expect(d.arrivalThreatCc[0]).toBe(0);
    expect([...d.arrivalDependentVictims]).not.toContain(1);
  });
});

describe('full evaluation and newly executed prover accounting', () => {
  it('counts private Prepare forecast work on veto without changing generator pricing', () => {
    const { ctx, p } = prepare(buildState(base({ pendingSummons: [], current: 'white' })));
    const before = ctx.meter.used;
    const veto = new PhasingEconomyProofCutoff(3, 1);
    const originalBuild = tablesModule.buildTables;
    const build = vi.spyOn(tablesModule, 'buildTables').mockImplementation((_p, _sc, _ply, level, tables) => {
      // The forced bare completion is scored at L1 before Prepare expands.
      if (level === 1) return originalBuild(_p, _sc, _ply, level, tables);
      tables.economyProverCalls += 3; tables.economyCappedProverCalls++;
      throw veto;
    });
    try {
      expect(() => generateAt(ctx, p, ctx.tables[0], 0)).toThrow(veto);
      expect(build.mock.calls.filter(call => call[3] === 2)).toHaveLength(1);
      expect(ctx.genStats.economyProverCalls).toBe(3);
      expect(ctx.stats.proverCalls).toBe(3);
      expect(ctx.stats.economyProverCalls).toBe(3);
      expect(ctx.stats.economyCappedProverCalls).toBe(1);
      expect(ctx.meter.byClass[WorkClass.PROVER]).toBe(3);
      expect(ctx.meter.used).toBe(before);
    } finally { build.mockRestore(); }
  });
  it('prices direct search L2 forecast work and propagates its typed veto', () => {
    const { ctx, p } = prepare(buildState(base({ pendingSummons: [], current: 'white' })));
    const before = ctx.meter.used;
    const veto = new PhasingEconomyProofCutoff(3, 1);
    const build = vi.spyOn(tablesModule, 'buildTables').mockImplementation((_p, _sc, _ply, _level, tables) => {
      tables.economyProverCalls += 3; tables.economyCappedProverCalls++;
      throw veto;
    });
    try {
      expect(() => pvs(ctx, p, 1, -1000, 1000, 0, 0)).toThrow(veto);
      expect(build).toHaveBeenCalledOnce();
      expect(ctx.stats.economyProverCalls).toBe(3);
      expect(ctx.stats.economyCappedProverCalls).toBe(1);
      expect(ctx.meter.byClass[WorkClass.PROVER]).toBe(3);
      expect(ctx.meter.used - before).toBe(WORK_COST[WorkClass.MACRO] + 3 * WORK_COST[WorkClass.PROVER]);
    } finally { build.mockRestore(); }
  });
  it('adds leaf forecast diagnostics without charging the same work twice', () => {
    const { ctx, p } = prepare(buildState(base({ pendingSummons: [], current: 'white' })));
    const before = ctx.meter.used;
    const veto = new PhasingEconomyProofCutoff(3, 1);
    const stage = vi.spyOn(ctx.eval, 'stage2').mockImplementation(() => {
      ctx.eval.lastTables.economyProverCalls += 3;
      ctx.eval.lastTables.economyCappedProverCalls++;
      throw veto;
    });
    try {
      expect(() => evaluateLeaf(ctx, p, -1000, 1000, 0)).toThrow(veto);
      expect(ctx.stats.proverCalls).toBe(3);
      expect(ctx.stats.economyProverCalls).toBe(3);
      expect(ctx.stats.economyCappedProverCalls).toBe(1);
      expect(ctx.meter.byClass[WorkClass.PROVER]).toBe(3);
      expect(ctx.meter.used - before).toBe(WORK_COST[WorkClass.EVAL1] + WORK_COST[WorkClass.EVAL2] + 3 * WORK_COST[WorkClass.PROVER]);
    } finally { stage.mockRestore(); }
  });
  it('meters quiescence table vetoes after its independent stand-pat evaluation', () => {
    const { ctx, p } = prepare(buildState(base({ pendingSummons: [], current: 'white' })));
    ctx.quiesceCapOn = false;
    const before = ctx.meter.used;
    const veto = new PhasingEconomyProofCutoff(3, 1);
    // Isolate the node-table boundary: the separate leaf-meter test above
    // already covers evaluation and its typed failure path.
    const leaf = vi.spyOn(ctx.eval, 'evaluate').mockReturnValue(0);
    const build = vi.spyOn(tablesModule, 'buildTables').mockImplementation((_p, _sc, _ply, _level, tables) => {
      tables.economyProverCalls += 3; tables.economyCappedProverCalls++;
      throw veto;
    });
    try {
      expect(() => quiesce(ctx, p, -1000, 1000, 0, 0)).toThrow(veto);
      expect(leaf).toHaveBeenCalledOnce(); expect(build).toHaveBeenCalledOnce();
      expect(ctx.stats.economyProverCalls).toBe(3);
      expect(ctx.stats.economyCappedProverCalls).toBe(1);
      expect(ctx.meter.byClass[WorkClass.PROVER]).toBe(3);
      expect(ctx.meter.used - before).toBe(WORK_COST[WorkClass.QUIESCE] + 3 * WORK_COST[WorkClass.PROVER]);
    } finally { build.mockRestore(); leaf.mockRestore(); }
  });
  it('reports pre-rung forecast work separately and never converts a veto into an engine fallback', async () => {
    const state = buildState(base({ pendingSummons: [], current: 'white' }));
    const { ctx, engine } = prepare(state);
    const veto = new PhasingEconomyProofCutoff(3, 1);
    const build = vi.spyOn(tablesModule, 'buildTables').mockImplementation((_p, _sc, _ply, _level, tables) => {
      tables.economyProverCalls += 3; tables.economyCappedProverCalls++;
      throw veto;
    });
    try {
      await expect(engine.searchTurn(state, { targetMs: 100, deadlineMs: 100 })).rejects.toBe(veto);
      expect(build).toHaveBeenCalledOnce();
      expect(ctx.stats.preparationEconomyProverCalls).toBe(3);
      expect(ctx.stats.preparationEconomyCappedProverCalls).toBe(1);
      expect(ctx.stats.economyProverCalls).toBe(0);
      build.mockClear();
      await expect(engine.searchTurn(state, { work: 1000 })).rejects.toBe(veto);
      expect(build).toHaveBeenCalledOnce();
      expect(ctx.stats.preparationEconomyProverCalls).toBe(0);
      expect(ctx.stats.economyProverCalls).toBe(3);
      expect(ctx.stats.economyCappedProverCalls).toBe(1);
      expect(ctx.meter.byClass[WorkClass.PROVER]).toBe(3);
      expect(ctx.meter.used).toBe(3 * WORK_COST[WorkClass.PROVER]);
    } finally { build.mockRestore(); }
  });
  it('always computes stage2, agrees across windows and charges no cached forecast twice', () => {
    const p = rep.pack(buildState(base())), ev = new Evaluator(rep), spend = vi.fn();
    expect(p.result).toBe(Result.ONGOING);
    const score = ev.evaluate(p, 0, -1_000_001, -1_000_000, sc, 0, { spend });
    expect(score).toBe(ev.full(p, 0, sc, 0));
    expect(spend).toHaveBeenCalledWith(WORK_CLASS_EVAL1, 1);
    expect(spend).toHaveBeenCalledWith(WORK_CLASS_EVAL2, 1);
    const calls = ev.lastTables.economyProverCalls;
    if (calls > 0) expect(spend).toHaveBeenCalledWith(WORK_CLASS_PROVER, calls);
    spend.mockClear();
    expect(ev.evaluate(p, 0, 1_000_000, 1_000_001, sc, 0, { spend })).toBe(score);
    expect(spend.mock.calls.filter(([kind]) => kind === WORK_CLASS_PROVER)).toHaveLength(0);
    expect(boundStage2(p, ev.lastTables, DEFAULT_WEIGHTS)).toBe(Infinity);
  });
  it('propagates a forecast veto while charging the work already executed', () => {
    const p = rep.pack(buildState(base())), ev = new Evaluator(rep), spend = vi.fn();
    const stage = vi.spyOn(ev, 'stage2').mockImplementation(() => {
      ev.lastTables.economyProverCalls += 3;
      throw new Error('authored forecast cutoff veto');
    });
    expect(() => ev.evaluate(p, 0, -1, 1, sc, 0, { spend })).toThrow(/cutoff veto/);
    expect(spend).toHaveBeenCalledWith(WORK_CLASS_EVAL2, 1);
    expect(spend).toHaveBeenCalledWith(WORK_CLASS_PROVER, 3);
    stage.mockRestore();
  });
  it('forms all signed values before truncation and does not mutate the root', () => {
    const reserves = empty(); reserves[11] = 2;
    const p = rep.pack(buildState(base({ reserves }))), before = rep.digest(p), ev = new Evaluator(rep);
    const a = new Int32Array(FEATURE_COUNT), b = new Int32Array(FEATURE_COUNT);
    const white = ev.full(p, 0, sc, 0, a), black = ev.full(p, 1, sc, 0, b);
    expect(black).toBe(-white);
    for (const i of [23, 58, 59, 60, 61]) expect(b[i] + a[i]).toBe(0);
    expect(rep.digest(p)).toEqual(before);
  });
});
