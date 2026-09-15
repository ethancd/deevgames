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
 * catalogue signature, so `stage1` followed by `stage2` on the same position
 * upgrades level 1 to level 2 instead of rebuilding it (DESIGN §5.12.4's lazy
 * driver calls exactly that pair). A fresh `allocTables()` carries the
 * `UNBUILT` sentinel so its zeroed buffers can never be mistaken for a hit.
 */
import { DEAD, MAX_SLOTS, NO_SLOT, type PackedState, type Side } from '../types';
import { bbNew, bbSet, type BB, type Scratch } from '../core/bits';
import { ACTIONS_PER_TURN } from '../core/state';
import { activeCatalog } from '../core/catalog';
import { createDistanceCache, type DistanceCache } from '../core/movement';
import { newSpawnInfo, spawnInfo, type SpawnInfo } from '../core/spawn';
import { BOARD, CORNER } from '../core/tables';
import { STRIKE_MOVE_ACTIONS, refreshExposure, strikeArea, strikeIfBoughtArea } from './threat';
import { APPROACH_SCRATCH_BB, APPROACH_SCRATCH_I8, approachTable } from './approach';
import {
  KILL_MAX_LANES,
  KILL_SCRATCH_I8,
  cleaveChain,
  killTable,
  minActionsToKill,
  newKillPlan,
  newKillTable,
  type KillOpts,
  type KillPlan,
  type KillTable,
} from './kill';
import { economyDP, newEconResult, type EconResult } from './economy';
import { newSpawnGeometry, spawnGeometry, type SpawnGeometry } from './geometry';
import { homeSafety, newHomeSafety, type HomeSafety } from './home';

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
  level: 1 | 2;
  /** The mover at this node. */
  side: Side;

  // --- level 1 ---
  dist: DistanceCache;
  /** Squares each side can attack this turn: ∪ `dilate(reach(u, spd, 3) ∪ {u})` (DESIGN §5.1). */
  strike: [BB, BB];
  /** The same for units not yet bought (DESIGN §5.2). */
  strikeIfBought: [BB, BB];
  /** `strike[other] | strikeIfBought[other]`. */
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
}

/** `keyLo`/`keyHi` of a `NodeTables` nothing has been computed into yet. A real
 * `Kturn` matching this pair is a 1-in-2^64 event. */
const UNBUILT = 0xffffffff;

/**
 * One node's tables, every buffer allocated once. The result is in the
 * "nothing computed yet" state: `killActions` is `KILL_NEVER` everywhere,
 * `cornerDist` is `-1` everywhere (the `bfsFrom` sentinel for "unreachable")
 * and every mask is empty.
 */
export function allocTables(): NodeTables {
  const t: NodeTables = {
    keyLo: UNBUILT,
    keyHi: UNBUILT,
    level: 1,
    side: 0,
    dist: createDistanceCache(),
    strike: [bbNew(), bbNew()],
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

/** The mover's "next turn" kill table, for the mid-turn case where
 * `killNow[mover]` (this turn's short budget) cannot double as `killActions`. */
const NEXT_TURN_TABLE: KillTable = newKillTable();

/** `refineNeedsBuy`'s throwaway plan. */
const NO_BUY_PLAN: KillPlan = newKillPlan();

const NO_BUY_OPTS: KillOpts = {
  actionBudget: ACTIONS_PER_TURN,
  crystalBudget: 0,
  allowBuys: false,
  allowPromotes: true,
  maxLanes: KILL_MAX_LANES,
};

const KILL_OPTS: KillOpts = {
  actionBudget: ACTIONS_PER_TURN,
  crystalBudget: 0,
  allowBuys: true,
  allowPromotes: true,
  maxLanes: KILL_MAX_LANES,
};

function killOptsFor(p: PackedState, attacker: Side, budget: number): KillOpts {
  KILL_OPTS.actionBudget = budget;
  KILL_OPTS.crystalBudget = p.bank[attacker];
  return KILL_OPTS;
}

function buildLevel1(p: PackedState, sc: Scratch, ply: number, t: NodeTables): void {
  // threat.ts — strike, strikeIfBought, exposure.
  strikeArea(p, 0, t, STRIKE_MOVE_ACTIONS, t.strike[0]);
  strikeArea(p, 1, t, STRIKE_MOVE_ACTIONS, t.strike[1]);
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

  // home.ts — `homeSafety` fills `cornerDist[side]` itself through
  // `nearestThreat`, but only when `CORNER[side]` is empty (a body standing
  // there makes the whole purchase branch moot). `cornerDist` is a level-1
  // FIELD of the contract, so the plugged case is filled here.
  homeSafety(p, t, 0, t.home[0]);
  homeSafety(p, t, 1, t.home[1]);
  if (p.pieceAt[CORNER[0]] !== NO_SLOT) t.dist.multi(p, CORNER_BB[0], t.cornerDist[0]);
  if (p.pieceAt[CORNER[1]] !== NO_SLOT) t.dist.multi(p, CORNER_BB[1], t.cornerDist[1]);

  // geometry.ts — spawn geometry (`blocking` reads `exposure`, above).
  spawnGeometry(p, t, 0, sc, ply, t.geom[0]);
  spawnGeometry(p, t, 1, sc, ply, t.geom[1]);
}

/** Can the owner's enemy still remove `slot` next turn using no purchases? */
function killableWithoutBuys(p: PackedState, t: NodeTables, slot: number, sc: Scratch, ply: number): boolean {
  const attacker = (1 - p.owner[slot]) as Side;
  NO_BUY_OPTS.crystalBudget = p.bank[attacker];
  if (!minActionsToKill(p, t, attacker, slot, NO_BUY_OPTS, sc, ply, NO_BUY_PLAN)) return false;
  return NO_BUY_PLAN.actions <= ACTIONS_PER_TURN;
}

function buildLevel2(p: PackedState, sc: Scratch, ply: number, t: NodeTables): void {
  const mover = p.side;
  const other = (1 - mover) as Side;
  let moverBudget = p.actions;
  if (moverBudget < 0) moverBudget = 0;
  else if (moverBudget > ACTIONS_PER_TURN) moverBudget = ACTIONS_PER_TURN;

  // kill.ts — `killNow` (this turn) for both sides...
  killTable(p, t, mover, killOptsFor(p, mover, moverBudget), sc, ply, t.killNow[mover]);
  killTable(p, t, other, killOptsFor(p, other, ACTIONS_PER_TURN), sc, ply, t.killNow[other]);

  // ...and `killActions` (NEXT turn, full budget, buys and promotions on) per
  // slot, taken from the table belonging to the OWNER's enemy. `killNow[other]`
  // is already a full-budget table, so only the mover's side can need a second
  // pass, and only while it is mid-turn.
  const moverNext =
    moverBudget === ACTIONS_PER_TURN
      ? t.killNow[mover]
      : killTable(p, t, mover, killOptsFor(p, mover, ACTIONS_PER_TURN), sc, ply, NEXT_TURN_TABLE);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD) continue;
    const table = p.owner[slot] === mover ? t.killNow[other] : moverNext;
    const e = table.entry[slot];
    if (e.minActions > ACTIONS_PER_TURN) {
      t.killActions[slot] = KILL_NEVER;
      t.killCrystals[slot] = 0;
      t.killNeedsBuy[slot] = 0;
      continue;
    }
    t.killActions[slot] = e.minActions;
    t.killCrystals[slot] = e.minCrystals;
    // `killNeedsBuy` means "there is NO plan without a purchase", which is what
    // its only consumer asks for (DESIGN §5.12.1 #29 `HangingBuy`: "only via a
    // purchase"). `KillEntry.needsBuy` is weaker — it reports whether the ONE
    // lexicographically cheapest plan the DP happened to return uses a buy, and
    // a purchase at cost 4 ties exactly with a promotion at `promoCost` 4, so
    // the flag can flip on nothing but candidate order. The tie is resolved
    // here by asking the same question again with buys switched off.
    t.killNeedsBuy[slot] = e.needsBuy === 1 && !killableWithoutBuys(p, t, slot, sc, ply) ? 1 : 0;
  }

  // approach.ts — one pass per defender, merged by owner.
  approachTable(p, t, 0, sc, ply, APPROACH_CLASS[0], APPROACH_RETREATS[0]);
  approachTable(p, t, 1, sc, ply, APPROACH_CLASS[1], APPROACH_RETREATS[1]);
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

  // economy.ts — the six-turn income/upkeep projection with relocation.
  economyDP(p, t, 0, sc, ply, t.econ[0]);
  economyDP(p, t, 1, sc, ply, t.econ[1]);

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
  const hit = out.keyLo === keyLo && out.keyHi === keyHi;
  if (hit && out.level >= level) return out;
  if (!hit) {
    buildLevel1(p, sc, ply, out);
    out.keyLo = keyLo;
    out.keyHi = keyHi;
    out.side = p.side;
    out.level = 1;
  }
  if (level === 2) {
    buildLevel2(p, sc, ply, out);
    out.level = 2;
  }
  return out;
}
