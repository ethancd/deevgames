/** Phasing book probing. Exact source-compatible BK03 books may select only
 * a generated candidate with the stored raw end-position key. EMPTY_BOOK is
 * the default; drift always falls through to search.
 */
import { DEAD, MAX_SLOTS, PEND_STRIDE, Result, type PackedState, type Side } from '../types';
import { BOARD, rot180 } from '../core/tables';
import { copyState, Replica } from '../core/state';
import { activeCatalog } from '../core/catalog';
import type { Turn } from '../gen/turn';
import { CONFIG_FEATURE_COUNT, PHASING_EVAL_SCHEMA, type Book, type BookEntry, type Weights } from '../config';

let mirrorReplica: Replica | null = null;

function replicaFor(p: PackedState): Replica {
  if (mirrorReplica === null || mirrorReplica.cat.signature !== p.catalogSignature) {
    mirrorReplica = new Replica(activeCatalog());
  }
  return mirrorReplica;
}

/**
 * `p` rotated 180° with the seats swapped, written into distinct caller-owned storage.
 *
 * Every square-indexed array is remapped through `rot180`, every side-indexed
 * one is swapped, and `side` flips. The handicap is a property of the BLACK
 * seat, so it does not survive a seat swap: a handicapped position has no
 * mirror image, which is exactly why `Book.handicap` is part of the header and
 * a book is only ever probed at its own handicap.
 */
export function mirrorPackedForBook(p: PackedState, m: PackedState): PackedState {
  if (m === p) throw new Error('book mirror requires distinct storage');
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
  m.pendIds.length = 0;
  for (let side = 0; side < 2; side++) for (let square = 0; square < BOARD; square++) {
    const from = side * PEND_STRIDE + square, to = (1 - side) * PEND_STRIDE + rot180(square);
    m.pendDef[to] = p.pendDef[from]; m.pendCost[to] = p.pendCost[from];
    m.pendOrd[to] = p.pendOrd[from];
    const id = p.pendIds[from];
    if (id !== undefined) m.pendIds[to] = id;
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
  if (p.result === Result.WHITE_WIN) m.result = Result.BLACK_WIN;
  else if (p.result === Result.BLACK_WIN) m.result = Result.WHITE_WIN;
  replicaFor(p).rehash(m);
  return m;
}

/** Raw keys are intentional. The bootstrap's canonical default-keep policy
 * breaks rotational symmetry on equal-cost square ties. Kturn includes phase,
 * remaining AP, attack flags and progress; partial/Prepare roots cannot alias
 * a full Act root as they could with Kpos. Asymmetric maps and
 * handicaps also cannot share a book entry. Mirroring state is still useful
 * for independent diagnostics, but must not merge evaluated positions.
 */
export function canonicalKey(p: PackedState): { lo: number; hi: number; negated: boolean } {
  return { lo: p.kturnLo >>> 0, hi: p.kturnHi >>> 0, negated: false };
}

/** Exact descriptor; changing weights at the same version also invalidates a book. */
export function bookCompatibility(p: PackedState, weights: Weights): { weightsKey: string; mapKey: string; rulesKey: string } {
  return {
    weightsKey: JSON.stringify([weights.featureSchema, weights.version, Array.from(weights.w), Array.from(weights.material)]),
    mapKey: JSON.stringify(Array.from(p.initialReserve)),
    rulesKey: JSON.stringify(['muju-phasing-1', PHASING_EVAL_SCHEMA, p.catalogSignature, p.handicap, p.victoryHome, p.drawRuleOn]),
  };
}
export function findCompatibleBookEntry(book: Book, p: PackedState, weights?: Weights): BookEntry | null {
  if (book.size === 0 || !weights || weights.featureSchema !== PHASING_EVAL_SCHEMA || weights.w.length !== CONFIG_FEATURE_COUNT
    || book.formatVersion !== 3 || book.handicap !== p.handicap || book.weightsVersion !== weights.version || p.result !== Result.ONGOING) return null;
  const compatibility = bookCompatibility(p, weights);
  if (book.weightsKey !== compatibility.weightsKey || book.mapKey !== compatibility.mapKey || book.rulesKey !== compatibility.rulesKey) return null;
  const key = canonicalKey(p);
  return book.lookup(key.lo, key.hi);
}
export function probeBook(book: Book, p: PackedState, turns: Turn[], n: number, weights?: Weights): number {
  if (n <= 0) return -1;
  const entry = findCompatibleBookEntry(book, p, weights);
  if (entry === null) return -1;
  const wantLo = entry.turnLo >>> 0;
  const wantHi = entry.turnHi >>> 0;
  for (let i = 0; i < n; i++) {
    if ((turns[i].endLo >>> 0) === wantLo && (turns[i].endHi >>> 0) === wantHi) return i;
  }
  return -1;
}
