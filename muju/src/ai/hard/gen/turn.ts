/**
 * The macro-turn record, its pool, its abstract signature and its decoder
 * (DESIGN §4.13 `gen/turn.ts`).
 *
 * A `Turn` is one whole macro turn: the place-plan prefix (`PAY_UPKEEP`, the
 * buys and promotions, `END_PLACE`), the action-phase line, and the terminal
 * action — `END_ACTION`, or nothing at all when the last action already ended
 * the game (a lethal `ATTACK` that eliminates, or a move the home-checkmate
 * gate resolves). `endLo`/`endHi` are the `Kpos` of the position the boundary
 * produced, which is what the macro TT, the book and the suites key on
 * (DESIGN §3.3).
 *
 * Every `Turn` object belongs to a `TurnPool`: the search allocates a fixed
 * number of them once and then recycles the whole pool per node, so nothing
 * under `gen/` allocates inside a search.
 */
import type { AIAction } from '../../types';
import { DEAD, MAX_TURN_ACTIONS, type Centi, type PackedState } from '../types';
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
  SUMMON_STRIKE: 4096,
} as const;
export type TurnFlag = (typeof TurnFlag)[keyof typeof TurnFlag];

/** The tactical flags `search/quiesce.ts isTacticalTurn` (M14) keys on; a turn
 * carrying none of them is `QUIET`. */
export const TACTICAL_FLAGS =
  TurnFlag.KILL | TurnFlag.CLEAVE_CHAIN | TurnFlag.HOME_ENTRY | TurnFlag.HOME_RESCUE | TurnFlag.HOME_RACE | TurnFlag.SUMMON_STRIKE;

export interface Turn {
  /** Packed `PA`s, capacity `MAX_TURN_ACTIONS`; owned by the pool. */
  actions: Int32Array;
  count: number;
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

// --- decoding ----------------------------------------------------------------

/**
 * Forward-only scratch for `decodeTurn`. A turn's later actions reference
 * units the turn's own earlier actions created (a `BUY` then a `MOVE` of the
 * bought unit), and `toAIAction` derives a unit id from the state it is handed
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

/**
 * The canonical `AIAction[]` a turn dispatches, in order (DESIGN §4.13).
 * `p` is the pre-turn state and `keep` the keep-set table the turn's
 * `PAY_UPKEEP` index refers to. `verify/replay.ts` (M14) is the authority on
 * what the canonical engine actually accepts — it replays this list through
 * `applyAction` and truncates at the first divergence.
 */
export function decodeTurn(p: PackedState, t: Turn, keep: KeepSetTable): AIAction[] {
  const rep = replicaFor(p);
  copyState(DECODE_STATE, p);
  rep.resetUndoScratch();
  const out: AIAction[] = new Array<AIAction>(t.count);
  for (let i = 0; i < t.count; i++) {
    const a = t.actions[i];
    out[i] = toAIAction(DECODE_STATE, a, keep);
    // Forward-only: the undo record of the action just applied is never
    // replayed, so both stacks are dropped before the next `make`.
    DECODE_UNDO.top = 0;
    rep.resetUndoScratch();
    rep.make(DECODE_STATE, a, DECODE_UNDO, keep);
  }
  return out;
}
