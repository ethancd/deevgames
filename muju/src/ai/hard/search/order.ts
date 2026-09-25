import { keepForTurn } from '../gen/turn';
/**
 * Macro-turn ordering (DESIGN §4.16 `order.ts`, §5.11.3).
 *
 * `scoreTurns` writes each candidate's ordering score into `Turn.gainCc` and
 * its SEE-analogue exposure into `Turn.hangCc`, then sorts the list in place,
 * best first. The order is DESIGN §5.11.3's list, top to bottom:
 *
 *   1 the TT turn (`endLo === bestEndLo`)                     +2,000,000
 *   2 `HOME_RESCUE` +1,500,000; `HOME_ENTRY`                  +1,200,000
 *   3 proven kills by value per action
 *   4 − `hangCc` (the SEE analogue)
 *   5 `SPAWN_DENY` +300,000 × anchorsVoided; `HOME_FORTIFY`  +250,000
 *   6 `CLEAVE_CHAIN`                                          +250,000
 *   7 killers +200,000; counter-move                          +150,000
 *   8 butterfly history
 *   9 the within-turn score of a quiet turn
 *
 * STRATEGOS W1.9 adds one item, at the ROOT only and only under
 * `HardConfig.searchFix.strategyPlans`: a `STRATEGY` plan line (a ForceContact
 * or Hold line, `strategy/contact.ts`, `strategy/hold.ts`) takes
 * `ORDER_STRATEGY` (+1,000,000), between item 2 and item 5.
 *
 * THE SEE ANALOGUE (DESIGN §5.11.3 item 4, the F2/F3/F7/F10 loss class).
 * `hangCc = Σ` material of my units `u` with `killActions[u] ≤ 4` under
 * `killTable(them, {horizon: 'current', actionBudget: 4})`
 * **on the post-turn position**. That is one `killTable` per candidate, so this
 * module applies each turn once, measures, and unmakes — the same pass also
 * yields items 3 and 5's `anchorsVoided`, which are post-turn quantities too.
 * One pass, three numbers; nothing else in the search re-walks a candidate.
 *
 * Determinism: no clock, no RNG, and the sort is a stable insertion sort keyed
 * on `(score, original index)`, so two runs that generate the same candidates
 * order them identically.
 *
 * DETERMINISM IS NOT THE SAME AS POSITION-DEPENDENCE (E4.2 lane 3). Item 1 is
 * a fact about the SEARCH, not about the position: the TT's `bestEndLo` is
 * whatever the previous iteration at this node chose. `search/pvs.ts
 * rootIteration` keeps the first candidate in this order on a strict
 * `score > best`, so at a root where every candidate returns the SAME score the
 * move the engine plays is the previous iteration's move, re-served. The
 * optional `HardConfig.searchFix.tieBreak` (`config.ts SearchFix`, absent in
 * every profile) is where that is made a choice instead of a side effect; see
 * `scoreTurns`.
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
export const ORDER_HOME_FORTIFY = 250_000;
export const ORDER_CLEAVE = 250_000;
export const ORDER_KILLER = 200_000;
export const ORDER_COUNTER = 150_000;
/**
 * STRATEGOS W1.9: a ply-0 `STRATEGY` candidate's bonus, applied only when
 * `HardConfig.searchFix.strategyPlans` is on. CHOICE (why: below the TT move
 * (2,000,000), a home rescue (1,500,000) and a home entry (1,200,000), so the
 * previous iteration's best still takes the full window first and a
 * home-corner answer still precedes a plan; above every other bonus — a
 * denial of three anchors, fortification, Cleave, killers, a kill's value per
 * action (at most a 17-crystal tier-3 in one action, 170,000) and the SEE
 * penalty of a line that walks into contact — so the plan lines are searched
 * right after those, where aspiration and alpha are still loose; plan lines
 * are `FORCED`, so `search/pvs.ts NO_REDUCE_FLAGS` already keeps them from
 * reduction; falsifier: a fixed-work comparison on the Phasing corpus where
 * the bonus costs completed depth against the same search without it).
 */
export const ORDER_STRATEGY = 1_000_000;

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
      allowBuys: false,
      allowPromotes: false,
      horizon: 'current',
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
  if (base + 1 < ord.killers.length && (ord.killers[base] >>> 0) !== (t.sig >>> 0)) {
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
 * four-action budget using its now-live army — DESIGN §5.11.3's SEE
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
  const keep = keepForTurn(t, s.keep[ply]);
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
      opts.allowBuys = false;
      opts.allowPromotes = false;
      opts.horizon = 'current';
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
 * `HardConfig.searchFix.tieBreak === 'end-key'`'s secondary key: the candidates'
 * canonical end keys, compared the way `search/root.ts keyHex` prints them —
 * `endHi` unsigned first, then `endLo` unsigned. True when `a` sorts AFTER `b`,
 * which is the direction the insertion sort below shifts on.
 *
 * Two candidates may share an end key (two action orders reaching one `Kpos`);
 * the comparison is then false both ways and the sort's stability decides,
 * exactly as it does for every other exact tie.
 */
export function endKeyAfter(a: Turn, b: Turn): boolean {
  const ah = a.endHi >>> 0;
  const bh = b.endHi >>> 0;
  if (ah !== bh) return ah > bh;
  return (a.endLo >>> 0) > (b.endLo >>> 0);
}

/**
 * DESIGN §4.16. Scores `turns[0..n)` for `p`, writes `gainCc`/`hangCc` and
 * sorts the slice in place, best first.
 *
 * `tt` is the probed entry for this node (or `null`); its `bestEndLo` selects
 * item 1. `prevSig` is the signature of the turn that led here, for the
 * counter-move table.
 *
 * E4.2 lane 3, `HardConfig.searchFix.tieBreak === 'end-key'` AND `ply === 0`
 * only: item 1 is withheld and the sort's tie-break moves from "original index"
 * to "smaller canonical end key". The root never takes a TT cutoff and searches
 * its whole list (`search/pvs.ts rootIteration`), so at the ROOT item 1 buys
 * only first-move-first ordering while it costs the engine a position-dependent
 * answer whenever the searched scores tie. With the key absent — every profile —
 * both lines below are exactly the code that was always there.
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
  // E4.2 lane 3. Read against the named value, never against truthiness, so a
  // future second policy cannot turn this one on by accident.
  const tieByEndKey = ply === 0 && s.cfg.searchFix?.tieBreak === 'end-key';
  // STRATEGOS W1.9: plan lines exist only at the root and only under the flag;
  // reading the flag (not just the bit) keeps every other profile's ordering
  // arithmetic exactly what it was.
  const strategyFirst = ply === 0 && s.cfg.searchFix?.strategyPlans === true;
  const ttEnd = !tieByEndKey && tt !== null && (tt.bound === Bound.EXACT || tt.bound === Bound.LOWER) ? tt.bestEndLo : -1;

  for (let i = 0; i < n; i++) {
    const turn = turns[i];
    const within = turn.gainCc;
    const see = measure(s, p, turn, mover, t, ply, SEE);
    turn.hangCc = see.hangCc;

    let score = 0;
    if (ttEnd >= 0 && (turn.endLo >>> 0) === (ttEnd >>> 0)) score += ORDER_TT;
    if ((turn.flags & TurnFlag.HOME_RESCUE) !== 0) score += ORDER_HOME_RESCUE;
    // `HOME_ENTRY` only. Under Phasing a `HOME_RACE` turn enters nothing: it
    // commits a body that arrives next turn and would still need four moves.
    // It is scored as the ordinary purchase it is (see `gen/turn.ts`).
    if ((turn.flags & TurnFlag.HOME_ENTRY) !== 0) score += ORDER_HOME_RACE;
    if (see.killValueCc > 0) {
      const perAction = see.killActions > 0 ? see.killActions : 1;
      score += ((see.killValueCc * 100) / perAction) | 0;
    }
    score -= see.hangCc;
    if ((turn.flags & TurnFlag.SPAWN_DENY) !== 0) {
      score += ORDER_SPAWN_DENY * (see.anchorsVoided > 0 ? see.anchorsVoided : 1);
    }
    if ((turn.flags & TurnFlag.HOME_FORTIFY) !== 0) score += ORDER_HOME_FORTIFY;
    if (strategyFirst && (turn.flags & TurnFlag.STRATEGY) !== 0) score += ORDER_STRATEGY;
    if ((turn.flags & TurnFlag.CLEAVE_CHAIN) !== 0) score += ORDER_CLEAVE;
    if ((turn.sig >>> 0) === (killerA >>> 0) || (turn.sig >>> 0) === (killerB >>> 0)) score += ORDER_KILLER;
    if ((turn.sig >>> 0) === (counterSig >>> 0)) score += ORDER_COUNTER;
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
    while (j >= 0 && (keys[j] < key || (tieByEndKey && keys[j] === key && endKeyAfter(turns[j], turn)))) {
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
