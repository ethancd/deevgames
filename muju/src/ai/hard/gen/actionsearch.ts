/**
 * Within-turn action search (DESIGN §4.13 `gen/actionsearch.ts`, §5.3, §5.4).
 *
 * A macro turn is atomic — the opponent never interleaves (`turn.ts:87-89`) —
 * and income depends only on the final squares (`mining.ts:19-23`), so the
 * action phase is a set-reachability problem, not a sequence problem. The
 * naive enumeration of the initial position is 14,959 sequences (ET §8.1) that
 * reach only 797 distinct end positions; this module collapses that with the
 * rules of DESIGN §5.3:
 *
 *   C0  promotions are emitted by ascending slot index — the Place phase, so
 *       `gen/purchase.ts`/`gen/promote.ts` own it, not this file;
 *   C1  **footprint independence** (the F1 fix): after applying `prev`, a
 *       child `cur` is pruned iff the two actions use different slots, their
 *       footprints are disjoint, and `key(prev) > key(cur)`. A MOVE's
 *       footprint is `{from, to} ∪ Ball(occupancy-it-is-applied-to, from,
 *       speed × cost)`; an ATTACK's is `{attackerSq, targetSq}`. Because each
 *       ball is taken on the occupancy its own action is applied to, every
 *       square `prev` vacated or filled that could change `cur`'s legality or
 *       cost lies inside one of the two footprints — which is exactly why the
 *       F1 counterexample ("step aside, then run") survives the prune;
 *   C2  a within-turn transposition table keyed on `Kturn`.
 *
 * `run` is the engine path (canonical ordering + widening + TT);
 * `enumerateAll` is the deliberately dumb one the M11 gate compares it
 * against. With unbounded widths and the TT off the two must produce the same
 * SET of end-position `Kpos` — not the same multiset: a pruned order whose
 * swapped form reaches the same squares with more actions left reaches a
 * superset of end positions, which is the whole point of the canonicalisation.
 *
 * Nothing here allocates during a search: the per-step action buffers,
 * priority buffers, footprint bitboards and anchor-void counts are built in
 * the constructor, and every `Turn` comes from the caller's `TurnPool`.
 */
import { CC, DEAD, F_PLACED, MAX_TURN_ACTIONS, NO_SLOT, Result, type Centi, type PackedState, type Side } from '../types';
import { bbHas, bbIntersects, bbNew, bbNext, bbZero, type BB, type Scratch } from '../core/bits';
import { ADJ_LIST, CORNER, RECT } from '../core/tables';
import { activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { AKind, paA, paB, paC, paKind, paMake, type PA } from '../core/action';
import { ACTIONS_PER_TURN, MAX_SLOTS, Replica, newUndo, type Undo } from '../core/state';
import { moveCost, reachMask, type DistanceCache } from '../core/movement';
import { pstMine } from '../core/income';
import { TACTICAL_FLAGS, TurnFlag, turnSignature, type Turn, type TurnPool } from './turn';
import type { GenTrace } from './trace';
import type { ActionSearchConfig } from '../config';

export type { ActionSearchConfig } from '../config';

/**
 * Stage-1 evaluation of a post-boundary position, from the point of view of
 * the side that just moved (DESIGN §4.13). The boundary has already flipped
 * `p.side`, so the mover is `1 - p.side` in every non-terminal case.
 */
export type WithinTurnScorer = (p: PackedState, sc: Scratch, ply: number) => Centi;

/**
 * Structural view of `search/time.ts WorkMeter` (DESIGN §4.16), which lands at
 * M14. The real class satisfies it; declaring only the two methods this module
 * calls keeps `gen` from importing `search` (which DESIGN §2's layering
 * forbids) and lets the M11 tooling pass `UNLIMITED_WORK`. See
 * `docs/hard-ai/design/DEVIATIONS.md` under M11.
 */
export interface WorkSink {
  spend(cls: number, n?: number): void;
  exhausted(): boolean;
}

/** A meter that never runs out — the gate runner, the oracles and the tests. */
export const UNLIMITED_WORK: WorkSink = {
  spend(): void {
    /* no-op */
  },
  exhausted(): boolean {
    return false;
  },
};

/** `WorkClass.TURN` (DESIGN §4.16), spelled here so `gen` need not import `search`. */
const WORK_CLASS_TURN = 2;

/**
 * The slice of `tables/context.ts NodeTables` (M6/M12) that `actionPriority`
 * reads. `NodeTables` is structurally assignable to it, so the search takes
 * the real tables unchanged once they exist; until then `neutralTables()` is
 * the stub DESIGN §5.4 calls for.
 */
export interface ActionSearchTables {
  /** Squares the OTHER side can strike, indexed by the side at risk. */
  exposure: readonly [BB, BB];
  /** Min actions for a slot's OWNER'S ENEMY to kill it next turn; 127 = never. */
  killActions: Int8Array;
}

/** Tables that claim no exposure and no threats — the M11 stub (DESIGN §5.4). */
export function neutralTables(): ActionSearchTables {
  return { exposure: [bbNew(), bbNew()], killActions: new Int8Array(MAX_SLOTS).fill(127) };
}

// --- C2: the within-turn transposition table ---------------------------------

/**
 * `Int32Array(2^bits * 3)` of `[keyLo, keyHi, payload]` with
 * `payload = (generation << 8) | (actionsRemaining << 4) | 1` (DESIGN §5.3).
 * Direct-mapped on `keyLo`; both key lanes are stored, so a hit is a real key
 * match and never a collision. `bump()` invalidates the table in O(1).
 */
export class TurnTT {
  readonly bits: number;
  private readonly slots: Int32Array;
  private readonly mask: number;
  private gen = 1;
  private probeCount = 0;
  private hitCount = 0;

  constructor(bits: number) {
    if (!Number.isInteger(bits) || bits < 1 || bits > 24) {
      throw new RangeError(`TurnTT: bits must be an integer in 1..24, got ${bits}`);
    }
    this.bits = bits;
    this.mask = (1 << bits) - 1;
    this.slots = new Int32Array((1 << bits) * 3);
  }

  /** True when this exact `Kturn` was already expanded with at least this many actions left. */
  probe(lo: number, hi: number, actions: number): boolean {
    this.probeCount++;
    const i = (lo & this.mask) * 3;
    const payload = this.slots[i + 2];
    if ((payload & 1) === 0) return false;
    if (this.slots[i] !== (lo | 0) || this.slots[i + 1] !== (hi | 0)) return false;
    if (payload >>> 8 !== this.gen) return false;
    if (((payload >>> 4) & 0xf) < actions) return false;
    this.hitCount++;
    return true;
  }

  store(lo: number, hi: number, actions: number): void {
    const i = (lo & this.mask) * 3;
    this.slots[i] = lo | 0;
    this.slots[i + 1] = hi | 0;
    this.slots[i + 2] = (this.gen << 8) | ((actions & 0xf) << 4) | 1;
  }

  /** Starts a new generation; every stored entry becomes a miss. */
  bump(): void {
    this.gen++;
    // `generation` occupies bits 8..30 of the payload; wrap by clearing.
    if (this.gen > 0x7fffff) {
      this.gen = 1;
      this.slots.fill(0);
    }
  }

  get generation(): number {
    return this.gen;
  }

  get probes(): number {
    return this.probeCount;
  }

  get hits(): number {
    return this.hitCount;
  }
}

// --- C1: footprints and independence ------------------------------------------

/** Scratch for `isIndependent`'s side of the footprint test. */
const CUR_FOOTPRINT: BB = bbNew();

let footprintCatalog: Catalog | null = null;

/** The catalogue matching `p`, memoised on `p.catalogSignature` (one compare in the hot path). */
function catalogFor(p: PackedState): Catalog {
  if (footprintCatalog === null || footprintCatalog.signature !== p.catalogSignature) {
    footprintCatalog = activeCatalog();
  }
  return footprintCatalog;
}

/**
 * `footprint(a at p)` as a bitboard (DESIGN §5.3):
 *   MOVE   `{from, to} ∪ Ball(p, from, speed × cost)`
 *   ATTACK `{attackerSq, targetSq}`
 * Any other kind has the empty footprint, which intersects nothing — so
 * `isIndependent` rejects those kinds outright rather than relying on it.
 */
export function footprint(p: PackedState, dist: DistanceCache, a: PA, out: BB): BB {
  const kind = paKind(a);
  if (kind === AKind.ATTACK) {
    bbZero(out);
    const from = p.sq[paA(a)];
    if (from !== DEAD) out[from >>> 5] |= 1 << (from & 31);
    const target = paB(a);
    out[target >>> 5] |= 1 << (target & 31);
    return out;
  }
  if (kind !== AKind.MOVE) return bbZero(out);
  const slot = paA(a);
  const from = p.sq[slot];
  const to = paB(a);
  const speed = catalogFor(p).spd[p.defId[slot]];
  const d = dist.get(p, from);
  let cost = paC(a);
  if (cost === 0) cost = moveCost(d, to, speed);
  reachMask(d, speed, cost, out);
  out[from >>> 5] |= 1 << (from & 31);
  out[to >>> 5] |= 1 << (to & 31);
  return out;
}

/**
 * DESIGN §5.3's `isIndependent`. `prevBallLo` is `footprint(prev at S0)` — the
 * state BEFORE `prev` was applied, which the caller has and this function does
 * not; `p` is `S1`, the state after `prev`, where `cur` would be applied.
 */
export function isIndependent(p: PackedState, dist: DistanceCache, prev: PA, prevBallLo: BB, cur: PA): boolean {
  const pk = paKind(prev);
  const ck = paKind(cur);
  if (pk !== AKind.MOVE && pk !== AKind.ATTACK) return false;
  if (ck !== AKind.MOVE && ck !== AKind.ATTACK) return false;
  if (paA(prev) === paA(cur)) return false;
  footprint(p, dist, cur, CUR_FOOTPRINT);
  return !bbIntersects(prevBallLo, CUR_FOOTPRINT);
}

/** DESIGN §5.3: `key(a) = (rank << 20) | (slot << 10) | square`, ATTACK ranking before MOVE. */
export function actionKey(a: PA): number {
  const rank = paKind(a) === AKind.ATTACK ? 0 : 1;
  return (rank << 20) | (paA(a) << 10) | paB(a);
}

// --- ordering ------------------------------------------------------------------

/**
 * DESIGN §5.4's `actionPriority`, integer, descending.
 *
 * `voidedByTo` is the per-square count of the enemy's currently-unblocked
 * spawn anchors an intruder on that square would void (`core/spawn.ts
 * anchorsVoidedBy` for all 100 squares at once); `null` skips the term.
 * `histMove` is `search/order.ts OrderTables.histMove` (`kind * 100 + square`),
 * `null` until M14 wires one in.
 *
 * The MVV term is DESIGN's `1_000 · victimValueCc / actionCost` normalised by
 * `CC`. `victimValueCc` is the `cost × 100` material prior (DESIGN §4.11), so
 * the unnormalised term would run 300,000–1,700,000 and swamp both the
 * 100,000 corner-kill and the 50,000 threat-removal bonus, inverting the
 * descending order DESIGN's own list states. See DEVIATIONS.md under M11.
 */
export function actionPriority(
  p: PackedState,
  t: ActionSearchTables,
  cat: Catalog,
  a: PA,
  voidedByTo: Int32Array | null,
  histMove: Int32Array | null,
): number {
  const side = p.side as Side;
  const kind = paKind(a);
  let score = 0;
  if (kind === AKind.ATTACK) {
    const slot = paA(a);
    const target = paB(a);
    const victim = p.pieceAt[target];
    if (victim === NO_SLOT) return 0;
    const victimDef = p.defId[victim];
    const attackerDef = p.defId[slot];
    const power = cat.power[powerIndex(side, attackerDef, victimDef)];
    const effectiveDef = Math.max(0, cat.def[victimDef] - p.damage[victim]);
    if (power >= effectiveDef) {
      if (target === CORNER[side]) score += 100_000;
      if (removesThreat(p, t, target, side)) score += 50_000;
    }
    // MVV-LVA analogue; an ATTACK always costs exactly one action.
    const victimValueCc = cat.cost[victimDef] * CC;
    score += ((1_000 * victimValueCc) / CC) | 0;
    const count = p.atkCount[slot];
    if (count > 0 && count < cat.tier[attackerDef]) score += 600;
    score -= 80;
  } else if (kind === AKind.MOVE) {
    const slot = paA(a);
    const def = p.defId[slot];
    const from = p.sq[slot];
    const to = paB(a);
    const cost = paC(a) === 0 ? 1 : paC(a);
    if (to === CORNER[1 - side]) score += 400;
    if (voidedByTo !== null) score += 300 * voidedByTo[to];
    const exposed = t.exposure[side];
    if (bbHas(exposed, from) && !bbHas(exposed, to)) score += 200;
    score += pstMine(def, p.reserve[to]) - pstMine(def, p.reserve[from]);
    score -= 80 * cost;
  }
  if (histMove !== null) {
    const index = kind * 100 + paB(a);
    if (index >= 0 && index < histMove.length) score += histMove[index] >> 5;
  }
  return score;
}

/**
 * DESIGN §5.4's "kills a unit whose killActions against me ≤ 4 — remove the
 * threat". `NodeTables.killActions` is indexed by DEFENDER (min actions for a
 * slot's owner's enemy to kill it), so the threat a victim poses is read off my
 * own units: the victim removes a threat when it stands next to one of mine
 * the enemy can kill within a turn. See DEVIATIONS.md under M11.
 */
function removesThreat(p: PackedState, t: ActionSearchTables, victimSq: number, side: Side): boolean {
  const base = victimSq * 4;
  for (let k = 0; k < 4; k++) {
    const q = ADJ_LIST[base + k];
    if (q < 0) continue;
    const slot = p.pieceAt[q];
    if (slot === NO_SLOT || p.owner[slot] !== side) continue;
    if (t.killActions[slot] <= 4) return true;
  }
  return false;
}

// --- the search ----------------------------------------------------------------

/** 4 attacks + 100 destinations per slot, plus the phase-ender (the bound `verify/perft.ts` uses). */
const GEN_CAPACITY = 4 + MAX_SLOTS * 104;
/** Every action costs at least one action point, so a turn is at most `ACTIONS_PER_TURN` deep. */
const MAX_ACTION_STEPS = ACTIONS_PER_TURN;
/** Default `enumerateAll` node bound, for a caller that passes none. */
export const MAX_NAIVE_CALLS = 40_000_000;

export type EndObserver = (endLo: number, endHi: number) => void;
/** Fired once per EXPANDED node (a TT hit is entered but not expanded). */
export type NodeObserver = (kturnLo: number, kturnHi: number, actions: number) => void;

export class ActionSearch {
  private readonly rep: Replica;
  private readonly cfg: ActionSearchConfig;
  private readonly pool: TurnPool;
  private readonly sc: Scratch;
  private readonly dist: DistanceCache;
  private readonly undo: Undo = newUndo();
  private readonly tt: TurnTT | null;

  private readonly buffers: Int32Array[] = [];
  private readonly priorities: Int32Array[] = [];
  private readonly footprints: BB[] = [];
  private readonly voided: Int32Array[] = [];
  private readonly voidedReady = new Uint8Array(MAX_ACTION_STEPS + 1);
  private readonly path = new Int32Array(MAX_ACTION_STEPS);
  private readonly pathFlags = new Int32Array(MAX_ACTION_STEPS + 1);
  private readonly friendly: BB = bbNew();
  private readonly kept: Turn[] = [];
  private readonly keptSeq: number[] = [];
  private readonly order: number[] = [];

  private histMove: Int32Array | null = null;
  private observer: EndObserver | null = null;
  private nodeObserver: NodeObserver | null = null;
  private trace: GenTrace | null = null;

  // per-run state
  private p: PackedState | null = null;
  private tables: ActionSearchTables = neutralTables();
  private score: WithinTurnScorer = () => 0;
  private meter: WorkSink = UNLIMITED_WORK;
  private ply = 0;
  private prefix: Int32Array = new Int32Array(0);
  private prefixLen = 0;
  private placeIndex = -1;
  private pathLen = 0;
  private rootSide: Side = 0;
  private rootTurnNumber = 0;
  private keptMax = 0;
  private keptCount = 0;
  private aborted = false;

  private nodeCount = 0;
  private visitCount = 0;
  private endCount = 0;
  private naiveCalls = 0;
  private naiveLimit = MAX_NAIVE_CALLS;

  constructor(rep: Replica, cfg: ActionSearchConfig, pool: TurnPool, sc: Scratch) {
    this.rep = rep;
    this.cfg = cfg;
    this.pool = pool;
    this.sc = sc;
    this.dist = rep.dist;
    this.tt = cfg.ttBits > 0 ? new TurnTT(cfg.ttBits) : null;
    for (let i = 0; i <= MAX_ACTION_STEPS; i++) {
      this.buffers.push(new Int32Array(GEN_CAPACITY));
      this.priorities.push(new Int32Array(GEN_CAPACITY));
      this.footprints.push(bbNew());
      this.voided.push(new Int32Array(100));
    }
  }

  /** Nodes EXPANDED by the last `run` (a TT hit is entered but not expanded) —
   * DESIGN §5.3's mid-turn state count. */
  get nodes(): number {
    return this.nodeCount;
  }

  /** Nodes ENTERED by the last `run`, TT hits included. */
  get visits(): number {
    return this.visitCount;
  }

  /** Turn boundaries reached by the last `run`/`enumerateAll`. */
  get ends(): number {
    return this.endCount;
  }

  /** The within-turn TT, or `null` when `cfg.ttBits <= 0` disabled it. */
  get turnTT(): TurnTT | null {
    return this.tt;
  }

  /** `search/order.ts OrderTables.histMove` (M14); `null` disables the history term. */
  setHistory(histMove: Int32Array | null): void {
    this.histMove = histMove;
  }

  /**
   * Installs (or clears) E2.2's stage trace. `null` — the only state a search
   * ever runs in — costs one null test per TURN BOUNDARY, never one per node.
   * See `gen/trace.ts`.
   */
  setTrace(trace: GenTrace | null): void {
    this.trace = trace;
  }

  /**
   * Observes every turn boundary `run` reaches, kept or not. The M11 gate
   * compares the observed `Kpos` set against `enumerateAll`'s; the search
   * itself never installs one.
   */
  setEndObserver(observer: EndObserver | null): void {
    this.observer = observer;
  }

  /**
   * Observes every node `run` expands, with its `Kturn` and actions left. The
   * M11 gate counts DISTINCT keys here rather than trusting `nodes`: the turn
   * TT is direct-mapped, so a handful of index collisions re-expand a state
   * that was already searched and inflate the raw node count (1,055 at 16 bits,
   * 1,053 from 20 bits up on the initial position) without changing a result.
   */
  setNodeObserver(observer: NodeObserver | null): void {
    this.nodeObserver = observer;
  }

  /**
   * DESIGN §5.4. `p` must be in the action phase with the place-plan prefix
   * already applied; `prefix[0..prefixLen)` is that prefix, copied verbatim
   * into every `Turn` this call records, and `placeIndex` is the plan's index
   * (or -1). Returns the number of `Turn`s written to `out`, best first.
   */
  run(
    p: PackedState,
    t: ActionSearchTables,
    prefix: Int32Array,
    prefixLen: number,
    placeIndex: number,
    score: WithinTurnScorer,
    meter: WorkSink,
    ply: number,
    out: Turn[],
  ): number {
    this.nodeCount = 0;
    this.visitCount = 0;
    this.endCount = 0;
    this.keptCount = 0;
    this.aborted = false;
    if (!this.begin(p, t, prefix, prefixLen, placeIndex, score, meter, ply)) return 0;
    this.keptMax = Math.min(this.cfg.keep, this.pool.free);
    this.kept.length = 0;
    this.keptSeq.length = 0;
    for (let i = 0; i < this.keptMax; i++) {
      this.kept.push(this.pool.alloc());
      this.keptSeq.push(0);
    }
    if (this.tt !== null) this.tt.bump();
    this.dfs(0);
    this.p = null;
    return this.emit(p, out);
  }

  /**
   * Naive enumeration for the M11 gate: no canonical ordering, no widening, no
   * TT. `p` and `prefix` carry the same contract as `run`; the prefix is not
   * replayed (it is already applied) but is validated, because a prefix that
   * leaves no room for an action phase is a caller bug. Returns the number of
   * complete action sequences; `onEnd` fires once per sequence.
   *
   * `maxCalls` bounds the DFS. The naive tree of a mid-game position with ten
   * own units is astronomically large (root branching alone runs to ~800 with
   * multi-action moves), so the M11 oracle lowers the position's action budget
   * until the tree fits and needs a cheap "does it fit" answer: exceeding
   * `maxCalls` ABORTS the walk and returns `-1`, with `onEnd` having fired an
   * arbitrary prefix of the sequences (the caller must discard what it
   * collected). DESIGN §4.13 gives the four-argument form; the fifth parameter
   * is optional and additive — see DEVIATIONS.md under M11.
   */
  enumerateAll(p: PackedState, prefix: Int32Array, prefixLen: number, onEnd: EndObserver, maxCalls: number = MAX_NAIVE_CALLS): number {
    checkPrefix(prefix, prefixLen, 'enumerateAll');
    this.endCount = 0;
    this.naiveCalls = 0;
    this.naiveLimit = maxCalls;
    this.aborted = false;
    if (p.result !== Result.ONGOING || p.upkeepPending === 1 || p.phase !== 1) return 0;
    this.p = p;
    this.rootSide = p.side as Side;
    this.rootTurnNumber = p.turnNumber;
    this.naive(0, onEnd);
    this.p = null;
    return this.aborted ? -1 : this.endCount;
  }

  // --- internals ---------------------------------------------------------------

  private begin(
    p: PackedState,
    t: ActionSearchTables,
    prefix: Int32Array,
    prefixLen: number,
    placeIndex: number,
    score: WithinTurnScorer,
    meter: WorkSink,
    ply: number,
  ): boolean {
    checkPrefix(prefix, prefixLen, 'ActionSearch.run');
    if (p.result !== Result.ONGOING || p.upkeepPending === 1 || p.phase !== 1) return false;
    this.p = p;
    this.tables = t;
    this.score = score;
    this.meter = meter;
    this.ply = ply;
    this.prefix = prefix;
    this.prefixLen = prefixLen;
    this.placeIndex = placeIndex;
    this.pathLen = 0;
    this.rootSide = p.side as Side;
    this.rootTurnNumber = p.turnNumber;
    let prefixFlags = 0;
    for (let i = 0; i < prefixLen; i++) {
      const kind = paKind(prefix[i]);
      if (kind === AKind.BUY) prefixFlags |= TurnFlag.PURCHASE;
      else if (kind === AKind.PROMOTE) prefixFlags |= TurnFlag.PROMOTION;
    }
    this.pathFlags[0] = prefixFlags;
    return true;
  }

  private dfs(step: number): void {
    const p = this.p as PackedState;
    this.visitCount++;
    this.meter.spend(WORK_CLASS_TURN);
    const tt = this.tt;
    if (tt !== null && tt.probe(p.kturnLo, p.kturnHi, p.actions)) return;
    this.nodeCount++;
    if (this.nodeObserver !== null) this.nodeObserver(p.kturnLo, p.kturnHi, p.actions);
    this.voidedReady[step] = 0;

    // The turn boundary is always considered, never widened away (DESIGN §5.4).
    this.considerEnd(step);

    if (p.actions === 0 || step >= MAX_ACTION_STEPS) {
      if (tt !== null) tt.store(p.kturnLo, p.kturnHi, p.actions);
      return;
    }

    const buf = this.buffers[step];
    let n = this.rep.genActions(p, buf);
    if (n > 0 && paKind(buf[n - 1]) === AKind.END_ACTION) n--;
    if (n === 0) {
      if (tt !== null) tt.store(p.kturnLo, p.kturnHi, p.actions);
      return;
    }

    const width = this.widthAt(step);
    const take = width > 0 && width < n ? width : n;
    if (take < n) this.orderTop(step, n, take);

    const prev = step > 0 ? this.path[step - 1] : 0;
    const prevFoot = step > 0 ? this.footprints[step - 1] : null;
    const prevKey = step > 0 ? actionKey(prev) : 0;
    const foot = this.footprints[step];

    for (let i = 0; i < take; i++) {
      const a = buf[i];
      // C1: drop the non-canonical order of an independent adjacent pair. The
      // swapped order is only guaranteed to exist while `a` leaves the game
      // running — an action that ENDS it (the kill that eliminates the last
      // enemy unit, the step onto the enemy corner the home gate resolves)
      // truncates the turn before `prev` could follow it, so `prev, a` reaches
      // an end position `a, prev` does not. `a` is therefore still applied and
      // recorded; only its SUBTREE is pruned. See DEVIATIONS.md under M11.
      const skipSubtree = prevFoot !== null && actionKey(a) < prevKey && isIndependent(p, this.dist, prev, prevFoot, a);
      if (!skipSubtree) footprint(p, this.dist, a, foot);
      const flags = this.flagsFor(step, a);
      const top = this.undo.top;
      this.rep.make(p, a, this.undo);
      this.path[step] = a;
      this.pathLen = step + 1;
      this.pathFlags[step + 1] = flags;
      if (this.isDone(p)) this.record(-1, flags);
      else if (!skipSubtree) this.dfs(step + 1);
      this.rep.unmake(p, this.undo);
      this.undo.top = top;
      this.pathLen = step;
      if (this.aborted || this.meter.exhausted()) {
        this.aborted = true;
        return;
      }
    }
    if (tt !== null) tt.store(p.kturnLo, p.kturnHi, p.actions);
  }

  /** `make`s `END_ACTION`, records the turn it produces, and `unmake`s it. */
  private considerEnd(step: number): void {
    const p = this.p as PackedState;
    const a = paMake(AKind.END_ACTION);
    const top = this.undo.top;
    this.rep.make(p, a, this.undo);
    this.pathLen = step;
    this.record(a, this.pathFlags[step]);
    this.rep.unmake(p, this.undo);
    this.undo.top = top;
  }

  /** True once the mover's turn is over — a boundary, or a mid-turn terminal. */
  private isDone(p: PackedState): boolean {
    return p.result !== Result.ONGOING || p.side !== this.rootSide || p.turnNumber !== this.rootTurnNumber;
  }

  /**
   * Records one turn boundary. `terminal` is the action that produced it
   * (`END_ACTION`), or -1 when the last action already ended the game.
   */
  private record(terminal: PA, flags: number): void {
    const p = this.p as PackedState;
    this.endCount++;
    if (this.observer !== null) this.observer(p.kposLo, p.kposHi);
    // E2.2: one null test and, on the watched key only, two compares.
    const tr = this.trace;
    const watched = tr !== null && p.kposLo === tr.watchLo && p.kposHi === tr.watchHi;
    if (watched) {
      const t = tr as GenTrace;
      t.beamReached = 1;
      t.beamPlaceIndex = this.placeIndex;
      t.beamDepth = this.pathLen;
      t.beamKeepWidth = this.keptMax;
      if (t.hitLineLen === 0) this.captureWatched(t, terminal, flags);
    }
    if (this.keptMax === 0) return;
    const gain = this.score(p, this.sc, this.ply);
    if (watched) (tr as GenTrace).beamGainCc = gain;
    let slot: number;
    if (this.keptCount < this.keptMax) {
      slot = this.keptCount++;
    } else {
      let worst = 0;
      for (let i = 1; i < this.keptCount; i++) if (this.kept[i].gainCc < this.kept[worst].gainCc) worst = i;
      if (gain <= this.kept[worst].gainCc) {
        if (watched) {
          const t = tr as GenTrace;
          t.beamKeepDrops++;
          t.beamKeepCutoffCc = this.kept[worst].gainCc;
        }
        return;
      }
      slot = worst;
    }
    this.fill(this.kept[slot], terminal, flags, gain);
    this.keptSeq[slot] = this.endCount;
  }

  /** Copies the prefix + path + terminal that reached the watched end key. */
  private captureWatched(tr: GenTrace, terminal: PA, flags: number): void {
    let k = 0;
    for (let i = 0; i < this.prefixLen && k < tr.hitLine.length; i++) tr.hitLine[k++] = this.prefix[i];
    for (let i = 0; i < this.pathLen && k < tr.hitLine.length; i++) tr.hitLine[k++] = this.path[i];
    if (terminal >= 0 && k < tr.hitLine.length) tr.hitLine[k++] = terminal;
    tr.hitLineLen = k;
    tr.hitFlags = flags;
  }

  private fill(t: Turn, terminal: PA, flags: number, gain: Centi): void {
    const p = this.p as PackedState;
    let k = 0;
    for (let i = 0; i < this.prefixLen; i++) t.actions[k++] = this.prefix[i];
    for (let i = 0; i < this.pathLen; i++) t.actions[k++] = this.path[i];
    if (terminal >= 0) t.actions[k++] = terminal;
    t.count = k;
    t.endLo = p.kposLo;
    t.endHi = p.kposHi;
    t.gainCc = gain;
    t.place = this.placeIndex;
    t.flags = (flags & TACTICAL_FLAGS) === 0 ? flags | TurnFlag.QUIET : flags;
    t.sig = 0;
    t.hangCc = 0;
  }

  /** Sorts the kept turns best-first and writes them into `out`. */
  private emit(root: PackedState, out: Turn[]): number {
    const n = this.keptCount;
    this.order.length = 0;
    for (let i = 0; i < n; i++) this.order.push(i);
    // Insertion sort: descending `gainCc`, ties broken by discovery order.
    for (let i = 1; i < n; i++) {
      const idx = this.order[i];
      const gain = this.kept[idx].gainCc;
      const seq = this.keptSeq[idx];
      let j = i - 1;
      while (j >= 0) {
        const other = this.order[j];
        const otherGain = this.kept[other].gainCc;
        if (otherGain > gain || (otherGain === gain && this.keptSeq[other] <= seq)) break;
        this.order[j + 1] = other;
        j--;
      }
      this.order[j + 1] = idx;
    }
    for (let i = 0; i < n; i++) {
      const t = this.kept[this.order[i]];
      t.sig = turnSignature(root, t);
      out[i] = t;
    }
    return n;
  }

  private widthAt(step: number): number {
    const widths = this.cfg.widths;
    if (widths.length === 0) return 0;
    return step < widths.length ? widths[step] : widths[widths.length - 1];
  }

  /**
   * Stable partial selection of the `take` highest-priority actions of
   * `buf[0..n)`, in place. Rotation (rather than swapping) keeps ties in
   * generation order, which is what DESIGN §5.4's "stable-sort descending"
   * asks for. Skipped entirely when the width does not bind: the exploration
   * order then changes nothing but the discovery order of equally-scored kept
   * turns. See DEVIATIONS.md under M11.
   */
  private orderTop(step: number, n: number, take: number): void {
    const p = this.p as PackedState;
    const buf = this.buffers[step];
    const prio = this.priorities[step];
    const voided = this.voidedFor(step);
    const cat = this.rep.cat;
    for (let i = 0; i < n; i++) prio[i] = actionPriority(p, this.tables, cat, buf[i], voided, this.histMove);
    for (let i = 0; i < take; i++) {
      let best = i;
      for (let j = i + 1; j < n; j++) {
        if (prio[j] > prio[best]) best = j;
      }
      if (best === i) continue;
      const a = buf[best];
      const s = prio[best];
      for (let j = best; j > i; j--) {
        buf[j] = buf[j - 1];
        prio[j] = prio[j - 1];
      }
      buf[i] = a;
      prio[i] = s;
    }
  }

  /**
   * Per-square count of the enemy's currently-unblocked spawn anchors an
   * intruder on that square would void — `core/spawn.ts anchorsVoidedBy` for
   * all 100 squares at once, built at most once per node.
   */
  private voidedFor(step: number): Int32Array {
    const out = this.voided[step];
    if (this.voidedReady[step] === 1) return out;
    const p = this.p as PackedState;
    const victimSide = (1 - p.side) as Side;
    const mover = p.side as Side;
    this.friendly[0] = p.occBy[mover * 4];
    this.friendly[1] = p.occBy[mover * 4 + 1];
    this.friendly[2] = p.occBy[mover * 4 + 2];
    this.friendly[3] = p.occBy[mover * 4 + 3];
    out.fill(0);
    const rect = RECT[victimSide];
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const anchor = p.sq[slot];
      if (anchor === DEAD || p.owner[slot] !== victimSide) continue;
      const box = rect[anchor];
      if (bbIntersects(box, this.friendly)) continue;
      for (let s = bbNext(box, -1); s >= 0; s = bbNext(box, s)) out[s]++;
    }
    this.voidedReady[step] = 1;
    return out;
  }

  /** Flags this action adds to the line reaching it. `p` is the PRE-action state. */
  private flagsFor(step: number, a: PA): number {
    const flags = this.pathFlags[step];
    if (this.keptMax === 0) return flags;
    const p = this.p as PackedState;
    const side = p.side as Side;
    const kind = paKind(a);
    if (kind === AKind.ATTACK) {
      const slot = paA(a);
      const target = paB(a);
      const victim = p.pieceAt[target];
      if (victim === NO_SLOT) return flags;
      const cat = this.rep.cat;
      const victimDef = p.defId[victim];
      const power = cat.power[powerIndex(side, p.defId[slot], victimDef)];
      const effectiveDef = Math.max(0, cat.def[victimDef] - p.damage[victim]);
      if (power < effectiveDef) return flags;
      let next = flags | TurnFlag.KILL;
      if (p.atkCount[slot] > 0) next |= TurnFlag.CLEAVE_CHAIN;
      if ((p.uflags[slot] & F_PLACED) !== 0) next |= TurnFlag.SUMMON_STRIKE;
      return next;
    }
    if (kind === AKind.MOVE) {
      const slot = paA(a);
      const from = p.sq[slot];
      const to = paB(a);
      let next = flags;
      if (to === CORNER[1 - side]) next |= TurnFlag.HOME_ENTRY;
      if (this.voidedFor(step)[to] > 0) next |= TurnFlag.SPAWN_DENY;
      const exposed = this.tables.exposure[side];
      if (bbHas(exposed, from) && !bbHas(exposed, to)) next |= TurnFlag.RETREAT;
      return next;
    }
    return flags;
  }

  private naive(step: number, onEnd: EndObserver): void {
    const p = this.p as PackedState;
    if (++this.naiveCalls > this.naiveLimit) {
      this.aborted = true;
      return;
    }
    const buf = this.buffers[step];
    const n = this.rep.genActions(p, buf);
    for (let i = 0; i < n; i++) {
      const a = buf[i];
      const top = this.undo.top;
      this.rep.make(p, a, this.undo);
      if (this.isDone(p)) {
        this.endCount++;
        onEnd(p.kposLo, p.kposHi);
      } else if (step + 1 <= MAX_ACTION_STEPS) {
        this.naive(step + 1, onEnd);
      }
      this.rep.unmake(p, this.undo);
      this.undo.top = top;
      if (this.aborted) return;
    }
  }
}

function checkPrefix(prefix: Int32Array, prefixLen: number, who: string): void {
  if (prefixLen < 0 || prefixLen > prefix.length) {
    throw new RangeError(`${who}: prefixLen ${prefixLen} is outside prefix[0..${prefix.length})`);
  }
  if (prefixLen + MAX_ACTION_STEPS + 1 > MAX_TURN_ACTIONS) {
    throw new RangeError(`${who}: prefixLen ${prefixLen} leaves no room for an action phase in ${MAX_TURN_ACTIONS} slots`);
  }
}
