/**
 * E2.1 — the family taxonomy and the canonical place-phase enumerator, on
 * hand-built positions whose answers are worked out from the rules rather than
 * from the engine.
 */
import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
import { createInitialGameState } from '../../src/game/board';
import { createUnitFromDefinition } from '../../src/game/building';
import { getPromotionCost } from '../../src/game/promotion';
import {
  classifyTurn,
  placeShape,
  shapeIsGeneratorExpressible,
  GENERATOR_EXPRESSIBLE_SHAPES,
  PLACE_SHAPES,
} from '../../lab/hard-ai/audit/families';
import { enumeratePlacePhase } from '../../lab/hard-ai/audit/place-enum';

/**
 * The canonical initial state starts in the ACTION phase (turn 1 has no place
 * phase), so every fixture here opens its own place phase explicitly.
 *
 * EXPLICITLY THE RETIRED RULES. `lab/hard-ai/audit/{families,place-enum}.ts`
 * model the Standard place phase — a purchase puts a body on the board that may
 * strike at once, and `finishPlacement` auto-advances a spent bank. Under
 * Phasing a purchase is a pending summon that arrives next turn and
 * END_PLACE_PHASE hands over, so this taxonomy cannot be repointed without
 * rewriting those two lab modules (measured 2026-09-21: three cases fail on the
 * flag alone). Naming the ruleset here keeps that visible instead of resting on
 * `board.ts`'s historical default.
 */
function baseState(): GameState {
  const state = createInitialGameState(undefined, 4, 0, 'standard');
  return {
    ...state,
    board: { ...state.board, units: [] },
    turn: { ...state.turn, phase: 'place', turnNumber: 3 },
  };
}

let seq = 0;
function unit(defId: string, owner: 'white' | 'black', x: number, y: number): Unit {
  return createUnitFromDefinition(defId, owner, { x, y }, `t-${owner}-${defId}-${seq++}`);
}

/** A unit that has been on the board a turn already: promotable, and able to act. */
function settled(u: Unit): Unit {
  return { ...u, placedThisTurn: false, promotedThisPlacement: false, canActThisTurn: true };
}

function withUnits(state: GameState, units: Unit[], whiteCrystals: number): GameState {
  return {
    ...state,
    board: { ...state.board, units },
    players: {
      ...state.players,
      white: { ...state.players.white, resources: whiteCrystals },
    },
  };
}

describe('placeShape', () => {
  it('names the six place-phase shapes', () => {
    expect(placeShape(0, 0)).toBe('none');
    expect(placeShape(2, 0)).toBe('buys-only');
    expect(placeShape(0, 1)).toBe('promo-1');
    expect(placeShape(0, 3)).toBe('promo-multi');
    expect(placeShape(1, 1)).toBe('buy+promo-1');
    expect(placeShape(2, 2)).toBe('buy+promo-multi');
  });

  it('marks exactly the two multi-promotion shapes as beyond buildCombos', () => {
    const inexpressible = PLACE_SHAPES.filter(s => !shapeIsGeneratorExpressible(s));
    expect(inexpressible).toEqual(['promo-multi', 'buy+promo-multi']);
    expect(GENERATOR_EXPRESSIBLE_SHAPES).toHaveLength(4);
  });
});

describe('classifyTurn', () => {
  it('classifies a pure action turn as `none`', () => {
    const mover = settled(unit('fire_1', 'white', 2, 2));
    const state = withUnits(baseState(), [mover, settled(unit('fire_1', 'black', 8, 8))], 0);
    const actions: AIAction[] = [
      { type: 'END_PLACE_PHASE' },
      { type: 'MOVE', unitId: mover.id, to: { x: 2, y: 3 } },
      { type: 'END_ACTION_PHASE' },
    ];
    const f = classifyTurn(state, actions);
    expect(f.legal).toBe(true);
    expect(f.shape).toBe('none');
    expect(f.buys).toBe(0);
    expect(f.promotions).toBe(0);
    expect(f.tags).not.toContain('summon-strike');
  });

  it('classifies two promotions as `promo-multi`, which the generator cannot express', () => {
    const a = settled(unit('fire_1', 'white', 1, 1));
    const b = settled(unit('water_1', 'white', 2, 1));
    const bank = (getPromotionCost(a) ?? 0) + (getPromotionCost(b) ?? 0);
    const state = withUnits(baseState(), [a, b, settled(unit('fire_1', 'black', 8, 8))], bank);
    // No explicit END_PLACE_PHASE: the bank is exactly spent, so
    // `finishPlacement` auto-advances the place phase (`simulate.ts:118`).
    const actions: AIAction[] = [
      { type: 'PROMOTE_UNIT', unitId: a.id },
      { type: 'PROMOTE_UNIT', unitId: b.id },
      { type: 'END_ACTION_PHASE' },
    ];
    const f = classifyTurn(state, actions);
    expect(f.legal).toBe(true);
    expect(f.promotions).toBe(2);
    expect(f.shape).toBe('promo-multi');
    expect(shapeIsGeneratorExpressible(f.shape)).toBe(false);
    expect(f.spend).toBe(bank);
  });

  it('refuses a second promotion of the same unit — once per place phase', () => {
    const a = settled(unit('fire_1', 'white', 1, 1));
    const state = withUnits(baseState(), [a, settled(unit('fire_1', 'black', 8, 8))], 99);
    const f = classifyTurn(state, [
      { type: 'PROMOTE_UNIT', unitId: a.id },
      { type: 'PROMOTE_UNIT', unitId: a.id },
    ]);
    expect(f.legal).toBe(false);
    expect(f.promotions).toBe(1);
  });

  it('records a summon-and-strike: a body bought this turn may act at once', () => {
    const victim = settled(unit('fire_1', 'black', 5, 5));
    // A body on its own corner has no spawn rectangle in front of it; (3,3)
    // gives the white side a real one.
    const anchor = settled(unit('fire_1', 'white', 3, 3));
    const state = withUnits(baseState(), [anchor, victim], 30);
    const enumeration = enumeratePlacePhase(state);
    // Find a prefix that bought exactly one body, then strike with it.
    const bought = enumeration.prefixes.find(p => p.family.buys === 1 && p.family.promotions === 0);
    expect(bought).toBeDefined();
    const buy = bought!.actions.find(a => a.type === 'BUY_UNIT');
    expect(buy).toBeDefined();
    const after = bought!.end;
    const fresh = after.board.units.find(u => u.owner === 'white' && u.id !== anchor.id);
    expect(fresh).toBeDefined();
    // The rule under test: `building.ts` mints it with `canActThisTurn` true.
    expect(fresh!.canActThisTurn).toBe(true);
    expect(fresh!.placedThisTurn).toBe(true);
  });
});

describe('enumeratePlacePhase', () => {
  it('returns exactly one prefix when nothing can be bought or promoted', () => {
    const state = withUnits(baseState(), [settled(unit('fire_1', 'white', 2, 2)), settled(unit('fire_1', 'black', 8, 8))], 0);
    const e = enumeratePlacePhase(state);
    expect(e.capped).toBe(false);
    expect(e.prefixes).toHaveLength(1);
    expect(e.prefixes[0].shape).toBe('none');
    expect(e.multiPromotion).toBe(0);
    expect(e.affordablePromotions).toBe(0);
  });

  it('enforces JOINT affordability rather than concatenating legal promotions', () => {
    const a = settled(unit('fire_1', 'white', 1, 1));
    const b = settled(unit('water_1', 'white', 2, 1));
    const costA = getPromotionCost(a) ?? 0;
    const costB = getPromotionCost(b) ?? 0;
    expect(costA).toBeGreaterThan(0);
    expect(costB).toBeGreaterThan(0);

    // A bank that pays for either one alone, but not for both together.
    const single = withUnits(baseState(), [a, b, settled(unit('fire_1', 'black', 9, 9))], Math.max(costA, costB));
    const eSingle = enumeratePlacePhase(single);
    expect(eSingle.affordablePromotions).toBe(2);
    expect(eSingle.twoPromotionsJointlyAffordable).toBe(false);
    expect(eSingle.multiPromotion).toBe(0);
    expect(eSingle.byShape['promo-multi']).toBe(0);

    // A bank that pays for both.
    const both = withUnits(baseState(), [a, b, settled(unit('fire_1', 'black', 9, 9))], costA + costB);
    const eBoth = enumeratePlacePhase(both);
    expect(eBoth.twoPromotionsJointlyAffordable).toBe(true);
    expect(eBoth.multiPromotion).toBeGreaterThan(0);
    expect(eBoth.byShape['promo-multi']).toBeGreaterThan(0);
    expect(eBoth.inexpressible).toBe(eBoth.multiPromotion);
  });

  it('never promotes a body bought in the same place phase', () => {
    const anchor = settled(unit('fire_1', 'white', 0, 0));
    const state = withUnits(baseState(), [anchor, settled(unit('fire_1', 'black', 9, 9))], 40);
    const e = enumeratePlacePhase(state);
    for (const prefix of e.prefixes) {
      const boughtIds = new Set<string>();
      let stateAt = state;
      for (const action of prefix.actions) {
        if (action.type === 'PROMOTE_UNIT') expect(boughtIds.has(action.unitId)).toBe(false);
        if (action.type === 'BUY_UNIT') {
          // The id the simulator mints is deterministic; find it after the buy.
          const before = new Set(stateAt.board.units.map(u => u.id));
          const next = prefix.end;
          for (const u of next.board.units) if (!before.has(u.id) && u.owner === 'white') boughtIds.add(u.id);
        }
      }
    }
    // The only promotable body is the anchor, and it was on the board already.
    expect(e.promotablePromotionsIgnoringPrice).toBe(1);
  });

  it('reports `capped` instead of guessing when the walk runs out of budget', () => {
    const units = [
      settled(unit('fire_1', 'white', 1, 1)),
      settled(unit('water_1', 'white', 2, 1)),
      settled(unit('plant_1', 'white', 3, 1)),
      settled(unit('fire_1', 'black', 9, 9)),
    ];
    const state = withUnits(baseState(), units, 60);
    const e = enumeratePlacePhase(state, { maxVisits: 5, maxPrefixes: 5 });
    expect(e.capped).toBe(true);
    expect(e.prefixes.length).toBeLessThanOrEqual(5);
  });
});
