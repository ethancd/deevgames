import { describe, expect, it } from 'vitest';
import { engineHash, mulberry32, PersistError } from '@deev/core';
import { tesser } from '../src/game.ts';
import { persistence } from '../src/persist.ts';

const hash = engineHash(tesser);

describe('persistence (v1 save envelope)', () => {
  it('round-trips the initial state', () => {
    const state = tesser.init({}, mulberry32(1));
    const envelope = persistence.save(state, { engineHash: hash });
    expect(envelope.v).toBe(1);
    expect(envelope.engineHash).toBe(hash);
    const loaded = persistence.load(envelope);
    expect(loaded.data).toEqual(state);
    expect(loaded.migratedFrom).toBeNull();
  });

  it('save snapshots immediately: later mutation does not leak into the envelope', () => {
    const state = tesser.init({}, mulberry32(1));
    const envelope = persistence.save(state, { engineHash: hash });
    state.pieces[0].measure = 1;
    expect(envelope.data.pieces[0].measure).toBe(6);
  });

  it('rejects malformed state (validate gate)', () => {
    const good = tesser.init({}, mulberry32(1));
    const bad = persistence.save(good, { engineHash: hash });
    (bad.data as { pieces: unknown[] }).pieces = [{ id: 'x' }]; // not a piece
    expect(() => persistence.load(bad)).toThrow(PersistError);
    expect(persistence.tryLoad(bad)).toBeNull();
  });

  it('tryLoad is boot-safe on garbage', () => {
    expect(persistence.tryLoad(null)).toBeNull();
    expect(persistence.tryLoad('nonsense')).toBeNull();
    expect(persistence.tryLoad({ v: 1 })).toBeNull(); // missing data
    expect(persistence.tryLoad({ v: 1, engineHash: hash, data: { pieces: [] } })).toBeNull();
  });

  it('refuses a save from a newer version', () => {
    const state = tesser.init({}, mulberry32(1));
    const envelope = persistence.save(state, { engineHash: hash });
    expect(persistence.tryLoad({ ...envelope, v: 2 })).toBeNull();
  });
});
