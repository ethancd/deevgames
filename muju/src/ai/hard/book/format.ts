/**
 * The opening-book container (DESIGN §4.17 `book/format.ts`, §5.14).
 *
 * `MUJUBK02`: an 8-byte magic, then `entryCount u32`, `handicap u8`,
 * `mapHash u32`, `weightsVersion u16` and one pad byte (the header is 20 bytes
 * so the entry array starts 4-byte aligned, which is what lets `parseBook`
 * read it through a `DataView` without copying), then `entryCount` 20-byte
 * entries **sorted by `(keyLo, keyHi)`** — the order `lookup`'s binary search
 * depends on, and the one `packBook` imposes.
 *
 * Entry: `keyLo u32 | keyHi u32 | turnLo u32 | turnHi u32 | flags u8 |
 * score i16 | count u8`. `flags` bit 0 is "the stored line belongs to the
 * mirrored seat" (`canonicalKey`'s `negated`) and bit 1 is "exact" — a line
 * the builder searched to completion rather than inherited from a parent.
 *
 * M14 ships the format and `EMPTY_BOOK`; M18's `lab/hard-ai/book/build.ts`
 * writes real ones. Everything here is pure byte work with no dependency on
 * the search, so the builder and the engine cannot drift apart.
 */
import type { Book, BookEntry } from '../config';

export type { Book, BookEntry } from '../config';

export const BOOK_MAGIC = 'MUJUBK02';
export const HEADER_BYTES = 20;
export const ENTRY_BYTES = 20;

/** `BookEntry.flags` bits. */
export const BookFlag = { NEGATED: 1, EXACT: 2 } as const;

export class BookFormatError extends Error {}

interface BookMeta {
  handicap: number;
  mapHash: number;
  weightsVersion: number;
}

class PackedBook implements Book {
  readonly size: number;
  readonly handicap: number;
  readonly mapHash: number;
  readonly weightsVersion: number;
  private readonly view: DataView;
  private readonly scratch: BookEntry = {
    keyLo: 0,
    keyHi: 0,
    turnLo: 0,
    turnHi: 0,
    flags: 0,
    score: 0,
    count: 0,
  };

  constructor(view: DataView, size: number, meta: BookMeta) {
    this.view = view;
    this.size = size;
    this.handicap = meta.handicap;
    this.mapHash = meta.mapHash;
    this.weightsVersion = meta.weightsVersion;
  }

  private read(index: number): BookEntry {
    const at = HEADER_BYTES + index * ENTRY_BYTES;
    const v = this.view;
    const e = this.scratch;
    e.keyLo = v.getUint32(at, true);
    e.keyHi = v.getUint32(at + 4, true);
    e.turnLo = v.getUint32(at + 8, true);
    e.turnHi = v.getUint32(at + 12, true);
    e.flags = v.getUint8(at + 16);
    e.score = v.getInt16(at + 17, true);
    e.count = v.getUint8(at + 19);
    return e;
  }

  /** Binary search on `(keyLo, keyHi)` as unsigned pairs. The returned record
   * is reused between calls — copy it if you need to keep it. */
  lookup(lo: number, hi: number): BookEntry | null {
    const wantLo = lo >>> 0;
    const wantHi = hi >>> 0;
    let low = 0;
    let high = this.size - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const e = this.read(mid);
      if (e.keyLo < wantLo || (e.keyLo === wantLo && e.keyHi < wantHi)) low = mid + 1;
      else if (e.keyLo > wantLo || (e.keyLo === wantLo && e.keyHi > wantHi)) high = mid - 1;
      else return e;
    }
    return null;
  }
}

/** A book with nothing in it — the M14 default and the fallback whenever a
 * file fails to parse (DESIGN §4.17). */
export const EMPTY_BOOK: Book = {
  lookup(): BookEntry | null {
    return null;
  },
  size: 0,
  handicap: 0,
  mapHash: 0,
  weightsVersion: 0,
};

export function parseBook(bytes: ArrayBuffer): Book {
  if (bytes.byteLength < HEADER_BYTES) throw new BookFormatError(`parseBook: ${bytes.byteLength} bytes is shorter than the header`);
  const view = new DataView(bytes);
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== BOOK_MAGIC) throw new BookFormatError(`parseBook: bad magic "${magic}"`);
  const entryCount = view.getUint32(8, true);
  const handicap = view.getUint8(12);
  const mapHash = view.getUint32(13, true);
  const weightsVersion = view.getUint16(17, true);
  const expected = HEADER_BYTES + entryCount * ENTRY_BYTES;
  if (bytes.byteLength < expected) {
    throw new BookFormatError(`parseBook: header claims ${entryCount} entries (${expected} bytes) but the file is ${bytes.byteLength}`);
  }
  return new PackedBook(view, entryCount, { handicap, mapHash, weightsVersion });
}

/** Entry order is part of the format, so `packBook` sorts rather than trusting
 * its input (DESIGN §4.17: "20-byte entries sorted by `(keyLo, keyHi)`"). */
export function packBook(entries: BookEntry[], meta: BookMeta): Uint8Array {
  const sorted = entries.slice().sort((a, b) => {
    const al = a.keyLo >>> 0;
    const bl = b.keyLo >>> 0;
    if (al !== bl) return al < bl ? -1 : 1;
    const ah = a.keyHi >>> 0;
    const bh = b.keyHi >>> 0;
    if (ah !== bh) return ah < bh ? -1 : 1;
    return 0;
  });
  const out = new Uint8Array(HEADER_BYTES + sorted.length * ENTRY_BYTES);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) view.setUint8(i, BOOK_MAGIC.charCodeAt(i));
  view.setUint32(8, sorted.length, true);
  view.setUint8(12, meta.handicap & 0xff);
  view.setUint32(13, meta.mapHash >>> 0, true);
  view.setUint16(17, meta.weightsVersion & 0xffff, true);
  view.setUint8(19, 0);
  for (let i = 0; i < sorted.length; i++) {
    const at = HEADER_BYTES + i * ENTRY_BYTES;
    const e = sorted[i];
    view.setUint32(at, e.keyLo >>> 0, true);
    view.setUint32(at + 4, e.keyHi >>> 0, true);
    view.setUint32(at + 8, e.turnLo >>> 0, true);
    view.setUint32(at + 12, e.turnHi >>> 0, true);
    view.setUint8(at + 16, e.flags & 0xff);
    view.setInt16(at + 17, e.score | 0, true);
    view.setUint8(at + 19, e.count & 0xff);
  }
  return out;
}
