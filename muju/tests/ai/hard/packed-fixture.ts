/**
 * Minimal `PackedState` builder for the M4 unit tests. `core/state.ts`
 * (`allocState`, `Replica.pack`) lands at M5; until then the primitives that
 * take a `PackedState` — `core/zobrist.ts` and `core/action.ts` — need a way
 * to construct one. This builder writes the fields those two modules read and
 * leaves the rest at their zero value; it is deliberately NOT a replica of
 * `pack` (the occupancy bitboards and incremental sums are not maintained).
 *
 * `putPending` (M2) writes the square-keyed commitment plane the same way:
 * `pendDef`/`pendCost` plus the derived bitboard and counters, so the Zobrist
 * `pend` plane has something to hash.
 */
import {
  DEAD,
  MAX_SLOTS,
  NO_SLOT,
  PEND_STRIDE,
  Reason,
  Result,
  type PackedState,
  type Side,
  type Square,
} from '../../../src/ai/hard/types';

export function allocPacked(): PackedState {
  return {
    sq: new Uint8Array(MAX_SLOTS).fill(DEAD),
    defId: new Uint8Array(MAX_SLOTS),
    owner: new Uint8Array(MAX_SLOTS),
    damage: new Uint8Array(MAX_SLOTS),
    atkCount: new Uint8Array(MAX_SLOTS),
    uflags: new Uint8Array(MAX_SLOTS),
    slotCount: 0,
    ord: new Int32Array(MAX_SLOTS),
    ordNext: 0,
    pieceAt: new Uint8Array(100).fill(NO_SLOT),
    occ: new Uint32Array(4),
    occBy: new Uint32Array(8),
    occTier: new Uint32Array(12),
    pendDef: new Uint8Array(2 * PEND_STRIDE),
    pendCost: new Uint8Array(2 * PEND_STRIDE),
    pendOrd: new Int32Array(2 * PEND_STRIDE),
    pendOrdNext: 0,
    pendBB: new Uint32Array(8),
    pendCount: new Uint8Array(2),
    pendCostSum: new Int32Array(2),
    reserve: new Uint8Array(100),
    initialReserve: new Uint8Array(100),
    bank: new Int32Array(2),
    gained: new Int32Array(2),
    side: 0,
    phase: 1,
    actions: 4,
    turnNumber: 1,
    upkeepPending: 0,
    clock: 0,
    progress: 0,
    handicap: 0,
    victoryHome: 1,
    drawRuleOn: 1,
    reviewUpkeep: new Uint8Array(2),
    result: Result.ONGOING,
    reason: Reason.NONE,
    kposLo: 0,
    kposHi: 0,
    kturnLo: 0,
    kturnHi: 0,
    occHash: 0,
    catalogSignature: 0,
    materialCc: new Int32Array(2),
    pstSumCc: new Int32Array(2),
    proverMode: 0,
    originIds: [],
    pendIds: [],
  };
}

export interface UnitSpec {
  slot: number;
  side: Side;
  defId: number;
  sq: Square;
  damage?: number;
  atkCount?: number;
  uflags?: number;
  /** Omit (or pass '') to mark the slot as bought during the search. */
  originId?: string;
}

export function putUnit(p: PackedState, spec: UnitSpec): PackedState {
  p.sq[spec.slot] = spec.sq;
  p.owner[spec.slot] = spec.side;
  p.defId[spec.slot] = spec.defId;
  p.damage[spec.slot] = spec.damage ?? 0;
  p.atkCount[spec.slot] = spec.atkCount ?? 0;
  p.uflags[spec.slot] = spec.uflags ?? 0;
  p.pieceAt[spec.sq] = spec.slot;
  if (spec.slot >= p.slotCount) p.slotCount = spec.slot + 1;
  // Slot order IS the birth sequence for a hand-built fixture; `Replica.check`
  // only demands the living sequences be distinct and below the counter.
  p.ord[spec.slot] = spec.slot;
  if (spec.slot >= p.ordNext) p.ordNext = spec.slot + 1;
  if (spec.originId !== undefined && spec.originId !== '') p.originIds[spec.slot] = spec.originId;
  return p;
}

export function clonePacked(p: PackedState): PackedState {
  return {
    ...p,
    sq: Uint8Array.from(p.sq),
    defId: Uint8Array.from(p.defId),
    owner: Uint8Array.from(p.owner),
    damage: Uint8Array.from(p.damage),
    atkCount: Uint8Array.from(p.atkCount),
    uflags: Uint8Array.from(p.uflags),
    ord: Int32Array.from(p.ord),
    pieceAt: Uint8Array.from(p.pieceAt),
    occ: Uint32Array.from(p.occ),
    occBy: Uint32Array.from(p.occBy),
    occTier: Uint32Array.from(p.occTier),
    pendDef: Uint8Array.from(p.pendDef),
    pendCost: Uint8Array.from(p.pendCost),
    pendOrd: Int32Array.from(p.pendOrd),
    pendBB: Uint32Array.from(p.pendBB),
    pendCount: Uint8Array.from(p.pendCount),
    pendCostSum: Int32Array.from(p.pendCostSum),
    reserve: Uint8Array.from(p.reserve),
    initialReserve: Uint8Array.from(p.initialReserve),
    bank: Int32Array.from(p.bank),
    gained: Int32Array.from(p.gained),
    reviewUpkeep: Uint8Array.from(p.reviewUpkeep),
    materialCc: Int32Array.from(p.materialCc),
    pstSumCc: Int32Array.from(p.pstSumCc),
    originIds: [...p.originIds],
    pendIds: [...p.pendIds],
  };
}

export interface PendingSpec {
  side: Side;
  defId: number;
  sq: Square;
  cost?: number;
  /** Omit to leave the commitment unnamed, as a search-time BUY leaves it. */
  pendId?: string;
}

export function putPending(p: PackedState, spec: PendingSpec): PackedState {
  const i = spec.side * PEND_STRIDE + spec.sq;
  p.pendDef[i] = spec.defId + 1;
  p.pendCost[i] = spec.cost ?? 0;
  p.pendBB[spec.side * 4 + (spec.sq >>> 5)] |= 1 << (spec.sq & 31);
  p.pendCount[spec.side] += 1;
  p.pendCostSum[spec.side] += spec.cost ?? 0;
  // Commitments are numbered in the order the fixture adds them, which is what
  // `applyBuyUnit`'s append does.
  p.pendOrd[i] = p.pendOrdNext++;
  if (spec.pendId !== undefined && spec.pendId !== '') p.pendIds[i] = spec.pendId;
  return p;
}
