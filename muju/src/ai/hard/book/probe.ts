/**
 * Book probing (DESIGN §4.17 `book/probe.ts`, §5.14).
 *
 * A book entry is keyed by the CANONICAL key of the position: the smaller of
 * `Kpos` and the `Kpos` of the position rotated 180° with the seats swapped.
 * Muju's board and its two home corners are symmetric under that map
 * (`core/tables.ts rot180`, `CORNER = [0, 99]`), so one entry serves both
 * seats and the book halves in size; `negated` tells the caller which side of
 * the symmetry it landed on, which is what `flags` bit 0 records.
 *
 * `probeBook` returns the INDEX of the candidate whose end position the entry
 * names, or -1. Book drift — an entry naming a turn this generator no longer
 * produces — therefore falls through to the search instead of forcing a move
 * the engine cannot play (DESIGN §4.17: "drift falls through").
 *
 * M14 ships `EMPTY_BOOK` and this probe; M18's builder fills real books.
 */
import { DEAD, MAX_SLOTS, type PackedState, type Side } from '../types';
import { BOARD, rot180 } from '../core/tables';
import { allocState, copyState, Replica } from '../core/state';
import { activeCatalog } from '../core/catalog';
import type { Turn } from '../gen/turn';
import type { Book } from '../config';

/** Scratch for the mirrored position. The engine is single-threaded and
 * `canonicalKey` never recurses, so one buffer is enough. */
const MIRROR: PackedState = allocState();
let mirrorReplica: Replica | null = null;

function replicaFor(p: PackedState): Replica {
  if (mirrorReplica === null || mirrorReplica.cat.signature !== p.catalogSignature) {
    mirrorReplica = new Replica(activeCatalog());
  }
  return mirrorReplica;
}

/**
 * `p` rotated 180° with the seats swapped, written into `MIRROR`.
 *
 * Every square-indexed array is remapped through `rot180`, every side-indexed
 * one is swapped, and `side` flips. The handicap is a property of the BLACK
 * seat, so it does not survive a seat swap: a handicapped position has no
 * mirror image, which is exactly why `Book.handicap` is part of the header and
 * a book is only ever probed at its own handicap.
 */
function mirrorInto(p: PackedState): PackedState {
  const m = MIRROR;
  copyState(m, p);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    m.sq[slot] = s === DEAD ? DEAD : rot180(s);
    m.owner[slot] = p.sq[slot] === DEAD ? p.owner[slot] : ((1 - p.owner[slot]) as Side);
  }
  for (let s = 0; s < BOARD; s++) {
    const r = rot180(s);
    m.reserve[r] = p.reserve[s];
    m.initialReserve[r] = p.initialReserve[s];
  }
  m.bank[0] = p.bank[1];
  m.bank[1] = p.bank[0];
  m.gained[0] = p.gained[1];
  m.gained[1] = p.gained[0];
  m.reviewUpkeep[0] = p.reviewUpkeep[1];
  m.reviewUpkeep[1] = p.reviewUpkeep[0];
  m.materialCc[0] = p.materialCc[1];
  m.materialCc[1] = p.materialCc[0];
  m.pstSumCc[0] = p.pstSumCc[1];
  m.pstSumCc[1] = p.pstSumCc[0];
  m.side = (1 - p.side) as Side;
  replicaFor(p).rehash(m);
  return m;
}

/** True when `(aLo, aHi) < (bLo, bHi)` as an unsigned 64-bit pair. */
function less(aLo: number, aHi: number, bLo: number, bHi: number): boolean {
  const ah = aHi >>> 0;
  const bh = bHi >>> 0;
  if (ah !== bh) return ah < bh;
  return (aLo >>> 0) < (bLo >>> 0);
}

/** DESIGN §4.17: `min(Kpos, Kpos∘rot180)` with the seat swap. */
export function canonicalKey(p: PackedState): { lo: number; hi: number; negated: boolean } {
  const m = mirrorInto(p);
  if (less(m.kposLo, m.kposHi, p.kposLo, p.kposHi)) {
    return { lo: m.kposLo >>> 0, hi: m.kposHi >>> 0, negated: true };
  }
  return { lo: p.kposLo >>> 0, hi: p.kposHi >>> 0, negated: false };
}

/**
 * DESIGN §4.17. Index of the candidate the book names, or -1.
 *
 * The entry stores the canonical key of the position the book line REACHES
 * (`turnLo`/`turnHi`), so the match is on each candidate's own end position,
 * canonicalised the same way. A candidate list that no longer contains the
 * book's line returns -1 and the caller searches normally.
 */
export function probeBook(book: Book, p: PackedState, turns: Turn[], n: number): number {
  if (book.size === 0 || n <= 0) return -1;
  const key = canonicalKey(p);
  const entry = book.lookup(key.lo, key.hi);
  if (entry === null) return -1;
  const wantLo = entry.turnLo >>> 0;
  const wantHi = entry.turnHi >>> 0;
  for (let i = 0; i < n; i++) {
    if ((turns[i].endLo >>> 0) === wantLo && (turns[i].endHi >>> 0) === wantHi) return i;
  }
  return -1;
}
