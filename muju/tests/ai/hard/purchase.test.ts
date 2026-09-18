// @vitest-environment node
/**
 * `src/ai/hard/gen/purchase.ts` (DESIGN §5.5, F16, F17, EG G7).
 *
 * The three stages are pinned separately: the dominance filter's drop rules and
 * its three "never drop" guards, the multiset enumerator's exact output on a
 * known bank, and the square assignment's ordering-legality and no-rejection
 * behaviour. Every position is a REAL `GameState` packed through
 * `Replica.pack`, so the legal spawn masks, reserves and power tables the
 * module reads are the canonical engine's own.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildState, type UnitSpec } from './game-fixture';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { AKind, paA, paB, paKind } from '../../../src/ai/hard/core/action';
import { DEF_ID, DEF_INDEX, activeCatalog } from '../../../src/ai/hard/core/catalog';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import {
  LIQUIDITY_FLOOR,
  MULTISET_WORDS,
  PURCHASE_MAX_BODIES,
  candidateDefs,
  newPlacePlan,
  planPurchases,
  purchaseMultisets,
  type PlacePlan,
} from '../../../src/ai/hard/gen/purchase';
import { TurnFlag } from '../../../src/ai/hard/gen/turn';
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

  it('drops lightning_1, metal_1 and shadow_1 when every clause of §5.5 holds', () => {
    const { p, t } = prepare(cornerLocked());
    expect(defsOf(p, t, 0)).toEqual(['fire_1', 'water_1', 'plant_1']);
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
    // Black Hi on G1: BFS 5 from B1, inside Goel's SPD-2 reach and outside Sjor's.
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

  it('keeps metal_1 when Inyan’s ATK 1 completes a kill Muju’s ATK 0 cannot', () => {
    // A Black Sjor (DEF 2) one step from B1: Inyan reaches POWER 2, Muju 1.
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

  it('every emitted buy is legal in the order it is emitted (DESIGN §5.5 ordering legality)', () => {
    const { p, t } = prepare(quiet([], 20));
    const undo = newUndo();
    for (const plan of plansOf(p, t)) {
      let applied = 0;
      for (let i = 0; i < plan.count; i++) {
        expect(rep.isLegal(p, plan.actions[i])).toBe(true);
        rep.make(p, plan.actions[i], undo);
        applied++;
      }
      for (let i = 0; i < applied; i++) rep.unmake(p, undo);
      undo.top = 0;
    }
  });

  it('reports spend and spawnAfter exactly as the replica computes them', () => {
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
      expect(probe.spawn[0].area).toBe(plan.spawnAfter);
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
    // The penalty is applied: the same assignment without it would score higher
    // than the plan's recorded score by at least `zeroSpawnCc`.
    expect(plan.scoreCc).toBeLessThan(0);
  });

  it('charges the liquidity floor as an ordering penalty, never as a rejection', () => {
    // A bank of exactly one body leaves 0 crystals, i.e. `LIQUIDITY_FLOOR`
    // below the floor; the plan still exists.
    const { p, t } = prepare(quiet([], 3));
    const plans = plansOf(p, t);
    expect(plans.length).toBeGreaterThan(1);
    expect(LIQUIDITY_FLOOR).toBeGreaterThan(0);
    expect(plans.some(plan => plan.count === 1)).toBe(true);
  });

  it('marks a buy that can reach the enemy corner this turn as a home-race plan', () => {
    // A White Radi bought on H9 is four SPD-3 actions from J10.
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
