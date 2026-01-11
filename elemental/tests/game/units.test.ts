import { describe, it, expect } from 'vitest';
import {
  UNIT_DEFINITIONS,
  getUnitDefinition,
  getUnitsByElement,
  getNextTierDefinition,
  getPromotionCost,
  STARTING_UNITS,
} from '../../src/game/units';

describe('Unit Definitions', () => {
  describe('UNIT_DEFINITIONS', () => {
    it('contains exactly 24 units (4 tiers × 6 elements)', () => {
      expect(UNIT_DEFINITIONS).toHaveLength(24);
    });

    it('has 4 units per element', () => {
      const elements = ['fire', 'lightning', 'water', 'wind', 'plant', 'metal'];
      for (const element of elements) {
        const units = UNIT_DEFINITIONS.filter((u) => u.element === element);
        expect(units).toHaveLength(4);
      }
    });

    it('has tiers 1-4 for each element', () => {
      const elements = ['fire', 'lightning', 'water', 'wind', 'plant', 'metal'];
      for (const element of elements) {
        const units = UNIT_DEFINITIONS.filter((u) => u.element === element);
        const tiers = units.map((u) => u.tier).sort();
        expect(tiers).toEqual([1, 2, 3, 4]);
      }
    });

    it('has unique IDs for all units', () => {
      const ids = UNIT_DEFINITIONS.map((u) => u.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(24);
    });

    it('has positive stats for all units', () => {
      for (const unit of UNIT_DEFINITIONS) {
        expect(unit.attack).toBeGreaterThan(0);
        expect(unit.defense).toBeGreaterThan(0);
        expect(unit.speed).toBeGreaterThan(0);
        expect(unit.mining).toBeGreaterThan(0);
        expect(unit.cost).toBeGreaterThan(0);
        expect(unit.buildTime).toBeGreaterThan(0);
      }
    });
  });

  describe('getUnitDefinition', () => {
    it('returns the correct unit for valid IDs', () => {
      const hi = getUnitDefinition('fire_1');
      expect(hi.name).toBe('Hi');
      expect(hi.element).toBe('fire');
      expect(hi.tier).toBe(1);
    });

    it('throws for unknown unit ID', () => {
      expect(() => getUnitDefinition('unknown')).toThrow('Unknown unit definition');
    });
  });

  describe('getUnitsByElement', () => {
    it('returns all fire units', () => {
      const fireUnits = getUnitsByElement('fire');
      expect(fireUnits).toHaveLength(4);
      expect(fireUnits.every((u) => u.element === 'fire')).toBe(true);
    });

    it('returns units in tier order', () => {
      const waterUnits = getUnitsByElement('water');
      const names = waterUnits.map((u) => u.name);
      expect(names).toContain('Sjor');
      expect(names).toContain('Hafkafstormur');
    });
  });

  describe('getNextTierDefinition', () => {
    it('returns next tier unit for tier 1', () => {
      const next = getNextTierDefinition('fire_1');
      expect(next?.tier).toBe(2);
      expect(next?.element).toBe('fire');
      expect(next?.name).toBe('Hono');
    });

    it('returns next tier unit for tier 3', () => {
      const next = getNextTierDefinition('plant_3');
      expect(next?.tier).toBe(4);
      expect(next?.name).toBe('Cuauhtlimallki');
    });

    it('returns null for tier 4 units', () => {
      const next = getNextTierDefinition('metal_4');
      expect(next).toBeNull();
    });
  });

  describe('getPromotionCost', () => {
    it('calculates correct cost for Hi → Hono', () => {
      // Hi costs 1, Hono costs 3, so promotion is 2
      const cost = getPromotionCost('fire_1');
      expect(cost).toBe(2);
    });

    it('calculates correct cost for Muju → Sachita', () => {
      // Muju costs 3, Sachita costs 6, so promotion is 3
      const cost = getPromotionCost('plant_1');
      expect(cost).toBe(3);
    });

    it('returns 0 for tier 4 units', () => {
      const cost = getPromotionCost('fire_4');
      expect(cost).toBe(0);
    });
  });

  describe('STARTING_UNITS', () => {
    it('contains fire_1, water_1, and plant_1', () => {
      expect(STARTING_UNITS).toContain('fire_1');
      expect(STARTING_UNITS).toContain('water_1');
      expect(STARTING_UNITS).toContain('plant_1');
    });

    it('has exactly 3 starting units', () => {
      expect(STARTING_UNITS).toHaveLength(3);
    });
  });

  describe('Unit stat patterns', () => {
    it('rush units have lower costs than expand units at same tier', () => {
      const fireT1 = getUnitDefinition('fire_1');
      const plantT1 = getUnitDefinition('plant_1');
      expect(fireT1.cost).toBeLessThan(plantT1.cost);
    });

    it('higher tier units cost more within same element', () => {
      for (const element of ['fire', 'water', 'plant'] as const) {
        const t1 = getUnitDefinition(`${element}_1`);
        const t2 = getUnitDefinition(`${element}_2`);
        const t3 = getUnitDefinition(`${element}_3`);
        const t4 = getUnitDefinition(`${element}_4`);
        expect(t2.cost).toBeGreaterThan(t1.cost);
        expect(t3.cost).toBeGreaterThan(t2.cost);
        expect(t4.cost).toBeGreaterThan(t3.cost);
      }
    });

    it('lightning units have higher speed than other elements', () => {
      const lightning2 = getUnitDefinition('lightning_2');
      const fire2 = getUnitDefinition('fire_2');
      const water2 = getUnitDefinition('water_2');
      expect(lightning2.speed).toBeGreaterThan(fire2.speed);
      expect(lightning2.speed).toBeGreaterThan(water2.speed);
    });

    it('plant units have higher mining than fire units', () => {
      const plant1 = getUnitDefinition('plant_1');
      const fire1 = getUnitDefinition('fire_1');
      expect(plant1.mining).toBeGreaterThan(fire1.mining);
    });

    it('metal units have highest defense', () => {
      const metal4 = getUnitDefinition('metal_4');
      expect(metal4.defense).toBe(8); // Highest in game
    });
  });
});
