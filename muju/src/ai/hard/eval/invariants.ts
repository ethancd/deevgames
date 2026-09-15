/**
 * The twenty SU §7 invariants as bit-flag features (DESIGN §4.15, §5.13).
 *
 * `invariantBits(p, t, side, sc, ply)` returns a 20-bit mask; bit `i` is SU §7
 * invariant `i + 1` violated FOR `side` on this position. DESIGN F7 is the
 * ruling that matters here: **none of these is a filter**. They are penalty
 * features evaluated on the position AFTER a candidate turn, and the generator
 * still emits the turns that violate them.
 *
 * "AFTER a candidate turn" fixes what is observable, and three of SU's
 * twenty tests are phrased over the turn itself. `src/game/turn.ts`'s
 * `finishTurnStart` calls `resetUnitActions(board, incomingPlayer)`
 * (`board.ts:263-292`), so on the macro node that follows `side`'s turn:
 *
 *   - `side`'s OWN units still carry that turn's `atkCount`, `F_LAST_KILLED`,
 *     `F_PLACED` and `F_PROMOTED` — the incoming player is the OPPONENT, so
 *     `side` is not the one being reset. Invariants 5, 7, 8, 14, 17 and 20 read
 *     those flags directly and are exact.
 *   - the ENEMY's `damageTaken` has just been healed to 0 (it is the incoming
 *     player). Invariant 9 ("the turn left a damaged, unkilled enemy") can
 *     therefore only be seen through its cause — an own unit that attacked
 *     without killing — except at an `upkeepPending` node, where
 *     `resetUnitActions` has not run yet and the damage is still visible.
 *
 * Every restatement is recorded in `docs/hard-ai/design/DEVIATIONS.md` under
 * M12. Invariants 8 and 9 are deliberately DISJOINT (a chip with a kill
 * available is 8, a chip without one is 9) so DESIGN §5.13's gate — "each
 * fixture sets exactly its own bit" — is satisfiable by a single chipping turn.
 *
 * Nothing here allocates after module load.
 */
import {
  CC,
  DEAD,
  F_LAST_KILLED,
  F_PLACED,
  F_PROMOTED,
  NO_SLOT,
  type Centi,
  type PackedState,
  type Side,
  type Square,
} from '../types';
import { bbCopy, bbHas, bbNew, bbNext, bbSet, bbZero, type BB, type Scratch } from '../core/bits';
import {
  ADJ_COUNT,
  ADJ_LIST,
  BOARD,
  CORNER,
  CORNER_NEIGHBOURS,
  MANHATTAN,
  RECT,
  SQ_X,
  SQ_Y,
  WHITE,
} from '../core/tables';
import { activeCatalog, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN } from '../core/state';
import { bfsMulti } from '../core/movement';
import { ECON_HORIZON } from '../tables/economy';
import { KILL_IMPOSSIBLE, cleavePlan, newCleavePlan } from '../tables/kill';
import { Approach } from '../tables/approach';
import type { NodeTables } from '../tables/context';

export const INVARIANT_COUNT = 20;

/** `Scratch` this module borrows per ply: none of its own; the one Int8 row is
 * `tables/kill.ts cleavePlan`'s, which invariant 12 calls through. */
export const INVARIANT_SCRATCH_BB = 0;
export const INVARIANT_SCRATCH_I8 = 1;

/** Bit `i` of the returned mask is invariant `i + 1`. */
function bit(i: number): number {
  return 1 << (i - 1);
}

const CLEAVE = newCleavePlan();
const OCC_SCRATCH: BB = bbNew();
const CORNER_SRC: BB = bbNew();
const DIST_BLOCKED = new Int8Array(BOARD);
const DIST_FREED = new Int8Array(BOARD);

function depthOf(side: Side, s: Square): number {
  return side === WHITE ? SQ_X[s] + SQ_Y[s] : 18 - SQ_X[s] - SQ_Y[s];
}

function chebyshev(a: Square, b: Square): number {
  const dx = Math.abs(SQ_X[a] - SQ_X[b]);
  const dy = Math.abs(SQ_Y[a] - SQ_Y[b]);
  return dx > dy ? dx : dy;
}

/** Fewest actions in which `side` (with `killNow[side]`'s budget) removes the
 * enemy units orthogonally adjacent to `sq`; `KILL_IMPOSSIBLE` when none is
 * reachable. Invariants 4 and 20 both ask "can I punish the attacker next
 * turn", and `NodeTables.approach` stores the class only, not the slot. */
function adjacentAttackerKillable(p: PackedState, t: NodeTables, side: Side, sq: Square): boolean {
  const enemy = (1 - side) as Side;
  const table = t.killNow[side];
  const base = sq * 4;
  const n = ADJ_COUNT[sq];
  for (let i = 0; i < n; i++) {
    const q = ADJ_LIST[base + i];
    const a = p.pieceAt[q];
    if (a === NO_SLOT || p.owner[a] !== enemy) continue;
    const entry = table.entry[a];
    if (entry.minActions < KILL_IMPOSSIBLE && entry.minActions <= ACTIONS_PER_TURN) return true;
  }
  return false;
}

/** `|{q : 0 < dist(from, q) <= speed} \ strike[enemy]|` — squares the unit on
 * `from` can step to and not be struck there (DESIGN §5.8 `retreats`). */
function retreatCount(p: PackedState, t: NodeTables, side: Side, from: Square, speed: number): number {
  if (speed <= 0) return 0;
  const enemyStrike = t.strike[(1 - side) as Side];
  const dist = t.dist.get(p, from);
  let n = 0;
  for (let q = 0; q < BOARD; q++) {
    const d = dist[q];
    if (d <= 0 || d > speed) continue;
    if (bbHas(enemyStrike, q)) continue;
    n++;
  }
  return n;
}

/** A purchase made this turn has a job when it anchors the deepest spawn
 * rectangle, plugs the home corner, denies an enemy rectangle, or is racing
 * the enemy corner (DESIGN §5.13 invariant 5's ANCHOR/BLOCK/PLUG/HOME_RACE). */
function placedMinerHasRole(p: PackedState, t: NodeTables, side: Side, s: Square): boolean {
  if (s === CORNER[side]) return true; // PLUG
  const enemy = (1 - side) as Side;
  if (MANHATTAN[s * BOARD + CORNER[enemy]] <= ACTIONS_PER_TURN) return true; // HOME_RACE
  const info = t.spawn[side];
  if (bbHas(info.anchors, s) && depthOf(side, s) >= info.depth) return true; // ANCHOR
  const enemyRect = RECT[enemy];
  for (let e = 0, limit = p.slotCount; e < limit; e++) {
    const a = p.sq[e];
    if (a === DEAD || p.owner[e] !== enemy) continue;
    if (bbHas(enemyRect[a], s)) return true; // BLOCK
  }
  return false;
}

/**
 * Invariant 17: "a buy this turn raised a later MOVE's cost in the same turn".
 *
 * Restated on the post-turn position, where the buy is the own unit carrying
 * `F_PLACED`: free every own `F_PLACED` square and re-run the multi-source BFS
 * from the ENEMY corner. If any own unit that did NOT arrive this turn now has
 * a cheaper first step towards that corner, the purchase stood in its way.
 * Distances are read one step out (the unit's own square is occupied by
 * itself, so `bfsMulti` never scores it) — exactly the quantity a later MOVE
 * would have paid.
 */
function selfBlock(p: PackedState, side: Side, cat: Catalog): boolean {
  let anyPlaced = false;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== side) continue;
    if ((p.uflags[slot] & F_PLACED) !== 0) {
      anyPlaced = true;
      break;
    }
  }
  if (!anyPlaced) return false;

  const enemy = (1 - side) as Side;
  bbSet(bbZero(CORNER_SRC), CORNER[enemy]);

  bbCopy(OCC_SCRATCH, p.occ);
  bfsMulti(OCC_SCRATCH, CORNER_SRC, DIST_BLOCKED);

  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if ((p.uflags[slot] & F_PLACED) === 0) continue;
    OCC_SCRATCH[s >>> 5] &= ~(1 << (s & 31));
  }
  bfsMulti(OCC_SCRATCH, CORNER_SRC, DIST_FREED);

  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if ((p.uflags[slot] & F_PLACED) !== 0) continue;
    if (cat.spd[p.defId[slot]] <= 0) continue;
    if (firstStep(DIST_FREED, s) < firstStep(DIST_BLOCKED, s)) return true;
  }
  return false;
}

const UNREACHED = 1 << 20;

/** `1 + min over free neighbours of dist[q]`, or `UNREACHED`. */
function firstStep(dist: Int8Array, from: Square): number {
  const base = from * 4;
  const n = ADJ_COUNT[from];
  let best = UNREACHED;
  for (let i = 0; i < n; i++) {
    const q = ADJ_LIST[base + i];
    const d = dist[q];
    if (d < 0) continue;
    const cost = d + 1;
    if (cost < best) best = cost;
  }
  return best;
}

export function invariantBits(p: PackedState, t: NodeTables, side: Side, sc: Scratch, ply: number): number {
  const cat = activeCatalog();
  const enemy = (1 - side) as Side;
  const geom = t.geom[side];
  const geomEnemy = t.geom[enemy];
  const home = t.home[side];
  const econ = t.econ[side];
  const killNow = t.killNow[side];
  let bits = 0;

  // --- one pass over our own units, collecting the flag-derived facts -------
  let ownUnits = 0;
  let nearHome = 0;
  let chipped = false;
  let killedThisTurn = false;
  let promotedThisTurn = false;
  let poorMiner = false;
  let softMinerExposed = false;
  let strandNoRetreat = false;
  let retreatSquareLost = false;
  let strandUnpunished = false;

  const ifBought = t.strikeIfBought[enemy];
  const exposure = t.exposure[side];
  const ownCorner = CORNER[side];

  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    const def = p.defId[slot];
    const flags = p.uflags[slot];
    ownUnits++;
    if (chebyshev(s, ownCorner) <= 2) nearHome++;
    if (p.atkCount[slot] > 0 && (flags & F_LAST_KILLED) === 0) chipped = true;
    if ((flags & F_LAST_KILLED) !== 0) killedThisTurn = true;
    if ((flags & F_PROMOTED) !== 0) promotedThisTurn = true;

    // 5: a miner bought this turn on a thin cell with no job.
    if (
      !poorMiner &&
      (flags & F_PLACED) !== 0 &&
      cat.mine[def] > 0 &&
      p.reserve[s] < 2 * cat.mine[def] &&
      !placedMinerHasRole(p, t, side, s)
    ) {
      poorMiner = true;
    }

    // 19: a soft miner parked forward inside the enemy's purchase reach.
    if (
      !softMinerExposed &&
      cat.def[def] === 1 &&
      cat.mine[def] > 0 &&
      p.bank[enemy] >= 3 &&
      MANHATTAN[s * BOARD + ownCorner] >= 5 &&
      bbHas(ifBought, s)
    ) {
      softMinerExposed = true;
    }

    // 20: the unit that killed this turn is stranded inside our exposure.
    if (
      !strandNoRetreat &&
      (flags & F_LAST_KILLED) !== 0 &&
      bbHas(exposure, s) &&
      retreatCount(p, t, side, s, cat.spd[def]) === 0
    ) {
      strandNoRetreat = true;
    }

    // 3 / 4: what the approach table says about this unit.
    const cls = t.approach[slot];
    if (!retreatSquareLost && cls === Approach.RETREAT && cat.cost[def] >= 4) {
      retreatSquareLost = true;
    }
    if (!strandUnpunished && cls === Approach.STRAND && !adjacentAttackerKillable(p, t, side, s)) {
      strandUnpunished = true;
    }
  }

  // --- 1: spawn area gone with crystals in hand ----------------------------
  if (geom.area === 0 && p.bank[side] >= 3) bits |= bit(1);

  // --- 2: both corner neighbours sealed by our own immobile miners ---------
  if (geom.cornerNeighboursHeld === 2) bits |= bit(2);

  if (retreatSquareLost) bits |= bit(3);
  if (strandUnpunished) bits |= bit(4);
  if (poorMiner) bits |= bit(5);

  // --- 6: a deep anchor with no cover --------------------------------------
  if (geom.blocking <= 1 && geom.anchorDepth >= 6) bits |= bit(6);

  // --- 7: promotion into an upkeep cliff -----------------------------------
  if (promotedThisTurn && econ.turnsToInsolvency <= ECON_HORIZON) bits |= bit(7);

  // --- 8 / 9: chip damage --------------------------------------------------
  const killAvailable = killNow.count > 0;
  if (chipped && killAvailable) bits |= bit(8);
  let damagedEnemy = false;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== enemy) continue;
    if (p.damage[slot] > 0) {
      damagedEnemy = true;
      break;
    }
  }
  if (damagedEnemy || (chipped && !killAvailable)) bits |= bit(9);

  // --- 10: the corner is reachable and nothing answers ---------------------
  if (home.occupied === 1 || (home.actionsToCorner <= 4 && home.rescuers === 0 && home.plug === 0)) {
    bits |= bit(10);
  }

  // --- 11: home left bare in front of a live invasion budget ---------------
  if (homeBare(p, t, side, cat)) bits |= bit(11);

  // --- 12: an enemy tier-2+ body sits on a two-victim Cleave line ----------
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== enemy) continue;
    if (cat.tier[p.defId[slot]] < 2) continue;
    if (t.chain[slot] <= 0) continue;
    if (cleavePlan(p, t, slot, sc, ply, CLEAVE).kills >= 2) {
      bits |= bit(12);
      break;
    }
  }

  // --- 13: turtling while the enemy takes the board ------------------------
  if (ownUnits > 0 && nearHome * 5 >= ownUnits * 3 && geom.anchorDepth < 4 && geomEnemy.anchorDepth >= 4) {
    bits |= bit(13);
  }

  // --- 14: below the liquidity floor after a turn that won nothing ---------
  if (p.bank[side] < 6 && !killedThisTurn) bits |= bit(14);

  // --- 15: structural (an UNKNOWN verdict is scored as the bad case) -------
  // Always 0: DESIGN §5.13 gives it no weight and no test of its own; the rule
  // lives in `tactics/prover.ts` (exhaustion never wins) and in invariant 10's
  // "no proven rescue counts as no rescue" reading above.

  // --- 16: sitting on a lead while the draw clock runs --------------------
  if (p.drawRuleOn === 1 && p.clock >= 7 && leadCc(p, side) >= 300 && killNow.count === 0) bits |= bit(16);

  // --- 17: this turn's purchase stood in our own way ----------------------
  if (selfBlock(p, side, cat)) bits |= bit(17);

  // --- 18: protocol rule only (DESIGN F7) ---------------------------------
  // Always 0: `END_PLACE_PHASE` is emitted only when legal
  // (`src/ai/simulate.ts:118-120`), which `core/state.ts isLegal` enforces.

  if (softMinerExposed) bits |= bit(19);
  if (strandNoRetreat) bits |= bit(20);

  return bits;
}

/**
 * A weight-free proxy for "who is ahead", in centi-crystals: catalogue
 * material plus the bank. `eval/features.ts` imports it for `DrawPressure`
 * (DESIGN §5.12.1's `sign(v0 + v1 so far)`); invariant 16's "ahead by >= 300
 * cc" uses it here. It lives in this module and not in `features.ts` because
 * `features.ts` already imports this one, and the reverse edge would close a
 * cycle. See DEVIATIONS under M12.
 */
export function leadCc(p: PackedState, side: Side): Centi {
  const other = (1 - side) as Side;
  return p.materialCc[side] - p.materialCc[other] + (p.bank[side] - p.bank[other]) * CC;
}

/**
 * Invariant 11: our corner and both its neighbours are empty while the enemy
 * either fields a speed-3 runner or holds the three crystals a tier-1 costs,
 * and has a legal spawn square within Manhattan 10 of that corner.
 */
function homeBare(p: PackedState, t: NodeTables, side: Side, cat: Catalog): boolean {
  const corner = CORNER[side];
  if (p.pieceAt[corner] !== NO_SLOT) return false;
  const nb = CORNER_NEIGHBOURS[side];
  for (let i = 0; i < nb.length; i++) if (p.pieceAt[nb[i]] !== NO_SLOT) return false;

  const enemy = (1 - side) as Side;
  let runner = false;
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== enemy) continue;
    if (cat.spd[p.defId[slot]] >= 3) {
      runner = true;
      break;
    }
  }
  if (!runner && p.bank[enemy] < 3) return false;

  const legal = t.spawn[enemy].legal;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    if (MANHATTAN[q * BOARD + corner] <= 10) return true;
  }
  return false;
}
