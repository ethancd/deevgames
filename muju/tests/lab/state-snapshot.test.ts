// @vitest-environment node
/**
 * `PackedSnapshot` must cover EVERY field of `PackedState`.
 *
 * The unmake identity check is only as complete as this snapshot. A field
 * added to `PackedState` later — another bitboard lane, another incremental
 * sum — would silently fall outside a hand-written list, which is precisely
 * how `occ`/`occBy`/`occTier` came to be compared by nothing. So the snapshot
 * is driven by the object's own shape, and this file pins that: the covered
 * key set is exactly `Object.keys(allocState())`, and a field of a kind the
 * snapshot does not understand is a hard error rather than a skip.
 */
import { describe, expect, it } from 'vitest';
import { Replica, allocState } from '../../src/ai/hard/core/state';
import type { PackedState } from '../../src/ai/hard/types';
import { createInitialGameState } from '../../src/game/board';
import { PackedSnapshot } from '../../lab/hard-ai/fuzz/statesnap';

describe('PackedSnapshot', () => {
  it('covers every own enumerable field of a PackedState', () => {
    const p = allocState();
    const snap = new PackedSnapshot();
    snap.capture(p);
    const covered = snap.coveredKeys();
    const own = Object.keys(p).sort();
    expect(covered).toEqual(own);
    // Not vacuous: the state really does have the lanes the old digest missed.
    for (const key of ['occ', 'occBy', 'occTier', 'pendBB', 'initialReserve', 'slotCount', 'originIds', 'pendIds']) {
      expect(covered).toContain(key);
    }
    expect(own.length).toBeGreaterThan(40);
  });

  it('refuses a state carrying a field of an unknown kind', () => {
    const p = { ...allocState(), somethingNew: { nested: true } } as unknown as PackedState;
    expect(() => new PackedSnapshot().capture(p)).toThrow(/unsupported kind/);
  });

  it('reports a difference in every field, one at a time', () => {
    const replica = new Replica();
    const p = replica.pack(createInitialGameState(undefined, 4, 0, 'phasing'));
    const snap = new PackedSnapshot();
    const record = p as unknown as Record<string, unknown>;
    let checked = 0;
    for (const key of Object.keys(record)) {
      const value = record[key];
      snap.capture(p);
      expect(snap.firstDifference(p)).toBeNull();
      if (ArrayBuffer.isView(value)) {
        const bytes = new Uint8Array((value as ArrayBufferView).buffer, (value as ArrayBufferView).byteOffset, (value as ArrayBufferView).byteLength);
        bytes[0] = (bytes[0] ^ 1) & 0xff;
        expect(snap.firstDifference(p), key).toMatch(new RegExp(`^${key}\\[`));
        bytes[0] = (bytes[0] ^ 1) & 0xff;
      } else if (typeof value === 'number') {
        record[key] = value + 1;
        expect(snap.firstDifference(p), key).toBe(key);
        record[key] = value;
      } else {
        const ids = value as string[];
        const saved = ids[0];
        ids[0] = 'tampered';
        expect(snap.firstDifference(p), key).toBe(`${key}[0]`);
        if (saved === undefined) delete ids[0];
        else ids[0] = saved;
      }
      checked++;
      expect(snap.firstDifference(p), `${key} restored`).toBeNull();
    }
    expect(checked).toBe(Object.keys(record).length);
  });

  it('re-derives its lanes when handed a different state object', () => {
    const replica = new Replica();
    const a = replica.pack(createInitialGameState(undefined, 4, 0, 'phasing'));
    const b = replica.pack(createInitialGameState(undefined, 4, 3, 'phasing'), allocState());
    const snap = new PackedSnapshot();
    snap.capture(a);
    // A snapshot of `a` says nothing about `b`, and must SAY so rather than
    // comparing `b` against the wrong buffers.
    expect(snap.firstDifference(b)).toBe('snapshot-target-changed');
    snap.capture(b);
    expect(snap.firstDifference(b)).toBeNull();
    b.bank[1] += 1;
    expect(snap.firstDifference(b)).toBe('bank[1]');
  });
});
