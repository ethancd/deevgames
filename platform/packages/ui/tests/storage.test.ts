import { describe, expect, it } from 'vitest';
import { definePersistence } from '@deev/core';
import { defineStore, type StorageLike } from '../src/storage.ts';

interface SaveDataV2 {
  hp: number;
  potions: number;
}

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function makePersistence() {
  return definePersistence<SaveDataV2>({
    version: 2,
    migrate: (old, fromVersion) => {
      const o = old as Record<string, unknown>;
      if (fromVersion === 1) return { ...o, potions: 0 }; // v1 -> v2 adds potions
      return o;
    },
    validate: (d): d is SaveDataV2 =>
      typeof (d as SaveDataV2).hp === 'number' && typeof (d as SaveDataV2).potions === 'number',
  });
}

describe('defineStore', () => {
  it('round-trips save/load through injected in-memory storage', () => {
    const storage = memoryStorage();
    const store = defineStore({
      key: 'game:save',
      persistence: makePersistence(),
      storage,
      engineHash: 'engine-abc',
    });

    store.save({ hp: 10, potions: 3 }, { s: 42 });
    const loaded = store.load();

    expect(loaded).not.toBeNull();
    expect(loaded!.data).toEqual({ hp: 10, potions: 3 });
    expect(loaded!.migratedFrom).toBeNull();
  });

  it('does not clone twice: raw storage payload reflects a plain envelope from core', () => {
    const storage = memoryStorage();
    const store = defineStore({
      key: 'game:save',
      persistence: makePersistence(),
      storage,
      engineHash: 'engine-abc',
    });

    store.save({ hp: 10, potions: 3 });
    const raw = JSON.parse(storage.getItem('game:save')!);
    expect(raw).toEqual({ v: 2, engineHash: 'engine-abc', data: { hp: 10, potions: 3 } });
  });

  it('returns null when the key is missing', () => {
    const store = defineStore({
      key: 'game:save',
      persistence: makePersistence(),
      storage: memoryStorage(),
      engineHash: 'engine-abc',
    });
    expect(store.load()).toBeNull();
  });

  it('returns null on corrupt JSON', () => {
    const storage = memoryStorage();
    storage.setItem('game:save', 'not json at all {{{');
    const store = defineStore({
      key: 'game:save',
      persistence: makePersistence(),
      storage,
      engineHash: 'engine-abc',
    });
    expect(store.load()).toBeNull();
  });

  it('returns null when validate rejects the data', () => {
    const storage = memoryStorage();
    storage.setItem('game:save', JSON.stringify({ v: 2, engineHash: 'x', data: { hp: 'NaN' } }));
    const store = defineStore({
      key: 'game:save',
      persistence: makePersistence(),
      storage,
      engineHash: 'engine-abc',
    });
    expect(store.load()).toBeNull();
  });

  it('surfaces migratedFrom via a real v1 -> v2 migration chain', () => {
    const storage = memoryStorage();
    // Simulate a save written by an older version of the game (v1 shape, no `potions`).
    storage.setItem('game:save', JSON.stringify({ v: 1, engineHash: 'engine-old', data: { hp: 5 } }));

    const store = defineStore({
      key: 'game:save',
      persistence: makePersistence(),
      storage,
      engineHash: 'engine-abc',
    });

    const loaded = store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.migratedFrom).toBe(1);
    expect(loaded!.data).toEqual({ hp: 5, potions: 0 });
  });

  it('clear() removes the stored key', () => {
    const storage = memoryStorage();
    const store = defineStore({
      key: 'game:save',
      persistence: makePersistence(),
      storage,
      engineHash: 'engine-abc',
    });
    store.save({ hp: 10, potions: 3 });
    expect(store.load()).not.toBeNull();

    store.clear();
    expect(store.load()).toBeNull();
    expect(storage.getItem('game:save')).toBeNull();
  });
});
