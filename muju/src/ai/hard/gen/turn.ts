/**
 * The macro-turn record, its pool, its abstract signature and its decoder
 * (DESIGN §4.13 `gen/turn.ts`).
 *
 * A `Turn` completes the mover's Act, then upkeep and Prepare, ending at
 * END_PLACE (the opponent's Act) or immediately when an action has ended
 * the game (a lethal `ATTACK` that eliminates, or a move the home-checkmate
 * gate resolves). `endLo`/`endHi` are the `Kpos` of the position the boundary
 * produced, which is what the macro TT, the book and the suites key on
 * (DESIGN §3.3).
 *
 * Search-owned `Turn` records belong to a fixed `TurnPool`. An upkeep mask is
 * copied into its retained record so a later candidate cannot replace it.
 */
import type { AIAction } from '../../types';
import { DEAD, MAX_SLOTS, MAX_TURN_ACTIONS, Result, type Centi, type PackedState } from '../types';
import { AKind, paA, paB, paKind, toAIAction, type KeepSetTable } from '../core/action';
import { activeCatalog } from '../core/catalog';
import { Replica, allocState, copyState, newUndo, type Undo } from '../core/state';

/** DESIGN §4.13. Bit flags describing what a turn does; ordering and quiescence read them. */
export const TurnFlag = {
  KILL: 1,
  CLEAVE_CHAIN: 2,
  HOME_ENTRY: 4,
  HOME_RESCUE: 8,
  SPAWN_DENY: 16,
  PURCHASE: 32,
  PROMOTION: 64,
  RETREAT: 128,
  QUIET: 256,
  FORCED: 512,
  BOOK: 1024,
  HOME_RACE: 2048,
  HOME_FORTIFY: 4096,
  DISRUPT: 8192,
} as const;
export type TurnFlag = (typeof TurnFlag)[keyof typeof TurnFlag];

/** The tactical flags `search/quiesce.ts isTacticalTurn` (M14) keys on; a turn
 * carrying none of them is `QUIET`. */
export const TACTICAL_FLAGS =
  TurnFlag.KILL | TurnFlag.CLEAVE_CHAIN | TurnFlag.HOME_ENTRY | TurnFlag.HOME_RESCUE | TurnFlag.HOME_RACE | TurnFlag.HOME_FORTIFY;

export interface Turn {
  /** Packed `PA`s, capacity `MAX_TURN_ACTIONS`; owned by the pool. */
  actions: Int32Array;
  count: number;
  /** Owned slot mask for this turn's PAY_UPKEEP (encoded with index zero). */
  keepMask?: Uint32Array;
  /** `Kpos` after the turn boundary. */
  endLo: number;
  endHi: number;
  /** 32-bit abstract signature (killers/counter-moves). */
  sig: number;
  flags: number;
  /** Ordering score, in centi-crystals, from the mover's point of view. */
  gainCc: Centi;
  /** Place-plan index, or -1 when the turn bought and promoted nothing. */
  place: number;
  /** SEE analogue: value the opponent can remove after this turn. Written by `search/order.ts` (M14). */
  hangCc: Centi;
}

function newTurn(): Turn {
  return {
    actions: new Int32Array(MAX_TURN_ACTIONS),
    count: 0,
    endLo: 0,
    endHi: 0,
    sig: 0,
    flags: 0,
    gainCc: 0,
    place: -1,
    hangCc: 0,
  };
}

/** Resets every scalar field; `actions` is left as it is (only `count` entries are ever read). */
function resetTurn(t: Turn): Turn {
  t.count = 0;
  t.keepMask = undefined;
  t.endLo = 0;
  t.endHi = 0;
  t.sig = 0;
  t.flags = 0;
  t.gainCc = 0;
  t.place = -1;
  t.hangCc = 0;
  return t;
}

/**
 * Fixed-size pool of `Turn` records (DESIGN §4.13). Every object is allocated
 * in the constructor; `alloc()` hands out the next free one and `reset()`
 * makes the whole pool free again. `alloc()` on a full pool throws rather than
 * growing — callers with a bounded appetite (`ActionSearch.run` keeps at most
 * `cfg.keep`) read `free` first and take what is there.
 */
export class TurnPool {
  readonly capacity: number;
  private readonly turns: Turn[];
  private n = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`TurnPool: capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.turns = new Array<Turn>(capacity);
    for (let i = 0; i < capacity; i++) this.turns[i] = newTurn();
  }

  reset(): void {
    this.n = 0;
  }

  alloc(): Turn {
    if (this.n >= this.capacity) throw new RangeError(`TurnPool: capacity ${this.capacity} exhausted`);
    return resetTurn(this.turns[this.n++]);
  }

  get used(): number {
    return this.n;
  }

  /** Records still available before `alloc()` throws. */
  get free(): number {
    return this.capacity - this.n;
  }
}

/** Deep copy the owned upkeep choice as well as the action buffer. */
export function copyTurnRecord(dst: Turn, src: Turn): Turn {
  dst.actions.set(src.actions.subarray(0, src.count));
  dst.count = src.count; dst.keepMask = src.keepMask?.slice();
  dst.endLo = src.endLo; dst.endHi = src.endHi; dst.sig = src.sig;
  dst.flags = src.flags; dst.gainCc = src.gainCc; dst.place = src.place; dst.hangCc = src.hangCc;
  return dst;
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ v, 0x01000193) | 0;
}

/**
 * 32-bit abstract signature of a turn, used as the killer/counter-move key
 * (DESIGN §4.13, §4.16). It is deliberately *abstract*: slots are resolved to
 * the squares they occupy at the START of the turn, so the same idea played
 * from a transposed position hashes the same way, and neither a move's cached
 * cost nor the pool record's identity takes part.
 *
 * `p` must be the pre-turn state the `Turn` was generated from. A slot with no
 * square there was bought during the turn and hashes by slot index instead.
 */
export function turnSignature(p: PackedState, t: Turn): number {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < t.count; i++) {
    const a = t.actions[i];
    const kind = paKind(a);
    let origin: number;
    switch (kind) {
      case AKind.MOVE:
      case AKind.ATTACK:
      case AKind.PROMOTE: {
        const slot = paA(a);
        const s = p.sq[slot];
        origin = s === DEAD ? 100 + slot : s;
        break;
      }
      case AKind.BUY:
        origin = 300 + paA(a);
        break;
      case AKind.PAY_UPKEEP:
        origin = 400 + paA(a);
        if (t.keepMask) {
          for (let sq = 0; sq < 100; sq++) {
            const slot = p.pieceAt[sq];
            if (slot >= 0 && (t.keepMask[slot >>> 5] & (1 << (slot & 31))) !== 0) h = mix(h, 700 + sq);
          }
        }
        break;
      case AKind.END_PLACE:
      case AKind.END_ACTION:
      case AKind.RESIGN:
        origin = 600 + kind;
        break;
    }
    h = mix(h, (kind << 24) ^ (origin << 12) ^ paB(a));
  }
  return h >>> 0;
}

/** Resolve an owned choice; legacy hand-authored turns require an explicit table. */
export function keepForTurn(t: Turn, fallback?: KeepSetTable): KeepSetTable {
  const keep = t.keepMask === undefined ? fallback : { masks: t.keepMask, count: 1 };
  if (t.keepMask !== undefined && t.keepMask.length !== (MAX_SLOTS >>> 5)) throw new Error('Invalid turn keep mask');
  for (let i = 0; i < t.count; i++) {
    if (paKind(t.actions[i]) !== AKind.PAY_UPKEEP) continue;
    const index = paA(t.actions[i]);
    if (!keep || index >= keep.count || keep.masks.length < (index + 1) * (MAX_SLOTS >>> 5)) {
      throw new Error('Missing turn upkeep choice');
    }
  }
  return keep ?? { masks: new Uint32Array(0), count: 0 };
}

// --- decoding ----------------------------------------------------------------

/**
 * Forward-only scratch for `decodeTurn`. Later actions use the post-action
 * board (including upkeep releases), and `toAIAction` derives a unit id from the state it is handed
 * (`core/action.ts unitIdFor`), so the decoder has to walk the turn forward
 * over a copy rather than decode every action against the root. The engine is
 * single-threaded, so one module-level copy suffices; `decodeTurn` is a
 * root/PV-path function, never an inner-loop one.
 */
const DECODE_STATE: PackedState = allocState();
const DECODE_UNDO: Undo = newUndo();
let decodeReplica: Replica | null = null;

function replicaFor(p: PackedState): Replica {
  if (decodeReplica === null || decodeReplica.cat.signature !== p.catalogSignature) {
    decodeReplica = new Replica(activeCatalog());
  }
  return decodeReplica;
}

/** A decode failure retains the decodable prefix for canonical fault reporting. */
export class TurnDecodeError extends Error {
  constructor(readonly actions: AIAction[], readonly index: number) {
    super(`Invalid macro action ${index}`);
  }
}

/**
 * The canonical `AIAction[]` a turn dispatches, in order (DESIGN §4.13).
 * `p` is the pre-turn state and `keep` the keep-set table the turn's
 * `PAY_UPKEEP` index refers to. `verify/replay.ts` (M14) is the authority on
 * what the canonical engine actually accepts — it replays this list through
 * `applyAction` and truncates at the first divergence.
 */
export function decodeTurn(p: PackedState, t: Turn, keep: KeepSetTable): AIAction[] {
  const rep = replicaFor(p);
  keep = keepForTurn(t, keep);
  copyState(DECODE_STATE, p);
  rep.resetUndoScratch();
  const out: AIAction[] = new Array<AIAction>(t.count);
  for (let i = 0; i < t.count; i++) {
    const a = t.actions[i];
    out[i] = toAIAction(DECODE_STATE, a, keep);
    if (DECODE_STATE.result !== Result.ONGOING || DECODE_STATE.side !== p.side || !rep.isLegal(DECODE_STATE, a, keep)) {
      throw new TurnDecodeError(out.slice(0, i + 1), i);
    }
    // Forward-only: the undo record of the action just applied is never
    // replayed, so both stacks are dropped before the next `make`.
    DECODE_UNDO.top = 0;
    rep.resetUndoScratch();
    rep.make(DECODE_STATE, a, DECODE_UNDO, keep);
  }
  return out;
}
