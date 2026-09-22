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
import { CC, MAX_SLOTS, Result, Reason, type PackedState } from '../../../src/ai/hard/types';
import {
  MISSION_NAMES,
  Mission,
  newPromoCandidate,
  planPromotions,
  type PromoCandidate,
} from '../../../src/ai/hard/gen/promote';
import { ACTION_VALUE_CC } from '../../../src/ai/hard/tables/economy';
import type { EvalFix } from '../../../src/ai/hard/config';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { analyzeHomeDefense, analyzeHomeDefenseEvidence } from '../../../src/game/homeCheckmate';
import { transitionWithoutCheckmate } from '../../../src/ai/simulate';
import { resetUnitActions } from '../../../src/game/board';
import { DEF_INDEX } from '../../../src/ai/hard/core/catalog';
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
  const out: PromoCandidate[] = Array.from({ length: MAX_SLOTS }, () => newPromoCandidate());
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
          { def: 'water_1', owner: 'white', x: 4, y: 4, id: 'w-hi' },
          { def: 'plant_1', owner: 'white', x: 3, y: 4, id: 'w-muju' },
          { def: 'shadow_1', owner: 'black', x: 4, y: 5, id: 'b-sjor' },
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

  it('does not invent a Prepare KILL mission when promotion crosses adjacent target defence', () => {
    // White Hi (POWER 1 into water) next to a Black Sjór (DEF 2); Honō reaches 2.
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
    expect(hi).toBeUndefined();
    expect(Object.keys(Mission)).not.toContain('KILL');
  });

  it('charges the crystals and RENT_PV × Δupkeep (SU addendum 1)', () => {
    const { p, t } = prepare(
      buildState({
        units: [
          { def: 'water_1', owner: 'white', x: 4, y: 4, id: 'w-hi' },
          { def: 'shadow_1', owner: 'black', x: 4, y: 5, id: 'b-sjor' },
          { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
        ],
        white: 20,
        black: 6,
        current: 'white',
        phase: 'place',
        turnNumber: 5,
      }),
    );
    const hi = promotionsOf(p, t).find(c => p.defId[c.slot] === DEF_INDEX.get('water_1')) as PromoCandidate;
    const def = p.defId[hi.slot];
    const next = nextOf(p, hi.slot);
    // SURVIVE protects the existing Sjór: benefit is its own material, not
    // an impossible immediate capture of Loş.
    expect(hi.mission).toBe(Mission.SURVIVE);
    const victimValue = cat.cost[def] * CC;
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

  it('returns at most `max` candidates, best score first, ties by ascending square', () => {
    const units = [];
    for (let i = 0; i < 6; i++) units.push({ def: 'water_1', owner: 'white' as const, x: i, y: 0, id: `w-${i}` });
    units.push({ def: 'water_1', owner: 'black' as const, x: 0, y: 1, id: 'b-sjor' });
    units.push({ def: 'plant_1', owner: 'black' as const, x: 9, y: 9, id: 'b-corner' });
    const { p, t } = prepare(
      buildState({ units, white: 40, black: 6, current: 'white', phase: 'place', turnNumber: 5 }),
    );
    const promos = promotionsOf(p, t, 3);
    expect(promos).toHaveLength(3);
    for (let i = 1; i < promos.length; i++) {
      expect(promos[i - 1].scoreCc).toBeGreaterThanOrEqual(promos[i].scoreCc);
      if (promos[i - 1].scoreCc === promos[i].scoreCc) expect(p.sq[promos[i - 1].slot]).toBeLessThan(p.sq[promos[i].slot]);
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

// Metal v2.9: Poṉ must be eligible for a movement upgrade even on an empty mine.
it('REACH: stationary Poṉ can promote for movement alone', () => {
  const {p, t} = prepare(buildState({current:'white', phase:'place', white:20, black:0,
    reserves:new Array<number>(100).fill(0), units:[
      {def:'metal_1',owner:'white',x:2,y:2},
      {def:'plant_1',owner:'black',x:8,y:8},
    ]}));
  expect(promotionsOf(p,t).some(c=>c.mission===Mission.REACH)).toBe(true);
});


it('FORTIFY preserves the home occupier and every possible blocker beyond the ordinary beam', () => {
  const state = buildState({ phase: 'place', white: 40, black: 10, units: [
    { def: 'metal_2', owner: 'white', x: 9, y: 9, id: 'occupier' },
    { def: 'plant_1', owner: 'white', x: 8, y: 9, id: 'blocker' },
    { def: 'fire_1', owner: 'white', x: 0, y: 0, id: 'remote-blocker' },
    { def: 'fire_1', owner: 'black', x: 7, y: 9, id: 'defender' },
  ] });
  const { p, t } = prepare(state);
  const candidates = promotionsOf(p, t, 0);
  expect(candidates).toHaveLength(3);
  expect(candidates.every(c => c.mission === Mission.FORTIFY)).toBe(true);
  for (const c of candidates) {
    const unit = state.board.units.find(u => u.position.y * 10 + u.position.x === p.sq[c.slot])!;
    const action = { type: 'PROMOTE_UNIT' as const, unitId: unit.id };
    expect(isLegalAction(state, action)).toBe(true);
    const next = applyAction(state, action);
    const copy = rep.pack(state, allocState());
    copy.proverMode = 2;
    const undo = newUndo();
    rep.make(copy, paMake(AKind.PROMOTE, c.slot), undo);
    const canonical = rep.pack(next, allocState());
    expect([copy.kposLo, copy.kposHi, copy.result]).toEqual([canonical.kposLo, canonical.kposHi, canonical.result]);
  }
  // Explicit caller capacity remains respected, even for forced candidates.
  const one = [newPromoCandidate()];
  expect(planPromotions(p, t, 0, one)).toBe(1);
});

it('FORTIFY promotion re-adjudicates a rescuable Prepare occupation as canonical home mate', () => {
  const state = buildState({ phase: 'place', white: 20, black: 0, units: [
    { def: 'metal_2', owner: 'white', x: 9, y: 9, id: 'occupier' },
    { def: 'fire_2', owner: 'black', x: 8, y: 9, id: 'defender' },
  ] });
  expect(analyzeHomeDefense(state, 'white', transitionWithoutCheckmate)).toBe('rescue');
  const { p, t } = prepare(state);
  const c = promotionsOf(p, t, 1).find(c => p.defId[c.slot] === DEF_INDEX.get('metal_2'))!;
  expect(c.mission).toBe(Mission.FORTIFY);
  const next = applyAction(state, { type: 'PROMOTE_UNIT', unitId: 'occupier' });
  expect(next.victoryReason).toBe('home-checkmate');
  rep.make(p, paMake(AKind.PROMOTE, c.slot), newUndo());
  expect(p.result).toBe(Result.WHITE_WIN);
  expect(p.reason).toBe(Reason.HOME_CHECKMATE);
});

it('FORTIFY can close the rescue route by reinforcing a blocker rather than the occupier', () => {
  const state = buildState({ phase: 'place', white: 20, black: 0, units: [
    { def: 'water_1', owner: 'white', x: 9, y: 9, id: 'occupier' },
    { def: 'water_1', owner: 'white', x: 8, y: 9, id: 'blocker' },
    { def: 'water_1', owner: 'white', x: 9, y: 8, id: 'detour-blocker' },
    { def: 'water_2', owner: 'black', x: 7, y: 9, id: 'defender' },
  ] });
  // Tier II permits two attacks: hit I10, step onto I10, hit J10.
  // After I10's DEF rises to 3,
  // this one attacker cannot kill it; going round J9 needs five actions.
  const evidence = analyzeHomeDefenseEvidence(state, 'white', transitionWithoutCheckmate);
  expect(evidence.result).toBe('rescue');
  expect(evidence.cutoffReason).toBeNull();
  expect(evidence.witness).toBeDefined();
  let reply: GameState = { ...state, board: resetUnitActions(state.board, 'black'),
    turn: { ...state.turn, currentPlayer: 'black', phase: 'action', actionsRemaining: 4 } };
  for (const action of evidence.witness!) {
    expect(isLegalAction(reply, action)).toBe(true);
    reply = transitionWithoutCheckmate(reply, action);
  }
  expect(reply.board.units.some(u => u.id === 'occupier')).toBe(false);
  const { p, t } = prepare(state);
  const c = promotionsOf(p, t, 0).find(c => p.sq[c.slot] === 98)!;
  expect(c.mission).toBe(Mission.FORTIFY);
  const next = applyAction(state, { type: 'PROMOTE_UNIT', unitId: 'blocker' });
  expect(next.victoryReason).toBe('home-checkmate');
  rep.make(p, paMake(AKind.PROMOTE, c.slot), newUndo());
  expect(p.result).toBe(Result.WHITE_WIN);
  expect(p.reason).toBe(Reason.HOME_CHECKMATE);
});

/**
 * R2/R3 (2026-09-21): `EvalFix.strength.promoteStrengthMission` and
 * `promoteOrderingRentPv`, both absent on every profile. The first case pins
 * that a plain combat upgrade is still NOT proposed by default — the behaviour
 * the knob exists to change — and the rest pin the knob's arithmetic.
 */
describe('gen/promote.ts strength knobs (strength.promoteStrengthMission, promoteOrderingRentPv)', () => {
  /** A lone White Poṉ at E5, no enemy within reach, nothing to fortify. */
  const lone = (): GameState =>
    buildState({
      units: [
        { def: 'fire_1', owner: 'white', x: 4, y: 4, id: 'w-yan' },
        { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
      ],
      white: 20,
      black: 6,
      current: 'white',
      phase: 'place',
      turnNumber: 5,
    });

  function withKnob<T>(strength: NonNullable<EvalFix['strength']>, fn: () => T): T {
    tables.evalFix = { strength };
    try {
      return fn();
    } finally {
      tables.evalFix = null;
    }
  }

  it('proposes nothing for fire_1 -> fire_2 by default: no mission claims a plain combat upgrade', () => {
    const { p, t } = prepare(lone());
    expect(t.evalFix).toBeNull();
    expect(promotionsOf(p, t)).toHaveLength(0);
  });

  it('offers STRENGTH when the knob is on, priced at (dAtk + dDef) x ACTION_VALUE_CC', () => {
    const { p, t } = prepare(lone());
    const [c] = withKnob({ promoteStrengthMission: true }, () => promotionsOf(p, t));
    expect(c).toBeDefined();
    expect(c.mission).toBe(Mission.STRENGTH);
    expect(MISSION_NAMES[Mission.STRENGTH]).toBe('STRENGTH');
    const def = p.defId[c.slot];
    const next = nextOf(p, c.slot);
    const combat = cat.atk[next] - cat.atk[def] + (cat.def[next] - cat.def[def]);
    expect(combat).toBeGreaterThan(0);
    const material = (cat.cost[next] - cat.cost[def]) * CC;
    const rent = RENT_PV * (cat.upkeep[next] - cat.upkeep[def]);
    expect(c.scoreCc).toBe(combat * ACTION_VALUE_CC + material - c.cost * CC - rent);
  });

  it('charges the ordering rent the knob names, and RENT_PV when it names none', () => {
    const { p, t } = prepare(lone());
    const scoreAt = (rentPv?: number): number =>
      withKnob(
        rentPv === undefined
          ? { promoteStrengthMission: true }
          : { promoteStrengthMission: true, promoteOrderingRentPv: rentPv },
        () => promotionsOf(p, t)[0].scoreCc,
      );
    const upkeepStep = cat.upkeep[nextOf(p, 0)] - cat.upkeep[p.defId[0]];
    expect(upkeepStep).toBeGreaterThan(0);
    const full = scoreAt();
    expect(scoreAt(RENT_PV)).toBe(full);
    expect(scoreAt(211)).toBe(full + (RENT_PV - 211) * upkeepStep);
    expect(scoreAt(0)).toBe(full + RENT_PV * upkeepStep);
    // Ordering only: the knob never makes a promotion legal or illegal, and it
    // never changes which mission claimed the candidate.
    expect(withKnob({ promoteStrengthMission: true, promoteOrderingRentPv: 0 }, () => promotionsOf(p, t))[0].mission).toBe(
      Mission.STRENGTH,
    );
  });

  it('re-prices an ordinary mission with the same rent knob, and leaves the mission alone', () => {
    // A water_1 in an enemy one-shot band: SURVIVE, which exists with or
    // without the strength knob.
    const state = buildState({
      units: [
        { def: 'water_1', owner: 'white', x: 4, y: 4, id: 'w-hi' },
        { def: 'shadow_1', owner: 'black', x: 4, y: 5, id: 'b-sjor' },
        { def: 'plant_1', owner: 'black', x: 9, y: 9, id: 'b-corner' },
      ],
      white: 20,
      black: 6,
      current: 'white',
      phase: 'place',
      turnNumber: 5,
    });
    const { p, t } = prepare(state);
    const slot = promotionsOf(p, t).find(c => p.defId[c.slot] === DEF_INDEX.get('water_1'))!;
    expect(slot.mission).toBe(Mission.SURVIVE);
    const upkeepStep = cat.upkeep[nextOf(p, slot.slot)] - cat.upkeep[p.defId[slot.slot]];
    const cheaper = withKnob({ promoteOrderingRentPv: 211 }, () =>
      promotionsOf(p, t).find(c => c.slot === slot.slot)!,
    );
    expect(cheaper.mission).toBe(Mission.SURVIVE);
    expect(cheaper.scoreCc).toBe(slot.scoreCc + (RENT_PV - 211) * upkeepStep);
  });
});
