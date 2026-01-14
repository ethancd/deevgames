import { describe, it, expect } from 'vitest';
import {
  hasAdvantage,
  hasDisadvantage,
  getAttackModifier,
  getAdvantageTargets,
  getWeaknesses,
  arePaired,
  getPairedElement,
  ELEMENT_INFO,
} from '../../src/game/elements';
import type { Element } from '../../src/game/types';

describe('Elemental System - Double-Thick Triangle', () => {
  /**
   * Double-Thick Triangle:
   * Fire & Lightning → Plant & Metal → Water & Shadow → Fire & Lightning
   *
   * Each element has advantage over TWO elements (its paired opponents),
   * and is weak to TWO elements (its paired counters).
   */

  describe('Fire/Lightning pair beats Plant/Metal pair', () => {
    it('fire has advantage over plant', () => {
      expect(hasAdvantage('fire', 'plant')).toBe(true);
      expect(hasDisadvantage('plant', 'fire')).toBe(true);
    });

    it('fire has advantage over metal', () => {
      expect(hasAdvantage('fire', 'metal')).toBe(true);
      expect(hasDisadvantage('metal', 'fire')).toBe(true);
    });

    it('lightning has advantage over plant', () => {
      expect(hasAdvantage('lightning', 'plant')).toBe(true);
      expect(hasDisadvantage('plant', 'lightning')).toBe(true);
    });

    it('lightning has advantage over metal', () => {
      expect(hasAdvantage('lightning', 'metal')).toBe(true);
      expect(hasDisadvantage('metal', 'lightning')).toBe(true);
    });
  });

  describe('Plant/Metal pair beats Water/Shadow pair', () => {
    it('plant has advantage over water', () => {
      expect(hasAdvantage('plant', 'water')).toBe(true);
      expect(hasDisadvantage('water', 'plant')).toBe(true);
    });

    it('plant has advantage over shadow', () => {
      expect(hasAdvantage('plant', 'shadow')).toBe(true);
      expect(hasDisadvantage('shadow', 'plant')).toBe(true);
    });

    it('metal has advantage over water', () => {
      expect(hasAdvantage('metal', 'water')).toBe(true);
      expect(hasDisadvantage('water', 'metal')).toBe(true);
    });

    it('metal has advantage over shadow', () => {
      expect(hasAdvantage('metal', 'shadow')).toBe(true);
      expect(hasDisadvantage('shadow', 'metal')).toBe(true);
    });
  });

  describe('Water/Shadow pair beats Fire/Lightning pair', () => {
    it('water has advantage over fire', () => {
      expect(hasAdvantage('water', 'fire')).toBe(true);
      expect(hasDisadvantage('fire', 'water')).toBe(true);
    });

    it('water has advantage over lightning', () => {
      expect(hasAdvantage('water', 'lightning')).toBe(true);
      expect(hasDisadvantage('lightning', 'water')).toBe(true);
    });

    it('shadow has advantage over fire', () => {
      expect(hasAdvantage('shadow', 'fire')).toBe(true);
      expect(hasDisadvantage('fire', 'shadow')).toBe(true);
    });

    it('shadow has advantage over lightning', () => {
      expect(hasAdvantage('shadow', 'lightning')).toBe(true);
      expect(hasDisadvantage('lightning', 'shadow')).toBe(true);
    });
  });

  describe('Same-pair matchups are neutral', () => {
    it('fire vs lightning is neutral (same pair)', () => {
      expect(hasAdvantage('fire', 'lightning')).toBe(false);
      expect(hasAdvantage('lightning', 'fire')).toBe(false);
    });

    it('plant vs metal is neutral (same pair)', () => {
      expect(hasAdvantage('plant', 'metal')).toBe(false);
      expect(hasAdvantage('metal', 'plant')).toBe(false);
    });

    it('water vs shadow is neutral (same pair)', () => {
      expect(hasAdvantage('water', 'shadow')).toBe(false);
      expect(hasAdvantage('shadow', 'water')).toBe(false);
    });
  });

  describe('Same-element matchups are neutral', () => {
    const elements: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];

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
      expect(getAttackModifier('fire', 'metal')).toBe(1);
      expect(getAttackModifier('water', 'fire')).toBe(1);
      expect(getAttackModifier('shadow', 'lightning')).toBe(1);
    });

    it('returns -1 when attacker has disadvantage', () => {
      expect(getAttackModifier('plant', 'fire')).toBe(-1);
      expect(getAttackModifier('metal', 'lightning')).toBe(-1);
      expect(getAttackModifier('fire', 'water')).toBe(-1);
      expect(getAttackModifier('lightning', 'shadow')).toBe(-1);
    });

    it('returns 0 for same-pair matchup', () => {
      expect(getAttackModifier('fire', 'lightning')).toBe(0);
      expect(getAttackModifier('plant', 'metal')).toBe(0);
      expect(getAttackModifier('water', 'shadow')).toBe(0);
    });

    it('returns 0 for same element', () => {
      expect(getAttackModifier('fire', 'fire')).toBe(0);
      expect(getAttackModifier('plant', 'plant')).toBe(0);
      expect(getAttackModifier('metal', 'metal')).toBe(0);
    });
  });

  describe('getAdvantageTargets', () => {
    it('fire targets plant and metal', () => {
      const targets = getAdvantageTargets('fire');
      expect(targets).toContain('plant');
      expect(targets).toContain('metal');
      expect(targets).toHaveLength(2);
    });

    it('water targets fire and lightning', () => {
      const targets = getAdvantageTargets('water');
      expect(targets).toContain('fire');
      expect(targets).toContain('lightning');
      expect(targets).toHaveLength(2);
    });

    it('plant targets water and shadow', () => {
      const targets = getAdvantageTargets('plant');
      expect(targets).toContain('water');
      expect(targets).toContain('shadow');
      expect(targets).toHaveLength(2);
    });
  });

  describe('getWeaknesses', () => {
    it('fire is weak to water and shadow', () => {
      const weaknesses = getWeaknesses('fire');
      expect(weaknesses).toContain('water');
      expect(weaknesses).toContain('shadow');
      expect(weaknesses).toHaveLength(2);
    });

    it('plant is weak to fire and lightning', () => {
      const weaknesses = getWeaknesses('plant');
      expect(weaknesses).toContain('fire');
      expect(weaknesses).toContain('lightning');
      expect(weaknesses).toHaveLength(2);
    });

    it('water is weak to plant and metal', () => {
      const weaknesses = getWeaknesses('water');
      expect(weaknesses).toContain('plant');
      expect(weaknesses).toContain('metal');
      expect(weaknesses).toHaveLength(2);
    });
  });

  describe('arePaired', () => {
    it('fire and lightning are paired', () => {
      expect(arePaired('fire', 'lightning')).toBe(true);
    });

    it('plant and metal are paired', () => {
      expect(arePaired('plant', 'metal')).toBe(true);
    });

    it('water and shadow are paired', () => {
      expect(arePaired('water', 'shadow')).toBe(true);
    });

    it('fire and plant are not paired', () => {
      expect(arePaired('fire', 'plant')).toBe(false);
    });

    it('elements are paired with themselves', () => {
      expect(arePaired('fire', 'fire')).toBe(true);
    });
  });

  describe('getPairedElement', () => {
    it('fire is paired with lightning', () => {
      expect(getPairedElement('fire')).toBe('lightning');
    });

    it('plant is paired with metal', () => {
      expect(getPairedElement('plant')).toBe('metal');
    });

    it('water is paired with shadow', () => {
      expect(getPairedElement('water')).toBe('shadow');
    });
  });

  describe('ELEMENT_INFO', () => {
    it('contains all 6 elements', () => {
      const elements: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
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
      expect(ELEMENT_INFO.shadow.language).toBe('Turkish/Slavic');
      expect(ELEMENT_INFO.plant.language).toBe('Quechua/Nahuatl');
      expect(ELEMENT_INFO.metal.language).toBe('Lakota');
    });
  });
});
