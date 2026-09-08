// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../../src/game/units';
import { calculateAttackPower } from '../../src/game/combat';
import { calculateMiningYield } from '../../src/game/mining';
import { createUnitFromDefinition } from '../../src/game/building';
import { accessTimeline, canKill, killFrontier, miningCurve, power, solveRoles, staticDominators, strikeActions, validateCatalogue } from '../../lab/solver/model';
import baseline from '../../lab/solver/baseline-v1.2.json';
import type { UnitDefinition } from '../../src/game/types';
const old = baseline as UnitDefinition[];
const get = (id: string) => getUnitDefinition(id);

describe('static value model independent checks', () => {
  it('matches actual elemental combat for all 324 catalogue pairs', () => {
    for (const a of UNIT_DEFINITIONS) for (const b of UNIT_DEFINITIONS) {
      const attacker = createUnitFromDefinition(a.id, 'white', { x: 1, y: 1 }, 'a');
      const defender = createUnitFromDefinition(b.id, 'black', { x: 1, y: 2 }, 'b');
      expect(power(a, b)).toBe(calculateAttackPower(attacker, defender));
    }
  });
  it('matches real mining yields at every remaining depth and never renews a well', () => {
    for (const def of UNIT_DEFINITIONS) for (let depth = 0; depth <= 5; depth++) {
      const unit = createUnitFromDefinition(def.id, 'white', { x: 0, y: 0 }, 'm');
      const amount = calculateMiningYield(unit, { position: unit.position, minedDepth: depth, resourceLayers: 5 - depth });
      expect(miningCurve(def, [depth], 3)).toEqual([0, amount, amount, amount]);
    }
  });
  it('matches exhaustive movement/mining sequences on a short corridor', () => {
    const depths = [0, 5, 2, 0], unit = { ...get('plant_1'), speed: 2 };
    function brute(position: number, wells: number[], steps: number): number {
      if (!steps) return 0;
      let best = 0;
      const yieldNow = Math.max(0, unit.mining - wells[position]);
      if (yieldNow) { const next = [...wells]; next[position] = unit.mining; best = yieldNow + brute(position, next, steps - 1); }
      for (let p = 0; p < wells.length; p++) if (p !== position && Math.abs(p - position) <= unit.speed) best = Math.max(best, brute(p, wells, steps - 1));
      return best;
    }
    expect(miningCurve(unit, depths, 4)).toEqual([0, 1, 2, 3, 4].map(n => brute(0, depths, n)));
  });
  it('finds the same minimum kill price as exhaustive squad enumeration', () => {
    const pool = ['fire_1', 'fire_2', 'lightning_2'].map(get), target = get('metal_3');
    for (const distance of [1, 3, 6]) for (const budget of [2, 4, 6]) {
      let best = Infinity;
      function brute(squad: UnitDefinition[]) {
        if (squad.length) {
          const actions = squad.reduce((sum, u) => sum + strikeActions(u, distance), 0);
          if (actions <= budget && squad.reduce((sum, u) => sum + power(u, target), 0) >= target.defense) best = Math.min(best, squad.reduce((sum, u) => sum + u.cost, 0));
        }
        if (squad.length < 3) for (const unit of pool) brute([...squad, unit]);
      }
      brute([]);
      expect(killFrontier(target, pool, distance, budget, 3)[0]?.cost ?? Infinity).toBe(best);
    }
  });
  it('cannot spend six attacks from one body against the same target', () => {
    const small = { ...get('fire_1'), attack: 1, element: 'metal' as const }, target = get('metal_3');
    expect(killFrontier(target, [small], 1, 6, 1)).toEqual([]);
    expect(killFrontier(target, [small], 1, 6, 4)).toEqual([]);
  });
  it('retains action-efficient costly solutions alongside cheap swarms', () => {
    const target = { ...get('metal_1'), defense: 4 };
    const cheap = { ...get('fire_1'), id: 'cheap', attack: 1, cost: 1 };
    const expensive = { ...cheap, id: 'expensive', attack: 3, cost: 3 };
    const solutions = killFrontier(target, [cheap, expensive], 1);
    expect(solutions.map(s => [s.cost, s.actions, s.bodies])).toEqual([[2, 2, 2], [3, 1, 1]]);
  });
  it('exhibits a real attack-speed complementarity breakpoint', () => {
    const radi = old.find(d => d.id === 'lightning_1')!, target = get('metal_1');
    expect(canKill(radi, target, 8, 3)).toBe(false);
    expect(canKill({ ...radi, attack: 2 }, target, 8, 3)).toBe(false);
    expect(canKill({ ...radi, speed: 4 }, target, 8, 3)).toBe(false);
    expect(canKill({ ...radi, attack: 2, speed: 4 }, target, 8, 3)).toBe(true);
  });
  it('models income phase, construction delay and no promotion on placement', () => {
    expect(accessTimeline(old, old.find(d => d.id === 'fire_2')!, 3).activeTurn).toBe(2);
    expect(accessTimeline(old, old.find(d => d.id === 'lightning_1')!, 9).activeTurn).toBe(2);
    expect(accessTimeline(old, old.find(d => d.id === 'lightning_2')!, 9).activeTurn).toBe(3);
    expect(accessTimeline(old, old.find(d => d.id === 'metal_1')!, 9).activeTurn).toBe(3);
    expect(accessTimeline(old, old.find(d => d.id === 'metal_2')!, 9).activeTurn).toBe(4);
    expect(accessTimeline(old, old.find(d => d.id === 'plant_4')!, 3).activeTurn).toBe(7);
    expect(accessTimeline(old, old.find(d => d.id === 'plant_4')!, 0).activeTurn).toBeNull();
  });
  it('detects the historical Plant tier-2 dominance without calling the whole tree dominated', () => {
    expect(staticDominators(old.find(d => d.id === 'plant_2')!, old)).toEqual(['metal_2']);
    expect(staticDominators(old.find(d => d.id === 'plant_3')!, old)).toEqual([]);
    const differentiated = old.map(d => d.id === 'plant_2' ? { ...d, mining: 4 } : d);
    expect(staticDominators(differentiated.find(d => d.id === 'plant_2')!, differentiated)).toEqual([]);
  });
  it('finds economical witnesses without forcing the requested type or tier', () => {
    const patched = old.map(d => d.id === 'plant_2' ? { ...d, mining: 4 } : d);
    const roles = solveRoles(patched);
    expect(roles.plant_2.soleCheapest).toBeGreaterThan(0);
    expect(roles.shadow_3.soleCheapest).toBeGreaterThan(0); // mining=2 thresholds must not be omitted
    expect(roles.plant_2.witnesses.every(w => !w.mission.includes('require plant_2'))).toBe(true);
  });
  it('keeps all live catalogue units distinct on the static pre-playtest checks', () => {
    const roles = solveRoles(UNIT_DEFINITIONS);
    for (const unit of UNIT_DEFINITIONS) {
      expect(staticDominators(unit, UNIT_DEFINITIONS), unit.id).toEqual([]);
      expect(roles[unit.id].soleCheapest, unit.id).toBeGreaterThan(0);
    }
  });
  it('rejects malformed catalogues instead of inventing value for impossible stats', () => {
    expect(() => validateCatalogue(UNIT_DEFINITIONS)).not.toThrow();
    expect(() => validateCatalogue([...UNIT_DEFINITIONS.slice(1), UNIT_DEFINITIONS[1]])).toThrow();
    expect(() => validateCatalogue(UNIT_DEFINITIONS.map(d => d.id === 'plant_3' ? { ...d, mining: 6 } : d))).toThrow();
  });
  it('rejects impossible corridor descriptions and unsupported finance assumptions', () => {
    expect(() => miningCurve(get('plant_1'), [6])).toThrow();
    expect(() => accessTimeline(old, old[0], -1)).toThrow();
    const invalid = old.map(d => d.id === 'fire_2' ? { ...d, cost: 0 } : d);
    expect(() => accessTimeline(invalid, invalid[1], 5)).toThrow();
  });
});
