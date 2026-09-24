// @vitest-environment node
/**
 * Phasing Prepare purchases. Old dominance scenarios now retain affordable
 * classes; multisets stay budget-bounded; commitments use a fixed live mask.
 * Hand-authored timing/risk fixtures use canonical replay and fixed weights.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildState, type UnitSpec } from './game-fixture';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { AKind, paA, paB, paKind } from '../../../src/ai/hard/core/action';
import { DEF_ID, DEF_INDEX, activeCatalog } from '../../../src/ai/hard/core/catalog';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import {
  MULTISET_WORDS,
  PURCHASE_MAX_BODIES,
  candidateDefs,
  newPlacePlan,
  planPurchases,
  purchaseMultisets,
  type PlacePlan,
} from '../../../src/ai/hard/gen/purchase';
import { TurnFlag } from '../../../src/ai/hard/gen/turn';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { getPurchasePositions } from '../../../src/game/summoning';
import { GAMMA_Q16, pstMine } from '../../../src/ai/hard/core/income';
import type { AIAction } from '../../../src/ai/types';
import { DESKTOP } from '../../../src/ai/hard/config';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import type { GameState } from '../../../src/game/types';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const rep = new Replica();
const sc = new Scratch(4, 8, 4, 4);
const tables: NodeTables = allocTables();
const cat = activeCatalog();

function prepare(state: GameState): { p: PackedState; t: NodeTables } {
  const p = rep.pack(state, allocState());
  p.proverMode = 2;
  buildTables(p, sc, 0, 2, tables);
  return { p, t: tables };
}

function defsOf(p: PackedState, t: NodeTables, side: Side): string[] {
  const out = new Uint8Array(cat.tier1.length);
  const n = candidateDefs(p, t, side, out);
  return Array.from(out.subarray(0, n)).map(d => DEF_ID[d]);
}

function plansOf(p: PackedState, t: NodeTables, maxPlans = 12): PlacePlan[] {
  const out: PlacePlan[] = Array.from({ length: maxPlans + 4 }, () => newPlacePlan());
  const cfg = { ...DESKTOP.gen.purchase, maxPlans };
  const n = planPurchases(p, t, cfg, sc, 0, out);
  return out.slice(0, n);
}

function buysOf(plan: PlacePlan): string[] {
  const out: string[] = [];
  for (let i = 0; i < plan.count; i++) {
    const a = plan.actions[i];
    expect(paKind(a)).toBe(AKind.BUY);
    out.push(`${DEF_ID[paA(a)]}@${paB(a)}`);
  }
  return out;
}

/** A quiet White board with one anchor at E5 and Black far away in its corner. */
function quiet(extra: UnitSpec[] = [], white = 12): GameState {
  return buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-anchor' },
      { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
      { def: 'fire_1', owner: 'black', x: 8, y: 9, id: 'b-second' },
      ...extra,
    ],
    white,
    black: 6,
    current: 'white',
    phase: 'place',
    turnNumber: 5,
  });
}

/**
 * A corner-locked White board: the only anchor is B2, so the legal spawn
 * squares are B1 and A2 — 17 BFS steps from J10 (outside `lightning_1`'s
 * home-race radius) and far from every Black body. Reserves are uniform so the
 * `metal_1` clause's "every candidate square has reserve >= 3" holds unless a
 * test overrides it.
 */
function cornerLocked(extra: UnitSpec[] = [], reserves?: readonly number[]): GameState {
  return buildState({
    units: [
      { def: 'plant_1', owner: 'white', x: 0, y: 0, id: 'w-a1' },
      { def: 'plant_1', owner: 'white', x: 1, y: 1, id: 'w-b2' },
      { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
      { def: 'water_1', owner: 'black', x: 8, y: 9, id: 'b-second' },
      ...extra,
    ],
    white: 12,
    black: 6,
    current: 'white',
    phase: 'place',
    turnNumber: 5,
    reserves: reserves ?? new Array<number>(100).fill(4),
  });
}

describe('gen/purchase.ts candidateDefs (DESIGN §5.5 dominance)', () => {
  it('offers only classes the bank can afford, in catalogue tier-1 order', () => {
    const { p, t } = prepare(quiet([], 3));
    // Only the two 3-crystal classes are affordable at a bank of 3.
    expect(defsOf(p, t, 0)).toEqual(['fire_1', 'lightning_1']);
  });

  it('retains all affordable classes: old same-turn dominance does not apply', () => {
    const { p, t } = prepare(cornerLocked());
    expect(defsOf(p, t, 0)).toEqual(Array.from(cat.tier1, d => DEF_ID[d]));
  });

  it('keeps lightning_1 when the enemy corner is inside the home-race radius', () => {
    // A White anchor on H9 puts legal spawn squares within BFS 12 of J10.
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 7, y: 8, id: 'w-anchor' },
          { def: 'plant_1', owner: 'black', x: 0, y: 9, id: 'b-far' },
        ],
        white: 12,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    expect(defsOf(p, t, 0)).toContain('lightning_1');
  });

  it('keeps lightning_1 when SPD 3 strictly beats SPD 2 to a reachable target', () => {
    // A Black body five steps from the nearest legal square: ceil(5/3) = 2 < 3 = ceil(5/2).
    const { p, t } = prepare(cornerLocked([{ def: 'water_1', owner: 'black', x: 0, y: 6, id: 'b-near' }]));
    expect(defsOf(p, t, 0)).toContain('lightning_1');
  });

  it('keeps shadow_1 when an enemy fire body sits in F17’s (4, 7] band', () => {
    // Black Hi on G1: BFS 5 from B1, inside Goel's SPD-2 reach and outside Sjór's.
    const { p, t } = prepare(cornerLocked([{ def: 'fire_1', owner: 'black', x: 6, y: 0, id: 'b-hi' }]));
    expect(defsOf(p, t, 0)).toContain('shadow_1');
  });

  it('keeps shadow_1 when a candidate square is a 0-reserve CORRIDOR cell', () => {
    // E2 anchors a rectangle that reaches the D1-F3 corridor block.
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 4, y: 1, id: 'w-anchor' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 12,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    expect(defsOf(p, t, 0)).toContain('shadow_1');
  });

  it('keeps metal_1 when a candidate square mines poorly', () => {
    const reserves = new Array<number>(100).fill(4);
    reserves[1] = 0; // B1 is one of the two legal squares.
    const { p, t } = prepare(cornerLocked([], reserves));
    expect(defsOf(p, t, 0)).toContain('metal_1');
  });

  it('retains metal_1 without relying on an immediate lethal-answer exception', () => {
    // Metal I is immobile; a commitment never supplies this turn's attack.
    const { p, t } = prepare(cornerLocked([{ def: 'water_1', owner: 'black', x: 2, y: 0, id: 'b-sjor' }]));
    expect(defsOf(p, t, 0)).toContain('metal_1');
  });

  it('never drops fire_1', () => {
    const { p, t } = prepare(cornerLocked());
    expect(defsOf(p, t, 0)).toContain('fire_1');
  });

  it('returns every affordable class when the side has no legal spawn square', () => {
    // A Black body inside the only rectangle blocks it; nothing can be dropped
    // because no candidate square exists to reason about.
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 1, y: 1, id: 'w-b2' },
          { def: 'fire_1', owner: 'black', x: 0, y: 0, id: 'b-intruder' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 12,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    expect(t.spawn[0].area).toBe(0);
    expect(defsOf(p, t, 0)).toHaveLength(6);
  });
});

describe('gen/purchase.ts purchaseMultisets (DESIGN §5.5)', () => {
  const defs = Uint8Array.from([DEF_INDEX.get('fire_1') as number, DEF_INDEX.get('water_1') as number]);

  function decode(out: Int32Array, n: number): string[][] {
    const sets: string[][] = [];
    for (let i = 0; i < n; i++) {
      const base = i * MULTISET_WORDS;
      const bodies: string[] = [];
      for (let k = 0; k < out[base]; k++) bodies.push(DEF_ID[out[base + 1 + k]]);
      sets.push(bodies);
    }
    return sets;
  }

  it('enumerates non-decreasing multisets inside the bank, never the empty one', () => {
    const out = new Int32Array(64 * MULTISET_WORDS);
    const n = purchaseMultisets(defs, 2, 7, 2, out);
    expect(decode(out, n)).toEqual([
      ['fire_1'],
      ['fire_1', 'fire_1'],
      ['fire_1', 'water_1'],
      ['water_1'],
    ]);
  });

  it('respects the body cap and the crystal budget independently', () => {
    const out = new Int32Array(64 * MULTISET_WORDS);
    // 3 crystals buys exactly one fire_1 and nothing else.
    expect(purchaseMultisets(defs, 2, 3, PURCHASE_MAX_BODIES, out)).toBe(1);
    expect(decode(out, 1)).toEqual([['fire_1']]);
    // 40 crystals with one body allowed is one multiset per class.
    expect(purchaseMultisets(defs, 2, 40, 1, out)).toBe(2);
  });

  it('writes -1 into the unused body slots and stops at the output capacity', () => {
    const out = new Int32Array(2 * MULTISET_WORDS);
    const n = purchaseMultisets(defs, 2, 40, PURCHASE_MAX_BODIES, out);
    expect(n).toBe(2);
    expect(out[0]).toBe(1);
    for (let k = 1; k < PURCHASE_MAX_BODIES; k++) expect(out[1 + k]).toBe(-1);
  });
});

describe('gen/purchase.ts planPurchases (DESIGN §5.5, F16)', () => {
  it('always emits the empty plan first, with the node’s own spawn area', () => {
    const { p, t } = prepare(quiet());
    const plans = plansOf(p, t);
    expect(plans.length).toBeGreaterThan(1);
    expect(plans[0].count).toBe(0);
    expect(plans[0].spend).toBe(0);
    expect(plans[0].scoreCc).toBe(0);
    expect(plans[0].spawnAfter).toBe(t.spawn[0].area);
  });

  it('emits only the empty plan outside the Place phase', () => {
    const { p, t } = prepare(buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 9, y: 9 },
      ],
      white: 20,
      current: 'white',
      phase: 'action',
    }));
    expect(plansOf(p, t)).toHaveLength(1);
  });

  it('replays every returned plan canonically with fixed live occupancy and distinct paid commitments', () => {
    const state = quiet([], 20);
    const { p, t } = prepare(state);
    const originalSquares = Array.from(p.sq);
    const originalOcc = Array.from(p.occ);
    const undo = newUndo();
    for (const plan of plansOf(p, t, 64)) {
      let canonical = state;
      const used = new Set<number>();
      for (let i = 0; i < plan.count; i++) {
        const packed = plan.actions[i];
        const q = paB(packed);
        const a: AIAction = { type: 'BUY_UNIT', definitionId: DEF_ID[paA(packed)], position: { x: q % 10, y: Math.floor(q / 10) } };
        expect(used.has(q)).toBe(false);
        used.add(q);
        expect(isLegalAction(canonical, a)).toBe(true);
        expect(rep.isLegal(p, packed)).toBe(true);
        canonical = applyAction(canonical, a);
        rep.make(p, packed, undo);
        expect(canonical.board.units).toEqual(state.board.units);
        expect(Array.from(p.sq)).toEqual(originalSquares);
        expect(Array.from(p.occ)).toEqual(originalOcc);
        expect(rep.isLegal(p, packed)).toBe(false);
        expect(isLegalAction(canonical, a)).toBe(false);
      }
      expect(plan.spawnAfter).toBe(getPurchasePositions(canonical, 'white').length);
      expect(state.players.white.resources - canonical.players.white.resources).toBe(plan.spend);
      const checked = rep.pack(canonical, allocState());
      expect([p.kposLo, p.kposHi]).toEqual([checked.kposLo, checked.kposHi]);
      for (let i = 0; i < plan.count; i++) rep.unmake(p, undo);
      undo.top = 0;
    }
  });

  it('reports spend and uncommitted purchase area without changing live spawn geometry', () => {
    const { p, t } = prepare(quiet([], 20));
    const undo = newUndo();
    const probe = allocTables();
    for (const plan of plansOf(p, t)) {
      if (plan.count === 0) continue;
      const bankBefore = p.bank[0];
      let applied = 0;
      for (let i = 0; i < plan.count; i++) {
        rep.make(p, plan.actions[i], undo);
        applied++;
      }
      expect(bankBefore - p.bank[0]).toBe(plan.spend);
      buildTables(p, sc, 1, 1, probe);
      expect(probe.spawn[0].area).toBe(t.spawn[0].area);
      expect(probe.spawn[0].area - p.pendCount[0]).toBe(plan.spawnAfter);
      for (let i = 0; i < applied; i++) rep.unmake(p, undo);
      undo.top = 0;
    }
  });

  it('F16: keeps the plan that fills the last spawn square, penalised but present', () => {
    // White's rectangle is A1-C2 and every square but C1 is occupied, so the
    // only buy fills the last legal square (DESIGN F16).
    const state = buildState({
      units: [
        { def: 'plant_1', owner: 'white', x: 0, y: 0, id: 'w-a1' },
        { def: 'fire_1', owner: 'white', x: 1, y: 0, id: 'w-b1' },
        { def: 'fire_1', owner: 'white', x: 0, y: 1, id: 'w-a2' },
        { def: 'plant_1', owner: 'white', x: 1, y: 1, id: 'w-b2' },
        { def: 'fire_1', owner: 'white', x: 2, y: 1, id: 'w-hi' },
        { def: 'water_1', owner: 'black', x: 2, y: 2, id: 'b-sjor' },
        { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
      ],
      white: 8,
      black: 6,
      current: 'white',
      phase: 'place',
      turnNumber: 5,
    });
    const { p, t } = prepare(state);
    expect(t.spawn[0].area).toBe(1);
    const plans = plansOf(p, t);
    const water = plans.find(plan => buysOf(plan).includes('water_1@2'));
    expect(water).toBeDefined();
    const plan = water as PlacePlan;
    // It is kept, it is a zero-spawn plan, and the bank still holds a body's
    // worth — exactly the case MF's generator rejected.
    expect(plan.spawnAfter).toBe(0);
    expect(p.bank[0] - plan.spend).toBeGreaterThanOrEqual(cat.cost[cat.tier1[0]]);
    expect(plan.flags & TurnFlag.PURCHASE).toBe(TurnFlag.PURCHASE);
    // Compare the identical assignment with only the zero-spawn coefficient
    // removed. Its absolute sign also includes mining and other ordering terms.
    const unpenalized = Array.from({ length: 16 }, () => newPlacePlan());
    const cfg = { ...DESKTOP.gen.purchase, maxPlans: 12,
      weights: { ...DESKTOP.gen.purchase.weights, zeroSpawnCc: 0 } };
    const count = planPurchases(p, t, cfg, sc, 0, unpenalized);
    const counterpart = unpenalized.slice(0, count).find(q => buysOf(q).includes('water_1@2'));
    expect(counterpart).toBeDefined();
    expect(counterpart!.scoreCc - plan.scoreCc).toBe(DESKTOP.gen.purchase.weights.zeroSpawnCc);
  });

  it('charges the next-bill reserve only as an ordering penalty, never as a rejection', () => {
    for (const owesRent of [false, true]) {
      const state = quiet(owesRent ? [{ def: 'fire_2', owner: 'white', x: 2, y: 2 }] : [], 3);
      state.board.cells.forEach(row => row.forEach(cell => { cell.resourceLayers = 0; }));
      state.board.initialResourceLayers = new Array<number>(100).fill(0);
      const { p, t } = prepare(state), out = Array.from({ length: 16 }, () => newPlacePlan());
      const cfg = { ...DESKTOP.gen.purchase, maxPlans: 16, maxBodies: 1,
        weights: { mineCc: 0, safeCc: 0, blockCc: 0, strikeCc: 0, anchorCc: 0, zeroSpawnCc: 0, liquidityCc: 17, homeRaceCc: 0 } };
      expect(t.econ[0].firstBillReached).toBe(true); expect(t.econ[0].requiredReserve).toBe(owesRent ? 1 : 0);
      const count = planPurchases(p, t, cfg, sc, 0, out), plans = out.slice(0, count).filter(plan => plan.count === 1);
      expect(plans.length).toBeGreaterThan(0);
      for (const plan of plans) { expect(plan.spend).toBe(3); expect(plan.scoreCc).toBe(owesRent ? -17 : 0); }
    }
  });

  it('marks delayed home-race intent without emitting a move or attack', () => {
    // A future Radi arrival may reach J10 on its next own Act; not this Prepare.
    const state = buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 7, y: 8, id: 'w-anchor' },
        { def: 'plant_1', owner: 'black', x: 0, y: 9, id: 'b-far' },
      ],
      white: 12,
      black: 6,
      current: 'white',
      phase: 'place',
      turnNumber: 5,
    });
    const { p, t } = prepare(state);
    expect(plansOf(p, t).some(plan => (plan.flags & TurnFlag.HOME_RACE) !== 0)).toBe(true);
  });
});


describe('Phasing purchase timing and dependency isolation', () => {
  function scored(state: GameState, patch: Partial<typeof DESKTOP.gen.purchase.weights> = {}): PlacePlan[] {
    const { p, t } = prepare(state);
    const out = Array.from({ length: 64 }, newPlacePlan);
    const cfg = { ...DESKTOP.gen.purchase, maxPlans: 64, maxBodies: 1, squares: 16, keepPerMultiset: 4,
      weights: { mineCc: 0, safeCc: 0, blockCc: 0, strikeCc: 0, anchorCc: 0, zeroSpawnCc: 0, liquidityCc: 0, homeRaceCc: 0, ...patch } };
    return out.slice(0, planPurchases(p, t, cfg, sc, 0, out));
  }
  const fireAt = (plans: PlacePlan[], q: number): PlacePlan => plans.find(c => c.count === 1 && paA(c.actions[0]) === DEF_INDEX.get('fire_1') && paB(c.actions[0]) === q)!;

  it('excludes existing own commitments and cannot use a remote pending body as an anchor', () => {
    const state = cornerLocked();
    state.pendingSummons = [
      { id: 'paid-b1', owner: 'white', definitionId: 'fire_1', cost: 3, position: { x: 1, y: 0 } },
      { id: 'remote', owner: 'white', definitionId: 'fire_1', cost: 3, position: { x: 8, y: 8 } },
    ];
    const { p, t } = prepare(state);
    const plans = plansOf(p, t, 64);
    expect(plans[0].spawnAfter).toBe(1);
    expect(plans.length).toBeGreaterThan(1);
    for (const plan of plans.slice(1)) {
      expect(plan.count).toBe(1);
      expect(paB(plan.actions[0])).toBe(10);
      expect(plan.spawnAfter).toBe(0);
      expect(rep.isLegal(p, plan.actions[0])).toBe(true);
    }
  });

  it('does not reserve the other owner’s pending square', () => {
    const state = cornerLocked();
    state.pendingSummons = [{ id: 'enemy', owner: 'black', definitionId: 'fire_1', cost: 3, position: { x: 1, y: 0 } }];
    const { p, t } = prepare(state);
    expect(plansOf(p, t, 64).some(c => buysOf(c).some(b => b.endsWith('@1')))).toBe(true);
  });

  it('discounts delayed mining one existing gamma step and recomputes same-mask/same-bank reserves', () => {
    const low = cornerLocked([], new Array<number>(100).fill(1));
    const high = cornerLocked([], new Array<number>(100).fill(8));
    const def = DEF_INDEX.get('fire_1')!;
    const first = fireAt(scored(low, { mineCc: 1 }), 1);
    const second = fireAt(scored(high, { mineCc: 1 }), 1);
    expect(first.scoreCc).toBe(Math.round(pstMine(def, 1) * GAMMA_Q16[1] / 65536));
    expect(second.scoreCc).toBe(Math.round(pstMine(def, 8) * GAMMA_Q16[1] / 65536));
    expect(second.scoreCc).toBeGreaterThan(first.scoreCc);
    expect(fireAt(scored(low, { mineCc: 2 }), 1).scoreCc).toBe(Math.round(2 * pstMine(def, 1) * GAMMA_Q16[1] / 65536));
  });

  it('prices refundable disruption as tied cash, preserving alternative live anchors', () => {
    const state = buildState({ phase: 'place', white: 12, black: 6, reserves: new Array<number>(100).fill(4), units: [
      { def: 'plant_1', owner: 'white', x: 0, y: 4 },
      { def: 'plant_1', owner: 'white', x: 4, y: 0 },
      { def: 'water_1', owner: 'black', x: 2, y: 3 },
    ] });
    const plans = scored(state, { safeCc: 100 });
    // The only common invasion square for A1's two supports is A1, five
    // SPD-1 steps away. B1's only support can be invaded in three steps.
    expect(fireAt(plans, 0).scoreCc).toBe(0);
    expect(fireAt(plans, 1).scoreCc).toBe(-Math.round(100 * 3 * (65536 - GAMMA_Q16[1]) / 65536));
  });

  it('has no immediate strike/block score or tactical summon flag, even beside a victim', () => {
    const state = cornerLocked([{ def: 'water_1', owner: 'black', x: 2, y: 0 }]);
    const neutral = scored(state);
    const oldBonuses = scored(state, { strikeCc: 100_000, blockCc: 100_000 });
    expect(oldBonuses.map(c => [Array.from(c.actions), c.scoreCc, c.flags])).toEqual(neutral.map(c => [Array.from(c.actions), c.scoreCc, c.flags]));
    for (const plan of oldBonuses.slice(1)) {
      expect(plan.flags & ~(TurnFlag.PURCHASE | TurnFlag.HOME_RACE)).toBe(0);
      expect(paKind(plan.actions[0])).toBe(AKind.BUY);
    }
  });
});

/**
 * 2026-09-23: every multiset is assigned and scored before the menu is
 * truncated, and each affordable class's largest single-class buy is pinned
 * ahead of the rest. Before, the write loop stopped at `maxPlans` in
 * cheapest-first order, so at a bank of 12 the whole menu was `fire_1 ×1..4`
 * (R1b's opt-in knob sorted first but still saw only fire-bearing multisets;
 * it is no longer read).
 */
describe('gen/purchase.ts full-class menu', () => {
  /** Every plan, off the full-size buffer `gen/generate.ts` allocates. */
  function menu(p: PackedState, t: NodeTables): PlacePlan[] {
    const cfg = DESKTOP.gen.purchase;
    const out: PlacePlan[] = Array.from({ length: Math.max(cfg.maxPlans, 200) + 1 }, () => newPlacePlan());
    return out.slice(0, planPurchases(p, t, cfg, sc, 0, out)).map(plan => ({ ...plan, actions: plan.actions.slice() }) as PlacePlan);
  }
  const classesOf = (plan: PlacePlan): Set<string> => new Set(buysOf(plan).map(b => b.split('@')[0]));

  it('offers every affordable class at the shipped bounds, and mixed plans too', () => {
    const { p, t } = prepare(quiet());
    const plans = menu(p, t);
    expect(plans.length).toBeLessThanOrEqual(DESKTOP.gen.purchase.maxPlans);
    expect(plans[0].count).toBe(0);
    expect(plans[0].pinned).toBe(false);
    const offered = new Set(plans.slice(1).flatMap(plan => [...classesOf(plan)]));
    expect(offered).toEqual(new Set(defsOf(p, t, 0)));
    expect(plans.some(plan => classesOf(plan).size > 1)).toBe(true);
  });

  it('pins one single-class plan per affordable class, at the most bodies it can buy, ahead of the rest', () => {
    const { p, t } = prepare(quiet());
    const plans = menu(p, t);
    const pinned = plans.filter(plan => plan.pinned);
    expect(pinned.map(plan => [...classesOf(plan)]).every(c => c.length === 1)).toBe(true);
    expect(pinned.map(plan => [...classesOf(plan)][0]).sort()).toEqual([...defsOf(p, t, 0)].sort());
    for (const plan of pinned) {
      const cost = cat.cost[paA(plan.actions[0])];
      expect(plan.count).toBe(Math.min(DESKTOP.gen.purchase.maxBodies, Math.floor(p.bank[0] / cost)));
    }
    // Pinned plans occupy 1..n best first; the others follow, best first.
    const n = pinned.length;
    expect(plans.slice(1, 1 + n).every(plan => plan.pinned)).toBe(true);
    for (let i = 2; i <= n; i++) expect(plans[i].scoreCc).toBeLessThanOrEqual(plans[i - 1].scoreCc);
    for (let i = n + 2; i < plans.length; i++) expect(plans[i].scoreCc).toBeLessThanOrEqual(plans[i - 1].scoreCc);
  });

  it('keeps a class pinned even when the plan budget leaves no room for anything else', () => {
    const { p, t } = prepare(quiet());
    const plans = plansOf(p, t, 3);
    expect(plans).toHaveLength(3);
    expect(plans.slice(1).every(plan => plan.pinned)).toBe(true);
  });

  it('offers non-fire singletons in a corner-locked position', () => {
    const { p, t } = prepare(cornerLocked());
    const singles = new Set(menu(p, t).filter(plan => plan.count === 1).map(plan => [...classesOf(plan)][0]));
    expect(singles.has('water_1') && singles.has('plant_1')).toBe(true);
  });
});
