/**
 * `src/ai/hard/tables/kill.ts` (DESIGN §4.11, §5.7).
 *
 * Every expectation is either derived from the live catalogue (so the balance
 * lab's `setElementGraph`/`setUpkeepVariant` knobs cannot silently rot a
 * hard-coded number) or taken from a published measurement: the corner cases
 * mirror `lab/ai/fixtures.ts`, the Cleave probes are the exact boards of
 * `lab/experiments/four-actions/probes.ts` whose answers LH §4.1 records.
 */
import { describe, expect, it, vi } from 'vitest';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { DEF_INDEX, activeCatalog, powerIndex } from '../../../src/ai/hard/core/catalog';
import { Replica } from '../../../src/ai/hard/core/state';
import { newSpawnInfo, spawnInfo } from '../../../src/ai/hard/core/spawn';
import { bbHas } from '../../../src/ai/hard/core/bits';
import type { PackedState, Side } from '../../../src/ai/hard/types';
import {
  KILL_IMPOSSIBLE,
  cleaveChain,
  cleavePlan,
  killTable,
  minActionsToKill,
  newCleavePlan,
  KILL_PENDING_ATTACKER,
  newKillPlan,
  newKillTable,
  type KillContext,
  type KillOpts,
} from '../../../src/ai/hard/tables/kill';
import { buildState, type StateSpec } from './game-fixture';

// E0.5 timeout budget: slowest test 0.0 s in the 2026-09-15 survey (M2 Max, load ~5, maxWorkers 2); 10 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 10_000 });

const WHITE: Side = 0;
const BLACK: Side = 1;
const cat = activeCatalog();
const sc = new Scratch(4, 4, 4);
const plan = newKillPlan();

function def(id: string): number {
  const d = DEF_INDEX.get(id);
  if (d === undefined) throw new Error(`unknown definition ${id}`);
  return d;
}

function power(side: Side, attacker: string, defender: string): number {
  return cat.power[powerIndex(side, def(attacker), def(defender))];
}

interface Board {
  p: PackedState;
  t: KillContext;
  rep: Replica;
}

function board(spec: StateSpec): Board {
  const rep = new Replica();
  const p = rep.pack(buildState(spec));
  const white = newSpawnInfo();
  const black = newSpawnInfo();
  spawnInfo(p, WHITE, white);
  spawnInfo(p, BLACK, black);
  return { p, t: { dist: rep.dist, spawn: [white, black] }, rep };
}

function opts(over: Partial<KillOpts> = {}): KillOpts {
  return { actionBudget: 4, crystalBudget: 0, allowBuys: false, allowPromotes: false, maxLanes: 4, ...over };
}

/** Slot of the unit at (x, y); slots are the `board.units` indices (`pack`). */
function slotAt(p: PackedState, x: number, y: number): number {
  const slot = p.pieceAt[y * 10 + x];
  expect(slot).not.toBe(255);
  return slot;
}

describe('minActionsToKill — lanes', () => {
  it('a corner target admits exactly two lanes, so two hits cap the damage', () => {
    // lab/ai/fixtures.ts "five-action rotation exceeds the turn budget":
    // three Straumr around the corner, but only two can ever reach it.
    const b = board({
      units: [
        { def: 'metal_3', owner: 'black', x: 0, y: 0 },
        { def: 'water_3', owner: 'white', x: 1, y: 0 },
        { def: 'water_3', owner: 'white', x: 0, y: 1 },
        { def: 'water_3', owner: 'white', x: 2, y: 0 },
      ],
    });
    expect(power(WHITE, 'water_3', 'metal_3') * 2).toBeLessThan(cat.def[def('metal_3')]);
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 0, 0), opts(), sc, 0, plan)).toBe(false);
    expect(plan.actions).toBe(KILL_IMPOSSIBLE);
  });

  it('two adjacent attackers on the corner lanes kill in two actions', () => {
    // lab/ai/fixtures.ts "Metal III / two Shadow III", expected `proved`.
    const b = board({
      units: [
        { def: 'metal_3', owner: 'black', x: 0, y: 0 },
        { def: 'shadow_3', owner: 'white', x: 1, y: 0 },
        { def: 'shadow_3', owner: 'white', x: 0, y: 1 },
      ],
      actions: 2,
    });
    expect(power(WHITE, 'shadow_3', 'metal_3') * 2).toBeGreaterThanOrEqual(cat.def[def('metal_3')]);
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 0, 0), opts({ actionBudget: 2 }), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(2);
    expect(plan.crystals).toBe(0);
    expect(plan.needsPromo).toBe(0);
    expect([plan.attackers[0], plan.attackers[1]].sort()).toEqual([slotAt(b.p, 0, 1), slotAt(b.p, 1, 0)].sort());
    expect([plan.lanes[0], plan.lanes[1]].sort()).toEqual([1, 10]);
  });

  it('a lane held by the target’s own side is not a lane', () => {
    // The only free approach to the corner target is plugged by its own miner,
    // so the single attacker on the other neighbour is the whole story.
    const b = board({
      units: [
        { def: 'metal_3', owner: 'black', x: 0, y: 0 },
        { def: 'plant_1', owner: 'black', x: 1, y: 0 },
        { def: 'shadow_3', owner: 'white', x: 0, y: 1 },
      ],
    });
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 0, 0), opts(), sc, 0, plan)).toBe(false);
  });

  it('maxLanes caps the number of hits below the lane count', () => {
    const b = board({
      units: [
        { def: 'metal_3', owner: 'black', x: 4, y: 4 },
        { def: 'shadow_3', owner: 'white', x: 3, y: 4 },
        { def: 'shadow_3', owner: 'white', x: 5, y: 4 },
      ],
    });
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 4, 4), opts(), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(2);
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 4, 4), opts({ maxLanes: 1 }), sc, 0, plan)).toBe(false);
  });

  // A lane holds ONE attacker. The DP carries the set of lanes a plan has used,
  // not just how many hits it has landed, so a second attacker whose cheapest
  // approach is the same neighbour square has to pay for a different one.
  // `lab/hard-ai/oracles/kill.ts` measures exactly this against a real replica
  // turn search (`suboptimal === 0`); these two boards are its unit twin.
  describe('two attackers are never charged the same lane', () => {
    // Shin (shadow_1, DEF 2) at (5,5) with its west and east neighbours plugged
    // by its own miners: only (5,4) and (5,6) are lanes. Two Hi (fire_1, ATK 1
    // into shadow) need both lanes to land the two hits DEF 2 demands.
    const plugged: StateSpec['units'] = [
      { def: 'shadow_1', owner: 'black', x: 5, y: 5 },
      { def: 'plant_1', owner: 'black', x: 4, y: 5 },
      { def: 'plant_1', owner: 'black', x: 6, y: 5 },
    ];

    it('is impossible when the far lane is out of reach', () => {
      // (5,3) and (4,4) are both one step from (5,4); the detour to (5,6) round
      // the plugged rank costs 5 and 7 steps at speed 2, i.e. 4 and 5 actions.
      const b = board({ units: [...plugged, { def: 'fire_1', owner: 'white', x: 5, y: 3 }, { def: 'fire_1', owner: 'white', x: 4, y: 4 }] });
      expect(power(WHITE, 'fire_1', 'shadow_1')).toBe(1);
      expect(cat.def[def('shadow_1')]).toBe(2);
      expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 5, 5), opts(), sc, 0, plan)).toBe(false);
    });

    it('takes both lanes when each attacker has its own', () => {
      const b = board({ units: [...plugged, { def: 'fire_1', owner: 'white', x: 5, y: 3 }, { def: 'fire_1', owner: 'white', x: 5, y: 7 }] });
      expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 5, 5), opts(), sc, 0, plan)).toBe(true);
      // Each Hi is one step from its lane: a move plus a hit, twice.
      expect(plan.actions).toBe(4);
      expect([plan.lanes[0], plan.lanes[1]].sort((x, y) => x - y)).toEqual([4 * 10 + 5, 6 * 10 + 5]);
      expect([plan.attackers[0], plan.attackers[1]].sort((x, y) => x - y)).toEqual(
        [slotAt(b.p, 5, 3), slotAt(b.p, 5, 7)].sort((x, y) => x - y),
      );
    });
  });
});

describe('minActionsToKill — candidate eligibility', () => {
  it('drops POWER-0 attackers instead of letting them burn an action', () => {
    expect(power(WHITE, 'plant_1', 'fire_1')).toBe(0);
    const b = board({
      units: [
        { def: 'fire_1', owner: 'black', x: 4, y: 4 },
        { def: 'plant_1', owner: 'white', x: 3, y: 4 },
      ],
    });
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 4, 4), opts(), sc, 0, plan)).toBe(false);
  });

  it('honours canActThisTurn (DESIGN F2)', () => {
    const spec: StateSpec = {
      units: [
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
        { def: 'fire_1', owner: 'white', x: 3, y: 4 },
      ],
    };
    expect(minActionsToKill(board(spec).p, board(spec).t, WHITE, 0, opts(), sc, 0, plan)).toBe(true);
    const off = board({ units: [spec.units[0], { ...spec.units[1], canAct: false }] });
    expect(minActionsToKill(off.p, off.t, WHITE, slotAt(off.p, 4, 4), opts(), sc, 0, plan)).toBe(false);
  });

  it('honours the Cleave chain state: a spent non-lethal attacker is out', () => {
    const spent = board({
      units: [
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
        { def: 'fire_2', owner: 'white', x: 3, y: 4, atkCount: 1, lastAttackKilled: false },
      ],
    });
    expect(minActionsToKill(spent.p, spent.t, WHITE, slotAt(spent.p, 4, 4), opts(), sc, 0, plan)).toBe(false);

    const chaining = board({
      units: [
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
        { def: 'fire_2', owner: 'white', x: 3, y: 4, atkCount: 1, lastAttackKilled: true },
      ],
    });
    expect(minActionsToKill(chaining.p, chaining.t, WHITE, slotAt(chaining.p, 4, 4), opts(), sc, 0, plan)).toBe(true);

    const tierOne = board({
      units: [
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
        { def: 'fire_1', owner: 'white', x: 3, y: 4, atkCount: 1, lastAttackKilled: true },
      ],
    });
    // muju-phasing-4: no tier cap — a tier-1 Hi whose last attack killed chains on.
    expect(minActionsToKill(tierOne.p, tierOne.t, WHITE, slotAt(tierOne.p, 4, 4), opts(), sc, 0, plan)).toBe(true);
  });

  it('charges ceil(distance / speed) + 1 over BFS distance, not Manhattan', () => {
    // A wall of enemy miners forces the long way round: Manhattan says 3,
    // the real corridor is 7 steps at speed 1.
    const b = board({
      units: [
        { def: 'fire_1', owner: 'black', x: 4, y: 0 },
        { def: 'plant_1', owner: 'black', x: 3, y: 0 },
        { def: 'plant_1', owner: 'black', x: 3, y: 1 },
        { def: 'plant_1', owner: 'black', x: 4, y: 1 },
        { def: 'plant_1', owner: 'black', x: 5, y: 1 },
        { def: 'water_1', owner: 'white', x: 2, y: 0 },
      ],
    });
    // (3,0) and (4,1) are held by the target's own side, so the only lane is
    // (5,0) and the route to it is (2,1),(2,2),(3,2),(4,2),(5,2),(6,2),(6,1),
    // (6,0),(5,0): 9 steps at speed 1, which no four-action turn can pay.
    expect(cat.spd[def('water_1')]).toBe(1);
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 4, 0), opts(), sc, 0, plan)).toBe(false);
    const open = board({
      units: [
        { def: 'fire_1', owner: 'black', x: 4, y: 0 },
        { def: 'water_1', owner: 'white', x: 2, y: 0 },
      ],
    });
    // (2,0) -> (3,0) is one step at speed 1: one move plus one attack.
    expect(minActionsToKill(open.p, open.t, WHITE, slotAt(open.p, 4, 0), opts(), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(2);
  });

  it('counts damage already taken', () => {
    const fresh = board({
      units: [
        { def: 'metal_3', owner: 'black', x: 4, y: 4 },
        { def: 'shadow_2', owner: 'white', x: 3, y: 4 },
      ],
    });
    expect(minActionsToKill(fresh.p, fresh.t, WHITE, slotAt(fresh.p, 4, 4), opts(), sc, 0, plan)).toBe(false);
    const chipped = board({
      units: [
        { def: 'metal_3', owner: 'black', x: 4, y: 4, damage: cat.def[def('metal_3')] - power(WHITE, 'shadow_2', 'metal_3') },
        { def: 'shadow_2', owner: 'white', x: 3, y: 4 },
      ],
    });
    expect(minActionsToKill(chipped.p, chipped.t, WHITE, slotAt(chipped.p, 4, 4), opts(), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(1);
  });
});

describe('minActionsToKill — Phasing horizons', () => {
  const units: StateSpec['units'] = [
    { def: 'plant_1', owner: 'white', x: 5, y: 5 },
    { def: 'fire_1', owner: 'black', x: 6, y: 4 },
  ];
  it('does not invent a bought attacker in the current Act, even with cash and legacy buy enabled', () => {
    const b = board({ units, white: 20 });
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 6, 4), opts({ allowBuys: true, crystalBudget: 20 }), sc, 0, plan)).toBe(false);
  });
  it('does not promote retroactively for either horizon', () => {
    const b = board({ units: [
      { def: 'metal_3', owner: 'black', x: 0, y: 0 },
      { def: 'shadow_2', owner: 'white', x: 1, y: 0 },
      { def: 'shadow_2', owner: 'white', x: 0, y: 1 },
    ], white: 24 });
    expect(power(WHITE, 'shadow_2', 'metal_3') * 2).toBeLessThan(cat.def[def('metal_3')]);
    for (const horizon of ['current', 'nextAct'] as const) {
      expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 0, 0), opts({ horizon, allowPromotes: true, crystalBudget: 24 }), sc, 0, plan)).toBe(false);
      expect(plan.needsPromo).toBe(0);
    }
  });
  it('counts an already-paid arrival only at next Act, with zero bank and crystal budget', () => {
    const b = board({ units, white: 0, pendingSummons: [{ def: 'water_1', owner: 'white', x: 5, y: 4 }] });
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 6, 4), opts(), sc, 0, plan)).toBe(false);
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 6, 4), opts({ horizon: 'nextAct' }), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(1);
    expect(plan.crystals).toBe(0);
    expect(plan.attackers[0]).toBe(KILL_PENDING_ATTACKER);
    expect(plan.spawnAt[0]).toBe(45);
    expect(plan.needsPromo).toBe(0);
  });
  it('voids a pending attacker when all its live supporting rectangles are blocked', () => {
    const b = board({ units: [...units, { def: 'metal_1', owner: 'black', x: 2, y: 2 }],
      pendingSummons: [{ def: 'water_1', owner: 'white', x: 5, y: 4 }] });
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 6, 4), opts({ horizon: 'nextAct' }), sc, 0, plan)).toBe(false);
  });
  it('resets a spent live attack only in the next-Act horizon', () => {
    const b = board({ units: [
      { def: 'fire_1', owner: 'white', x: 4, y: 4, canAct: false, atkCount: 1 },
      { def: 'plant_1', owner: 'black', x: 5, y: 4 },
    ] });
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 5, 4), opts(), sc, 0, plan)).toBe(false);
    expect(minActionsToKill(b.p, b.t, WHITE, slotAt(b.p, 5, 4), opts({ horizon: 'nextAct' }), sc, 0, plan)).toBe(true);
    expect(plan.actions).toBe(1);
    expect(plan.attackers[0]).toBe(slotAt(b.p, 4, 4));
  });
});

describe('killTable', () => {
  it('fills every enemy slot and summarises the best value per action', () => {
    const b = board({
      units: [
        { def: 'plant_1', owner: 'black', x: 4, y: 4 },
        { def: 'metal_3', owner: 'black', x: 9, y: 9 },
        { def: 'fire_3', owner: 'white', x: 3, y: 4 },
      ],
    });
    const table = newKillTable();
    killTable(b.p, b.t, WHITE, opts(), sc, 0, table);

    const muju = slotAt(b.p, 4, 4);
    const straumr = slotAt(b.p, 9, 9);
    const kagari = slotAt(b.p, 3, 4);

    expect(table.entry[muju].minActions).toBe(1);
    expect(table.entry[muju].valueCc).toBe(cat.cost[def('plant_1')] * 100);
    expect(table.entry[straumr].minActions).toBe(KILL_IMPOSSIBLE);
    expect(table.entry[straumr].valueCc).toBe(cat.cost[def('metal_3')] * 100);
    // Own units are never entries.
    expect(table.entry[kagari].minActions).toBe(KILL_IMPOSSIBLE);
    expect(table.entry[kagari].valueCc).toBe(0);

    expect(table.count).toBe(1);
    expect(bbHas(table.killableNow, 4 * 10 + 4)).toBe(true);
    expect(bbHas(table.killableNow, 9 * 10 + 9)).toBe(false);
    expect(table.bestValuePerAction).toBe(cat.cost[def('plant_1')] * 100);
  });

  it('does not label already-paid arrivals as a new buy or promotion', () => {
    const b = board({
      units: [
        { def: 'plant_1', owner: 'white', x: 5, y: 5 },
        { def: 'fire_1', owner: 'black', x: 6, y: 4 },
      ],
      pendingSummons: [{ def: 'water_1', owner: 'white', x: 5, y: 4 }],
      white: 0,
    });
    const table = newKillTable();
    killTable(b.p, b.t, WHITE, opts({ horizon: 'nextAct' }), sc, 0, table);
    const target = slotAt(b.p, 6, 4);
    expect(table.entry[target].minActions).toBe(1);
    expect(table.entry[target].needsBuy).toBe(0);
    expect(table.entry[target].needsPromo).toBe(0);
  });
});

describe('cleaveChain', () => {
  // lab/experiments/four-actions/probes.ts `cleave()`, LH §4.1: one Kagari
  // against three stationary Muju. Clustered kills 3 in 3 actions; spaced on
  // C1/E1/G1 the four-action budget caps it at 2 kills in 4 actions.
  const mujuCc = cat.cost[def('plant_1')] * 100;

  it('clustered: three kills in three actions', () => {
    const b = board({
      units: [
        { def: 'fire_3', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
        { def: 'plant_1', owner: 'black', x: 4, y: 5 },
        { def: 'plant_1', owner: 'black', x: 3, y: 4 },
      ],
    });
    const kagari = slotAt(b.p, 4, 4);
    expect(cleaveChain(b.p, b.t, kagari, sc, 0)).toBe(3 * mujuCc);
    const witness = cleavePlan(b.p, b.t, kagari, sc, 0, newCleavePlan());
    expect(witness.kills).toBe(3);
    expect(witness.actions).toBe(3);
    expect(witness.square).toBe(4 * 10 + 4);
  });

  it('spaced C1/E1/G1: two kills in four actions', () => {
    const b = board({
      units: [
        { def: 'fire_3', owner: 'white', x: 0, y: 0 },
        { def: 'plant_1', owner: 'black', x: 2, y: 0 },
        { def: 'plant_1', owner: 'black', x: 4, y: 0 },
        { def: 'plant_1', owner: 'black', x: 6, y: 0 },
      ],
    });
    const kagari = slotAt(b.p, 0, 0);
    expect(cleaveChain(b.p, b.t, kagari, sc, 0)).toBe(2 * mujuCc);
    const witness = cleavePlan(b.p, b.t, kagari, sc, 0, newCleavePlan());
    expect(witness.kills).toBe(2);
    expect(witness.actions).toBe(4);
    expect(witness.square).toBe(3);
  });

  it('is not capped by the attacker’s tier (muju-phasing-4)', () => {
    // A tier-1 Hi standing among three one-shot victims chains all three.
    const b = board({
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
        { def: 'plant_1', owner: 'black', x: 4, y: 5 },
        { def: 'plant_1', owner: 'black', x: 3, y: 4 },
      ],
    });
    expect(power(WHITE, 'fire_1', 'plant_1')).toBeGreaterThanOrEqual(cat.def[def('plant_1')]);
    expect(cat.tier[def('fire_1')]).toBe(1);
    expect(cleaveChain(b.p, b.t, slotAt(b.p, 4, 4), sc, 0)).toBe(3 * mujuCc);
  });

  it('ignores victims the unit cannot one-shot', () => {
    const b = board({
      units: [
        { def: 'fire_2', owner: 'white', x: 4, y: 4 },
        { def: 'metal_3', owner: 'black', x: 5, y: 4 },
      ],
    });
    expect(power(WHITE, 'fire_2', 'metal_3')).toBeLessThan(cat.def[def('metal_3')]);
    expect(cleaveChain(b.p, b.t, slotAt(b.p, 4, 4), sc, 0)).toBe(0);
  });

  it('takes the most valuable victims first', () => {
    const b = board({
      units: [
        { def: 'fire_3', owner: 'white', x: 4, y: 4 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
        { def: 'fire_1', owner: 'black', x: 4, y: 5 },
        { def: 'lightning_1', owner: 'black', x: 3, y: 4 },
      ],
    });
    // Four actions take all three hits, so this is a sum — but the ORDER is by
    // value, which the two-actions-left variant below exposes.
    expect(cleaveChain(b.p, b.t, slotAt(b.p, 4, 4), sc, 0)).toBe(
      (cat.cost[def('plant_1')] + cat.cost[def('fire_1')] + cat.cost[def('lightning_1')]) * 100,
    );
    // A Hi (speed 2) four squares away spends two actions reaching (4,4), so it
    // has two left for the chain there, and every other square touches fewer
    // victims or costs more to reach. With no tier cap, ACTIONS decide how many
    // are taken, and the two most valuable (Muju and Poṉ, 5 each) beat Kimbunga (3).
    const approach = board({
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 0 },
        { def: 'plant_1', owner: 'black', x: 5, y: 4 },
        { def: 'metal_1', owner: 'black', x: 4, y: 5 },
        { def: 'lightning_1', owner: 'black', x: 3, y: 4 },
      ],
    });
    expect(cat.cost[def('lightning_1')]).toBeLessThan(cat.cost[def('metal_1')]);
    const witness = cleavePlan(approach.p, approach.t, slotAt(approach.p, 4, 0), sc, 0, newCleavePlan());
    expect(witness.kills).toBe(2);
    expect(witness.actions).toBe(4);
    expect(witness.valueCc).toBe((cat.cost[def('plant_1')] + cat.cost[def('metal_1')]) * 100);
  });
});
