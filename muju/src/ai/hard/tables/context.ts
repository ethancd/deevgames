/**
 * `NodeTables` — the frozen two-level knowledge contract (DESIGN §4.8).
 *
 * A `NodeTables` is the per-macro-node scratchpad the generator, the ordering
 * and the evaluator read. Level 1 is the cheap half (distances, strike maps,
 * spawn geometry, home safety); level 2 adds the expensive tables (kill DP,
 * approach, cleave chains, economy DP). `allocTables()` hands out an instance
 * whose every buffer is allocated once and then written in place;
 * `buildTables()` fills it by calling `threat.ts`, `spawn.ts`, `home.ts` and
 * `geometry.ts`, and at level 2 `kill.ts`, `approach.ts`, `kill.ts cleaveChain`
 * and `economy.ts`, in exactly that order.
 *
 * LEVEL-2 RESULT SHAPES. M6 wrote `KillEntry`, `KillTable`, `HomeSafety`,
 * `SpawnGeometry` and `EconResult` out here field for field, because
 * `tables/kill.ts`, `tables/home.ts`, `tables/geometry.ts` and
 * `tables/economy.ts` were being built CONCURRENTLY by M7–M9 and could not be
 * imported. All of those modules have landed, so — as M6's header anticipated
 * — the declarations are now re-exports of the originals and the duplicate
 * constructors are gone. The import edge `context → geometry → context` that
 * this closes is safe: `geometry.ts`'s only value import from here is
 * `KILL_NEVER`, which it reads inside a function and not during module
 * initialisation.
 *
 * CACHING. `keyLo`/`keyHi`/`level` are the contract's own memo: `buildTables`
 * keys the filled tables on `Kturn` (the complete state key — DESIGN §3.3:
 * `Kturn = Kpos ⊕ phase ⊕ actions ⊕ atkCount ⊕ uflags`) folded with the
 * catalogue signature, plus exact slot and canonical identity guards. The
 * public keys deliberately omit order/IDs, but chronological economy windows
 * carry them and pending features compare root-live birth identities. Thus
 * `stage1` followed by `stage2` on the same position
 * upgrades level 1 to level 2 instead of rebuilding it (DESIGN §5.12.4's lazy
 * driver calls exactly that pair). A fresh `allocTables()` carries the
 * `UNBUILT` sentinel so its zeroed buffers can never be mistaken for a hit.
 */
import { DEAD, MAX_SLOTS, PEND_STRIDE, type PackedState, type Side } from '../types';
import { bbNew, bbSet, type BB, type Scratch } from '../core/bits';
import { ACTIONS_PER_TURN } from '../core/state';
import { activeCatalog } from '../core/catalog';
import { createDistanceCache, type DistanceCache, type ReachMemo } from '../core/movement';
import { newSpawnInfo, spawnInfo, type SpawnInfo } from '../core/spawn';
import { BOARD, CORNER } from '../core/tables';
import { STRIKE_MOVE_ACTIONS, refreshExposure, strikeArea, strikeIfBoughtArea } from './threat';
import { APPROACH_SCRATCH_BB, APPROACH_SCRATCH_I8, approachTable } from './approach';
import {
  KILL_MAX_LANES,
  KILL_SCRATCH_I8,
  cleaveChain,
  killTable,
  newKillTable,
  type KillOpts,
  type KillTable,
} from './kill';
import { newEconResult, type EconResult } from './economy';
import { phasingEconomy } from './phasing-economy';
import { newSpawnGeometry, spawnGeometry, type SpawnGeometry } from './geometry';
import { homeSafety, newHomeSafety, type HomeSafety } from './home';
import type { EvalFix } from '../config';

export type { KillEntry, KillTable } from './kill';
export type { HomeSafety } from './home';
export type { SpawnGeometry } from './geometry';
export type { EconResult } from './economy';

/** `killActions` sentinel: this slot can never be killed next turn (DESIGN §4.8). */
export const KILL_NEVER = 127;

/** `Scratch` dimensions `buildTables` requires per ply: the max over the table
 * modules it drives (`approach.ts` wants seven bitboards and one Int8 row,
 * `kill.ts` one Int8 row, the rest own their scratch). */
export const TABLE_SCRATCH_BB = APPROACH_SCRATCH_BB;
export const TABLE_SCRATCH_I8 = APPROACH_SCRATCH_I8 > KILL_SCRATCH_I8 ? APPROACH_SCRATCH_I8 : KILL_SCRATCH_I8;

export interface NodeTables {
  keyLo: number;
  keyHi: number;
  /** Exact slot→square identity guard: Kturn itself is square-keyed. */
  slotSquares: Uint8Array;
  level: 1 | 2;
  /** The mover at this node. */
  side: Side;

  // --- level 1 ---
  dist: DistanceCache;
  /** Squares each side can attack this turn: ∪ `dilate(reach(u, spd, 3) ∪ {u})` (DESIGN §5.1). */
  strike: [BB, BB];
  /** Existing bodies at next Act, with simultaneous arrivals blocking paths. */
  strikeNext: [BB, BB];
  /** Legacy name: valid already-paid pending arrivals at next Act. */
  strikeIfBought: [BB, BB];
  /** `strikeNext[other] | strikeIfBought[other]`. */
  exposure: [BB, BB];
  spawn: [SpawnInfo, SpawnInfo];
  /** Multi-source BFS from `CORNER[side]`: every square's distance to that corner. */
  cornerDist: [Int8Array, Int8Array];
  home: [HomeSafety, HomeSafety];
  geom: [SpawnGeometry, SpawnGeometry];

  // --- level 2 ---
  /** [MAX_SLOTS] min actions for the OWNER's ENEMY to kill this slot next turn; `KILL_NEVER` = never. */
  killActions: Int8Array;
  /** [MAX_SLOTS] crystals of the cheapest such plan. */
  killCrystals: Int16Array;
  /** [MAX_SLOTS]. */
  killNeedsBuy: Uint8Array;
  /** What each side can kill THIS turn (mover: actions left; other: 4). */
  killNow: [KillTable, KillTable];
  /** [MAX_SLOTS] `Approach` class of the cheapest lethal enemy attacker of this slot. */
  approach: Uint8Array;
  /** [MAX_SLOTS] retreat squares of that attacker outside our strike. */
  retreats: Uint8Array;
  /** [MAX_SLOTS] Cleave-chain value (cc) exposed by this enemy tier-2+ unit. */
  chain: Int16Array;
  econ: [EconResult, EconResult];
  /** Monotone actually-executed forecast proof work; cache hits add zero. */
  economyProverCalls: number;
  economyCappedProverCalls: number;

  // --- not a DESIGN §4.8 table ---
  /**
   * The E3.2 correctness flags this node's tables are computed under, or
   * `null` — which is what `allocTables` hands out and what every existing
   * caller therefore gets. Additive to DESIGN §4.8 (see DEVIATIONS under M12):
   * `economyDP` (B1, B2, B5), `eval/invariants.ts` (B4) and `eval/features.ts`
   * (B3) all take `NodeTables` already, so carrying the block here is what
   * lets an arm turn a fix on without changing one normative signature or one
   * of the ~40 `allocTables`/`buildTables` call sites in `src`, `lab` and
   * `tests`. `HardEngine`'s constructor stamps it on the search's per-ply
   * tables and `Evaluator`'s constructor on its own; nothing else writes it,
   * so `null` is the champion and the champion is byte-identical.
   */
  evalFix: EvalFix | null;
}

/** `keyLo`/`keyHi` of a `NodeTables` nothing has been computed into yet. A real
 * `Kturn` matching this pair is a 1-in-2^64 event. */
const UNBUILT = 0xffffffff;

/** Cache-local metadata, not a change to public Kpos/Kturn semantics. */
interface IdentityGuard {
  valid: boolean;
  ord: Int32Array;
  originIds: string[];
  ordNext: number;
  pendOrd: Int32Array;
  pendIds: string[];
  pendOrdNext: number;
}
const identities = new WeakMap<NodeTables, IdentityGuard>();
function identityGuard(out: NodeTables): IdentityGuard {
  let guard = identities.get(out);
  if (guard === undefined) {
    guard = { valid: false, ord: new Int32Array(MAX_SLOTS), originIds: [], ordNext: 0,
      pendOrd: new Int32Array(2 * PEND_STRIDE), pendIds: [], pendOrdNext: 0 };
    identities.set(out, guard);
  }
  return guard;
}
function sameIdentity(p: PackedState, guard: IdentityGuard): boolean {
  if (!guard.valid || guard.ordNext !== p.ordNext || guard.pendOrdNext !== p.pendOrdNext ||
    guard.originIds.length !== p.originIds.length || guard.pendIds.length !== p.pendIds.length) return false;
  for (let i = 0; i < MAX_SLOTS; i++) if (guard.ord[i] !== p.ord[i]) return false;
  for (let i = 0; i < 2 * PEND_STRIDE; i++) if (guard.pendOrd[i] !== p.pendOrd[i]) return false;
  for (let i = 0; i < p.originIds.length; i++) if (guard.originIds[i] !== p.originIds[i]) return false;
  for (let i = 0; i < p.pendIds.length; i++) if (guard.pendIds[i] !== p.pendIds[i]) return false;
  return true;
}
function stampIdentity(p: PackedState, guard: IdentityGuard): void {
  guard.ord.set(p.ord); guard.pendOrd.set(p.pendOrd);
  guard.ordNext = p.ordNext; guard.pendOrdNext = p.pendOrdNext;
  // Preserve sparse ID arrays, including their length, without retaining the
  // caller's mutable buffers or allocating per rebuilt position.
  guard.originIds.length = 0; guard.pendIds.length = 0;
  for (let i = 0; i < p.originIds.length; i++) if (p.originIds[i] !== undefined) guard.originIds[i] = p.originIds[i];
  for (let i = 0; i < p.pendIds.length; i++) if (p.pendIds[i] !== undefined) guard.pendIds[i] = p.pendIds[i];
  guard.originIds.length = p.originIds.length; guard.pendIds.length = p.pendIds.length;
  guard.valid = true;
}

/**
 * One node's tables, every buffer allocated once. `memo` is E4.3 candidate C's
 * shared reach memo (`searchFix.reachCache`), `null` for every existing caller
 * and for the champion. The result is in the
 * "nothing computed yet" state: `killActions` is `KILL_NEVER` everywhere,
 * `cornerDist` is `-1` everywhere (the `bfsFrom` sentinel for "unreachable")
 * and every mask is empty.
 */
export function allocTables(memo: ReachMemo | null = null): NodeTables {
  const t: NodeTables = {
    keyLo: UNBUILT,
    keyHi: UNBUILT,
    slotSquares: new Uint8Array(MAX_SLOTS).fill(DEAD),
    level: 1,
    side: 0,
    dist: createDistanceCache(undefined, memo),
    strike: [bbNew(), bbNew()],
    strikeNext: [bbNew(), bbNew()],
    strikeIfBought: [bbNew(), bbNew()],
    exposure: [bbNew(), bbNew()],
    spawn: [newSpawnInfo(), newSpawnInfo()],
    cornerDist: [new Int8Array(BOARD), new Int8Array(BOARD)],
    home: [newHomeSafety(), newHomeSafety()],
    geom: [newSpawnGeometry(), newSpawnGeometry()],
    killActions: new Int8Array(MAX_SLOTS),
    killCrystals: new Int16Array(MAX_SLOTS),
    killNeedsBuy: new Uint8Array(MAX_SLOTS),
    killNow: [newKillTable(), newKillTable()],
    approach: new Uint8Array(MAX_SLOTS),
    retreats: new Uint8Array(MAX_SLOTS),
    chain: new Int16Array(MAX_SLOTS),
    econ: [newEconResult(), newEconResult()],
    economyProverCalls: 0, economyCappedProverCalls: 0,
    evalFix: null,
  };
  t.killActions.fill(KILL_NEVER);
  t.cornerDist[0].fill(-1);
  t.cornerDist[1].fill(-1);
  return t;
}

/** `CORNER[side]` as a singleton bitboard, for `DistanceCache.multi`. */
const CORNER_BB: readonly [BB, BB] = (() => {
  const white = bbNew();
  bbSet(white, CORNER[0]);
  const black = bbNew();
  bbSet(black, CORNER[1]);
  return [white, black];
})();

/** `approachTable` fills the WHOLE of its two outputs and writes only the
 * defender's own slots, so the two sides are gathered separately and merged. */
const APPROACH_CLASS: readonly [Uint8Array, Uint8Array] = [new Uint8Array(MAX_SLOTS), new Uint8Array(MAX_SLOTS)];
const APPROACH_RETREATS: readonly [Uint8Array, Uint8Array] = [new Uint8Array(MAX_SLOTS), new Uint8Array(MAX_SLOTS)];

const NEXT_TURN_TABLES: [KillTable, KillTable] = [newKillTable(), newKillTable()];
const KILL_OPTS: KillOpts = {
  actionBudget: ACTIONS_PER_TURN, crystalBudget: 0,
  allowBuys: false, allowPromotes: false, maxLanes: KILL_MAX_LANES,
};
function killOptsFor(budget: number, horizon: 'current' | 'nextAct'): KillOpts {
  KILL_OPTS.actionBudget = budget;
  KILL_OPTS.horizon = horizon;
  return KILL_OPTS;
}

function buildLevel1(p: PackedState, sc: Scratch, ply: number, t: NodeTables): void {
  // threat.ts — strike, strikeIfBought, exposure.
  const currentMoves = Math.max(0, Math.min(STRIKE_MOVE_ACTIONS, p.actions - 1));
  strikeArea(p, 0, t, p.side === 0 ? currentMoves : STRIKE_MOVE_ACTIONS, t.strike[0]);
  strikeArea(p, 1, t, p.side === 1 ? currentMoves : STRIKE_MOVE_ACTIONS, t.strike[1]);
  strikeArea(p, 0, t, STRIKE_MOVE_ACTIONS, t.strikeNext[0], 'nextAct');
  strikeArea(p, 1, t, STRIKE_MOVE_ACTIONS, t.strikeNext[1], 'nextAct');
  strikeIfBoughtArea(p, 0, t, t.strikeIfBought[0]);
  strikeIfBoughtArea(p, 1, t, t.strikeIfBought[1]);
  refreshExposure(t);

  // spawn.ts — the two legal spawn masks (home.ts reads `spawn[enemy].legal`).
  spawnInfo(p, 0, t.spawn[0]);
  spawnInfo(p, 1, t.spawn[1]);

  // The level-2 arrays are cleared HERE, not in `buildLevel2`: `geometry.ts`
  // reads `killActions` for its `fragility` term and must see the honest
  // "not computed" value (`KILL_NEVER`) while level 1 is being built.
  t.killActions.fill(KILL_NEVER);
  t.killCrystals.fill(0);
  t.killNeedsBuy.fill(0);
  t.approach.fill(0);
  t.retreats.fill(0);
  t.chain.fill(0);

  // home.ts uses projected arrival occupancy; the public corner distance
  // field remains the live-board distance and is filled independently.
  homeSafety(p, t, 0, t.home[0]);
  homeSafety(p, t, 1, t.home[1]);
  t.dist.multi(p, CORNER_BB[0], t.cornerDist[0]);
  t.dist.multi(p, CORNER_BB[1], t.cornerDist[1]);

  // geometry.ts — spawn geometry (`blocking` reads `exposure`, above).
  spawnGeometry(p, t, 0, sc, ply, t.geom[0]);
  spawnGeometry(p, t, 1, sc, ply, t.geom[1]);
}

function buildLevel2(p: PackedState, sc: Scratch, ply: number, t: NodeTables): void {
  const mover = p.side;
  const other = (1 - mover) as Side;
  let moverBudget = p.actions;
  if (moverBudget < 0) moverBudget = 0;
  else if (moverBudget > ACTIONS_PER_TURN) moverBudget = ACTIONS_PER_TURN;

  // The mover has no remaining Act during Prepare. Other-side current
  // queries still describe live bodies only; nextAct explicitly resets flags.
  if (p.phase === 0) moverBudget = 0;
  killTable(p, t, mover, killOptsFor(moverBudget, 'current'), sc, ply, t.killNow[mover]);
  killTable(p, t, other, killOptsFor(ACTIONS_PER_TURN, 'current'), sc, ply, t.killNow[other]);
  for (let side = 0; side < 2; side++) {
    killTable(p, t, side as Side, killOptsFor(ACTIONS_PER_TURN, 'nextAct'), sc, ply, NEXT_TURN_TABLES[side]);
  }
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD) continue;
    const e = NEXT_TURN_TABLES[1 - p.owner[slot]].entry[slot];
    t.killActions[slot] = e.minActions <= ACTIONS_PER_TURN ? e.minActions : KILL_NEVER;
    t.killCrystals[slot] = 0;
    // Arrivals have already been paid. Do not activate legacy HangingBuy.
    t.killNeedsBuy[slot] = 0;
  }

  // approach.ts — one pass per defender, merged by owner.
  approachTable(p, t, 0, sc, ply, APPROACH_CLASS[0], APPROACH_RETREATS[0], 'nextAct');
  approachTable(p, t, 1, sc, ply, APPROACH_CLASS[1], APPROACH_RETREATS[1], 'nextAct');
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD) continue;
    const owner = p.owner[slot];
    t.approach[slot] = APPROACH_CLASS[owner][slot];
    t.retreats[slot] = APPROACH_RETREATS[owner][slot];
  }

  // kill.ts — Cleave chains for the tier-2-and-up bodies (DESIGN §4.8: `chain`
  // is "the value exposed by this enemy tier-2+ unit"; both sides are filled,
  // since the feature is a symmetric difference).
  const cat = activeCatalog();
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || cat.tier[p.defId[slot]] < 2) continue;
    const value = cleaveChain(p, t, slot, sc, ply);
    t.chain[slot] = value > 32767 ? 32767 : value;
  }

  // Exact Phasing pass-only lifecycle; the historical relocation DP is diagnostic only.
  try {
    phasingEconomy(p, t.econ);
  } finally {
    // Preserve executed work even if a capped proof vetoes the forecast.
    t.economyProverCalls += t.econ[0].forecastProverCalls;
    t.economyCappedProverCalls += t.econ[0].cappedProverCalls;
  }

  // `fragility` is the one geometry field DESIGN §5.12.1 classifies as
  // "geom + kill" (feature 35, an L2 feature): `geometry.ts` computes it from
  // `killActions[deepest anchor]`, which was still `KILL_NEVER` when level 1
  // ran. Re-running `spawnGeometry` here is what makes the field mean what the
  // feature table says it means; every other geometry field is unchanged by
  // the second pass, its inputs being level-1 only. See DEVIATIONS under M12.
  spawnGeometry(p, t, 0, sc, ply, t.geom[0]);
  spawnGeometry(p, t, 1, sc, ply, t.geom[1]);
}

/**
 * Fill `out` for `p` at `level` (DESIGN §4.8). Returns `out`.
 *
 * Idempotent per position: a second call at the same or a lower level is a
 * no-op, and a level-2 call after a level-1 call on the same position adds
 * only the level-2 half.
 */
export function buildTables(
  p: PackedState,
  sc: Scratch,
  ply: number,
  level: 1 | 2,
  out: NodeTables,
): NodeTables {
  const keyLo = (p.kturnLo ^ p.catalogSignature) >>> 0;
  const keyHi = p.kturnHi >>> 0;
  const identity = identityGuard(out);
  let hit = out.keyLo === keyLo && out.keyHi === keyHi && sameIdentity(p, identity);
  if (hit) {
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (out.slotSquares[slot] !== p.sq[slot]) { hit = false; break; }
    }
  }
  if (hit && out.level >= level) return out;
  if (!hit) {
    // A failed rebuild must not leave the previous position's stamp attached
    // to partially overwritten buffers. A failed L2 upgrade remains L1 only.
    identity.valid = false;
    out.level = 1;
    buildLevel1(p, sc, ply, out);
    out.keyLo = keyLo;
    out.keyHi = keyHi;
    out.slotSquares.set(p.sq);
    out.side = p.side;
    stampIdentity(p, identity);
  }
  if (level === 2) {
    buildLevel2(p, sc, ply, out);
    out.level = 2;
  }
  return out;
}
