// Versioned save envelopes with migration chains and snapshot-on-write.
//
// Napkin lessons encoded here:
// - snapshot-on-write: save() structuredClones immediately, so a deferred/
//   debounced writer can never persist a live object that mutated after the
//   save was scheduled (Lution's double-draw bug).
// - stale-save tolerance: loading an older version runs the migrate chain;
//   loading garbage returns null from tryLoad rather than throwing mid-boot
//   (MMS recomputeHero lesson).

import type { RngState } from './rng.ts';

// Node >= 17 and all modern browsers provide this at runtime; the bare ES2022
// lib doesn't declare it. Module-scoped so it travels with this file into any
// downstream package's typecheck (source-exports workspace).
declare function structuredClone<T>(value: T): T;

export interface SaveEnvelope<T> {
  v: number;
  engineHash: string;
  rngState?: RngState;
  data: T;
}

export interface PersistenceSpec<T> {
  version: number;
  /** Migrate one step at a time is fine — called as migrate(old, fromVersion). */
  migrate?: (old: unknown, fromVersion: number) => unknown;
  /** Final gate after migration; throw or return false to reject. */
  validate?: (data: unknown) => data is T;
}

export interface Persistence<T> {
  save(data: T, extras: { engineHash: string; rngState?: RngState }): SaveEnvelope<T>;
  /** Throws PersistError on any problem. */
  load(envelope: unknown): { data: T; migratedFrom: number | null };
  /** Null on any problem — boot-safe. */
  tryLoad(envelope: unknown): { data: T; migratedFrom: number | null } | null;
}

export class PersistError extends Error {}

export function definePersistence<T>(spec: PersistenceSpec<T>): Persistence<T> {
  const load = (envelope: unknown): { data: T; migratedFrom: number | null } => {
    if (typeof envelope !== 'object' || envelope === null) {
      throw new PersistError('not an envelope');
    }
    const env = envelope as Partial<SaveEnvelope<unknown>>;
    if (typeof env.v !== 'number' || !('data' in env)) {
      throw new PersistError('missing v/data');
    }
    if (env.v > spec.version) {
      throw new PersistError(`save is from a newer version (${env.v} > ${spec.version})`);
    }
    let data: unknown = env.data;
    let migratedFrom: number | null = null;
    if (env.v < spec.version) {
      if (!spec.migrate) throw new PersistError(`no migrate chain from v${env.v}`);
      migratedFrom = env.v;
      for (let from = env.v; from < spec.version; from++) {
        data = spec.migrate(data, from);
      }
    }
    if (spec.validate) {
      let ok = false;
      try {
        ok = spec.validate(data);
      } catch (e) {
        throw new PersistError(`validate threw: ${(e as Error).message}`);
      }
      if (!ok) throw new PersistError('validate rejected data');
    }
    return { data: data as T, migratedFrom };
  };

  return {
    save(data, extras) {
      // Snapshot NOW — the caller may hand this envelope to a debounced writer.
      return structuredClone({
        v: spec.version,
        engineHash: extras.engineHash,
        ...(extras.rngState ? { rngState: extras.rngState } : {}),
        data,
      });
    },
    load,
    tryLoad(envelope) {
      try {
        return load(envelope);
      } catch {
        return null;
      }
    },
  };
}
