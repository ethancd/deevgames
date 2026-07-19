import { describe, expect, it } from 'vitest';
import { definePersistence, PersistError } from '../src/persist.ts';

interface V3 {
  hp: number;
  name: string;
  inventory: string[];
}

const persistence = definePersistence<V3>({
  version: 3,
  migrate: (old, fromVersion) => {
    const o = old as Record<string, unknown>;
    if (fromVersion === 1) return { ...o, name: 'hero' }; // v1 → v2 adds name
    if (fromVersion === 2) return { ...o, inventory: [] }; // v2 → v3 adds inventory
    return o;
  },
  validate: (d): d is V3 => typeof (d as V3).hp === 'number' && Array.isArray((d as V3).inventory),
});

describe('definePersistence', () => {
  it('round-trips current-version data', () => {
    const env = persistence.save({ hp: 10, name: 'x', inventory: ['sword'] }, { engineHash: 'ab' });
    expect(env.v).toBe(3);
    const loaded = persistence.load(env);
    expect(loaded.migratedFrom).toBeNull();
    expect(loaded.data.inventory).toEqual(['sword']);
  });

  it('runs the migration chain v1 → v3', () => {
    const loaded = persistence.load({ v: 1, engineHash: 'old', data: { hp: 5 } });
    expect(loaded.migratedFrom).toBe(1);
    expect(loaded.data).toEqual({ hp: 5, name: 'hero', inventory: [] });
  });

  it('rejects newer-version saves and garbage; tryLoad is boot-safe', () => {
    expect(() => persistence.load({ v: 4, data: {} })).toThrow(PersistError);
    expect(persistence.tryLoad('not json at all')).toBeNull();
    expect(persistence.tryLoad({ v: 3, engineHash: 'x', data: { hp: 'NaN' } })).toBeNull();
  });

  it('snapshot-on-write: mutations after save() do not leak into the envelope', () => {
    const live = { hp: 10, name: 'x', inventory: ['sword'] };
    const env = persistence.save(live, { engineHash: 'ab', rngState: { s: 42 } });
    // Simulate a mutation between scheduling and the debounced write.
    live.hp = 1;
    live.inventory.push('MUTATED');
    expect(env.data.hp).toBe(10);
    expect(env.data.inventory).toEqual(['sword']);
    expect(env.rngState).toEqual({ s: 42 });
  });
});
