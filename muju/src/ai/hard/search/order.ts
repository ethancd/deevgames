/**
 * Macro-turn ordering (DESIGN §4.16 `order.ts`, §5.11.3).
 *
 * `scoreTurns` writes each candidate's ordering score into `Turn.gainCc` and
 * its SEE-analogue exposure into `Turn.hangCc`, then sorts the list in place,
 * best first. The order is DESIGN §5.11.3's list, top to bottom:
 *
 *   1 the TT turn (`endLo === bestEndLo`)                     +2,000,000
 *   2 `HOME_RESCUE` +1,500,000; `HOME_RACE`/`HOME_ENTRY`      +1,200,000
 *   3 proven kills by value per action
 *   4 − `hangCc` (the SEE analogue)
 *   5 `SPAWN_DENY` +300,000 × anchorsVoided; `SUMMON_STRIKE`  +250,000
 *   6 `CLEAVE_CHAIN`                                          +250,000
 *   7 killers +200,000; counter-move                          +150,000
 *   8 butterfly history
 *   9 the within-turn score of a quiet turn
 *
 * THE SEE ANALOGUE (DESIGN §5.11.3 item 4, the F2/F3/F7/F10 loss class).
 * `hangCc = Σ` material of my units `u` with `killActions[u] ≤ 4` under
 * `killTable(them, {allowBuys: true, allowPromotes: true, actionBudget: 4})`
 * **on the post-turn position**. That is one `killTable` per candidate, so this
 * module applies each turn once, measures, and unmakes — the same pass also
 * yields items 3 and 5's `anchorsVoided`, which are post-turn quantities too.
 * One pass, three numbers; nothing else in the search re-walks a candidate.
 *
 * Determinism: no clock, no RNG, and the sort is a stable insertion sort keyed
 * on `(score, original index)`, so two runs that generate the same candidates
 * order them identically.
 */
import {
  DEAD,
  MAX_SLOTS,
  Result,
  type Centi,
  type PackedState,
  type Side,
} from '../types';
import { bbCount } from '../core/bits';
import { AKind, paA, paB, paKind } from '../core/action';
import { ACTIONS_PER_TURN } from '../core/state';
import { newSpawnInfo, spawnInfo, type SpawnInfo } from '../core/spawn';
import type { NodeTables } from '../tables/context';
import {
  KILL_IMPOSSIBLE,
  KILL_MAX_LANES,
  killTable,
  newKillTable,
  type KillOpts,
  type KillTable,
} from '../tables/kill';
import { TurnFlag, type Turn } from '../gen/turn';
import { WorkClass } from './time';
import { Bound, type TTEntry } from './tt';
import { PROVER_BOUND, chargeProver, type SearchContext } from './pvs';

export interface OrderTables {
  /** 2 per ply, matched on `Turn.sig`. */
  killers: Int32Array;
  /** `2^14` counter-move slots, keyed by `hash(prevSig)`. */
  counter: Int32Array;
  /** 6 action kinds × 100 destination squares (butterfly). */
  histMove: Int32Array;
  /** 18 definitions × 100 spawn squares. */
  histBuy: Int32Array;
  /** Scratch the SEE pass needs; not part of DESIGN §4.16's four arrays, but
   * per-context state has to live somewhere and `OrderTables` is the object
   * the search already threads through every call. */
  seeSpawn: [SpawnInfo, SpawnInfo];
  seeKills: KillTable;
  seeOpts: KillOpts;
  /** Ordering keys, parallel to the candidate array during one `scoreTurns`. */
  keys: Int32Array;
}

export const COUNTER_BITS = 14;
const COUNTER_SLOTS = 1 << COUNTER_BITS;
const HIST_MOVE_KINDS = 6;
const BOARD = 100;
const NDEF = 18;

/** Ordering bonuses (DESIGN §5.11.3). */
export const ORDER_TT = 2_000_000;
export const ORDER_HOME_RESCUE = 1_500_000;
export const ORDER_HOME_RACE = 1_200_000;
export const ORDER_SPAWN_DENY = 300_000;
export const ORDER_SUMMON_STRIKE = 250_000;
export const ORDER_CLEAVE = 250_000;
export const ORDER_KILLER = 200_000;
export const ORDER_COUNTER = 150_000;

/** History counters are halved once a bucket passes this, so the table ages
 * instead of saturating (DESIGN §5.11.3: "bounded by aging halving"). */
export const HISTORY_CEILING = 1 << 14;

export function newOrderTables(maxPly: number): OrderTables {
  if (!Number.isInteger(maxPly) || maxPly <= 0) throw new RangeError(`newOrderTables: bad maxPly ${maxPly}`);
  return {
    killers: new Int32Array(maxPly * 2),
    counter: new Int32Array(COUNTER_SLOTS),
    histMove: new Int32Array(HIST_MOVE_KINDS * BOARD),
    histBuy: new Int32Array(NDEF * BOARD),
    seeSpawn: [newSpawnInfo(), newSpawnInfo()],
    seeKills: newKillTable(),
    seeOpts: {
      actionBudget: ACTIONS_PER_TURN,
      crystalBudget: 0,
      allowBuys: true,
      allowPromotes: true,
      maxLanes: KILL_MAX_LANES,
    },
    keys: new Int32Array(256),
  };
}

/** Drops killers, counters and history. Called between independent searches so
 * one position's ordering never leaks into another's (determinism). */
export function clearOrderTables(ord: OrderTables): void {
  ord.killers.fill(0);
  ord.counter.fill(0);
  ord.histMove.fill(0);
  ord.histBuy.fill(0);
}

function counterSlot(prevSig: number): number {
  return (Math.imul(prevSig >>> 0, 0x9e3779b1) >>> (32 - COUNTER_BITS)) & (COUNTER_SLOTS - 1);
}

/** `histMove` row for an action kind; -1 for kinds with no destination. */
function moveHistRow(kind: number): number {
  switch (kind) {
    case AKind.MOVE:
      return 0;
    case AKind.ATTACK:
      return 1;
    case AKind.PROMOTE:
      return 2;
    case AKind.END_PLACE:
      return 3;
    case AKind.END_ACTION:
      return 4;
    case AKind.PAY_UPKEEP:
      return 5;
    default:
      return -1;
  }
}

/** The turn's "primary" non-terminal action — the one history credits. */
function primaryAction(t: Turn): number {
  for (let i = 0; i < t.count; i++) {
    const kind = paKind(t.actions[i]);
    if (kind === AKind.ATTACK || kind === AKind.MOVE) return t.actions[i];
  }
  for (let i = 0; i < t.count; i++) {
    const kind = paKind(t.actions[i]);
    if (kind === AKind.BUY || kind === AKind.PROMOTE) return t.actions[i];
  }
  return t.count > 0 ? t.actions[0] : 0;
}

function historyOf(ord: OrderTables, t: Turn): number {
  const a = primaryAction(t);
  const kind = paKind(a);
  if (kind === AKind.BUY) return ord.histBuy[paA(a) * BOARD + paB(a)];
  const row = moveHistRow(kind);
  if (row < 0) return 0;
  const to = kind === AKind.MOVE || kind === AKind.ATTACK ? paB(a) : 0;
  return ord.histMove[row * BOARD + to];
}

function bumpHistory(ord: OrderTables, t: Turn, depth: number): void {
  const bonus = depth * depth;
  const a = primaryAction(t);
  const kind = paKind(a);
  if (kind === AKind.BUY) {
    const at = paA(a) * BOARD + paB(a);
    ord.histBuy[at] += bonus;
    if (ord.histBuy[at] > HISTORY_CEILING) {
      for (let i = 0; i < ord.histBuy.length; i++) ord.histBuy[i] >>= 1;
    }
    return;
  }
  const row = moveHistRow(kind);
  if (row < 0) return;
  const to = kind === AKind.MOVE || kind === AKind.ATTACK ? paB(a) : 0;
  const at = row * BOARD + to;
  ord.histMove[at] += bonus;
  if (ord.histMove[at] > HISTORY_CEILING) {
    for (let i = 0; i < ord.histMove.length; i++) ord.histMove[i] >>= 1;
  }
}

/**
 * DESIGN §4.16. Records the turn that produced a beta cutoff: two killers per
 * ply (most recent first, no duplicates), a counter-move keyed on the previous
 * turn's signature, and a depth² history bonus.
 */
export function onCutoff(ord: OrderTables, t: Turn, ply: number, prevSig: number, depth: number): void {
  const base = ply * 2;
  if (base + 1 < ord.killers.length && ord.killers[base] !== t.sig) {
    ord.killers[base + 1] = ord.killers[base];
    ord.killers[base] = t.sig;
  }
  ord.counter[counterSlot(prevSig)] = t.sig;
  bumpHistory(ord, t, depth);
}

/** Per-candidate post-turn measurements (the single make/unmake pass). */
interface SeeResult {
  hangCc: Centi;
  killValueCc: Centi;
  killActions: number;
  anchorsVoided: number;
  ok: boolean;
}

const SEE: SeeResult = { hangCc: 0, killValueCc: 0, killActions: 0, anchorsVoided: 0, ok: false };

/**
 * Applies `t` to `p`, measures the three post-turn quantities the ordering
 * needs, and unmakes. Leaves `p` byte-identical to how it was found.
 *
 * `hangCc` is the material `them` can remove from `me` next turn with a full
 * four-action budget, buys and promotions allowed — DESIGN §5.11.3's SEE
 * analogue. `killValueCc`/`killActions` are the turn's own proven kills and
 * the actions it spent attacking. `anchorsVoided` is how many of the enemy's
 * unblocked anchors the turn removed.
 */
function measure(
  s: SearchContext,
  p: PackedState,
  t: Turn,
  mover: Side,
  tables: NodeTables,
  ply: number,
  out: SeeResult,
): SeeResult {
  out.hangCc = 0;
  out.killValueCc = 0;
  out.killActions = 0;
  out.anchorsVoided = 0;
  out.ok = false;

  const rep = s.rep;
  const cat = s.cat;
  const undo = s.undo;
  const keep = s.keep[ply];
  // The SEE pass borrows the NEXT ply's scratch: this node's own row is still
  // live (it holds `tables`), and the child ply has not been entered yet.
  const seePly = ply + 1 < s.sc.maxPly ? ply + 1 : ply;
  const top = undo.top;
  // DESIGN §5.11.4 puts the prover in `full` mode only at the root and at PV
  // nodes of depth >= 1. The ORDERING pass is neither: it wants three post-turn
  // measurements (hung material, proven kills, voided anchors), and the
  // admissible bound answers "is this a corner mate?" well enough to rank a
  // turn that already carries `HOME_ENTRY +1,200,000`. Running the full prover
  // here instead would multiply the rate M14 gates by the candidate width.
  const proverBefore = s.rep.fullProverCalls;
  p.proverMode = PROVER_BOUND;
  let applied = 0;
  let killValue = 0;
  let killActions = 0;
  for (let i = 0; i < t.count; i++) {
    const a = t.actions[i];
    if (!rep.isLegal(p, a, keep)) break;
    let victim = -1;
    if (paKind(a) === AKind.ATTACK) {
      victim = p.pieceAt[paB(a)];
      killActions++;
    }
    rep.make(p, a, undo, keep);
    applied++;
    if (victim >= 0 && victim < MAX_SLOTS && p.sq[victim] === DEAD) killValue += cat.cost[p.defId[victim]] * 100;
  }
  if (applied === t.count) {
    out.ok = true;
    out.killValueCc = killValue;
    out.killActions = killActions;
    if (p.result === Result.ONGOING) {
      const them = (1 - mover) as Side;
      spawnInfo(p, 0, s.ord.seeSpawn[0]);
      spawnInfo(p, 1, s.ord.seeSpawn[1]);
      const before = bbCount(tables.spawn[them].anchors);
      const after = bbCount(s.ord.seeSpawn[them].anchors);
      out.anchorsVoided = before > after ? before - after : 0;

      const opts = s.ord.seeOpts;
      opts.actionBudget = ACTIONS_PER_TURN;
      opts.crystalBudget = p.bank[them];
      opts.allowBuys = true;
      opts.allowPromotes = true;
      opts.maxLanes = KILL_MAX_LANES;
      SEE_CTX.dist = tables.dist;
      SEE_CTX.spawn = s.ord.seeSpawn;
      killTable(p, SEE_CTX, them, opts, s.sc, seePly, s.ord.seeKills);
      s.meter.spend(WorkClass.KILLTABLE, 1);
      const table = s.ord.seeKills;
      for (let slot = 0; slot < MAX_SLOTS; slot++) {
        if (p.sq[slot] === DEAD || p.owner[slot] !== mover) continue;
        const e = table.entry[slot];
        if (e.minActions === KILL_IMPOSSIBLE || e.minActions > ACTIONS_PER_TURN) continue;
        out.hangCc += e.valueCc;
      }
    }
  }
  for (let i = 0; i < applied; i++) rep.unmake(p, undo);
  undo.top = top;
  chargeProver(s, proverBefore);
  return out;
}

/** Mutable `KillContext` for the SEE pass; the search is single-threaded and
 * `measure` never recurses, so one instance suffices. */
const SEE_CTX: { dist: NodeTables['dist']; spawn: readonly [SpawnInfo, SpawnInfo] } = {
  dist: null as unknown as NodeTables['dist'],
  spawn: [newSpawnInfo(), newSpawnInfo()],
};

function ensureKeys(ord: OrderTables, n: number): Int32Array {
  if (ord.keys.length < n) ord.keys = new Int32Array(n * 2);
  return ord.keys;
}

/**
 * DESIGN §4.16. Scores `turns[0..n)` for `p`, writes `gainCc`/`hangCc` and
 * sorts the slice in place, best first.
 *
 * `tt` is the probed entry for this node (or `null`); its `bestEndLo` selects
 * item 1. `prevSig` is the signature of the turn that led here, for the
 * counter-move table.
 */
export function scoreTurns(
  p: PackedState,
  t: NodeTables,
  turns: Turn[],
  n: number,
  tt: TTEntry | null,
  ord: OrderTables,
  ply: number,
  prevSig: number,
  s: SearchContext,
): void {
  if (n <= 0) return;
  const mover = p.side as Side;
  const keys = ensureKeys(ord, n);
  const killerBase = ply * 2;
  const killerA = killerBase < ord.killers.length ? ord.killers[killerBase] : 0;
  const killerB = killerBase + 1 < ord.killers.length ? ord.killers[killerBase + 1] : 0;
  const counterSig = ord.counter[counterSlot(prevSig)];
  const ttEnd = tt !== null && (tt.bound === Bound.EXACT || tt.bound === Bound.LOWER) ? tt.bestEndLo : -1;

  for (let i = 0; i < n; i++) {
    const turn = turns[i];
    const within = turn.gainCc;
    const see = measure(s, p, turn, mover, t, ply, SEE);
    turn.hangCc = see.hangCc;

    let score = 0;
    if (ttEnd >= 0 && (turn.endLo >>> 0) === (ttEnd >>> 0)) score += ORDER_TT;
    if ((turn.flags & TurnFlag.HOME_RESCUE) !== 0) score += ORDER_HOME_RESCUE;
    if ((turn.flags & (TurnFlag.HOME_RACE | TurnFlag.HOME_ENTRY)) !== 0) score += ORDER_HOME_RACE;
    if (see.killValueCc > 0) {
      const perAction = see.killActions > 0 ? see.killActions : 1;
      score += ((see.killValueCc * 100) / perAction) | 0;
    }
    score -= see.hangCc;
    if ((turn.flags & TurnFlag.SPAWN_DENY) !== 0) {
      score += ORDER_SPAWN_DENY * (see.anchorsVoided > 0 ? see.anchorsVoided : 1);
    }
    if ((turn.flags & TurnFlag.SUMMON_STRIKE) !== 0) score += ORDER_SUMMON_STRIKE;
    if ((turn.flags & TurnFlag.CLEAVE_CHAIN) !== 0) score += ORDER_CLEAVE;
    if (turn.sig === killerA || turn.sig === killerB) score += ORDER_KILLER;
    if (turn.sig === counterSig) score += ORDER_COUNTER;
    score += historyOf(ord, turn);
    // Item 9: a quiet turn is ranked by its own within-turn score. Tactical
    // turns already carry items 2-6, so the within-turn score only breaks
    // their ties; dividing keeps it from swamping the bonuses above.
    score += (within / 16) | 0;

    turn.gainCc = score;
    keys[i] = score;
  }

  // Stable insertion sort, descending. `n` is `K` plus the forced injections
  // (DESIGN §8: 24 + ≤ 128), so the quadratic term never bites.
  for (let i = 1; i < n; i++) {
    const turn = turns[i];
    const key = keys[i];
    let j = i - 1;
    while (j >= 0 && keys[j] < key) {
      turns[j + 1] = turns[j];
      keys[j + 1] = keys[j];
      j--;
    }
    turns[j + 1] = turn;
    keys[j + 1] = key;
  }
}

/** DESIGN §5.11.2's `maxPlausibleGain(t)`: the most valuable enemy unit the
 * mover can take this turn, plus the projected income swing. Used by the
 * futility and delta pruning margins. */
export function maxPlausibleGain(p: PackedState, t: NodeTables): Centi {
  const mover = p.side as Side;
  const table = t.killNow[mover];
  let best = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] === mover) continue;
    const e = table.entry[slot];
    if (e.minActions === KILL_IMPOSSIBLE || e.minActions > p.actions) continue;
    if (e.valueCc > best) best = e.valueCc;
  }
  const income = t.econ[mover].stream - t.econ[(1 - mover) as Side].stream;
  return best + (income > 0 ? income : 0);
}
