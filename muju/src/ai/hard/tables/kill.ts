/**
 * Kill-combination DP and Cleave chains (DESIGN §4.11, §5.7).
 *
 * `minActionsToKill` generalises the canonical `enoughPossibleDamage`
 * (`homeCheckmate.ts:27-49`) and its analysis twin `damageUpperBound`
 * (`server/analysis/tactics.ts:41-69`) in three ways:
 *
 *   1. from the corner's two lanes to every free lane of an arbitrary square
 *      (`maxHits = min(opts.maxLanes, |lanes|, actionBudget)` — a corner still
 *      admits exactly two, because a corner has exactly two neighbours);
 *   2. from Manhattan distance to real BFS distance over the live occupancy
 *      (`movement.ts bfsFrom`, through `t.dist`), so a walled-off attacker is
 *      not counted;
 *   3. from "is there enough damage" to "how few actions, and then how few
 *      crystals" — the answer is lexicographic in `(actions, crystals)`.
 *
 * It stays an OPTIMISTIC bound, exactly like the two canonical functions: two
 * attackers may be charged the same lane, a purchase is charged at the single
 * cheapest legal spawn square, and no attacker is charged for the occupancy
 * another attacker's move changes. It therefore never reports MORE actions
 * than a real line needs, which is what makes it safe as a search bound and is
 * what `lab/hard-ai/oracles/kill.ts` measures (`suboptimal === 0`).
 *
 * Combat facts the DP encodes (`combat.ts:13-17`, RE §1.7a):
 *   - one attack per attacker: a hit that does not kill ends that unit's
 *     Cleave chain, so every candidate contributes AT MOST ONE hit to a single
 *     target;
 *   - `canAttack` is `canActThisTurn && atkCount < tier && (atkCount === 0 ||
 *     lastAttackKilled)`; `attackedThisTurn` needs no separate check, because a
 *     unit that already hit this target either killed it (no target left) or
 *     closed its own chain;
 *   - `need = max(0, defense − damageTaken)` is `calculateDefense`;
 *   - a POWER-0 attacker can never contribute, so zero-damage entries are
 *     dropped rather than allowed to burn an action.
 *
 * `cleaveChain` is the mirror quantity: what ONE enemy unit can harvest from us
 * in a single turn by walking to a square and chaining kills off it.
 *
 * Nothing here allocates after module load: the DP tables, the candidate arrays
 * and the path buffers are module-level typed arrays, and the two per-ply
 * workspaces come from the caller's `Scratch`.
 */
import type { Centi, PackedState, Side, Slot, Square } from '../types';
import { DEAD, F_CAN_ACT, F_LAST_KILLED, F_PLACED, F_PROMOTED, MAX_SLOTS, NO_SLOT } from '../types';
import { bbNew, bbNext, bbSet, bbZero, type BB, type Scratch } from '../core/bits';
import { ADJ_LIST, BOARD } from '../core/tables';
import { activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN } from '../core/state';
import type { DistanceCache } from '../core/movement';
import type { SpawnInfo } from '../core/spawn';

/**
 * The subset of `NodeTables` (DESIGN §4.8) this module reads.
 *
 * `tables/context.ts` declares `NodeTables` with a `killNow: [KillTable,
 * KillTable]` field, i.e. `context` imports `kill`; importing `NodeTables` back
 * from here would close that cycle. `NodeTables` is structurally assignable to
 * `KillContext`, so every §4.11 signature below reads exactly as DESIGN writes
 * it for every caller that passes a `NodeTables`. See
 * `docs/hard-ai/design/DEVIATIONS.md` under M7.
 */
export interface KillContext {
  dist: DistanceCache;
  spawn: readonly [SpawnInfo, SpawnInfo];
}

export interface KillOpts {
  actionBudget: number;
  crystalBudget: number;
  allowBuys: boolean;
  allowPromotes: boolean;
  maxLanes: number;
}

export interface KillPlan {
  actions: number;
  crystals: number;
  /** slots, or `-(defId + 1)` for a purchase; `KILL_NO_ATTACKER` pads. */
  attackers: Int8Array;
  /** spawn square of the matching purchase, else -1. */
  spawnAt: Int8Array;
  /** lane the matching attacker strikes from, or -1. */
  lanes: Int8Array;
  needsPromo: 0 | 1;
}

export interface KillEntry {
  /** 255 = impossible within the opts' budgets. */
  minActions: number;
  minCrystals: number;
  needsBuy: 0 | 1;
  needsPromo: 0 | 1;
  /** catalogue cost prior, `cost × 100` — never an eval weight (DESIGN §4.11). */
  valueCc: Centi;
}

export interface KillTable {
  entry: KillEntry[];
  killableNow: BB;
  bestValuePerAction: number;
  count: number;
}

/** `KillEntry.minActions` / `KillPlan.actions` sentinel. */
export const KILL_IMPOSSIBLE = 255;
/** `KillPlan.attackers` padding (`-1` is a legal "no spawn square"/"no lane"). */
export const KILL_NO_ATTACKER = -128;
/** Ceiling on `KillOpts.maxLanes`: no square has more than four neighbours. */
export const KILL_MAX_LANES = 4;
/** `Scratch` bitboards this module borrows: none — every BFS row comes from
 * `t.dist`, and the DP tables are module-level. */
export const KILL_SCRATCH_BB = 0;
/** `Scratch` 100-entry Int8 rows borrowed at `(ply, 0 .. KILL_SCRATCH_I8-1)`. */
export const KILL_SCRATCH_I8 = 1;

export function newKillPlan(): KillPlan {
  return {
    actions: KILL_IMPOSSIBLE,
    crystals: 0,
    attackers: new Int8Array(KILL_MAX_LANES).fill(KILL_NO_ATTACKER),
    spawnAt: new Int8Array(KILL_MAX_LANES).fill(-1),
    lanes: new Int8Array(KILL_MAX_LANES).fill(-1),
    needsPromo: 0,
  };
}

export function newKillTable(): KillTable {
  const entry: KillEntry[] = new Array<KillEntry>(MAX_SLOTS);
  for (let i = 0; i < MAX_SLOTS; i++) {
    entry[i] = { minActions: KILL_IMPOSSIBLE, minCrystals: 0, needsBuy: 0, needsPromo: 0, valueCc: 0 };
  }
  return { entry, killableNow: bbNew(), bestValuePerAction: 0, count: 0 };
}

// --- DP tables -------------------------------------------------------------

/** Lane-usage bitmask over the lanes `collectLanes` wrote into `LANES`. Lanes
 * are a plan's scarcest resource: a lane holds one attacker, so two hits can
 * never be charged to the same neighbour square. Carrying the used-lane set in
 * the DP state (rather than only the hit COUNT, as §5.7's pseudocode sketches)
 * is what makes `minActions` exact rather than a lower bound — see
 * `docs/hard-ai/design/DEVIATIONS.md` under M7. */
const LMASK_DIM = 1 << KILL_MAX_LANES;
/** Action index 0..ACTIONS_PER_TURN. */
const A_DIM = ACTIONS_PER_TURN + 1;
/** Saturating damage index 0..MAX_NEED; DEF maxes at 5 (metal_3), 8 is headroom. */
const MAX_NEED = 8;
const P_DIM = MAX_NEED + 1;
const DP_CELLS = LMASK_DIM * A_DIM * P_DIM;
const INF = 0x3fffffff;

const FLAG_BUY = 1;
const FLAG_PROMO = 2;

/** Popcount of every lane mask — the number of hits that mask represents. */
const LMASK_POP = new Uint8Array(LMASK_DIM);
for (let m = 0; m < LMASK_DIM; m++) {
  let bits = 0;
  for (let b = 0; b < KILL_MAX_LANES; b++) if ((m & (1 << b)) !== 0) bits++;
  LMASK_POP[m] = bits;
}

/** `DP[lanes][a][pw]` = the fewest crystals that reach saturated damage `pw`
 * striking from exactly the lanes in `lanes` and spending exactly `a` actions. */
const DP = new Int32Array(DP_CELLS);
/** `FLAG_BUY | FLAG_PROMO` of the cheapest path into each cell. */
const DP_FLAGS = new Uint8Array(DP_CELLS);
/** Candidate indices of the cheapest path into each cell, `-1` padded. */
const DP_PATH = new Int16Array(DP_CELLS * KILL_MAX_LANES);

function dpIndex(mask: number, a: number, pw: number): number {
  return (mask * A_DIM + a) * P_DIM + pw;
}

// --- candidate arrays ------------------------------------------------------

/** Every live slot may contribute a base and a promoted variant on each lane,
 * plus one purchase entry per tier-1 definition per lane. */
const MAX_CANDIDATES = (MAX_SLOTS * 2 + 8) * KILL_MAX_LANES;
const CAND_COST = new Int32Array(MAX_CANDIDATES);
const CAND_CRYSTALS = new Int32Array(MAX_CANDIDATES);
const CAND_POWER = new Int32Array(MAX_CANDIDATES);
/** slot, or `-(defId + 1)` for a purchase. */
const CAND_ACTOR = new Int32Array(MAX_CANDIDATES);
const CAND_SPAWN = new Int32Array(MAX_CANDIDATES);
const CAND_LANE = new Int32Array(MAX_CANDIDATES);
/** `1 << laneIndex` — the lane this candidate occupies while it strikes. */
const CAND_LANE_BIT = new Int32Array(MAX_CANDIDATES);
const CAND_FLAGS = new Uint8Array(MAX_CANDIDATES);
/** `GROUP_START[g] .. GROUP_START[g+1]` is group `g`'s candidate range. */
const GROUP_START = new Int32Array(MAX_CANDIDATES + 1);
/** Number of mutually-exclusive groups the last `buildCandidates` produced. */
let groupCount = 0;

const LANES = new Int32Array(KILL_MAX_LANES);
/** Per empty lane: the legal spawn square closest to it, and that distance.
 * `-1` for a lane a purchase cannot use (occupied, or no spawn square reaches it). */
const LANE_SPAWN = new Int32Array(KILL_MAX_LANES);
const LANE_SPAWN_DIST = new Int32Array(KILL_MAX_LANES);

/** Scratch i8 index: a private copy of a `DistanceCache` row. */
const SC_DIST_COPY = 0;

/** Result of the last `runKillDp`; `KILL_IMPOSSIBLE` when none. */
let dpActions = KILL_IMPOSSIBLE;
let dpCrystals = 0;
let dpFlags = 0;
let dpCell = -1;

/**
 * The free lanes of `targetSq`, written into `LANES` in ascending square order.
 * A lane is a neighbour square that is empty or already holds one of
 * `attacker`'s units; a square held by the target's own side blocks that lane
 * (clearing it is a different plan, and counting it here would make the bound
 * pessimistic — the whole point of the bound is that it never overstates cost).
 */
function collectLanes(p: PackedState, attacker: Side, targetSq: Square): number {
  let n = 0;
  const base = targetSq * 4;
  for (let k = 0; k < 4; k++) {
    const q = ADJ_LIST[base + k];
    if (q < 0) continue;
    const occupant = p.pieceAt[q];
    if (occupant !== NO_SLOT && p.owner[occupant] !== attacker) continue;
    LANES[n++] = q;
  }
  // ADJ_LIST is up, down, left, right (board.ts:313-324); sort so the
  // "lowest square wins" tiebreak below is deterministic.
  for (let i = 1; i < n; i++) {
    const v = LANES[i];
    let j = i - 1;
    while (j >= 0 && LANES[j] > v) {
      LANES[j + 1] = LANES[j];
      j--;
    }
    LANES[j + 1] = v;
  }
  return n;
}

/** `canAttack` (`combat.ts:13-17`) on a packed slot. */
function canAttack(p: PackedState, cat: Catalog, slot: Slot): boolean {
  const flags = p.uflags[slot];
  if ((flags & F_CAN_ACT) === 0) return false;
  const count = p.atkCount[slot];
  if (count >= cat.tier[p.defId[slot]]) return false;
  return count === 0 || (flags & F_LAST_KILLED) !== 0;
}

/** `ceil(distance / speed) + 1` — the approach plus the hit; 0 steps still
 * costs the single attack action (DESIGN §5.7 "0 → 1 when adjacent"). */
function actionCost(distance: number, speed: number): number {
  return (((distance + speed - 1) / speed) | 0) + 1;
}

function pushCandidate(
  n: number,
  cost: number,
  crystals: number,
  power: number,
  actor: number,
  spawn: number,
  laneIndex: number,
  flags: number,
): number {
  CAND_COST[n] = cost;
  CAND_CRYSTALS[n] = crystals;
  CAND_POWER[n] = power;
  CAND_ACTOR[n] = actor;
  CAND_SPAWN[n] = spawn;
  CAND_LANE[n] = LANES[laneIndex];
  CAND_LANE_BIT[n] = 1 << laneIndex;
  CAND_FLAGS[n] = flags;
  return n + 1;
}

/**
 * One entry per affordable tier-1 definition PER LANE, each placed at the legal
 * spawn square closest to that lane — `server/analysis/tactics.ts:52-56`'s
 * "optimistic new purchases start adjacent", tightened from a flat cost of 1 to
 * the real BFS approach from the best square (DESIGN §5.7). All of a
 * definition's lane entries share one group, so a plan buys each definition at
 * most once.
 */
function appendPurchases(
  p: PackedState,
  t: KillContext,
  cat: Catalog,
  attacker: Side,
  targetDef: number,
  o: KillOpts,
  budget: number,
  sc: Scratch,
  ply: number,
  laneCount: number,
  start: number,
): number {
  const spawn = t.spawn[attacker];
  if (spawn.area === 0) return start;

  let usable = 0;
  for (let li = 0; li < laneCount; li++) {
    LANE_SPAWN[li] = -1;
    LANE_SPAWN_DIST[li] = -1;
    const lane = LANES[li];
    // Every free lane held by one of our own units already has a body on it:
    // a purchase has nowhere to stand, and charging it for a lane its own side
    // would first have to vacate is exactly the overstatement this bound must
    // not make.
    if (p.pieceAt[lane] !== NO_SLOT) continue;
    // Copied out of the cache: the scan below is long, and `DistanceCache.get`
    // owns (and may recycle) the row it returns.
    const dist = sc.i8(ply, SC_DIST_COPY);
    dist.set(t.dist.get(p, lane));
    let bestD = -1;
    let bestQ = -1;
    for (let q = bbNext(spawn.legal, -1); q >= 0; q = bbNext(spawn.legal, q)) {
      const d = dist[q];
      if (d < 0) continue;
      if (bestD < 0 || d < bestD) {
        bestD = d;
        bestQ = q;
      }
    }
    if (bestQ < 0) continue;
    LANE_SPAWN[li] = bestQ;
    LANE_SPAWN_DIST[li] = bestD;
    usable++;
  }
  if (usable === 0) return start;

  let n = start;
  for (let i = 0; i < cat.tier1.length; i++) {
    const def = cat.tier1[i];
    const crystals = cat.cost[def];
    if (crystals > o.crystalBudget) continue;
    const power = cat.power[powerIndex(attacker, def, targetDef)];
    if (power <= 0) continue;
    const groupStart = n;
    for (let li = 0; li < laneCount; li++) {
      if (LANE_SPAWN[li] < 0) continue;
      const cost = actionCost(LANE_SPAWN_DIST[li], cat.spd[def]);
      if (cost > budget) continue;
      n = pushCandidate(n, cost, crystals, power, -(def + 1), LANE_SPAWN[li], li, FLAG_BUY);
    }
    if (n > groupStart) GROUP_START[++groupCount] = n;
  }
  return n;
}

/**
 * Builds the candidate list for "`attacker` kills `target`". Returns the number
 * of candidates; `GROUP_START[0..groupCount]` delimits the mutually exclusive
 * groups (every lane and promotion variant of one unit shares that unit's
 * group, because one attacker contributes at most one hit; every purchase
 * definition is its own group).
 */
function buildCandidates(
  p: PackedState,
  t: KillContext,
  cat: Catalog,
  attacker: Side,
  target: Slot,
  o: KillOpts,
  budget: number,
  sc: Scratch,
  ply: number,
  laneCount: number,
): number {
  const targetDef = p.defId[target];
  let n = 0;
  groupCount = 0;
  GROUP_START[0] = 0;

  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== attacker) continue;
    if (!canAttack(p, cat, slot)) continue;
    const def = p.defId[slot];
    const basePower = cat.power[powerIndex(attacker, def, targetDef)];
    const nextDef = cat.nextDef[def];
    const promoCost = cat.promoCost[def];
    const flags = p.uflags[slot];
    const promotable =
      o.allowPromotes &&
      nextDef >= 0 &&
      promoCost <= o.crystalBudget &&
      (flags & F_PLACED) === 0 &&
      (flags & F_PROMOTED) === 0;
    const promoPower = promotable ? cat.power[powerIndex(attacker, nextDef, targetDef)] : 0;
    if (basePower <= 0 && promoPower <= 0) continue;

    // One BFS row per attacker, consumed immediately: `DistanceCache.get` owns
    // the array it returns and may recycle it on the next call.
    const dist = t.dist.get(p, p.sq[slot]);
    const start = n;
    for (let li = 0; li < laneCount; li++) {
      const d = dist[LANES[li]];
      if (d < 0) continue;
      if (basePower > 0) {
        const cost = actionCost(d, cat.spd[def]);
        if (cost <= budget) n = pushCandidate(n, cost, 0, basePower, slot, -1, li, 0);
      }
      if (promoPower > 0) {
        // `damageUpperBound` (tactics.ts:46-49) re-derives the approach cost from
        // the PROMOTED definition's speed, which differs across tiers (fire_2
        // speed 2 -> fire_3 speed 3); §5.7's pseudocode reuses the base cost as
        // shorthand. The canonical arithmetic wins.
        const cost = actionCost(d, cat.spd[nextDef]);
        if (cost <= budget) n = pushCandidate(n, cost, promoCost, promoPower, slot, -1, li, FLAG_PROMO);
      }
    }
    if (n > start) GROUP_START[++groupCount] = n;
  }

  if (o.allowBuys) n = appendPurchases(p, t, cat, attacker, targetDef, o, budget, sc, ply, laneCount, n);
  return n;
}

/**
 * The §5.7 DP over (used lanes, actions spent, damage dealt). Damage is the
 * third axis, saturated at `need`, so `minCrystals` is exact rather than a
 * lexicographic guess; the lane mask is the first axis so that two attackers
 * are never charged the same neighbour square.
 *
 * Each group contributes at most one hit. That is enforced without snapshots by
 * filling destination cells in DESCENDING popcount order: a write at popcount
 * `k` only ever reads cells of popcount `k-1`, and those are written later in
 * the same group's pass, so no candidate can be applied twice.
 *
 * Writes `dpActions` / `dpCrystals` / `dpFlags` / `dpCell`.
 */
function runKillDp(need: number, maxHits: number, budget: number, crystalBudget: number): boolean {
  const needIdx = need > MAX_NEED ? MAX_NEED : need;
  DP.fill(INF);
  DP_FLAGS.fill(0);
  DP_PATH.fill(-1);
  DP[dpIndex(0, 0, 0)] = 0;

  for (let g = 0; g < groupCount; g++) {
    const lo = GROUP_START[g];
    const hi = GROUP_START[g + 1];
    if (hi <= lo) continue;
    for (let hits = maxHits; hits >= 1; hits--) {
      for (let c = lo; c < hi; c++) {
        const cost = CAND_COST[c];
        const cry = CAND_CRYSTALS[c];
        const pow = CAND_POWER[c];
        const bit = CAND_LANE_BIT[c];
        const flag = CAND_FLAGS[c];
        if (cry > crystalBudget) continue;
        for (let mask = 0; mask < LMASK_DIM; mask++) {
          if (LMASK_POP[mask] !== hits - 1) continue;
          if ((mask & bit) !== 0) continue;
          const dstMask = mask | bit;
          for (let a = 0; a + cost <= budget; a++) {
            for (let pw = 0; pw <= needIdx; pw++) {
              const src = dpIndex(mask, a, pw);
              const base = DP[src];
              if (base >= INF) continue;
              const total = base + cry;
              if (total > crystalBudget) continue;
              let np = pw + pow;
              if (np > needIdx) np = needIdx;
              const dst = dpIndex(dstMask, a + cost, np);
              if (total >= DP[dst]) continue;
              DP[dst] = total;
              DP_FLAGS[dst] = DP_FLAGS[src] | flag;
              const srcPath = src * KILL_MAX_LANES;
              const dstPath = dst * KILL_MAX_LANES;
              for (let k = 0; k < KILL_MAX_LANES; k++) DP_PATH[dstPath + k] = DP_PATH[srcPath + k];
              // The source cell holds exactly hits-1 candidates, so that slot is free.
              DP_PATH[dstPath + hits - 1] = c;
            }
          }
        }
      }
    }
  }

  dpActions = KILL_IMPOSSIBLE;
  dpCrystals = 0;
  dpFlags = 0;
  dpCell = -1;
  for (let a = 0; a <= budget; a++) {
    let best = INF;
    let bestCell = -1;
    for (let mask = 1; mask < LMASK_DIM; mask++) {
      if (LMASK_POP[mask] > maxHits) continue;
      const cell = dpIndex(mask, a, needIdx);
      const v = DP[cell];
      if (v < best) {
        best = v;
        bestCell = cell;
      }
    }
    if (best < INF) {
      dpActions = a;
      dpCrystals = best;
      dpFlags = DP_FLAGS[bestCell];
      dpCell = bestCell;
      return true;
    }
  }
  return false;
}

/** Core of `minActionsToKill`; `out` may be null when only the numbers matter. */
function solveKill(
  p: PackedState,
  t: KillContext,
  cat: Catalog,
  attacker: Side,
  target: Slot,
  o: KillOpts,
  sc: Scratch,
  ply: number,
  out: KillPlan | null,
): boolean {
  if (out !== null) {
    out.actions = KILL_IMPOSSIBLE;
    out.crystals = 0;
    out.needsPromo = 0;
    out.attackers.fill(KILL_NO_ATTACKER);
    out.spawnAt.fill(-1);
    out.lanes.fill(-1);
  }
  if (p.sq[target] === DEAD || p.owner[target] === attacker) return false;

  const budget = o.actionBudget < ACTIONS_PER_TURN ? o.actionBudget : ACTIONS_PER_TURN;
  if (budget <= 0) return false;

  const laneCount = collectLanes(p, attacker, p.sq[target]);
  if (laneCount === 0) return false;

  let maxHits = o.maxLanes < laneCount ? o.maxLanes : laneCount;
  if (maxHits > budget) maxHits = budget;
  if (maxHits > KILL_MAX_LANES) maxHits = KILL_MAX_LANES;
  if (maxHits <= 0) return false;

  const defense = cat.def[p.defId[target]];
  const damage = p.damage[target];
  const need = defense - damage > 0 ? defense - damage : 0;
  if (need === 0) return false;

  const candidates = buildCandidates(p, t, cat, attacker, target, o, budget, sc, ply, laneCount);
  if (candidates === 0) return false;
  if (!runKillDp(need, maxHits, budget, o.crystalBudget)) return false;

  if (out !== null) {
    out.actions = dpActions;
    out.crystals = dpCrystals;
    out.needsPromo = (dpFlags & FLAG_PROMO) !== 0 ? 1 : 0;
    const path = dpCell * KILL_MAX_LANES;
    for (let k = 0; k < KILL_MAX_LANES; k++) {
      const c = DP_PATH[path + k];
      if (c < 0) break;
      out.attackers[k] = CAND_ACTOR[c];
      out.spawnAt[k] = CAND_SPAWN[c];
      out.lanes[k] = CAND_LANE[c];
    }
  }
  return true;
}

/**
 * Fewest actions (then fewest crystals) in which `attacker` can remove `target`
 * from this position under `o`'s budgets. Returns false — and leaves
 * `out.actions === KILL_IMPOSSIBLE` — when no combination fits.
 */
export function minActionsToKill(
  p: PackedState,
  t: KillContext,
  attacker: Side,
  target: Slot,
  o: KillOpts,
  sc: Scratch,
  ply: number,
  out: KillPlan,
): boolean {
  return solveKill(p, t, activeCatalog(), attacker, target, o, sc, ply, out);
}

/**
 * `minActionsToKill` for every enemy slot, amortising one `activeCatalog()`
 * probe over the whole side. `killableNow` carries the SQUARES of the targets
 * that fall inside the budgets (it is a bitboard, so squares and not slots);
 * `bestValuePerAction` is the best `valueCc / minActions` among them.
 */
export function killTable(
  p: PackedState,
  t: KillContext,
  attacker: Side,
  o: KillOpts,
  sc: Scratch,
  ply: number,
  out: KillTable,
): KillTable {
  const cat = activeCatalog();
  bbZero(out.killableNow);
  out.count = 0;
  out.bestValuePerAction = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const e = out.entry[slot];
    e.minActions = KILL_IMPOSSIBLE;
    e.minCrystals = 0;
    e.needsBuy = 0;
    e.needsPromo = 0;
    e.valueCc = 0;
    if (p.sq[slot] === DEAD || p.owner[slot] === attacker) continue;
    e.valueCc = cat.cost[p.defId[slot]] * 100;
    if (!solveKill(p, t, cat, attacker, slot, o, sc, ply, null)) continue;
    e.minActions = dpActions;
    e.minCrystals = dpCrystals;
    e.needsBuy = (dpFlags & FLAG_BUY) !== 0 ? 1 : 0;
    e.needsPromo = (dpFlags & FLAG_PROMO) !== 0 ? 1 : 0;
    bbSet(out.killableNow, p.sq[slot]);
    out.count++;
    const perAction = (e.valueCc / dpActions) | 0;
    if (perAction > out.bestValuePerAction) out.bestValuePerAction = perAction;
  }
  return out;
}

// --- Cleave chains ---------------------------------------------------------

/** `cleaveChain`'s witness. Kept separate so the hot path returns a single
 * number (DESIGN §4.11) while `tests/ai/hard/kill.test.ts` and the M7 gate's
 * LH §4.1 probe can assert the action count too. See DEVIATIONS under M7. */
export interface CleavePlan {
  /** Best total value in cc — identical to `cleaveChain`'s return. */
  valueCc: Centi;
  /** Units killed on that plan. */
  kills: number;
  /** Approach actions plus one per kill. */
  actions: number;
  /** Square the unit chains from, or -1 when nothing is reachable. */
  square: Square;
}

export function newCleavePlan(): CleavePlan {
  return { valueCc: 0, kills: 0, actions: 0, square: -1 };
}

/** Values of the victims adjacent to the square under test, descending. */
const CHAIN_VALUES = new Int32Array(KILL_MAX_LANES);
const CHAIN_SCRATCH = newCleavePlan();

/**
 * What the unit in `enemySlot` can harvest in one turn by walking to a square
 * and chaining one-shot kills off it (DESIGN §5.7): for every square `q` the
 * unit can reach (its own square included), count the victims orthogonally
 * adjacent to `q` that it kills in a single hit, and take the `tier` most
 * valuable of them, capped by the actions left after the approach. The answer is
 * the best such square.
 *
 * "Victims" are the units of the side `enemySlot` does NOT own — from the table
 * owner's seat, our own units. Cleave only chains off KILLS
 * (`combat.ts:13-17`), which is why a one-shot test and not raw power decides
 * membership; the test is `power >= defense − damage` (`calculateDefense`), so a
 * chipped unit counts as one-shot even when its printed DEF is out of reach.
 */
export function cleaveChain(p: PackedState, t: KillContext, enemySlot: Slot, sc: Scratch, ply: number): Centi {
  return cleavePlan(p, t, enemySlot, sc, ply, CHAIN_SCRATCH).valueCc;
}

export function cleavePlan(
  p: PackedState,
  t: KillContext,
  enemySlot: Slot,
  sc: Scratch,
  ply: number,
  out: CleavePlan,
): CleavePlan {
  out.valueCc = 0;
  out.kills = 0;
  out.actions = 0;
  out.square = -1;
  if (p.sq[enemySlot] === DEAD) return out;

  const cat = activeCatalog();
  const side = p.owner[enemySlot] as Side;
  const victimSide = 1 - side;
  const def = p.defId[enemySlot];
  const speed = cat.spd[def];
  const tier = cat.tier[def];
  const origin = p.sq[enemySlot];

  // Copied out of the cache: the loop below never calls `get` again, but the
  // copy keeps this correct if a caller ever interleaves another lookup.
  const dist = sc.i8(ply, SC_DIST_COPY);
  dist.set(t.dist.get(p, origin));
  const reach = speed * (ACTIONS_PER_TURN - 1);

  for (let q = 0; q < BOARD; q++) {
    let approach = 0;
    if (q !== origin) {
      const d = dist[q];
      if (d <= 0 || d > reach) continue;
      approach = ((d + speed - 1) / speed) | 0;
    }
    const left = ACTIONS_PER_TURN - approach;
    if (left <= 0) continue;
    let maxKills = tier < left ? tier : left;
    if (maxKills > KILL_MAX_LANES) maxKills = KILL_MAX_LANES;
    if (maxKills <= 0) continue;

    let found = 0;
    const base = q * 4;
    for (let k = 0; k < 4; k++) {
      const n = ADJ_LIST[base + k];
      if (n < 0) continue;
      const victim = p.pieceAt[n];
      if (victim === NO_SLOT || p.owner[victim] !== victimSide) continue;
      const victimDef = p.defId[victim];
      if (cat.power[powerIndex(side, def, victimDef)] < cat.def[victimDef] - p.damage[victim]) continue;
      const value = cat.cost[victimDef] * 100;
      let i = found++;
      while (i > 0 && CHAIN_VALUES[i - 1] < value) {
        CHAIN_VALUES[i] = CHAIN_VALUES[i - 1];
        i--;
      }
      CHAIN_VALUES[i] = value;
    }
    if (found === 0) continue;
    const take = found < maxKills ? found : maxKills;
    let sum = 0;
    for (let i = 0; i < take; i++) sum += CHAIN_VALUES[i];
    // Ties go to the cheaper plan: same value, fewer actions.
    const actions = approach + take;
    if (sum > out.valueCc || (sum === out.valueCc && sum > 0 && actions < out.actions)) {
      out.valueCc = sum;
      out.kills = take;
      out.actions = actions;
      out.square = q;
    }
  }
  return out;
}
