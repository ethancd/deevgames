// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import {
  hasAdvantage,
  getAttackModifier,
  setElementGraph,
  getElementGraph,
  getAdvantageTargets,
  getWeaknesses,
} from '../../src/game/elements';
import {
  calculateAttackPower,
  setCombatHandicap,
  resetCombatHandicap,
} from '../../src/game/combat';
import { createUnit } from '../../src/game/board';
import type { Element } from '../../src/game/types';

/**
 * Balance-lab engine knobs: the injectable element graph (experiment E7) and
 * the global ATK handicap (instrument sensitivity gate). Real games never
 * touch either; these tests pin the default behavior to the shipped rules
 * and the variants to their specs.
 */

afterEach(() => {
  setElementGraph('double-thick');
  resetCombatHandicap();
});

const ALL: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];

describe('injectable element graph', () => {
  it('defaults to the Double-Thick Triangle incumbent', () => {
    expect(getElementGraph()).toBe('double-thick');
    // pair cycle: fire&lightning > plant&metal > water&shadow > fire&lightning
    expect(hasAdvantage('fire', 'plant')).toBe(true);
    expect(hasAdvantage('fire', 'metal')).toBe(true);
    expect(hasAdvantage('lightning', 'plant')).toBe(true);
    expect(hasAdvantage('plant', 'water')).toBe(true);
    expect(hasAdvantage('metal', 'shadow')).toBe(true);
    expect(hasAdvantage('water', 'fire')).toBe(true);
    expect(hasAdvantage('shadow', 'lightning')).toBe(true);
    // same pair neutral
    expect(hasAdvantage('fire', 'lightning')).toBe(false);
    expect(hasAdvantage('water', 'shadow')).toBe(false);
  });

  it('dual-triangle restores the v1.0 graphs', () => {
    setElementGraph('dual-triangle');
    expect(hasAdvantage('fire', 'plant')).toBe(true);
    expect(hasAdvantage('plant', 'water')).toBe(true);
    expect(hasAdvantage('water', 'fire')).toBe(true);
    expect(hasAdvantage('lightning', 'metal')).toBe(true);
    expect(hasAdvantage('metal', 'shadow')).toBe(true);
    expect(hasAdvantage('shadow', 'lightning')).toBe(true);
    // cross-triangle neutral
    expect(hasAdvantage('fire', 'metal')).toBe(false);
    expect(hasAdvantage('lightning', 'plant')).toBe(false);
    expect(hasAdvantage('water', 'lightning')).toBe(false);
  });

  it('rush-edge-only keeps only fire/lightning > plant/metal', () => {
    setElementGraph('rush-edge-only');
    for (const rush of ['fire', 'lightning'] as Element[]) {
      for (const expand of ['plant', 'metal'] as Element[]) {
        expect(hasAdvantage(rush, expand)).toBe(true);
        expect(hasAdvantage(expand, rush)).toBe(false);
      }
    }
    expect(hasAdvantage('water', 'fire')).toBe(false);
    expect(hasAdvantage('plant', 'water')).toBe(false);
  });

  it('none disables all advantages', () => {
    setElementGraph('none');
    for (const a of ALL) for (const b of ALL) expect(hasAdvantage(a, b)).toBe(false);
  });

  it('every E7 candidate graph preserves the rush→expand edge (ruling E-1) — control excluded', () => {
    for (const graph of ['double-thick', 'dual-triangle', 'rush-edge-only'] as const) {
      setElementGraph(graph);
      // at least one rush element gets +1 into each expand element's pair partner set
      expect(hasAdvantage('fire', 'plant')).toBe(true);
      expect(hasAdvantage('lightning', 'metal') || hasAdvantage('lightning', 'plant')).toBe(true);
      // and expand never elementally beats rush
      expect(hasAdvantage('plant', 'fire')).toBe(false);
      expect(hasAdvantage('metal', 'fire')).toBe(false);
      expect(hasAdvantage('plant', 'lightning')).toBe(false);
      expect(hasAdvantage('metal', 'lightning')).toBe(false);
    }
  });

  it('getAttackModifier / targets / weaknesses track the active graph', () => {
    setElementGraph('none');
    expect(getAttackModifier('fire', 'plant')).toBe(0);
    expect(getAdvantageTargets('fire')).toEqual([]);
    expect(getWeaknesses('fire')).toEqual([]);
    setElementGraph('double-thick');
    expect(getAttackModifier('fire', 'plant')).toBe(1);
    expect(getAttackModifier('plant', 'fire')).toBe(-1);
    expect(getAdvantageTargets('fire').sort()).toEqual(['metal', 'plant']);
    expect(getWeaknesses('fire').sort()).toEqual(['shadow', 'water']);
  });
});

describe('global combat handicap', () => {
  it('defaults to zero (shipped behavior unchanged)', () => {
    const hi = createUnit('fire_1', 'white', { x: 0, y: 0 });
    const muju = createUnit('plant_1', 'black', { x: 0, y: 1 });
    expect(calculateAttackPower(hi, muju)).toBe(3); // 2 ATK + 1 advantage
  });

  it('applies a per-player attack bonus', () => {
    setCombatHandicap('white', 1);
    const hi = createUnit('fire_1', 'white', { x: 0, y: 0 });
    const muju = createUnit('plant_1', 'black', { x: 0, y: 1 });
    expect(calculateAttackPower(hi, muju)).toBe(4); // 2 + 1 advantage + 1 handicap
    const enemyHi = createUnit('fire_1', 'black', { x: 5, y: 5 });
    const myMuju = createUnit('plant_1', 'white', { x: 5, y: 6 });
    expect(calculateAttackPower(enemyHi, myMuju)).toBe(3); // black unaffected
  });

  it('still floors attack power at zero', () => {
    setCombatHandicap('white', -5);
    const muju = createUnit('plant_1', 'white', { x: 0, y: 0 });
    const sjor = createUnit('water_1', 'black', { x: 0, y: 1 });
    expect(calculateAttackPower(muju, sjor)).toBe(0);
  });

  it('resets cleanly', () => {
    setCombatHandicap('white', 3);
    resetCombatHandicap();
    const hi = createUnit('fire_1', 'white', { x: 0, y: 0 });
    const sjor = createUnit('water_1', 'black', { x: 0, y: 1 });
    expect(calculateAttackPower(hi, sjor)).toBe(1); // 2 - 1 disadvantage
  });
});
