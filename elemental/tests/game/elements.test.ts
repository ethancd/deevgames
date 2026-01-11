import { describe, it, expect } from 'vitest';
import {
  hasAdvantage,
  hasDisadvantage,
  getAttackModifier,
  getAdvantageTarget,
  getWeakness,
  inSameTriangle,
  ELEMENT_INFO,
} from '../../src/game/elements';
import type { Element } from '../../src/game/types';

describe('Elemental System', () => {
  describe('Triangle 1: Fire → Plant → Water → Fire', () => {
    it('fire has advantage over plant', () => {
      expect(hasAdvantage('fire', 'plant')).toBe(true);
      expect(hasDisadvantage('plant', 'fire')).toBe(true);
    });

    it('plant has advantage over water', () => {
      expect(hasAdvantage('plant', 'water')).toBe(true);
      expect(hasDisadvantage('water', 'plant')).toBe(true);
    });

    it('water has advantage over fire', () => {
      expect(hasAdvantage('water', 'fire')).toBe(true);
      expect(hasDisadvantage('fire', 'water')).toBe(true);
    });
  });

  describe('Triangle 2: Lightning → Metal → Wind → Lightning', () => {
    it('lightning has advantage over metal', () => {
      expect(hasAdvantage('lightning', 'metal')).toBe(true);
      expect(hasDisadvantage('metal', 'lightning')).toBe(true);
    });

    it('metal has advantage over wind', () => {
      expect(hasAdvantage('metal', 'wind')).toBe(true);
      expect(hasDisadvantage('wind', 'metal')).toBe(true);
    });

    it('wind has advantage over lightning', () => {
      expect(hasAdvantage('wind', 'lightning')).toBe(true);
      expect(hasDisadvantage('lightning', 'wind')).toBe(true);
    });
  });

  describe('Cross-triangle matchups are neutral', () => {
    const triangle1: Element[] = ['fire', 'plant', 'water'];
    const triangle2: Element[] = ['lightning', 'metal', 'wind'];

    it('fire vs lightning/metal/wind are neutral', () => {
      for (const t2 of triangle2) {
        expect(hasAdvantage('fire', t2)).toBe(false);
        expect(hasAdvantage(t2, 'fire')).toBe(false);
      }
    });

    it('plant vs lightning/metal/wind are neutral', () => {
      for (const t2 of triangle2) {
        expect(hasAdvantage('plant', t2)).toBe(false);
        expect(hasAdvantage(t2, 'plant')).toBe(false);
      }
    });

    it('water vs lightning/metal/wind are neutral', () => {
      for (const t2 of triangle2) {
        expect(hasAdvantage('water', t2)).toBe(false);
        expect(hasAdvantage(t2, 'water')).toBe(false);
      }
    });
  });

  describe('Same-element matchups are neutral', () => {
    const elements: Element[] = ['fire', 'lightning', 'water', 'wind', 'plant', 'metal'];

    it('no element has advantage over itself', () => {
      for (const element of elements) {
        expect(hasAdvantage(element, element)).toBe(false);
        expect(hasDisadvantage(element, element)).toBe(false);
      }
    });
  });

  describe('getAttackModifier', () => {
    it('returns +1 when attacker has advantage', () => {
      expect(getAttackModifier('fire', 'plant')).toBe(1);
      expect(getAttackModifier('water', 'fire')).toBe(1);
      expect(getAttackModifier('lightning', 'metal')).toBe(1);
    });

    it('returns -1 when attacker has disadvantage', () => {
      expect(getAttackModifier('plant', 'fire')).toBe(-1);
      expect(getAttackModifier('fire', 'water')).toBe(-1);
      expect(getAttackModifier('metal', 'lightning')).toBe(-1);
    });

    it('returns 0 for neutral matchup (cross-triangle)', () => {
      expect(getAttackModifier('fire', 'lightning')).toBe(0);
      expect(getAttackModifier('plant', 'metal')).toBe(0);
      expect(getAttackModifier('water', 'wind')).toBe(0);
    });

    it('returns 0 for same element', () => {
      expect(getAttackModifier('fire', 'fire')).toBe(0);
      expect(getAttackModifier('plant', 'plant')).toBe(0);
      expect(getAttackModifier('metal', 'metal')).toBe(0);
    });
  });

  describe('getAdvantageTarget', () => {
    it('fire targets plant', () => {
      expect(getAdvantageTarget('fire')).toBe('plant');
    });

    it('plant targets water', () => {
      expect(getAdvantageTarget('plant')).toBe('water');
    });

    it('lightning targets metal', () => {
      expect(getAdvantageTarget('lightning')).toBe('metal');
    });
  });

  describe('getWeakness', () => {
    it('fire is weak to water', () => {
      expect(getWeakness('fire')).toBe('water');
    });

    it('plant is weak to fire', () => {
      expect(getWeakness('plant')).toBe('fire');
    });

    it('metal is weak to lightning', () => {
      expect(getWeakness('metal')).toBe('lightning');
    });
  });

  describe('inSameTriangle', () => {
    it('fire and plant are in same triangle', () => {
      expect(inSameTriangle('fire', 'plant')).toBe(true);
      expect(inSameTriangle('fire', 'water')).toBe(true);
      expect(inSameTriangle('plant', 'water')).toBe(true);
    });

    it('lightning and metal are in same triangle', () => {
      expect(inSameTriangle('lightning', 'metal')).toBe(true);
      expect(inSameTriangle('lightning', 'wind')).toBe(true);
      expect(inSameTriangle('metal', 'wind')).toBe(true);
    });

    it('fire and lightning are NOT in same triangle', () => {
      expect(inSameTriangle('fire', 'lightning')).toBe(false);
      expect(inSameTriangle('plant', 'metal')).toBe(false);
      expect(inSameTriangle('water', 'wind')).toBe(false);
    });
  });

  describe('ELEMENT_INFO', () => {
    it('contains all 6 elements', () => {
      const elements: Element[] = ['fire', 'lightning', 'water', 'wind', 'plant', 'metal'];
      for (const element of elements) {
        expect(ELEMENT_INFO[element]).toBeDefined();
        expect(ELEMENT_INFO[element].name).toBeTruthy();
        expect(ELEMENT_INFO[element].language).toBeTruthy();
        expect(ELEMENT_INFO[element].region).toBeTruthy();
        expect(ELEMENT_INFO[element].color).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });

    it('has correct cultural assignments', () => {
      expect(ELEMENT_INFO.fire.language).toBe('Japanese');
      expect(ELEMENT_INFO.lightning.language).toBe('Swahili');
      expect(ELEMENT_INFO.water.language).toBe('Norse');
      expect(ELEMENT_INFO.wind.language).toBe('Hawaiian/Māori');
      expect(ELEMENT_INFO.plant.language).toBe('Quechua/Nahuatl');
      expect(ELEMENT_INFO.metal.language).toBe('Lakota');
    });
  });
});
