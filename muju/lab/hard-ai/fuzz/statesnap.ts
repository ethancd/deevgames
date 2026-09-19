/**
 * A COMPLETE snapshot of a `PackedState`, for the make/unmake identity check.
 *
 * ## Why this exists
 *
 * Until round 5 the differential's immediate unmake check compared
 * `fuzzDigest` — `Replica.digest` plus the pending plane, the pending counts
 * and both banks. That digest is built by walking `pieceAt`, so it omits the
 * three occupancy lanes (`occ`, `occBy`, `occTier`), `initialReserve`,
 * `gained`, `materialCc`, `pstSumCc`, `slotCount`, `catalogSignature`,
 * `proverMode` and the two cold id arrays. The occupancy comparisons
 * `firstDifference` gained in round 4 run only AFTER the action is made a
 * SECOND time, and re-making can repair a corrupt restoration — a lane that
 * `make` overwrites unconditionally is indistinguishable, at that point, from
 * one `unmake` put back correctly.
 *
 * An independent reviewer proved the hole rather than argued it: a bounded
 * 400-action probe that replaced `unmake`'s restored `occTier` with the
 * POST-action values produced 164 incorrect restorations while the divergence,
 * unmake, legality, rehash, round-trip and invariant counters all stayed 0,
 * even at `--legality-every 1`.
 *
 * ## What this module guarantees
 *
 * The snapshot is driven by the SHAPE of the object it is given, not by a
 * hand-written field list:
 *
 *   - every own enumerable property whose value is an `ArrayBuffer`-backed view
 *     is copied byte for byte and compared byte for byte;
 *   - every own enumerable property whose value is a `number` is copied and
 *     compared;
 *   - every own enumerable property whose value is an array of strings (the two
 *     cold id planes) is copied and compared, with `undefined` and `''` treated
 *     as the same absent id, because `make` writes `''` where `pack` left a
 *     hole and `unmake` puts the `''` back;
 *   - any other own enumerable property is a hard ERROR at snapshot time.
 *
 * So a field added to `PackedState` later cannot be silently ignored: it is
 * either one of the three kinds above, and covered, or the snapshot throws.
 * `tests/lab/state-snapshot.test.ts` additionally asserts that the covered key
 * set is exactly `Object.keys(allocState())`.
 *
 * The snapshot object is reusable: `capture` re-copies into the buffers it
 * already holds, and only re-derives its lanes when it is handed a different
 * `PackedState` object (or one whose typed arrays were replaced). That keeps
 * it cheap enough for the hot walk, where it runs once per applied action.
 */
import type { PackedState } from '../../../src/ai/hard/types';

interface ArrayLane {
  key: string;
  /** The live array, kept only to detect a replaced reference. */
  src: ArrayBufferView;
  /** Byte view of the live array. */
  live: Uint8Array;
  /** Word view of the live array's 4-byte-aligned prefix. */
  liveWords: Uint32Array;
  /** The saved copy, same length as `live`. */
  saved: Uint8Array;
  savedWords: Uint32Array;
  /** Bytes of one element, for reporting an element index rather than a byte. */
  bpe: number;
}

interface IdLane {
  key: string;
  src: readonly string[];
  saved: string[];
  savedLength: number;
}

export class PackedSnapshot {
  private target: PackedState | null = null;
  private arrays: ArrayLane[] = [];
  private ids: IdLane[] = [];
  private scalarKeys: string[] = [];
  private scalars: number[] = [];

  /** Every own enumerable key the snapshot covers, in `Object.keys` order. */
  coveredKeys(): string[] {
    const out: string[] = [];
    for (const lane of this.arrays) out.push(lane.key);
    for (const lane of this.ids) out.push(lane.key);
    for (const key of this.scalarKeys) out.push(key);
    return out.sort();
  }

  /** Copies every field of `p`. Re-derives the lanes if `p` is new. */
  capture(p: PackedState): void {
    if (this.target !== p || this.stale(p)) this.derive(p);
    for (const lane of this.arrays) lane.saved.set(lane.live);
    for (const lane of this.ids) {
      const src = lane.src;
      lane.savedLength = src.length;
      // Truncated, not just grown: a leftover entry from a longer earlier
      // capture would otherwise be compared against this state's absent one.
      lane.saved.length = src.length;
      for (let i = 0; i < src.length; i++) lane.saved[i] = src[i] ?? '';
    }
    const record = p as unknown as Record<string, number>;
    for (let i = 0; i < this.scalarKeys.length; i++) this.scalars[i] = record[this.scalarKeys[i]];
  }

  /**
   * The first field of `p` that differs from the captured copy, named
   * `<key>[<element index>]` for an array field and `<key>` for a scalar, or
   * `null` when every byte of every field matches.
   */
  firstDifference(p: PackedState): string | null {
    if (this.target !== p) return 'snapshot-target-changed';
    for (const lane of this.arrays) {
      if (lane.src !== (p as unknown as Record<string, unknown>)[lane.key]) return `${lane.key}-array-replaced`;
      const a = lane.liveWords;
      const b = lane.savedWords;
      for (let w = 0; w < a.length; w++) {
        if (a[w] !== b[w]) return `${lane.key}[${((w * 4) / lane.bpe) | 0}]`;
      }
      for (let i = a.length * 4; i < lane.live.length; i++) {
        if (lane.live[i] !== lane.saved[i]) return `${lane.key}[${(i / lane.bpe) | 0}]`;
      }
    }
    const record = p as unknown as Record<string, number>;
    for (let i = 0; i < this.scalarKeys.length; i++) {
      if (record[this.scalarKeys[i]] !== this.scalars[i]) return this.scalarKeys[i];
    }
    for (const lane of this.ids) {
      const src = lane.src;
      // Compared over the UNION of the two lengths, with an out-of-range or
      // `undefined` entry read as `''`. The id planes are `string[]`, not typed
      // arrays: `make` grows one by writing at an index past its end when an
      // arrival takes a slot no live unit has ever held, and `unmake` writes
      // `''` back there rather than shortening the array. That is a length
      // change with no information in it — `unpack` treats `''` and absent
      // identically (`core/state.ts:687,714`) — and it is the ONLY thing
      // make/unmake does not restore literally. Comparing the union keeps the
      // check fault-sensitive where it matters: an id LEFT BEHIND at a grown
      // index is `'unit-…'` against `''` and still reported.
      const n = src.length > lane.savedLength ? src.length : lane.savedLength;
      for (let i = 0; i < n; i++) {
        if ((src[i] ?? '') !== (lane.saved[i] ?? '')) return `${lane.key}[${i}]`;
      }
    }
    return null;
  }

  private stale(p: PackedState): boolean {
    const record = p as unknown as Record<string, unknown>;
    for (const lane of this.arrays) if (lane.src !== record[lane.key]) return true;
    for (const lane of this.ids) if (lane.src !== record[lane.key]) return true;
    return false;
  }

  private derive(p: PackedState): void {
    this.target = p;
    this.arrays = [];
    this.ids = [];
    this.scalarKeys = [];
    this.scalars = [];
    const record = p as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
        const view = value as ArrayBufferView & { BYTES_PER_ELEMENT: number };
        const live = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        const saved = new Uint8Array(view.byteLength);
        const words = (view.byteLength / 4) | 0;
        // A word view needs a 4-byte-aligned offset; every `allocState` array
        // owns its buffer, so this holds, but fall back to the byte tail if a
        // future layout packs several fields into one buffer at odd offsets.
        const aligned = view.byteOffset % 4 === 0;
        this.arrays.push({
          key,
          src: view,
          live,
          liveWords: new Uint32Array(view.buffer, view.byteOffset, aligned ? words : 0),
          saved,
          savedWords: new Uint32Array(saved.buffer, 0, aligned ? words : 0),
          bpe: view.BYTES_PER_ELEMENT ?? 1,
        });
      } else if (typeof value === 'number') {
        this.scalarKeys.push(key);
        this.scalars.push(value);
      } else if (Array.isArray(value) && value.every(v => typeof v === 'string' || v === undefined)) {
        this.ids.push({ key, src: value as string[], saved: [], savedLength: 0 });
      } else {
        throw new Error(
          `PackedSnapshot: field "${key}" is of an unsupported kind (${Object.prototype.toString.call(value)}); ` +
            'the snapshot must cover EVERY field of PackedState — teach it this one rather than skipping it',
        );
      }
    }
  }
}
