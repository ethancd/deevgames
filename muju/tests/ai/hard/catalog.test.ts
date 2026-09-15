// @vitest-environment node
/**
 * `core/catalog.ts` against the canonical catalogue and combat arithmetic
 * (DESIGN §4.3; M4 gate: "`catalog.power[side]` equals `calculateAttackPower`
 * for 18x18x2 under each of the four element graphs and handicaps {0, +1};
 * `signature` flip-and-restore"). Also carries the `catalog.power` half of the
 * R13 constants-agreement test (DESIGN §7.8) that M1 deferred to this milestone.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEF_ID,
  DEF_INDEX,
  NDEF,
  NEVER_KILLS,
  activeCatalog,
  buildCatalog,
  catalogSignature,
  powerIndex,
  type Catalog,
} from '../../../src/ai/hard/core/catalog';
import { DEFAULT_MATERIAL_CC } from '../../../src/ai/hard/config';
import { UNIT_DEFINITIONS, getNextTierDefinition, getPromotionCost } from '../../../src/game/units';
import { calculateAttackPower, resetCombatHandicap, setCombatHandicap } from '../../../src/game/combat';
import { getAttackModifier, setElementGraph, type ElementGraphName } from '../../../src/game/elements';
import { setUpkeepVariant, upkeepForTier } from '../../../src/game/upkeep';
import type { PlayerId, Unit } from '../../../src/game/types';
import type { Side } from '../../../src/ai/hard/types';

const GRAPHS: readonly ElementGraphName[] = ['double-thick', 'dual-triangle', 'rush-edge-only', 'none'];
const SIDE_PLAYER: readonly PlayerId[] = ['white', 'black'];

function probe(defId: number, owner: PlayerId): Unit {
  return {
    id: `t-${owner}-${DEF_ID[defId]}`,
    definitionId: DEF_ID[defId],
    owner,
    position: { x: 0, y: 0 },
    hasMoved: false,
    hasAttacked: false,
    lastAttackKilled: false,
    canActThisTurn: true,
    damageTaken: 0,
  };
}

function expectPowerPlanesAgree(cat: Catalog): void {
  for (let s = 0; s < 2; s++) {
    const side = s as Side;
    const attackerOwner = SIDE_PLAYER[s];
    const defenderOwner = SIDE_PLAYER[1 - s];
    for (let a = 0; a < NDEF; a++) {
      for (let d = 0; d < NDEF; d++) {
        const expected = calculateAttackPower(probe(a, attackerOwner), probe(d, defenderOwner));
        const i = powerIndex(side, a, d);
        expect(cat.power[i], `power[${SIDE_PLAYER[s]}][${DEF_ID[a]}][${DEF_ID[d]}]`).toBe(expected);
        expect(cat.killsInOne[i]).toBe(expected >= cat.def[d] ? 1 : 0);
        expect(cat.hitsToKill[i]).toBe(expected === 0 ? NEVER_KILLS : Math.ceil(cat.def[d] / expected));
      }
    }
  }
}

afterEach(() => {
  setElementGraph('double-thick');
  setUpkeepVariant('shipped');
  resetCombatHandicap();
});

describe('core/catalog: static tables', () => {
  it('mirrors UNIT_DEFINITIONS field by field, in catalogue order', () => {
    const cat = buildCatalog();
    expect(DEF_ID.length).toBe(NDEF);
    const elementOrder = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
    for (let d = 0; d < NDEF; d++) {
      const u = UNIT_DEFINITIONS[d];
      expect(DEF_ID[d]).toBe(u.id);
      expect(DEF_INDEX.get(u.id)).toBe(d);
      expect(cat.atk[d]).toBe(u.attack);
      expect(cat.def[d]).toBe(u.defense);
      expect(cat.spd[d]).toBe(u.speed);
      expect(cat.mine[d]).toBe(u.mining);
      expect(cat.tier[d]).toBe(u.tier);
      expect(cat.cost[d]).toBe(u.cost);
      expect(cat.element[d]).toBe(elementOrder.indexOf(u.element));
      expect(cat.upkeep[d]).toBe(upkeepForTier(u.tier));
      const next = getNextTierDefinition(u.id);
      expect(cat.nextDef[d]).toBe(next === null ? -1 : (DEF_INDEX.get(next.id) as number));
      expect(cat.promoCost[d]).toBe(next === null ? 0 : getPromotionCost(u.id));
    }
  });

  it('promoCost is 4 from tier 1, 8 from tier 2 and 0 at tier 3', () => {
    const cat = buildCatalog();
    for (let d = 0; d < NDEF; d++) {
      expect(cat.promoCost[d]).toBe(cat.tier[d] === 1 ? 4 : cat.tier[d] === 2 ? 8 : 0);
      expect(cat.nextDef[d] === -1).toBe(cat.tier[d] === 3);
    }
  });

  it('tier1 is the six purchasable defIds ascending by cost then id', () => {
    const cat = buildCatalog();
    expect([...cat.tier1]).toEqual(['fire_1', 'lightning_1', 'water_1', 'shadow_1', 'plant_1', 'metal_1'].map(id => DEF_INDEX.get(id)));
    expect([...cat.tier1].map(d => cat.cost[d])).toEqual([3, 3, 4, 4, 5, 5]);
  });

  it('DEFAULT_MATERIAL_CC is cost x 100 with no rent term (DESIGN F9)', () => {
    const cat = buildCatalog();
    expect(DEFAULT_MATERIAL_CC.length).toBe(NDEF);
    for (let d = 0; d < NDEF; d++) expect(DEFAULT_MATERIAL_CC[d]).toBe(cat.cost[d] * 100);
  });
});

describe('core/catalog: R13 power agreement (DESIGN §7.8, deferred from M1)', () => {
  it('power/killsInOne/hitsToKill agree with calculateAttackPower under all four element graphs x handicaps {0, +1}', () => {
    const handicaps: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const graph of GRAPHS) {
      for (const [white, black] of handicaps) {
        setElementGraph(graph);
        setCombatHandicap('white', white);
        setCombatHandicap('black', black);
        expectPowerPlanesAgree(buildCatalog());
      }
    }
  });

  it('the two planes are max(0, atk + elementModifier + handicap[attackerOwner])', () => {
    setCombatHandicap('white', 1);
    const cat = buildCatalog();
    for (let a = 0; a < NDEF; a++) {
      for (let d = 0; d < NDEF; d++) {
        const raw = cat.atk[a] + getAttackModifier(UNIT_DEFINITIONS[a].element, UNIT_DEFINITIONS[d].element);
        expect(cat.power[powerIndex(0, a, d)]).toBe(Math.max(0, raw + 1));
        expect(cat.power[powerIndex(1, a, d)]).toBe(Math.max(0, raw));
        expect(cat.power[powerIndex(0, a, d)]).toBeGreaterThanOrEqual(cat.power[powerIndex(1, a, d)]);
      }
    }
  });

  it('POWER 0 never kills: hitsToKill is the NEVER_KILLS sentinel', () => {
    // Muju (plant_1) has ATK 0; against a fellow plant it stays 0 under the shipped graph.
    const cat = buildCatalog();
    const muju = DEF_INDEX.get('plant_1') as number;
    const sachita = DEF_INDEX.get('plant_2') as number;
    expect(cat.power[powerIndex(0, muju, sachita)]).toBe(0);
    expect(cat.hitsToKill[powerIndex(0, muju, sachita)]).toBe(NEVER_KILLS);
    expect(cat.killsInOne[powerIndex(0, muju, sachita)]).toBe(0);
  });
});

describe('core/catalog: signature', () => {
  it('flips and restores under setElementGraph', () => {
    const base = catalogSignature();
    setElementGraph('dual-triangle');
    expect(catalogSignature()).not.toBe(base);
    setElementGraph('rush-edge-only');
    expect(catalogSignature()).not.toBe(base);
    setElementGraph('none');
    expect(catalogSignature()).not.toBe(base);
    setElementGraph('double-thick');
    expect(catalogSignature()).toBe(base);
  });

  it('flips and restores under setUpkeepVariant', () => {
    const base = catalogSignature();
    setUpkeepVariant('steep');
    expect(catalogSignature()).not.toBe(base);
    setUpkeepVariant('off');
    expect(catalogSignature()).not.toBe(base);
    setUpkeepVariant('shipped');
    expect(catalogSignature()).toBe(base);
  });

  it('flips and restores under setCombatHandicap, per side', () => {
    const base = catalogSignature();
    setCombatHandicap('white', 1);
    const afterWhite = catalogSignature();
    expect(afterWhite).not.toBe(base);
    setCombatHandicap('white', 0);
    expect(catalogSignature()).toBe(base);
    setCombatHandicap('black', 1);
    expect(catalogSignature()).not.toBe(base);
    expect(catalogSignature()).not.toBe(afterWhite);
    resetCombatHandicap();
    expect(catalogSignature()).toBe(base);
  });

  it('a built catalog records the signature it was built under', () => {
    expect(buildCatalog().signature).toBe(catalogSignature());
    setUpkeepVariant('steep');
    expect(buildCatalog().signature).toBe(catalogSignature());
  });
});

describe('core/catalog: activeCatalog memoisation', () => {
  it('returns the same object while the signature holds and rebuilds when it moves', () => {
    const first = activeCatalog();
    expect(activeCatalog()).toBe(first);

    setElementGraph('none');
    const second = activeCatalog();
    expect(second).not.toBe(first);
    expect(second.signature).toBe(catalogSignature());
    expectPowerPlanesAgree(second);

    setElementGraph('double-thick');
    const third = activeCatalog();
    expect(third).not.toBe(second);
    expect(third.signature).toBe(first.signature);
    expect([...third.power]).toEqual([...first.power]);
  });

  it('upkeep follows setUpkeepVariant through activeCatalog', () => {
    const shipped = activeCatalog();
    const tanka = DEF_INDEX.get('metal_3') as number;
    expect(shipped.upkeep[tanka]).toBe(2);
    setUpkeepVariant('steep');
    expect(activeCatalog().upkeep[tanka]).toBe(3);
    setUpkeepVariant('off');
    expect(activeCatalog().upkeep[tanka]).toBe(0);
  });
});
