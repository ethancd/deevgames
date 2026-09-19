/**
 * BK03 opening-book container: 24-byte header, exact compatibility descriptor,
 * aligned 20-byte entries sorted by unique unsigned (keyLo,keyHi).
 * The descriptor binds the entire weight vector, map and rules; BK02 is refused.
 * EMPTY_BOOK remains the shipped default. No generated book is bundled here.
 */
import type { Book, BookEntry } from '../config';

export type { Book, BookEntry } from '../config';

export const BOOK_MAGIC = 'MUJUBK03';
/** BK03 adds a length-prefixed exact compatibility descriptor after this header. */
export const HEADER_BYTES = 24;
export const ENTRY_BYTES = 20;

/** `BookEntry.flags` bits. */
export const BookFlag = { NEGATED: 1, EXACT: 2 } as const;

export class BookFormatError extends Error {}

interface BookMeta {
  handicap: number;
  mapHash: number;
  weightsVersion: number;
  weightsKey: string;
  mapKey: string;
  rulesKey: string;
}

class PackedBook implements Book {
  readonly size: number;
  readonly handicap: number;
  readonly mapHash: number;
  readonly weightsVersion: number;
  readonly formatVersion = 3 as const;
  readonly weightsKey: string;
  readonly mapKey: string;
  readonly rulesKey: string;
  private readonly view: DataView;
  private readonly entriesOffset: number;
  private readonly scratch: BookEntry = {
    keyLo: 0,
    keyHi: 0,
    turnLo: 0,
    turnHi: 0,
    flags: 0,
    score: 0,
    count: 0,
  };

  constructor(view: DataView, size: number, meta: BookMeta, entriesOffset: number) {
    this.view = view;
    this.size = size;
    this.handicap = meta.handicap;
    this.mapHash = meta.mapHash;
    this.weightsVersion = meta.weightsVersion;
    this.weightsKey = meta.weightsKey;
    this.mapKey = meta.mapKey;
    this.rulesKey = meta.rulesKey;
    this.entriesOffset = entriesOffset;
  }

  private read(index: number): BookEntry {
    const at = this.entriesOffset + index * ENTRY_BYTES;
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
  formatVersion: 3,
  weightsKey: '', mapKey: '', rulesKey: '',
};

function validateKeys(input: unknown): Pick<BookMeta, 'weightsKey' | 'mapKey' | 'rulesKey'> {
  if (!input || typeof input !== 'object') throw new BookFormatError('missing BK03 compatibility keys');
  const row = input as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'mapKey,rulesKey,weightsKey'
    || ['weightsKey', 'mapKey', 'rulesKey'].some(key => typeof row[key] !== 'string' || !(row[key] as string).length)) throw new BookFormatError('invalid BK03 compatibility keys');
  return row as Pick<BookMeta, 'weightsKey' | 'mapKey' | 'rulesKey'>;
}

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
  if (handicap > 20 || weightsVersion < 1) throw new BookFormatError('invalid BK03 metadata');
  const keyLength = view.getUint32(20, true);
  if (keyLength < 1 || keyLength > 32768 || HEADER_BYTES + keyLength > bytes.byteLength) throw new BookFormatError('invalid BK03 descriptor length');
  let keys: Pick<BookMeta, 'weightsKey' | 'mapKey' | 'rulesKey'>;
  try { keys = validateKeys(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes, HEADER_BYTES, keyLength)))); }
  catch (error) { throw new BookFormatError(`invalid BK03 descriptor: ${String(error)}`); }
  const offset = (HEADER_BYTES + keyLength + 3) & ~3;
  const expected = offset + entryCount * ENTRY_BYTES;
  if (bytes.byteLength !== expected) {
    throw new BookFormatError(`parseBook: header claims ${entryCount} entries (${expected} bytes) but the file is ${bytes.byteLength}`);
  }
  for (let i = 1; i < entryCount; i++) {
    const previous = offset + (i - 1) * ENTRY_BYTES, current = previous + ENTRY_BYTES;
    const aLo = view.getUint32(previous, true), aHi = view.getUint32(previous + 4, true);
    const bLo = view.getUint32(current, true), bHi = view.getUint32(current + 4, true);
    if (aLo > bLo || aLo === bLo && aHi >= bHi) throw new BookFormatError('BK03 entries must have unique sorted keys');
  }
  return new PackedBook(view, entryCount, { handicap, mapHash, weightsVersion, ...keys }, offset);
}

/** Entry order is part of the format, so `packBook` sorts rather than trusting
 * its input (DESIGN §4.17: "20-byte entries sorted by `(keyLo, keyHi)`"). */
export function packBook(entries: BookEntry[], meta: BookMeta): Uint8Array {
  const keys = validateKeys({ weightsKey: meta.weightsKey, mapKey: meta.mapKey, rulesKey: meta.rulesKey });
  if (!Number.isInteger(meta.handicap) || meta.handicap < 0 || meta.handicap > 20 || !Number.isInteger(meta.weightsVersion) || meta.weightsVersion < 1 || meta.weightsVersion > 65535) throw new BookFormatError('invalid BK03 metadata');
  const descriptor = new TextEncoder().encode(JSON.stringify(keys));
  if (descriptor.length > 32768) throw new BookFormatError('BK03 descriptor too long');
  const sorted = entries.slice().sort((a, b) => {
    const al = a.keyLo >>> 0;
    const bl = b.keyLo >>> 0;
    if (al !== bl) return al < bl ? -1 : 1;
    const ah = a.keyHi >>> 0;
    const bh = b.keyHi >>> 0;
    if (ah !== bh) return ah < bh ? -1 : 1;
    return 0;
  });
  for (let i = 1; i < sorted.length; i++) if ((sorted[i].keyLo >>> 0) === (sorted[i - 1].keyLo >>> 0) && (sorted[i].keyHi >>> 0) === (sorted[i - 1].keyHi >>> 0)) throw new BookFormatError('duplicate BK03 key');
  const offset = (HEADER_BYTES + descriptor.length + 3) & ~3;
  const out = new Uint8Array(offset + sorted.length * ENTRY_BYTES);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) view.setUint8(i, BOOK_MAGIC.charCodeAt(i));
  view.setUint32(8, sorted.length, true);
  view.setUint8(12, meta.handicap & 0xff);
  view.setUint32(13, meta.mapHash >>> 0, true);
  view.setUint16(17, meta.weightsVersion & 0xffff, true);
  view.setUint8(19, 0);
  view.setUint32(20, descriptor.length, true);
  out.set(descriptor, HEADER_BYTES);
  for (let i = 0; i < sorted.length; i++) {
    const at = offset + i * ENTRY_BYTES;
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
