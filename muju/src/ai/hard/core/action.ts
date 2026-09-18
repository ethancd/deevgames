/**
 * Packed 32-bit actions (DESIGN §3.2, §4). Layout:
 *
 *   bits  0..2   kind   (AKind, 0..7)
 *   bits  3..9   a      (7 bits: slot | defId | keep-set index)
 *   bits 10..16  b      (7 bits: destination / target / spawn square)
 *   bits 17..23  c      (7 bits: MOVE cost 1..4 cached, else 0)
 *
 * A `PA` is therefore always a non-negative 24-bit integer, safe as an
 * `Int32Array` element and as a `Map` key.
 *
 * Fields are masked, not validated, on the encode path: `paMake` sits inside
 * the generators' inner loops. Callers pass in-range values; the range of
 * every field is pinned by `tests/ai/hard/action.test.ts`.
 *
 * `toAIAction`/`fromAIAction`/`keepSetIds` cross the packed/canonical
 * boundary and therefore need unit ids. See `unitIdFor` for the exact,
 * reversible derivation used for units bought during the search.
 */
import { DEAD, MAX_SLOTS, type PackedState, type Slot, type Square } from '../types';
import type { AIAction } from '../../types';
import { DEF_ID, DEF_INDEX } from './catalog';
import { SQ_X, SQ_Y } from './tables';

export type PA = number;

export const AKind = {
  END_PLACE: 0,
  MOVE: 1,
  ATTACK: 2,
  BUY: 3,
  PROMOTE: 4,
  END_ACTION: 5,
  PAY_UPKEEP: 6,
  RESIGN: 7,
} as const;
export type AKind = (typeof AKind)[keyof typeof AKind];

const KIND_MASK = 0x7;
const FIELD_MASK = 0x7f;
const A_SHIFT = 3;
const B_SHIFT = 10;
const C_SHIFT = 17;

/** No legal action encodes to 0 other than `END_PLACE`, so callers that need a
 * "no action" sentinel use this instead. */
export const PA_NONE = -1;

export function paMake(kind: AKind, a = 0, b = 0, c = 0): PA {
  return (kind & KIND_MASK) | ((a & FIELD_MASK) << A_SHIFT) | ((b & FIELD_MASK) << B_SHIFT) | ((c & FIELD_MASK) << C_SHIFT);
}

export function paKind(a: PA): AKind {
  return (a & KIND_MASK) as AKind;
}

/** MOVE/ATTACK/PROMOTE: slot. BUY: defId. PAY_UPKEEP: keep-set index. */
export function paA(a: PA): number {
  return (a >>> A_SHIFT) & FIELD_MASK;
}

/** MOVE: destination square. ATTACK: target square. BUY: spawn square. */
export function paB(a: PA): number {
  return (a >>> B_SHIFT) & FIELD_MASK;
}

/** MOVE: cost (1..4) as a cache; 0 otherwise. */
export function paC(a: PA): number {
  return (a >>> C_SHIFT) & FIELD_MASK;
}

export class PaDecodeError extends Error {}

/**
 * Node-local keep-set list for `PAY_UPKEEP`; the index is carried in `paA`.
 * `masks` is 64 entries of 4 words each — a 128-bit slot bitmask per entry.
 */
export interface KeepSetTable {
  masks: Uint32Array;
  count: number;
}

export const KEEP_SET_CAPACITY = 64;
const KEEP_SET_WORDS = MAX_SLOTS >>> 5;

export function newKeepSetTable(): KeepSetTable {
  return { masks: new Uint32Array(KEEP_SET_CAPACITY * KEEP_SET_WORDS), count: 0 };
}

/** Empties the table without reallocating (the search reuses one per ply). */
export function keepSetReset(keep: KeepSetTable): void {
  keep.masks.fill(0);
  keep.count = 0;
}

export function keepSetAdd(keep: KeepSetTable, index: number, slot: Slot): void {
  keep.masks[index * KEEP_SET_WORDS + (slot >>> 5)] |= 1 << (slot & 31);
}

export function keepSetHas(keep: KeepSetTable, index: number, slot: Slot): boolean {
  return (keep.masks[index * KEEP_SET_WORDS + (slot >>> 5)] & (1 << (slot & 31))) !== 0;
}

const PLAYER_OF_SIDE = ['white', 'black'] as const;

/**
 * A live slot with no `originIds` entry is a unit bought during the search.
 * The canonical engine names those `unit-<player>-<turnNumber>-<n>`, where `n`
 * is the FIRST index not already taken by a unit on the board
 * (`nextUnitId`, simulate.ts:14-20). This reproduces it: the k-th such slot in
 * ascending slot order takes the (k+1)-th free index of that prefix, skipping
 * any index an `originIds` entry already occupies. `slotForId` inverts it
 * exactly, so `fromAIAction(p, toAIAction(p, a, k), k)` restores `a` for every
 * kind.
 *
 * Limitation, by construction: `originIds` is cold data that `make` does not
 * extend (DESIGN §3.1), so a slot can only be identified by its position in
 * slot order. That reproduces the canonical ids exactly as long as no unit
 * bought during the same turn has since died — once one has, the canonical
 * engine frees its index for the next buy while slot order does not record the
 * swap. `verify/replay.ts` (M14) is the authority on the ids a decoded turn
 * carries: it replays the line through `applyAction` and truncates at the
 * first divergence (DESIGN §6.4 layer 3).
 */
export function unitIdFor(p: PackedState, slot: Slot): string {
  if (p.sq[slot] === DEAD) throw new PaDecodeError(`unitIdFor: slot ${slot} is dead`);
  const known = p.originIds[slot];
  if (known !== undefined && known !== '') return known;
  const owner = p.owner[slot];
  let rank = 0;
  for (let s = 0; s < slot; s++) {
    if (p.sq[s] === DEAD || p.owner[s] !== owner) continue;
    const id = p.originIds[s];
    if (id === undefined || id === '') rank++;
  }
  const prefix = `unit-${PLAYER_OF_SIDE[owner]}-${p.turnNumber}-`;
  for (let n = 0; n <= MAX_SLOTS * 2; n++) {
    if (originIdsHas(p, prefix + n)) continue;
    if (rank === 0) return prefix + n;
    rank--;
  }
  throw new PaDecodeError(`unitIdFor: no free id for slot ${slot} under "${prefix}"`);
}

/** True when some live slot carries exactly this `originIds` entry. */
function originIdsHas(p: PackedState, id: string): boolean {
  for (let s = 0; s < MAX_SLOTS; s++) {
    if (p.sq[s] === DEAD) continue;
    const known = p.originIds[s];
    if (known !== undefined && known !== '' && known === id) return true;
  }
  return false;
}

/** Inverse of `unitIdFor`. Throws `PaDecodeError` on an id no live slot carries. */
export function slotForId(p: PackedState, id: string): Slot {
  for (let s = 0; s < MAX_SLOTS; s++) {
    if (p.sq[s] === DEAD) continue;
    const known = p.originIds[s];
    if (known !== undefined && known !== '' && known === id) return s;
  }
  for (let s = 0; s < MAX_SLOTS; s++) {
    if (p.sq[s] === DEAD) continue;
    const known = p.originIds[s];
    if (known !== undefined && known !== '') continue;
    if (unitIdFor(p, s) === id) return s;
  }
  throw new PaDecodeError(`fromAIAction: unknown unit id "${id}"`);
}

function posOf(s: Square): { x: number; y: number } {
  return { x: SQ_X[s], y: SQ_Y[s] };
}

/** Slot bitmask of keep-set `index`, as canonical unit ids in ascending slot order. */
export function keepSetIds(p: PackedState, keep: KeepSetTable, index: number): string[] {
  if (index < 0 || index >= KEEP_SET_CAPACITY) throw new PaDecodeError(`keepSetIds: index ${index} out of range`);
  const out: string[] = [];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD) continue;
    if (keepSetHas(keep, index, slot)) out.push(unitIdFor(p, slot));
  }
  return out;
}

export function toAIAction(p: PackedState, a: PA, keep: KeepSetTable): AIAction {
  const kind = paKind(a);
  switch (kind) {
    case AKind.END_PLACE:
      return { type: 'END_PLACE_PHASE' };
    case AKind.END_ACTION:
      return { type: 'END_ACTION_PHASE' };
    case AKind.MOVE:
      return { type: 'MOVE', unitId: unitIdFor(p, paA(a)), to: posOf(paB(a)) };
    case AKind.ATTACK:
      return { type: 'ATTACK', unitId: unitIdFor(p, paA(a)), targetPosition: posOf(paB(a)) };
    case AKind.BUY: {
      const defId = paA(a);
      if (defId >= DEF_ID.length) throw new PaDecodeError(`toAIAction: unknown defId ${defId}`);
      return { type: 'BUY_UNIT', definitionId: DEF_ID[defId], position: posOf(paB(a)) };
    }
    case AKind.PROMOTE:
      return { type: 'PROMOTE_UNIT', unitId: unitIdFor(p, paA(a)) };
    case AKind.PAY_UPKEEP:
      return { type: 'PAY_UPKEEP', keepUnitIds: keepSetIds(p, keep, paA(a)) };
    case AKind.RESIGN:
      return { type: 'RESIGN' };
  }
}

/** Throws `PaDecodeError` on an unknown unit id, definition id or keep-set. */
export function fromAIAction(p: PackedState, a: AIAction, keep: KeepSetTable): PA {
  switch (a.type) {
    case 'END_PLACE_PHASE':
      return paMake(AKind.END_PLACE);
    case 'END_ACTION_PHASE':
      return paMake(AKind.END_ACTION);
    case 'RESIGN':
      return paMake(AKind.RESIGN);
    case 'MOVE':
      return paMake(AKind.MOVE, slotForId(p, a.unitId), a.to.y * 10 + a.to.x);
    case 'ATTACK':
      return paMake(AKind.ATTACK, slotForId(p, a.unitId), a.targetPosition.y * 10 + a.targetPosition.x);
    case 'PROMOTE_UNIT':
      return paMake(AKind.PROMOTE, slotForId(p, a.unitId));
    case 'BUY_UNIT': {
      const defId = DEF_INDEX.get(a.definitionId);
      if (defId === undefined) throw new PaDecodeError(`fromAIAction: unknown definition id "${a.definitionId}"`);
      return paMake(AKind.BUY, defId, a.position.y * 10 + a.position.x);
    }
    case 'PAY_UPKEEP': {
      const index = findKeepSet(p, keep, a.keepUnitIds);
      if (index < 0) throw new PaDecodeError(`fromAIAction: keep-set {${a.keepUnitIds.join(',')}} is not in the node's keep-set table`);
      return paMake(AKind.PAY_UPKEEP, index);
    }
  }
}

/** Index of the keep-set whose slot bitmask is exactly `ids`, or -1. */
export function findKeepSet(p: PackedState, keep: KeepSetTable, ids: readonly string[]): number {
  const wanted = new Uint32Array(KEEP_SET_WORDS);
  for (const id of ids) {
    const slot = slotForId(p, id);
    wanted[slot >>> 5] |= 1 << (slot & 31);
  }
  for (let i = 0; i < keep.count; i++) {
    let same = true;
    for (let w = 0; w < KEEP_SET_WORDS; w++) {
      if (keep.masks[i * KEEP_SET_WORDS + w] !== wanted[w]) {
        same = false;
        break;
      }
    }
    if (same) return i;
  }
  return -1;
}
