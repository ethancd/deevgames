/**
 * Spawn geometry (DESIGN §4.6, §5.8).
 *
 * The canonical rule (`spawning.ts:98-153`) is: every living unit of a side is
 * an ANCHOR; its rectangle is the axis-aligned box between that side's start
 * corner and the unit's square; an anchor is UNBLOCKED when no enemy unit
 * stands anywhere inside its rectangle; a square is a legal spawn square when
 * it is empty and lies inside at least one unblocked rectangle.
 * `RECT[side][s]` (`core/tables.ts`) is that box as a bitboard, so the whole
 * rule costs four machine words per anchor.
 *
 * `tests/ai/hard/spawn.test.ts` pins `spawnInfo().legal` against
 * `getAllSpawnPositions` and `isLegalSpawn` against `isValidSpawnPosition` as
 * sets on 50,000 generated positions; the M5 fuzzer re-checks the same
 * equality through every BUY it generates.
 */
import { DEAD, MAX_SLOTS, NO_SLOT, PEND_STRIDE, type PackedState, type Side, type Slot, type Square } from '../types';
import {
  bbAndNot,
  bbCopy,
  bbCount,
  bbHas,
  bbIntersects,
  bbIsEmpty,
  bbNew,
  bbNext,
  bbOr,
  bbReserveSum,
  bbSet,
  bbZero,
  type BB,
} from './bits';
import { BOARD, RECT, SQ_X, SQ_Y, WHITE } from './tables';

export interface SpawnInfo {
  /** Empty squares the side may buy onto this turn. */
  legal: BB;
  /** `popcount(legal)`. */
  area: number;
  /** Squares of the side's own units whose rectangle holds no enemy. */
  anchors: BB;
  /**
   * `anchorDepth` (DESIGN §5.8): `max(x + y)` over unblocked anchors for
   * White, `max(18 − x − y)` for Black. `0` when the side has no unblocked
   * anchor at all — `anchors` is then empty, which is how callers tell that
   * case apart from a lone anchor on the side's own corner.
   */
  depth: number;
  /** `Σ reserve[q]` over `legal`. */
  reserveSum: number;
}

export function newSpawnInfo(): SpawnInfo {
  return { legal: bbNew(), area: 0, anchors: bbNew(), depth: 0, reserveSum: 0 };
}

const SC_ENEMY = bbNew();
const SC_MASK = bbNew();
const SC_CANDIDATES = bbNew();

/** Occupancy of `side`'s enemy, straight out of the maintained `occBy` lanes. */
function enemyOcc(p: PackedState, side: Side, dst: BB): BB {
  const base = (1 - side) * 4;
  dst[0] = p.occBy[base];
  dst[1] = p.occBy[base + 1];
  dst[2] = p.occBy[base + 2];
  dst[3] = p.occBy[base + 3];
  return dst;
}

function clearSquare(d: BB, s: Square): void {
  d[s >>> 5] &= ~(1 << (s & 31));
}

function depthOf(side: Side, s: Square): number {
  return side === WHITE ? SQ_X[s] + SQ_Y[s] : 18 - SQ_X[s] - SQ_Y[s];
}

/** `spawnInfo(p, side, out).legal` ≡ `getAllSpawnPositions(side, board)` as a set. */
export function spawnInfo(p: PackedState, side: Side, out: SpawnInfo): SpawnInfo {
  const enemy = enemyOcc(p, side, SC_ENEMY);
  const rect = RECT[side];
  bbZero(out.legal);
  bbZero(out.anchors);
  let depth = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    const box = rect[s];
    if (bbIntersects(box, enemy)) continue;
    bbSet(out.anchors, s);
    bbOr(out.legal, out.legal, box);
    const d = depthOf(side, s);
    if (d > depth) depth = d;
  }
  bbAndNot(out.legal, out.legal, p.occ);
  out.area = bbCount(out.legal);
  out.depth = bbIsEmpty(out.anchors) ? 0 : depth;
  out.reserveSum = bbReserveSum(out.legal, p.reserve);
  return out;
}

/** `isLegalSpawn(p, side, s)` ≡ `isValidSpawnPosition({x, y}, side, board)` (spawning.ts:123-153). */
export function isLegalSpawn(p: PackedState, side: Side, s: Square, addedEnemy?: BB): boolean {
  if (s < 0 || s >= BOARD) return false;
  if (p.pieceAt[s] !== NO_SLOT || (addedEnemy !== undefined && bbHas(addedEnemy, s))) return false;
  const enemy = enemyOcc(p, side, SC_ENEMY);
  if (addedEnemy !== undefined) bbOr(enemy, enemy, addedEnemy);
  const rect = RECT[side];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const a = p.sq[slot];
    if (a === DEAD || p.owner[slot] !== side) continue;
    const box = rect[a];
    if (!bbHas(box, s)) continue;
    if (!bbIntersects(box, enemy)) return true;
  }
  return false;
}

/**
 * The legal spawn mask `side` would have if the unit in `slot` were gone —
 * KF's "what if this anchor dies" primitive. Works for either owner: removing
 * one of `side`'s own units drops an anchor and frees its square, removing an
 * enemy unit unblocks whatever rectangles it was sitting in.
 */
export function spawnMaskWithout(p: PackedState, side: Side, slot: Slot, out: BB): BB {
  const gone = p.sq[slot];
  const enemy = enemyOcc(p, side, SC_ENEMY);
  if (gone !== DEAD && p.owner[slot] !== side) clearSquare(enemy, gone);
  const rect = RECT[side];
  bbZero(SC_MASK);
  for (let other = 0; other < MAX_SLOTS; other++) {
    if (other === slot) continue;
    const a = p.sq[other];
    if (a === DEAD || p.owner[other] !== side) continue;
    const box = rect[a];
    if (bbIntersects(box, enemy)) continue;
    bbOr(SC_MASK, SC_MASK, box);
  }
  bbAndNot(out, SC_MASK, p.occ);
  if (gone !== DEAD && bbHas(SC_MASK, gone)) bbSet(out, gone);
  return out;
}

/**
 * The legal spawn mask `side` would have after placing a unit on `extra` —
 * KF's "what if I buy here" primitive. `extra` gains an anchor (unless an
 * enemy already blocks its rectangle) and loses its own availability.
 */
export function spawnMaskWith(p: PackedState, side: Side, extra: Square, out: BB): BB {
  const enemy = enemyOcc(p, side, SC_ENEMY);
  const rect = RECT[side];
  bbZero(SC_MASK);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const a = p.sq[slot];
    if (a === DEAD || p.owner[slot] !== side) continue;
    const box = rect[a];
    if (bbIntersects(box, enemy)) continue;
    bbOr(SC_MASK, SC_MASK, box);
  }
  const extraBox = rect[extra];
  if (!bbIntersects(extraBox, enemy)) bbOr(SC_MASK, SC_MASK, extraBox);
  bbAndNot(out, SC_MASK, p.occ);
  clearSquare(out, extra);
  return out;
}

/**
 * How many of `victimSide`'s currently-unblocked anchors an enemy unit
 * standing on `s` would void. `victimSide`'s own corner lies inside every one
 * of its rectangles, so an intruder there voids them all — DESIGN §4.6's
 * "corner = all" falls out of the geometry rather than being special-cased.
 */
export function anchorsVoidedBy(p: PackedState, victimSide: Side, s: Square): number {
  const enemy = enemyOcc(p, victimSide, SC_ENEMY);
  const rect = RECT[victimSide];
  let voided = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const a = p.sq[slot];
    if (a === DEAD || p.owner[slot] !== victimSide) continue;
    const box = rect[a];
    if (bbIntersects(box, enemy)) continue;
    if (bbHas(box, s)) voided++;
  }
  return voided;
}

/**
 * Working set for `blockingSet`. `RECT[side][a] ⊆ RECT[side][b]` exactly when
 * `a` is dominated by `b`, so only the Pareto-minimal rectangles constrain the
 * cover; on a 10×10 board those form an antichain of at most ten boxes.
 */
const MAX_COVER_RECTS = 16;
const COVER_RECTS: BB[] = Array.from({ length: MAX_COVER_RECTS }, () => bbNew());
const COVER_CAND_SQ = new Int32Array(BOARD);
const COVER_CAND_MASK = new Int32Array(BOARD);
const COVER_BEST = new Int32Array(MAX_COVER_RECTS + 1);
const COVER_PICK = new Int32Array(MAX_COVER_RECTS + 1);
let coverCandCount = 0;
let coverFull = 0;
let coverBestSize = 0;

/** Exact branch-and-bound: always extend the lowest uncovered rectangle. */
function coverVisit(covered: number, depth: number): void {
  if (covered === coverFull) {
    if (depth < coverBestSize) {
      coverBestSize = depth;
      for (let i = 0; i < depth; i++) COVER_BEST[i] = COVER_PICK[i];
    }
    return;
  }
  if (depth + 1 >= coverBestSize) return;
  let target = 0;
  while ((covered & (1 << target)) !== 0) target++;
  const bit = 1 << target;
  for (let c = 0; c < coverCandCount; c++) {
    const mask = COVER_CAND_MASK[c];
    if ((mask & bit) === 0) continue;
    COVER_PICK[depth] = COVER_CAND_SQ[c];
    coverVisit(covered | mask, depth + 1);
  }
}

/**
 * Minimum number of squares drawn from `candidate` (the whole board when
 * `candidate` is `null`) whose occupation by one enemy unit each voids EVERY
 * unblocked anchor of `side`. Only empty squares can be occupied, so the
 * candidate set is intersected with `~occ`, exactly as
 * `server/analysis/geometry.ts:25-50` does.
 *
 * Returns `0` when the side has no unblocked anchor left, `cap + 1` when the
 * true minimum exceeds `cap` or no selection covers every anchor, and
 * otherwise the minimum, with the witness squares written into `out`.
 */
export function blockingSet(p: PackedState, side: Side, candidate: BB | null, cap: number, out: BB): number {
  bbZero(out);
  const enemy = enemyOcc(p, side, SC_ENEMY);
  const rect = RECT[side];

  let rectCount = 0;
  for (let slot = 0; slot < MAX_SLOTS && rectCount < MAX_COVER_RECTS; slot++) {
    const a = p.sq[slot];
    if (a === DEAD || p.owner[slot] !== side) continue;
    const box = rect[a];
    if (bbIntersects(box, enemy)) continue;
    let dominated = false;
    for (let i = 0; i < rectCount; i++) {
      if (isSubset(COVER_RECTS[i], box)) {
        dominated = true;
        break;
      }
      if (isSubset(box, COVER_RECTS[i])) {
        bbCopy(COVER_RECTS[i], COVER_RECTS[rectCount - 1]);
        rectCount--;
        i--;
      }
    }
    if (dominated) continue;
    bbCopy(COVER_RECTS[rectCount++], box);
  }
  if (rectCount === 0) return 0;
  coverFull = (1 << rectCount) - 1;

  if (candidate === null) {
    SC_CANDIDATES[0] = 0xffffffff;
    SC_CANDIDATES[1] = 0xffffffff;
    SC_CANDIDATES[2] = 0xffffffff;
    SC_CANDIDATES[3] = 0x0000000f;
  } else {
    bbCopy(SC_CANDIDATES, candidate);
  }
  bbAndNot(SC_CANDIDATES, SC_CANDIDATES, p.occ);

  coverCandCount = 0;
  let reachable = 0;
  for (let s = bbNext(SC_CANDIDATES, -1); s >= 0; s = bbNext(SC_CANDIDATES, s)) {
    let mask = 0;
    for (let i = 0; i < rectCount; i++) if (bbHas(COVER_RECTS[i], s)) mask |= 1 << i;
    if (mask === 0) continue;
    if (mask === coverFull) {
      if (cap < 1) return cap + 1;
      bbSet(out, s);
      return 1;
    }
    COVER_CAND_SQ[coverCandCount] = s;
    COVER_CAND_MASK[coverCandCount] = mask;
    coverCandCount++;
    reachable |= mask;
  }
  if (reachable !== coverFull) return cap + 1;

  const limit = cap < MAX_COVER_RECTS ? cap : MAX_COVER_RECTS;
  coverBestSize = limit + 1;
  coverVisit(0, 0);
  if (coverBestSize > limit) return cap + 1;
  for (let i = 0; i < coverBestSize; i++) bbSet(out, COVER_BEST[i]);
  return coverBestSize;
}

/** `a ⊆ b`. */
function isSubset(a: BB, b: BB): boolean {
  return (a[0] & ~b[0]) === 0 && (a[1] & ~b[1]) === 0 && (a[2] & ~b[2]) === 0 && (a[3] & ~b[3]) === 0;
}

/** Paid arrivals that survive on the unchanged original board. A pending
 * square is never itself an anchor. All callers project this complete mask
 * only AFTER computing eligibility, preserving simultaneous arrival rules. */
export function validPendingMask(p: PackedState, side: Side, out: BB): BB {
  bbZero(out);
  const base = side * PEND_STRIDE;
  for (let q = 0; q < BOARD; q++) {
    if (p.pendDef[base + q] !== 0 && isLegalSpawn(p, side, q)) bbSet(out, q);
  }
  return out;
}

const SC_PRECEDING_ARRIVALS = bbNew();

/** Static-board next-Act forecast. The opponent's imminent Act resolves only
 * its own batch. The current mover's next Act follows the opponent's arrival
 * window, so those earlier arrivals also block paths. Each complete batch is
 * validated before any of its bodies is added; arrivals never anchor siblings.
 * Outputs must be distinct caller-owned masks. Slot/append order is untouched;
 * canonical resolution remains authoritative for actual unit creation. */
export function nextActProjection(
  p: PackedState, side: Side, ownArrivals: BB, occupancy: BB, precedingEnemy?: BB,
): void {
  bbZero(SC_PRECEDING_ARRIVALS);
  if (side === p.side) validPendingMask(p, (1 - side) as Side, SC_PRECEDING_ARRIVALS);
  bbZero(ownArrivals);
  const base = side * PEND_STRIDE;
  for (let q = 0; q < BOARD; q++) {
    if (p.pendDef[base + q] !== 0 && isLegalSpawn(p, side, q, SC_PRECEDING_ARRIVALS)) bbSet(ownArrivals, q);
  }
  bbOr(occupancy, p.occ, SC_PRECEDING_ARRIVALS);
  bbOr(occupancy, occupancy, ownArrivals);
  if (precedingEnemy !== undefined) bbCopy(precedingEnemy, SC_PRECEDING_ARRIVALS);
}

/** Number of currently valid paid commitments newly voided by an enemy
 * occupying `intruderSquare`. Every alternative supporting rectangle must
 * be blocked: losing just one anchor is insufficient. No state is mutated. */
export function pendingVoidedBy(p: PackedState, victimSide: Side, intruderSquare: Square): number {
  if (intruderSquare < 0 || intruderSquare >= BOARD) return 0;
  let count = 0;
  const base = victimSide * PEND_STRIDE;
  for (let q = 0; q < BOARD; q++) {
    if (p.pendDef[base + q] === 0 || !isLegalSpawn(p, victimSide, q)) continue;
    if (q === intruderSquare) { count++; continue; }
    // isLegalSpawn leaves SC_ENEMY set to the same original enemy occupancy.
    let survives = false;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD || p.owner[slot] !== victimSide) continue;
      const box = RECT[victimSide][s];
      if (bbHas(box, q) && !bbIntersects(box, SC_ENEMY) && !bbHas(box, intruderSquare)) {
        survives = true;
        break;
      }
    }
    if (!survives) count++;
  }
  return count;
}
