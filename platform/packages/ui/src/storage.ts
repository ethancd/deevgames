// Thin storage adapter over @deev/core's SaveEnvelope/definePersistence.
// This is the ui -> core edge: one envelope shape, one migrate chain,
// defined once in the game's core Persistence and reused here.

import type { Persistence, RngState } from '@deev/core';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DefineStoreOptions<T> {
  key: string;
  persistence: Persistence<T>;
  /** Defaults to `localStorage`; MUST be injectable for testing. */
  storage?: StorageLike;
  engineHash: string;
}

export interface LoadResult<T> {
  data: T;
  migratedFrom: number | null;
}

export interface Store<T> {
  save(data: T, rngState?: RngState): void;
  /** tryLoad semantics: corrupt JSON, missing key, failed validation all -> null. */
  load(): LoadResult<T> | null;
  clear(): void;
}

export function defineStore<T>(opts: DefineStoreOptions<T>): Store<T> {
  const storage = opts.storage ?? localStorage;

  return {
    save(data: T, rngState?: RngState) {
      // core's Persistence.save() (definePersistence, persist.ts) already
      // structuredClones the envelope for snapshot-on-write — do NOT clone
      // again here, that would just re-clone an already-frozen snapshot.
      const envelope = opts.persistence.save(data, {
        engineHash: opts.engineHash,
        rngState,
      });
      storage.setItem(opts.key, JSON.stringify(envelope));
    },
    load() {
      const raw = storage.getItem(opts.key);
      if (raw === null) return null; // missing key -> null

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null; // corrupt JSON -> null
      }

      return opts.persistence.tryLoad(parsed); // failed validation -> null (core's tryLoad)
    },
    clear() {
      storage.removeItem(opts.key);
    },
  };
}
