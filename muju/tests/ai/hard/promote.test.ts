// @vitest-environment node
/**
 * `src/ai/hard/gen/promote.ts` (DESIGN §5.6, ET §3.4, SU addendum 1).
 *
 * Two things are pinned: the LEGALITY envelope — every emitted candidate must
 * be a `PROMOTE` the replica (and therefore `promotion.ts`) accepts — and the
 * MISSION semantics, one test per mission plus the rent accounting SU addendum
 * 1 insists on.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildState } from './game-fixture';
import { Replica, allocState, newUndo } from '../../../src/ai/hard/core/state';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { AKind, paMake } from '../../../src/ai/hard/core/action';
import { activeCatalog } from '../../../src/ai/hard/core/catalog';
import { allocTables, buildTables, type NodeTables } from '../../../src/ai/hard/tables/context';
import { RENT_PV } from '../../../src/ai/hard/core/income';
import { CC, type PackedState } from '../../../src/ai/hard/types';
import {
  Mission,
  newPromoCandidate,
  planPromotions,
  type PromoCandidate,
} from '../../../src/ai/hard/gen/promote';
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

function promotionsOf(p: PackedState, t: NodeTables, max = 8): PromoCandidate[] {
  const out: PromoCandidate[] = Array.from({ length: 8 }, () => newPromoCandidate());
  const n = planPromotions(p, t, max, out);
  return out.slice(0, n).map(c => ({ ...c }));
}

/** The definition a slot would become. */
function nextOf(p: PackedState, slot: number): number {
  return cat.nextDef[p.defId[slot]];
}

describe('gen/promote.ts planPromotions (DESIGN §5.6)', () => {
  it('emits nothing outside the Place phase, and nothing while upkeep is pending', () => {
    const action = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4 },
          { def: 'water_1', owner: 'black', x: 4, y: 5 },
        ],
        white: 20,
        current: 'white',
        phase: 'action',
      }),
    );
    expect(promotionsOf(action.p, action.t)).toHaveLength(0);

    const upkeep = prepare(
      buildState({
        units: [
          { def: 'fire_2', owner: 'white', x: 4, y: 4 },
          { def: 'water_1', owner: 'black', x: 9, y: 9 },
        ],
        white: 20,
        current: 'white',
        phase: 'place',
        upkeepPending: true,
      }),
    );
    expect(promotionsOf(upkeep.p, upkeep.t)).toHaveLength(0);
  });

  it('every emitted candidate is a legal PROMOTE with the catalogue’s own cost', () => {
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-hi' },
          { def: 'plant_1', owner: 'white', x: 3, y: 4, id: 'w-muju' },
          { def: 'water_1', owner: 'black', x: 4, y: 5, id: 'b-sjor' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 20,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    const promos = promotionsOf(p, t);
    expect(promos.length).toBeGreaterThan(0);
    const undo = newUndo();
    for (const c of promos) {
      const a = paMake(AKind.PROMOTE, c.slot, 0, 0);
      expect(rep.isLegal(p, a)).toBe(true);
      expect(c.cost).toBe(cat.promoCost[p.defId[c.slot]]);
      rep.make(p, a, undo);
      rep.unmake(p, undo);
      undo.top = 0;
    }
  });

  it('never proposes a body bought this turn or already promoted (promotion.ts:44-58)', () => {
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-placed', placedThisTurn: true },
          { def: 'fire_1', owner: 'white', x: 3, y: 4, id: 'w-promoted', promotedThisPlacement: true },
          { def: 'water_1', owner: 'black', x: 4, y: 5, id: 'b-sjor' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 20,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    expect(promotionsOf(p, t)).toHaveLength(0);
  });

  it('KILL: promotes the body whose new POWER crosses a reachable target’s defence', () => {
    // White Hi (POWER 1 into water) next to a Black Sjor (DEF 2); Hono reaches 2.
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-hi' },
          { def: 'water_1', owner: 'black', x: 4, y: 5, id: 'b-sjor' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 20,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    const promos = promotionsOf(p, t);
    const hi = promos.find(c => p.defId[c.slot] === 0);
    expect(hi).toBeDefined();
    expect((hi as PromoCandidate).mission).toBe(Mission.KILL);
  });

  it('charges the crystals and RENT_PV × Δupkeep (SU addendum 1)', () => {
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-hi' },
          { def: 'water_1', owner: 'black', x: 4, y: 5, id: 'b-sjor' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 20,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    const hi = promotionsOf(p, t).find(c => p.defId[c.slot] === 0) as PromoCandidate;
    const def = p.defId[hi.slot];
    const next = nextOf(p, hi.slot);
    // KILL's benefit is the victim's catalogue prior; the material the
    // promotion buys exactly repays its crystals, so the residue is the rent.
    const victimValue = cat.cost[6] * CC; // water_1
    const material = (cat.cost[next] - cat.cost[def]) * CC;
    const rent = RENT_PV * (cat.upkeep[next] - cat.upkeep[def]);
    expect(hi.scoreCc).toBe(victimValue + material - hi.cost * CC - rent);
    expect(rent).toBeGreaterThan(0);
    // The rent is what makes a tier-1 promotion expensive at all.
    expect(hi.scoreCc).toBeLessThan(victimValue);
  });

  it('INCOME: promotes a plant whose cell can feed the bigger mine', () => {
    const reserves = new Array<number>(100).fill(0);
    reserves[44] = 16; // E5: reserve >= 2 x plant_2's MINE 5.
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'plant_1', owner: 'white', x: 4, y: 4, id: 'w-muju' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 20,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
        reserves,
      }),
    );
    const muju = promotionsOf(p, t).find(c => c.slot === 0);
    expect(muju).toBeDefined();
    expect((muju as PromoCandidate).mission).toBe(Mission.INCOME);
  });

  it('REACH: promotes lightning_2 and metal_2 for the speed alone', () => {
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'lightning_2', owner: 'white', x: 4, y: 4, id: 'w-umeme' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 20,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    const umeme = promotionsOf(p, t).find(c => c.slot === 0);
    expect(umeme).toBeDefined();
    expect((umeme as PromoCandidate).mission).toBe(Mission.REACH);
  });

  it('returns at most `max` candidates, best score first, ties by ascending slot', () => {
    const units = [];
    for (let i = 0; i < 6; i++) units.push({ def: 'fire_1', owner: 'white' as const, x: i, y: 0, id: `w-${i}` });
    units.push({ def: 'water_1', owner: 'black' as const, x: 0, y: 1, id: 'b-sjor' });
    units.push({ def: 'plant_1', owner: 'black' as const, x: 9, y: 9, id: 'b-corner' });
    const { p, t } = prepare(
      buildState({ units, white: 40, black: 6, current: 'white', phase: 'place', turnNumber: 5 }),
    );
    const promos = promotionsOf(p, t, 3);
    expect(promos.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < promos.length; i++) {
      expect(promos[i - 1].scoreCc).toBeGreaterThanOrEqual(promos[i].scoreCc);
      if (promos[i - 1].scoreCc === promos[i].scoreCc) expect(promos[i - 1].slot).toBeLessThan(promos[i].slot);
    }
  });

  it('never proposes a promotion the bank cannot pay for', () => {
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-hi' },
          { def: 'water_1', owner: 'black', x: 4, y: 5, id: 'b-sjor' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 3,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    expect(promotionsOf(p, t)).toHaveLength(0);
  });
});

// Metal v2.9: Yan must be eligible for a movement upgrade even on an empty mine.
it('REACH: stationary Yan can promote for movement alone', () => {
  const {p, t} = prepare(buildState({current:'white', phase:'place', white:20, black:0,
    reserves:new Array<number>(100).fill(0), units:[
      {def:'metal_1',owner:'white',x:2,y:2},
      {def:'plant_1',owner:'black',x:8,y:8},
    ]}));
  expect(promotionsOf(p,t).some(c=>c.mission===Mission.REACH)).toBe(true);
});
