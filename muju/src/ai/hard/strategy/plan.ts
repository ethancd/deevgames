/**
 * STRATEGOS W1.9 — what the two Workflow 1 plans share (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part B.1's `contact.ts`
 * and `hold.ts` rows, B.1b, step W1.9): the plan-line record, the caller-owned
 * scratch, the work tally every query is charged from, and the small board
 * helpers both plans and the ForceContact rollouts read.
 *
 * A PLAN LINE is `{ contract, act, prep, label, feasibility, queries }`
 * (`PlanLine`): `act`/`prep` are what `gen/generate.ts playStrategyTurn`
 * makes into a complete turn (its Act actions, `END_ACTION`, the rules'
 * `PAY_UPKEEP`, its Prepare actions, `END_PLACE`), and the rest is the
 * `strategy/types.ts InjectedPlan` the Chronicle records. Every line is played
 * HERE, on the scratch's own copy of the root, through that same function,
 * before it is offered — so its `endKey` is the end position the generator
 * will record, and a line the rules refuse never reaches the generator.
 *
 * PURITY. Like every module in this directory: no module state. The scratch is
 * the caller's (`search/root.ts` owns one), holds nothing between calls that a
 * later call reads before rewriting, and owns its OWN `Replica`, so no plan
 * computation touches the search's undo stack, id stack or distance cache.
 *
 * WORK. Nothing here reads a clock. Each primitive a plan runs is counted in
 * work units on `PlanScratch.work` (the constants below), `PlanScratch.cap`
 * bounds the ForceContact rollouts, and `search/root.ts` charges the total to
 * the search meter once per search (`WorkClass.TURN`, one unit per unit).
 */
import { DEAD, F_CAN_ACT, F_LAST_KILLED, MAX_SLOTS, MAX_TURN_ACTIONS, NO_SLOT, Result, type PackedState, type Side, type Square } from '../types';
import { AKind, newKeepSetTable, paA, paB, paKind, paMake, type KeepSetTable } from '../core/action';
import { activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { Replica, allocState, copyState, newUndo, type Undo } from '../core/state';
import { ADJ_LIST } from '../core/tables';
import { Scratch, bbNew, type BB } from '../core/bits';
import { newSpawnInfo } from '../core/spawn';
import type { NodeTables } from '../tables/context';
import { newCleavePlan, type CleavePlan, type KillContext } from '../tables/kill';
import { firstLegalKeepSet, newStrategyTurn, playStrategyTurn, type StrategyLine, type StrategyTurn } from '../gen/generate';
import { killEta, newKillEtaScratch, type KillEtaReading, type KillEtaScratch } from './killeta';
import type { AnalysisQuery, InjectedPlan, Posture } from './types';

// ---------------------------------------------------------------------------
// the record
// ---------------------------------------------------------------------------

/** One plan line: the generator's `StrategyLine` plus the Chronicle's
 * `InjectedPlan` (contract, end key, label, feasibility, queries). */
export interface PlanLine extends StrategyLine, InjectedPlan {}

/** What one plan computation offers the root. */
export interface PlanSet {
  /** The posture the lines serve (`none` → no lines). */
  readonly posture: Posture;
  readonly lines: readonly PlanLine[];
  /** Every query this computation ran, in order (each line's own included). */
  readonly queries: readonly AnalysisQuery[];
  /** Work units the computation spent (`PlanScratch.work` at its end). */
  readonly work: number;
}

/** The empty packed-action list: a line with no Act, or a bare Prepare. */
export const NO_ACTIONS: Int32Array = new Int32Array(0);

// ---------------------------------------------------------------------------
// work units
// ---------------------------------------------------------------------------

/**
 * One `Replica.make` on a scratch board. DERIVED (DESIGN §8 `WORK_COST`,
 * `search/time.ts`: TURN = 1 unit per within-turn node, a `make` plus a
 * within-turn score; a plan `make` scores nothing, so charging it a whole
 * TURN errs toward over-charging). The anchor for the two below: units are
 * DESIGN §8's "≈ µs on the reference box".
 */
export const WORK_MAKE = 1;
/**
 * One distance row or board scan a policy step reads (a single- or
 * multi-source BFS, a strike ball, a `cleavePlan`, a `genPlace`). DERIVED
 * (measured 2026-09-24 on the lane box: a BFS row 1.5 µs, a within-turn node
 * 1.2–10 µs — one TURN); falsifier: the plan layer's measured wall time per
 * root exceeding its counted units by more than the engine's own
 * units-to-µs ratio on the same box.
 */
export const WORK_ROW = 1;
/**
 * One `strategy/killeta.ts killEta` call at the limits the plans pass
 * (`r ≤ 11`). DERIVED (same measurement: 8–118 µs, median about 25, against
 * `tables/kill.ts killTable`'s 2–28 µs at DESIGN §8's KILLTABLE price of 8);
 * falsifier as above. With it, a whole plan computation counts 30–160 units
 * against a measured 15–130 µs on the W1.9 fixtures and the Phasing corpus's
 * posture roots (the same measurement).
 */
export const WORK_KILL_ETA = 24;

// ---------------------------------------------------------------------------
// scratch
// ---------------------------------------------------------------------------

/** Genplace buffer: every tier-1 BUY on every square, every PROMOTE, END_PLACE.
 * DERIVED (`core/state.ts genPlace`): at most `tier1 × 100 + MAX_SLOTS + 1`. */
const PLACE_CAPACITY = 18 * 100 + MAX_SLOTS + 1;

export interface PlanScratch {
  /** The plans' OWN replica (never the search's). */
  readonly rep: Replica;
  readonly cat: Catalog;
  /** The root copy a line is played on (left at the line's end position). */
  readonly line: PackedState;
  /** The rollout board. */
  readonly roll: PackedState;
  readonly undo: Undo;
  readonly keep: KeepSetTable;
  /** The line's complete turn, as `playStrategyTurn` wrote it. */
  readonly actions: Int32Array;
  readonly turn: StrategyTurn;
  readonly eta: KillEtaScratch;
  readonly place: Int32Array;
  /** `tables/kill.ts cleavePlan`'s context: this scratch's distance cache. */
  readonly kill: KillContext;
  readonly killSc: Scratch;
  readonly cleave: CleavePlan;
  readonly maskA: BB;
  readonly maskB: BB;
  readonly rowA: Int8Array;
  readonly rowB: Int8Array;
  readonly rowC: Int8Array;
  /** Work units spent by the computation in progress. */
  work: number;
  /** The computation's budget; rollouts stop (`unresolved`) past it. */
  cap: number;
}

export function newPlanScratch(cat: Catalog = activeCatalog()): PlanScratch {
  const rep = new Replica(cat);
  return {
    rep,
    cat,
    line: allocState(),
    roll: allocState(),
    undo: newUndo(),
    keep: newKeepSetTable(),
    actions: new Int32Array(MAX_TURN_ACTIONS),
    turn: newStrategyTurn(),
    eta: newKillEtaScratch(),
    place: new Int32Array(PLACE_CAPACITY),
    kill: { dist: rep.dist, spawn: [newSpawnInfo(), newSpawnInfo()] },
    // `cleavePlan` borrows `KILL_SCRATCH_I8` (1) Int8 row at its ply.
    killSc: new Scratch(1, 0, 1, 0),
    cleave: newCleavePlan(),
    maskA: bbNew(),
    maskB: bbNew(),
    rowA: new Int8Array(100),
    rowB: new Int8Array(100),
    rowC: new Int8Array(100),
    work: 0,
    cap: 0,
  };
}

// ---------------------------------------------------------------------------
// playing lines
// ---------------------------------------------------------------------------

/**
 * Plays `line` from `root` as the complete turn the generator will record
 * (`playStrategyTurn`, the same function), on `s.line`. True when every
 * action was legal; `s.line` is then the position AFTER the turn and
 * `s.actions[0 … s.turn.count)` the turn. Forward-only: the undo record is
 * dropped, the next call starts from a fresh copy.
 */
export function playLine(root: PackedState, t: NodeTables, line: StrategyLine, s: PlanScratch): boolean {
  copyState(s.line, root);
  s.undo.top = 0;
  s.rep.resetUndoScratch();
  playStrategyTurn(s.rep, s.line, t, line, s.undo, s.keep, s.actions, s.turn);
  s.work += WORK_MAKE * (s.turn.count > 0 ? s.turn.count : line.act.length + line.prep.length + 1);
  s.undo.top = 0;
  s.rep.resetUndoScratch();
  return s.turn.count >= 0;
}

/**
 * Forward-only `make` on a scratch board (`decodeTurn`'s pattern: the undo
 * record of an applied action is never replayed, so both stacks are dropped
 * first). False, with nothing applied, when `rep.isLegal` refuses.
 */
export function forward(s: PlanScratch, p: PackedState, a: number, keep?: KeepSetTable): boolean {
  if (!s.rep.isLegal(p, a, keep)) return false;
  s.undo.top = 0;
  s.rep.resetUndoScratch();
  s.rep.make(p, a, s.undo, keep);
  s.work += WORK_MAKE;
  return true;
}

/**
 * Closes the turn in progress on a scratch board the way a plan line's turn
 * closes (`playStrategyTurn`): `END_ACTION` if still in Act, the first legal
 * ranked keep set if a bill is pending (`firstLegalKeepSet`). Leaves `p` in
 * its Prepare, ready for BUY/PROMOTE and `END_PLACE`. False when a boundary
 * action was refused or the game ended.
 */
export function enterPrepare(s: PlanScratch, p: PackedState, t: NodeTables): boolean {
  if (p.result !== Result.ONGOING) return false;
  if (p.phase === 1 && !forward(s, p, paMake(AKind.END_ACTION))) return false;
  if (p.result !== Result.ONGOING) return false;
  if (p.upkeepPending === 1) {
    const choice = firstLegalKeepSet(s.rep, p, t, s.keep);
    s.work += WORK_ROW;
    if (choice === null || !forward(s, p, paMake(AKind.PAY_UPKEEP, 0), choice)) return false;
  }
  return p.result === Result.ONGOING && p.phase === 0 && p.upkeepPending === 0;
}

/** The canonical end-key form (`search/root.ts keyHex`, `RootResult.endKey`). */
export function endKeyOf(p: PackedState): string {
  return `${(p.kposHi >>> 0).toString(16).padStart(8, '0')}${(p.kposLo >>> 0).toString(16).padStart(8, '0')}`;
}

/** `killEta` on a scratch board, charged. */
export function killEtaOn(s: PlanScratch, p: PackedState, side: Side, limit: number): KillEtaReading {
  s.work += WORK_KILL_ETA;
  return killEta(p, side, { limit }, s.eta);
}

// ---------------------------------------------------------------------------
// board helpers
// ---------------------------------------------------------------------------

/** Algebraic square name, `a1` = (0,0), for plan labels. */
export function sqName(sq: Square): string {
  return `${String.fromCharCode(97 + (sq % 10))}${Math.floor(sq / 10) + 1}`;
}

/** What a body of `def` would mine standing on `sq` next event (RULE
 * `core/state.ts makeEndAction`: `min(mine, reserve)`). */
export function cellYield(cat: Catalog, p: PackedState, def: number, sq: Square): number {
  const m = cat.mine[def];
  const r = p.reserve[sq];
  return m < r ? m : r;
}

/** Attack power of `attacker` (a live slot) against `victim` (a live slot),
 * `combat.ts calculateAttackPower` through the catalogue's table. */
export function powerOf(cat: Catalog, p: PackedState, attacker: number, victim: number): number {
  return cat.power[powerIndex(p.owner[attacker] as Side, p.defId[attacker], p.defId[victim])];
}

/** `combat.ts canAttack` on a packed unit (no tier cap since phasing-4). */
export function canAttackNow(p: PackedState, slot: number): boolean {
  if ((p.uflags[slot] & F_CAN_ACT) === 0) return false;
  return p.atkCount[slot] === 0 || (p.uflags[slot] & F_LAST_KILLED) !== 0;
}

/** Does `side` have a live unit with nonzero power against some live enemy
 * unit — i.e. could any attack of its do damage at all? */
export function sideCanDamage(cat: Catalog, p: PackedState, side: Side): boolean {
  for (let a = 0; a < MAX_SLOTS; a++) {
    if (p.sq[a] === DEAD || p.owner[a] !== side) continue;
    for (let v = 0; v < MAX_SLOTS; v++) {
      if (p.sq[v] === DEAD || p.owner[v] === side) continue;
      if (powerOf(cat, p, a, v) > 0) return true;
    }
  }
  return false;
}

/**
 * The first damaging attack `side` has on `p` right now (slot ascending, then
 * target square ascending): an `ATTACK` whose power is nonzero, i.e. one that
 * does damage (`combat.ts resolveCombat`), or -1. What "a damaging attack has
 * been made" (`PlanEndPredicate 'damaging-attack'`) counts.
 */
export function damagingAttack(s: PlanScratch, p: PackedState, side: Side): number {
  if (p.phase !== 1 || p.actions <= 0 || p.side !== side) return -1;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const at = p.sq[slot];
    if (at === DEAD || p.owner[slot] !== side || !canAttackNow(p, slot)) continue;
    let best = -1;
    for (let k = 0; k < 4; k++) {
      const q = ADJ_LIST[at * 4 + k];
      if (q < 0) continue;
      const v = p.pieceAt[q];
      if (v === NO_SLOT || p.owner[v] === side || powerOf(s.cat, p, slot, v) <= 0) continue;
      if (best < 0 || q < best) best = q;
    }
    if (best >= 0) return paMake(AKind.ATTACK, slot, best, 0);
  }
  return -1;
}

/** Whether replaying `act` from `root` makes a damaging attack (power read
 * before each attack lands). Charged like any other forward replay. */
export function actDamages(s: PlanScratch, root: PackedState, act: Int32Array): boolean {
  if (act.length === 0) return false;
  copyState(s.roll, root);
  s.roll.proverMode = 1; // Act actions only: the admissible bound suffices (contact.ts ROLLOUT_PROVER_MODE)
  const p = s.roll;
  for (let i = 0; i < act.length; i++) {
    const a = act[i];
    if (paKind(a) === AKind.ATTACK) {
      const v = p.pieceAt[paB(a)];
      if (v !== NO_SLOT && powerOf(s.cat, p, paA(a), v) > 0) return true;
    }
    if (!forward(s, p, a)) return false;
  }
  return false;
}

/**
 * The fastest affordable tier-1 BUY on the legal spawn square nearest the
 * enemy (plan W1.9's ForceContact (b), and the rollouts' own buy), from the
 * Prepare position `p`: among `genPlace`'s BUYs, the class first by nonzero
 * power against `targetDef` (CHOICE: a fast body that cannot hurt the target
 * does not force contact with it; falsifier: an exam case where the
 * zero-power fast buy is the one that reaches contact), then speed, then power,
 * then price, then definition; the square by Manhattan distance to the nearest
 * live enemy unit, then index. -1 when no BUY is legal.
 */
export function fastestBuyNearEnemy(s: PlanScratch, p: PackedState, targetDef: number): number {
  const n = s.rep.genPlace(p, s.place);
  s.work += WORK_ROW;
  const cat = s.cat;
  const side = p.side as Side;
  let best = -1;
  let bKeys: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = s.place[i];
    if (paKind(a) !== AKind.BUY) continue;
    const def = paA(a);
    const sq = paB(a);
    const pow = targetDef >= 0 ? cat.power[powerIndex(side, def, targetDef)] : cat.atk[def];
    const keys = [pow > 0 ? 0 : 1, -cat.spd[def], -pow, cat.cost[def], def, nearestEnemyManhattan(p, side, sq), sq];
    if (best < 0 || lexLess(keys, bKeys)) {
      best = a;
      bKeys = keys;
    }
  }
  return best;
}

/** Manhattan distance from `sq` to the nearest live unit NOT owned by `side`
 * (`BOARD` squares when there is none). */
export function nearestEnemyManhattan(p: PackedState, side: Side, sq: Square): number {
  let best = 100;
  const x = sq % 10;
  const y = (sq / 10) | 0;
  for (let v = 0; v < MAX_SLOTS; v++) {
    const e = p.sq[v];
    if (e === DEAD || p.owner[v] === side) continue;
    const d = Math.abs((e % 10) - x) + Math.abs(((e / 10) | 0) - y);
    if (d < best) best = d;
  }
  return best;
}

/** Lexicographic `<` on two equal-length key tuples. */
export function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/** The most expensive live unit `side` has, in crystals (0 with none). */
export function maxUnitCost(cat: Catalog, p: PackedState, side: Side): number {
  let best = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    if (cat.cost[p.defId[slot]] > best) best = cat.cost[p.defId[slot]];
  }
  return best;
}

/** Crystals the Prepare actions of `prep` cost at `root` prices. */
export function prepSpend(cat: Catalog, root: PackedState, prep: Int32Array): number {
  let spend = 0;
  for (let i = 0; i < prep.length; i++) {
    const a = prep[i];
    if (paKind(a) === AKind.BUY) spend += cat.cost[paA(a)];
    else if (paKind(a) === AKind.PROMOTE) spend += cat.promoCost[root.defId[paA(a)]];
  }
  return spend;
}
