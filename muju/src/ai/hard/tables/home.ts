/**
 * Home safety and the purchase-based home race (DESIGN §4.12, §5.8; SU §4.4,
 * addendum 20b).
 *
 * `homeSafety(side)` answers "how exposed is MY corner". `minTurnsToCorner
 * (attacker)` and `homeRaceAvailable(side)` answer the mirror question, "how
 * fast can I (or my opponent) reach the OTHER corner", reusing the exact same
 * threat-minimisation as `homeSafety` with the two sides swapped (KF §4.7:
 * `actionsToCorner(side) = min over enemy slots of ceil(bfsDist/spd) ∪ min
 * over affordable enemy tier-1 def and enemy legal spawn square of
 * ceil(bfsDist/spd)`). The two halves of that minimum use two different BFS
 * directions, because an existing unit's own square is always occupied (by
 * itself) while a legal spawn square is always empty — see `nearestThreat`'s
 * body for why that forces the split.
 *
 * `NodeTables.cornerDist` is nominally filled by `buildTables` "calling
 * home.ts" (DESIGN §4.8's `home.ts (cornerDist, home)"), but `buildTables`'s
 * body does not land until M12 (`tables/context.ts`). This module is
 * therefore self-sufficient: `fillCornerDist` runs the BFS itself, on every
 * call, for whichever corner is needed. That is one redundant multi-source
 * BFS per call when `homeSafety` and `homeRaceAvailable`/`minTurnsToCorner`
 * are both invoked for the same node — an M12 optimisation opportunity (the
 * BFS could be cached once cornerDist's sentinel `-1` has been overwritten
 * for `p`'s current occupancy) — but it keeps every exported function here
 * correct in isolation, independent of call order, which is what M9's own
 * tests and oracle need. See `docs/hard-ai/design/DEVIATIONS.md` under M9.
 */
import {
  DEAD,
  F_PLACED,
  F_PROMOTED,
  MAX_SLOTS,
  NO_SLOT,
  Result,
  type PackedState,
  type Side,
  type Square,
} from '../types';
import { bbIsEmpty, bbNew, bbNext, bbSet, type BB } from '../core/bits';
import { CORNER, CORNER_NEIGHBOURS } from '../core/tables';
import { moveCost } from '../core/movement';
import { spawnMaskWith } from '../core/spawn';
import { activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { AKind, PA_NONE, paMake } from '../core/action';
import { ACTIONS_PER_TURN } from '../core/state';
import type { NodeTables } from './context';

/** `tables/home.ts` `HomeSafety` (DESIGN §4.12); re-declared in
 * `tables/context.ts` (structurally identical, see that module's header)
 * until M12 can `import type` this directly — the same arrangement
 * `tables/geometry.ts` uses for `SpawnGeometry`. */
export interface HomeSafety {
  actionsToCorner: number;
  turnsToCorner: number;
  buyThreat: 0 | 1;
  rescuers: number;
  plug: 0 | 1;
  occupied: 0 | 1;
}

/** `HomeSafety` sentinel for "no threat found at all" (DESIGN §4.12's fields
 * are plain numbers with no dedicated "never" constant; this mirrors
 * `tables/kill.ts`'s `KillEntry.minActions === 255` convention at a scale
 * that fits comfortably under any real BFS distance ÷ speed on a 10×10
 * board). `context.ts newHomeSafety()` already defaults both fields to 127. */
export const HOME_NEVER = 127;

export function newHomeSafety(): HomeSafety {
  return { actionsToCorner: HOME_NEVER, turnsToCorner: HOME_NEVER, buyThreat: 0, rescuers: 0, plug: 0, occupied: 0 };
}

/** `CORNER[side]` (`core/tables.ts`) as a singleton bitboard, for
 * `DistanceCache.multi`'s multi-source-BFS signature. */
const CORNER_BB: readonly [BB, BB] = (() => {
  const white = bbNew();
  bbSet(white, CORNER[0]);
  const black = bbNew();
  bbSet(black, CORNER[1]);
  return [white, black];
})();

/**
 * Fills and returns `t.cornerDist[corner]`: every square's BFS distance (over
 * `p`'s occupancy) to `CORNER[corner]`. See the module header for why this is
 * recomputed on every call instead of trusted from a prior fill.
 */
function fillCornerDist(p: PackedState, t: NodeTables, corner: Side): Int8Array {
  const out = t.cornerDist[corner];
  t.dist.multi(p, CORNER_BB[corner], out);
  return out;
}

/** The winning branch of `actionsToCorner(side)`: how many actions, and
 * which defId achieves it — `homeSafety`'s "nearest threat" for `rescuers`,
 * DESIGN §5.8. `isPurchase` is `homeSafety`'s `buyThreat`. */
interface Threat {
  actions: number;
  defId: number;
  isPurchase: 0 | 1;
}

const NO_THREAT: Threat = { actions: HOME_NEVER, defId: -1, isPurchase: 0 };

/** Module-level scratch for `nearestThreat`'s result: DESIGN §4 requires the
 * hot path to be allocation-free, and `nearestThreat` runs once per node per
 * side. Callers (`homeSafety`, `minTurnsToCorner`) read the fields out before
 * the next call, so a single shared record is sufficient. */
const SC_THREAT: Threat = { actions: HOME_NEVER, defId: -1, isPurchase: 0 };

/**
 * `actionsToCorner(side)` (DESIGN §5.8, KF §4.7): the minimum number of
 * actions for `side`'s ENEMY to reach `CORNER[side]`, over the enemy's
 * existing units and, separately, over every affordable enemy tier-1
 * definition at every enemy legal spawn square (purchases included, SU
 * addendum 20b). `minTurnsToCorner(attacker)` reuses this with the sides
 * swapped: `nearestThreat(p, t, 1 - attacker, cat).actions` is exactly "how
 * fast can `attacker` reach `CORNER[1 - attacker]`", since from
 * `(1 - attacker)`'s point of view `attacker` IS "the enemy".
 */
function nearestThreat(p: PackedState, t: NodeTables, side: Side, cat: Catalog): Threat {
  const enemy = (1 - side) as Side;
  const cornerSq = CORNER[side];

  // Existing units: each unit's own square is necessarily OCCUPIED (by
  // itself), and `bfsFrom`/`bfsMulti` treat every occupied square but the
  // BFS's own source(s) as impassable — so `fillCornerDist`'s "BFS from
  // CORNER[side]" can never assign a distance to a live unit's square (it is
  // never a source here). The correct distance is the SAME BFS run the other
  // way round, from the unit's own square as origin (where ITS occupancy is
  // the irrelevant one, `core/movement.ts`'s documented contract) — exactly
  // `t.dist.get(p, unitSquare)`, cached, read at `CORNER[side]`.
  let bestExisting = HOME_NEVER;
  let bestExistingDef = -1;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== enemy) continue;
    const dist = t.dist.get(p, p.sq[slot]);
    const cost = moveCost(dist, cornerSq, cat.spd[p.defId[slot]]);
    if (cost > 0 && cost < bestExisting) {
      bestExisting = cost;
      bestExistingDef = p.defId[slot];
    }
  }

  // Purchases: every candidate square is a LEGAL SPAWN square, i.e.
  // guaranteed empty at query time, so the single multi-source BFS from
  // CORNER[side] (which only needs to run once, not once per candidate
  // square) measures every candidate's distance correctly.
  //
  // `bfsMulti` seeds its SOURCES at distance 0 regardless of occupancy,
  // though, so a corner that somebody is already standing on still reads as
  // enterable — where the existing-unit branch above inherits the opposite
  // (correct) convention for free, since `bfsFrom` writes -1 on every
  // occupied square but its own origin. A unit standing on `CORNER[side]`
  // makes the square un-enterable for every purchase (a MOVE onto an
  // occupied square is never legal, whoever owns the occupant), so the whole
  // purchase branch is skipped in that case; `plug`/`occupied` are the
  // fields that report somebody is standing there.
  let bestPurchase = HOME_NEVER;
  let bestPurchaseDef = -1;
  if (p.pieceAt[cornerSq] === NO_SLOT) {
    const dist = fillCornerDist(p, t, side);
    const legal = t.spawn[enemy].legal;
    for (let ti = 0; ti < cat.tier1.length; ti++) {
      const def = cat.tier1[ti];
      if (cat.cost[def] > p.bank[enemy]) continue;
      const spd = cat.spd[def];
      for (let s = bbNext(legal, -1); s >= 0; s = bbNext(legal, s)) {
        const cost = moveCost(dist, s, spd);
        if (cost > 0 && cost < bestPurchase) {
          bestPurchase = cost;
          bestPurchaseDef = def;
        }
      }
    }
  }

  const actions = Math.min(bestExisting, bestPurchase);
  if (actions >= HOME_NEVER) {
    SC_THREAT.actions = NO_THREAT.actions;
    SC_THREAT.defId = NO_THREAT.defId;
    SC_THREAT.isPurchase = NO_THREAT.isPurchase;
    return SC_THREAT;
  }
  const isPurchase: 0 | 1 = bestPurchase <= bestExisting ? 1 : 0;
  SC_THREAT.actions = actions;
  SC_THREAT.defId = isPurchase ? bestPurchaseDef : bestExistingDef;
  SC_THREAT.isPurchase = isPurchase;
  return SC_THREAT;
}

/**
 * `homeSafety` (DESIGN §4.12, §5.8; `side` = defender). `rescuers` counts
 * `side`'s own live units adjacent to `CORNER[side]` whose attack power
 * against the nearest threat's defId is positive (DESIGN: "own units
 * adjacent to the corner with power > 0 against the nearest threat"); when no
 * threat exists there is nothing to be a rescuer against, so `rescuers` is 0.
 */
export function homeSafety(p: PackedState, t: NodeTables, side: Side, out: HomeSafety): HomeSafety {
  const cat = activeCatalog();
  const threat = nearestThreat(p, t, side, cat);

  out.actionsToCorner = threat.actions;
  out.turnsToCorner = threat.actions >= HOME_NEVER ? HOME_NEVER : Math.ceil(threat.actions / ACTIONS_PER_TURN);
  out.buyThreat = threat.isPurchase;

  let rescuers = 0;
  if (threat.defId >= 0) {
    const neighbours = CORNER_NEIGHBOURS[side];
    for (let i = 0; i < neighbours.length; i++) {
      const slot = p.pieceAt[neighbours[i]];
      if (slot === NO_SLOT || p.owner[slot] !== side) continue;
      if (cat.power[powerIndex(side, p.defId[slot], threat.defId)] > 0) rescuers++;
    }
  }
  out.rescuers = rescuers;

  const occupant = p.pieceAt[CORNER[side]];
  out.plug = occupant !== NO_SLOT && p.owner[occupant] === side ? 1 : 0;
  out.occupied = occupant !== NO_SLOT && p.owner[occupant] !== side ? 1 : 0;

  return out;
}

/** How many turns (`ceil(actions / 4)`) for `attacker` to reach
 * `CORNER[1 - attacker]`, purchases included (DESIGN §4.12). */
export function minTurnsToCorner(p: PackedState, t: NodeTables, attacker: Side): number {
  const defender = (1 - attacker) as Side;
  const threat = nearestThreat(p, t, defender, activeCatalog());
  return threat.actions >= HOME_NEVER ? HOME_NEVER : Math.ceil(threat.actions / ACTIONS_PER_TURN);
}

/** `BUY, END_PLACE, MOVE` — one `homeRaceAvailable` line (DESIGN §4.12). The
 * middle word is `PA_NONE` (skip) when the BUY itself ends the Place phase;
 * see `homeRaceAvailable`. */
export const HOME_RACE_LINE_LEN = 3;

function firstFreeSlot(p: PackedState): number {
  for (let i = 0; i < MAX_SLOTS; i++) if (p.sq[i] === DEAD) return i;
  return -1;
}

/** Scratch for `placePhaseSurvivesBuy`'s post-purchase spawn mask. */
const SC_SPAWN_AFTER = bbNew();

/**
 * Would `side` still be in the Place phase after buying `def` onto `s`?
 *
 * `make`'s BUY handler ends with `finishPlacement` (`core/state.ts:1285-1289`,
 * canonical `simulate.ts:118-120`), which AUTO-ADVANCES to the action phase
 * the moment `canActInPlacePhase` goes false — so on most lines the explicit
 * `END_PLACE` that follows the BUY is already illegal (`isLegal` requires
 * `phase === 0`). This predicate is `canActInPlacePhase(p, side)`
 * (`core/state.ts:1292-1311`) evaluated against the POST-buy state, which
 * differs from `p` in exactly three ways: the bank is `cat.cost[def]` lighter,
 * `s` carries one more own unit (a new anchor, and one square less spawn
 * area), and that new unit is `F_PLACED` — so it can never be the promotion
 * candidate the last clause looks for, and the promote loop may run over `p`'s
 * own slots unchanged. `upkeepPending` is 0 here (`homeRaceAvailable` returns
 * early otherwise), so `canActInPlacePhase`'s first clause is skipped.
 */
function placePhaseSurvivesBuy(p: PackedState, side: Side, def: number, s: Square, cat: Catalog): boolean {
  const cash = p.bank[side] - cat.cost[def];
  let affordable = false;
  for (let i = 0; i < cat.tier1.length; i++) {
    if (cat.cost[cat.tier1[i]] <= cash) {
      affordable = true;
      break;
    }
  }
  if (affordable && !bbIsEmpty(spawnMaskWith(p, side, s, SC_SPAWN_AFTER))) return true;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    const flags = p.uflags[slot];
    if ((flags & F_PLACED) !== 0 || (flags & F_PROMOTED) !== 0) continue;
    const d = p.defId[slot];
    if (cat.nextDef[d] < 0) continue;
    if (cash >= cat.promoCost[d]) return true;
  }
  return false;
}

/**
 * `homeRaceAvailable` (DESIGN §4.12, §5.10; SU addendum 20b): every affordable
 * tier-1 definition × legal spawn square whose move cost to `CORNER[1 -
 * side]` fits the action budget the mover will hold once the Place phase is
 * over (always `ACTIONS_PER_TURN`: both `END_PLACE` and `finishPlacement`'s
 * auto-advance call `setActions(p, ACTIONS_PER_TURN)`), written as a `[BUY,
 * END_PLACE, MOVE]` PA line (§5.10: "the line is injected FORCED and, if the
 * canonical replay returns home-checkmate, returned immediately"). `make`'s
 * `BUY` handler always claims the first `DEAD` slot in ascending order
 * (`core/state.ts makeBuy`), so the MOVE's slot is predictable before the BUY
 * is actually applied.
 *
 * EVERY emitted line is legal end to end through `Replica.isLegal`/`make` —
 * a line the canonical replay would reject is a silently discarded win, not a
 * conservative one (DESIGN §5.10 replays these FORCED), so the preconditions
 * that make the three actions legal are checked here rather than left to the
 * consumer:
 *
 *   - `p` must be an ONGOING position with `side` to move in the Place phase
 *     and no pending upkeep — `isLegal` answers only `RESIGN` while
 *     `upkeepPending`, and `BUY` needs `phase === 0` and `p.side === side`;
 *   - `CORNER[1 - side]` must be EMPTY — a MOVE onto an occupied square is
 *     never legal, whoever owns the occupant (the race is won by ENTERING the
 *     corner, so there is no home race to report when it is plugged);
 *   - the `END_PLACE` word is `PA_NONE` on any line whose BUY auto-advances
 *     the phase (`placePhaseSurvivesBuy`) — the standard "no action here"
 *     padding this array already uses for unwritten lines.
 *
 * `out` holds up to `floor(out.length / HOME_RACE_LINE_LEN)` lines; every
 * unused slot (including the unused tail) is `PA_NONE`. Returns the number
 * of lines written.
 */
export function homeRaceAvailable(p: PackedState, t: NodeTables, side: Side, out: Int32Array): number {
  out.fill(PA_NONE);
  const capacity = (out.length / HOME_RACE_LINE_LEN) | 0;
  if (capacity <= 0) return 0;
  if (p.result !== Result.ONGOING || p.side !== side || p.phase !== 0 || p.upkeepPending === 1) return 0;
  const slot = firstFreeSlot(p);
  if (slot < 0) return 0;

  const enemy = (1 - side) as Side;
  const cornerSq = CORNER[enemy];
  if (p.pieceAt[cornerSq] !== NO_SLOT) return 0;

  const cat = activeCatalog();
  const dist = fillCornerDist(p, t, enemy);
  const legal = t.spawn[side].legal;
  const budget = ACTIONS_PER_TURN;

  let n = 0;
  for (let ti = 0; ti < cat.tier1.length && n < capacity; ti++) {
    const def = cat.tier1[ti];
    if (cat.cost[def] > p.bank[side]) continue;
    const spd = cat.spd[def];
    for (let s = bbNext(legal, -1); s >= 0 && n < capacity; s = bbNext(legal, s)) {
      const cost = moveCost(dist, s, spd);
      if (cost <= 0 || cost > budget) continue;
      const base = n * HOME_RACE_LINE_LEN;
      out[base] = paMake(AKind.BUY, def, s, 0);
      out[base + 1] = placePhaseSurvivesBuy(p, side, def, s, cat) ? paMake(AKind.END_PLACE) : PA_NONE;
      out[base + 2] = paMake(AKind.MOVE, slot, cornerSq, cost);
      n++;
    }
  }
  return n;
}
