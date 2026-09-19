// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { resolveSummons } from '../../../src/game/summoning';
import { getUnitDefinition } from '../../../src/game/units';
import { resetUnitActions } from '../../../src/game/board';
import type { AIAction } from '../../../src/ai/types';
import { Scratch, bbHas, bbNew, bbNext } from '../../../src/ai/hard/core/bits';
import { recomputeKturn } from '../../../src/ai/hard/core/zobrist';
import { Replica } from '../../../src/ai/hard/core/state';
import { nextActProjection, pendingVoidedBy, validPendingMask } from '../../../src/ai/hard/core/spawn';
import { allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { KILL_PENDING_ATTACKER, minActionsToKill, newKillPlan, type KillOpts } from '../../../src/ai/hard/tables/kill';
import { Approach, approachTable } from '../../../src/ai/hard/tables/approach';
import { strikeArea, strikeIfBoughtArea } from '../../../src/ai/hard/tables/threat';
import { DEAD, MAX_SLOTS, NO_SLOT, type PackedState } from '../../../src/ai/hard/types';
import { buildState } from './game-fixture';

const rep = new Replica();
const sc = new Scratch(2, 8, 8, 8);
const opts = (future = false): KillOpts => ({ actionBudget: 4, crystalBudget: 0,
  allowBuys: false, allowPromotes: false, maxLanes: 4, horizon: future ? 'nextAct' : 'current' });
const squares = (mask: Uint32Array): number[] => {
  const result: number[] = [];
  for (let q = bbNext(mask, -1); q >= 0; q = bbNext(mask, q)) result.push(q);
  return result;
};

function snapshotSlotFields(p: PackedState) {
  const t = buildTables(p, sc, 0, 2, allocTables());
  return { kill: [...t.killActions], approach: [...t.approach], retreats: [...t.retreats],
    chain: [...t.chain], now: t.killNow.map(k => k.entry.map(e => ({ ...e }))) };
}

/** Same square-keyed state with a different physical slot identity (including
 * a dead slot). Every slot-indexed plane and pieceAt is moved consistently. */
function swapSlots(p: PackedState, a: number, b: number): void {
  for (const arr of [p.sq, p.defId, p.owner, p.damage, p.atkCount, p.uflags, p.ord]) {
    const temp = arr[a]; arr[a] = arr[b]; arr[b] = temp;
  }
  if (p.sq[a] !== DEAD) p.pieceAt[p.sq[a]] = a;
  if (p.sq[b] !== DEAD) p.pieceAt[p.sq[b]] = b;
  if (p.sq[a] !== DEAD) p.slotCount = Math.max(p.slotCount, a + 1);
  if (p.sq[b] !== DEAD) p.slotCount = Math.max(p.slotCount, b + 1);
}

describe('Phasing table horizons and slot identity', () => {
  it('a legal BUY has no current attacker; its paid zero-bank future matches canonical arrival and attack', () => {
    let state = buildState({ units: [
      { def: 'plant_1', owner: 'white', x: 5, y: 5 },
      { def: 'fire_1', owner: 'black', x: 6, y: 4 },
      { def: 'plant_1', owner: 'black', x: 9, y: 9 },
    ], white: getUnitDefinition('water_1').cost, phase: 'place', victoryRule: 'elimination', reserves: new Array(100).fill(0) });
    const step = (action: AIAction) => {
      expect(isLegalAction(state, action)).toBe(true);
      state = applyAction(state, action);
    };
    step({ type: 'BUY_UNIT', definitionId: 'water_1', position: { x: 5, y: 4 } });
    expect(state.players.white.resources).toBe(0);
    expect(state.board.units).toHaveLength(3);
    const p = rep.pack(state);
    const t = buildTables(p, sc, 0, 2, allocTables());
    const plan = newKillPlan();
    expect(minActionsToKill(p, t, 0, p.pieceAt[46], opts(), sc, 0, plan)).toBe(false);
    expect(minActionsToKill(p, t, 0, p.pieceAt[46], opts(true), sc, 0, plan)).toBe(true);
    expect([plan.actions, plan.crystals, plan.attackers[0], plan.spawnAt[0]]).toEqual([1, 0, KILL_PENDING_ATTACKER, 45]);
    expect(t.killNow[0].entry[p.pieceAt[46]].minActions).toBe(255);
    expect(t.killActions[p.pieceAt[46]]).toBe(1);
    expect(t.killNeedsBuy[p.pieceAt[46]]).toBe(0);
    const cls = new Uint8Array(MAX_SLOTS), retreats = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, sc, 0, cls, retreats);
    expect(cls[p.pieceAt[46]]).toBe(Approach.NONE);
    approachTable(p, t, 1, sc, 0, cls, retreats, 'nextAct');
    expect(cls[p.pieceAt[46]]).not.toBe(Approach.NONE);
    const futureClass = cls[p.pieceAt[46]];
    step({ type: 'END_PLACE_PHASE' });
    step({ type: 'END_ACTION_PHASE' });
    step({ type: 'END_PLACE_PHASE' });
    expect(state.turn.currentPlayer).toBe('white');
    expect(state.pendingSummons).toHaveLength(0);
    const arrived = rep.pack(state);
    const at = buildTables(arrived, sc, 0, 2, allocTables());
    approachTable(arrived, at, 1, sc, 0, cls, retreats);
    expect(cls[arrived.pieceAt[46]]).toBe(futureClass);
    expect(minActionsToKill(arrived, at, 0, arrived.pieceAt[46], opts(), sc, 0, plan)).toBe(true);
    expect([plan.actions, plan.crystals, plan.attackers[0]]).toEqual([1, 0, arrived.pieceAt[45]]);
    step({ type: 'ATTACK', unitId: state.board.units.find(u => u.position.x === 5 && u.position.y === 4)!.id,
      targetPosition: { x: 6, y: 4 } });
    expect(state.board.units.some(u => u.position.x === 6 && u.position.y === 4)).toBe(false);
  });

  it('uses every alternative anchor and counts only newly voided commitments', () => {
    const state = buildState({ units: [
      { def: 'plant_1', owner: 'white', x: 4, y: 1 },
      { def: 'plant_1', owner: 'white', x: 1, y: 4 },
      { def: 'plant_1', owner: 'black', x: 9, y: 9 },
    ], pendingSummons: [
      { def: 'fire_1', owner: 'white', x: 1, y: 1 },
      { def: 'fire_1', owner: 'white', x: 7, y: 7 }, // already voided
    ] });
    const p = rep.pack(state), mask = bbNew();
    expect(squares(validPendingMask(p, 0, mask))).toEqual([11]);
    for (const q of [3, 10, 11, 88]) {
      const altered = { ...state, board: { ...state.board, units: [...state.board.units,
        { ...state.board.units[2], id: 'intruder', position: { x: q % 10, y: Math.floor(q / 10) } }] } };
      const before = resolveSummons(state, 'white').lastSummoning!.summoned.length;
      const after = resolveSummons(altered, 'white').lastSummoning!.summoned.length;
      expect(pendingVoidedBy(p, 0, q)).toBe(before - after);
    }
    expect(pendingVoidedBy(p, 0, 3)).toBe(0); // one rectangle survives
    expect(pendingVoidedBy(p, 0, 10)).toBe(1); // every supporting rectangle blocked
    expect(pendingVoidedBy(p, 0, 11)).toBe(1); // landing occupied
  });

  it('simultaneous arrivals block one another for kill, strike and approach BFS', () => {
    const state = buildState({ units: [
      { def: 'metal_1', owner: 'white', x: 0, y: 3 },
      { def: 'plant_1', owner: 'black', x: 1, y: 0 },
      { def: 'metal_1', owner: 'black', x: 1, y: 1 },
      { def: 'metal_1', owner: 'black', x: 1, y: 2 },
    ], pendingSummons: [
      { def: 'fire_1', owner: 'white', x: 0, y: 2 },
      { def: 'metal_1', owner: 'white', x: 0, y: 1 },
    ] });
    const p = rep.pack(state), t = buildTables(p, sc, 0, 2, allocTables());
    const resolved = resolveSummons(state, 'white');
    expect(resolved.lastSummoning!.summoned).toHaveLength(2);
    const ready = { ...resolved, board: resetUnitActions(resolved.board, 'white') };
    const actual = rep.pack(ready), actualTables = buildTables(actual, sc, 0, 2, allocTables());
    const plan = newKillPlan();
    expect(minActionsToKill(p, t, 0, p.pieceAt[1], opts(true), sc, 0, plan)).toBe(false);
    expect(minActionsToKill(actual, actualTables, 0, actual.pieceAt[1], opts(), sc, 0, plan)).toBe(false);
    const live = bbNew(), pending = bbNew();
    strikeArea(actual, 0, actualTables, 3, live);
    strikeIfBoughtArea(p, 0, t, pending);
    expect(bbHas(pending, 1)).toBe(false);
    expect(squares(t.exposure[1])).toEqual(squares(live));
    const cls = new Uint8Array(MAX_SLOTS), ret = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, sc, 0, cls, ret, 'nextAct');
    expect(cls[p.pieceAt[1]]).toBe(Approach.NONE);
    // Remove the blocking commitment: the exact same attacking arrival now reaches the target.
    const open = rep.pack({ ...state, pendingSummons: state.pendingSummons!.slice(0, 1) });
    expect(minActionsToKill(open, allocTables(), 0, open.pieceAt[1], opts(true), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(2);
  });

  it('resolves the preceding opponent batch before our next-Act movement forecast', () => {
    let state = buildState({ units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 5 },
      { def: 'metal_1', owner: 'black', x: 5, y: 4 },
      { def: 'plant_1', owner: 'black', x: 6, y: 5 },
    ], phase: 'place', victoryRule: 'elimination', pendingSummons: [
      { def: 'metal_1', owner: 'white', x: 0, y: 0, id: 'white-paid' },
      { def: 'metal_1', owner: 'black', x: 5, y: 5, id: 'black-blocker' },
    ] });
    const original = state;
    const p = rep.pack(state), arrivals = bbNew(), occ = bbNew(), preceding = bbNew();
    nextActProjection(p, 0, arrivals, occ, preceding);
    expect(squares(arrivals)).toEqual([0]);
    expect(squares(preceding)).toEqual([55]);
    const first = resolveSummons(state, 'black');
    const second = resolveSummons(first, 'white');
    expect(first.board.units.map(u => u.id)).toEqual(['u0', 'u1', 'u2', 'black-blocker']);
    expect(second.board.units.map(u => u.id)).toEqual(['u0', 'u1', 'u2', 'black-blocker', 'white-paid']);
    expect(squares(occ)).toEqual(second.board.units.map(u => u.position.y * 10 + u.position.x).sort((a, b) => a - b));
    // The no-move batches leave White's valid commitment valid. Opposing
    // valid rectangles cannot overlap; the new body changes movement paths.
    expect(squares(validPendingMask(p, 0, bbNew()))).toEqual(squares(arrivals));
    const t = buildTables(p, sc, 0, 2, allocTables()), plan = newKillPlan();
    expect(minActionsToKill(p, t, 0, p.pieceAt[56], { ...opts(true), actionBudget: 2 }, sc, 0, plan)).toBe(false);
    expect(minActionsToKill(p, t, 0, p.pieceAt[56], opts(true), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(3);
    const withoutBlocker = rep.pack({ ...state, pendingSummons: state.pendingSummons!.filter(s => s.owner === 'white') });
    expect(minActionsToKill(withoutBlocker, allocTables(), 0, withoutBlocker.pieceAt[56], { ...opts(true), actionBudget: 2 }, sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(2);
    for (const action of [
      { type: 'END_PLACE_PHASE' as const },
      { type: 'END_ACTION_PHASE' as const },
      { type: 'END_PLACE_PHASE' as const },
    ]) {
      expect(isLegalAction(state, action)).toBe(true);
      state = applyAction(state, action);
    }
    expect(state.turn.currentPlayer).toBe('white');
    expect(state.turn.phase).toBe('action');
    expect(state.board.units.map(u => u.id)).toEqual(second.board.units.map(u => u.id));
    const arrived = rep.pack(state), at = buildTables(arrived, sc, 0, 2, allocTables());
    expect(minActionsToKill(arrived, at, 0, arrived.pieceAt[56], opts(), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(3);
    const cls = new Uint8Array(MAX_SLOTS), ret = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, sc, 0, cls, ret, 'nextAct');
    const futureClass = cls[p.pieceAt[56]];
    approachTable(arrived, at, 1, sc, 0, cls, ret);
    expect(cls[arrived.pieceAt[56]]).toBe(futureClass);
    expect(squares(t.exposure[1])).toEqual(squares(at.strike[0]));
    // The imminent opponent horizon does not prematurely materialize White.
    nextActProjection(rep.pack(original), 1, arrivals, occ, preceding);
    expect(squares(arrivals)).toEqual([55]);
    expect(squares(preceding)).toEqual([]);
    expect(bbHas(occ, 0)).toBe(false);
  });

  it('does not call a future hit decisive when a preceding enemy arrival survives it', () => {
    const state = buildState({ units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 5 },
      { def: 'plant_1', owner: 'black', x: 5, y: 5 },
    ], pendingSummons: [{ def: 'metal_1', owner: 'black', x: 6, y: 5 }] });
    const p = rep.pack(state), t = buildTables(p, sc, 0, 2, allocTables());
    const cls = new Uint8Array(MAX_SLOTS), ret = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, sc, 0, cls, ret);
    expect(cls[p.pieceAt[55]]).toBe(Approach.STRAND); // actual last live defender
    approachTable(p, t, 1, sc, 0, cls, ret, 'nextAct');
    expect(cls[p.pieceAt[55]]).toBe(Approach.RETREAT); // arrival survives the future hit
    const resolved = resolveSummons(state, 'black');
    expect(resolved.board.units.filter(u => u.owner === 'black')).toHaveLength(2);
    const arrived = rep.pack(resolved), at = buildTables(arrived, sc, 0, 2, allocTables());
    approachTable(arrived, at, 1, sc, 0, cls, ret);
    expect(cls[arrived.pieceAt[55]]).toBe(Approach.RETREAT);
  });

  it('current strike reserves its hit action within the actual remaining AP', () => {
    const spec = { units: [
      { def: 'fire_1', owner: 'white' as const, x: 4, y: 4 },
      { def: 'plant_1', owner: 'black' as const, x: 9, y: 9 },
    ], actions: 1 };
    const p = rep.pack(buildState(spec));
    const t = buildTables(p, sc, 0, 1, allocTables());
    expect(squares(t.strike[0])).toEqual([34, 43, 44, 45, 54]);
    expect(bbHas(t.strike[0], 46)).toBe(false);
    expect(bbHas(t.strikeNext[0], 46)).toBe(true);
    const two = rep.pack(buildState({ ...spec, actions: 2 }));
    const twoTables = buildTables(two, sc, 0, 1, allocTables());
    expect(bbHas(twoTables.strike[0], 47)).toBe(true); // speed 2 walk plus hit
    expect(bbHas(twoTables.strike[0], 48)).toBe(false);
    const prep = rep.pack(buildState({ ...spec, phase: 'place' }));
    expect(squares(buildTables(prep, sc, 0, 1, allocTables()).strike[0])).toEqual([]);
  });

  it('heals the defender before the mover next Act, but not before the imminent opponent Act', () => {
    const units = [
      { def: 'shadow_2', owner: 'white' as const, x: 4, y: 4 },
      { def: 'metal_3', owner: 'black' as const, x: 5, y: 4, damage: 3 },
      { def: 'plant_1', owner: 'black' as const, x: 9, y: 9 },
    ];
    const p = rep.pack(buildState({ units }));
    const t = buildTables(p, sc, 0, 2, allocTables());
    const plan = newKillPlan();
    expect(minActionsToKill(p, t, 0, p.pieceAt[45], opts(), sc, 0, plan)).toBe(true);
    expect(minActionsToKill(p, t, 0, p.pieceAt[45], opts(true), sc, 0, plan)).toBe(false);
    const cls = new Uint8Array(MAX_SLOTS), ret = new Uint8Array(MAX_SLOTS);
    approachTable(p, t, 1, sc, 0, cls, ret);
    expect(cls[p.pieceAt[45]]).not.toBe(Approach.NONE);
    approachTable(p, t, 1, sc, 0, cls, ret, 'nextAct');
    expect(cls[p.pieceAt[45]]).toBe(Approach.NONE);
    const imminent = rep.pack(buildState({ units, current: 'black' }));
    expect(minActionsToKill(imminent, allocTables(), 0, imminent.pieceAt[45], opts(true), sc, 0, plan)).toBe(true);
    // Canonical start-turn reset independently establishes the healing step.
    expect(resetUnitActions(buildState({ units }).board, 'black').units[1].damageTaken).toBe(0);
  });

  it.each([1, 2] as const)('rebuilds slot-indexed arrays on equal-Kturn slot permutation from level %i', level => {
    const p = rep.pack(buildState({ units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 4 },
      { def: 'plant_1', owner: 'black', x: 5, y: 4 },
      { def: 'metal_3', owner: 'black', x: 9, y: 9 },
    ] }));
    const t = buildTables(p, sc, 0, level, allocTables());
    const key = [p.kturnLo, p.kturnHi];
    swapSlots(p, 1, 2);
    expect([p.kturnLo, p.kturnHi]).toEqual(key);
    const rebuilt = recomputeKturn(p);
    expect([rebuilt.lo, rebuilt.hi]).toEqual(key);
    const expected = snapshotSlotFields(p);
    buildTables(p, sc, 0, 2, t);
    expect([...t.killActions]).toEqual(expected.kill);
    expect([...t.approach]).toEqual(expected.approach);
    expect([...t.retreats]).toEqual(expected.retreats);
    expect(t.killNow.map(k => k.entry.map(e => ({ ...e })))).toEqual(expected.now);
    expect(t.killActions[2]).toBe(1);
    expect(t.killActions[1]).toBe(127);
  });

  it('does not reuse live-slot entries when a same-key body moves to a previously dead slot', () => {
    const p = rep.pack(buildState({ units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 4 },
      { def: 'plant_1', owner: 'black', x: 5, y: 4 },
    ] }));
    const t = buildTables(p, sc, 0, 2, allocTables());
    const key = [p.kturnLo, p.kturnHi];
    swapSlots(p, 1, 17);
    expect(p.pieceAt[45]).toBe(17);
    expect(p.sq[1]).toBe(DEAD);
    expect(p.pieceAt[99]).toBe(NO_SLOT);
    expect([p.kturnLo, p.kturnHi]).toEqual(key);
    const rebuilt = recomputeKturn(p);
    expect([rebuilt.lo, rebuilt.hi]).toEqual(key);
    buildTables(p, sc, 0, 2, t);
    expect(t.killActions[1]).toBe(127);
    expect(t.killActions[17]).toBe(1);
    expect(t.killNow[0].entry[1].minActions).toBe(255);
    expect(t.killNow[0].entry[17].minActions).toBe(1);
    expect([...t.slotSquares]).toEqual([...p.sq]);
  });
});
