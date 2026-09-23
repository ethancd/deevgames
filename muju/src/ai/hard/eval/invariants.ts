/**
 * The twenty SU §7 invariants as bit-flag features (DESIGN §4.15, §5.13).
 *
 * `invariantBits(p, t, side, sc, ply)` returns a 20-bit mask; bit `i` is SU §7
 * invariant `i + 1` violated FOR `side` on this position. DESIGN F7 is the
 * ruling that matters here: **none of these is a filter**. They are penalty
 * features evaluated on the position AFTER a candidate turn, and the generator
 * still emits the turns that violate them.
 *
 * Phasing keeps the twenty indices, but not Standard's immediate-placement
 * premises. Bits 5 and 17 are structural zero: a snapshot cannot attribute a
 * live body's role/path obstruction to a particular delayed commitment.
 * Bits 7/14 use the first bill actually reached by the conditional pass-only
 * forecast; bit 19 observes already-paid arrivals, independent of enemy cash.
 * Other flag-derived diagnostics retain their documented snapshot meaning.
 * All invariant bootstrap coefficients are zero; no bit is a legal filter.
 *
 * Nothing here allocates after module load.
 */
import {
  CC,
  DEAD,
  F_LAST_KILLED,
  F_PROMOTED,
  NO_SLOT,
  type Centi,
  type PackedState,
  type Side,
  type Square,
} from '../types';
import { bbHas, bbNext, type Scratch } from '../core/bits';
import {
  ADJ_COUNT,
  ADJ_LIST,
  BOARD,
  CORNER,
  CORNER_NEIGHBOURS,
  MANHATTAN,
  SQ_X,
  SQ_Y,
} from '../core/tables';
import { activeCatalog, type Catalog } from '../core/catalog';
import { ACTIONS_PER_TURN, INACTIVITY_WARNING } from '../core/state';
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

    // 19: forward soft miner exposed to an already-paid next-Act arrival.
    if (
      !softMinerExposed &&
      cat.def[def] === 1 &&
      cat.mine[def] > 0 &&
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
    // E3.2 B4 (`config.ts EvalFix.inv3RetreatConjunct`, OFF by default): DESIGN
    // §5.13 row 3 is "some own unit with `material >= 400` has
    // `approach == RETREAT` AND THE ATTACKER HAS `retreats > 0`" (DESIGN.md:1448).
    // The shipped predicate drops the second conjunct, and `t.retreats[slot]`
    // — the attacker's retreat squares outside our strike, computed by
    // `tables/approach.ts` and written by `buildTables` — is read nowhere else
    // in the evaluator. 943 of 965 firings on the E3.1 fuzz corpus are the
    // excluded case (`E3.1-FEATURE-AUDIT` L1-F3, `E3.1-INVARIANTS-AUDIT` L2-F5).
    // With the flag on the bit means what DESIGN says it means.
    if (
      !retreatSquareLost &&
      cls === Approach.RETREAT &&
      cat.cost[def] >= 4 &&
      (t.evalFix === null || t.evalFix.inv3RetreatConjunct !== true || t.retreats[slot] > 0)
    ) {
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
  // 5: structural zero. A BUY creates escrow, not a live miner; arrival
  // resets flags. A snapshot does not prove which commitment lacked a role.

  // --- 6: a deep anchor with no cover --------------------------------------
  if (geom.blocking <= 1 && geom.anchorDepth >= 6) bits |= bit(6);

  // --- 7: promotion into an upkeep cliff -----------------------------------
  if (promotedThisTurn && econ.firstBillReached && econ.rentShortfall > 0) bits |= bit(7);

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

  // --- 12: an enemy body sits on a two-victim Cleave line -------------------
  // Any tier since `muju-phasing-4`: Cleave has no tier cap, so a Tier I
  // chains two kills exactly as a Tier II does.
  for (let slot = 0, limit = p.slotCount; slot < limit; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] !== enemy) continue;
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

  // --- 14: the next reached bill has an actual forecast cash shortage -------
  // Includes income/refunds before that bill; unpaid Prepare is ordinal zero.
  // Terminal-before-bill is unreached, not an affordability claim.
  if (econ.firstBillReached && econ.rentShortfall > 0 && !killedThisTurn) bits |= bit(14);

  // --- 15: structural (an UNKNOWN verdict is scored as the bad case) -------
  // Always 0: DESIGN §5.13 gives it no weight and no test of its own; the rule
  // lives in `tactics/prover.ts` (exhaustion never wins) and in invariant 10's
  // "no proven rescue counts as no rescue" reading above.

  // --- 16: sitting on a lead while the kill clock runs ---------------------
  // The threshold is the CANONICAL in-game warning, `INACTIVITY_WARNING` — the
  // last three plies before the clock ends the game — not the literal 7 it
  // used to be. Under `muju-phasing-2` (A4) that was 17; `muju-phasing-3`
  // (owner decision 2026-09-22, the KILL CLOCK) brings it back to 7, and the
  // invariant's threshold did not have to be restated either time.
  // MEANING FLIPPED under `muju-phasing-3`: under `-1`/`-2` the clock only ever
  // drew, so "the clock is three plies from ending and you are ahead" was a
  // WASTED lead — nothing about being ahead changed a neutral draw. Now the
  // clock is DECIDED by the higher mined total, so sitting on a mining lead
  // while it runs out is the CORRECT plan — it heads toward a win, not a
  // neutral draw. `leadCc` here (material + bank) is not literally the
  // mined-total lead the verdict compares — `eval/features.ts`'s
  // `DrawPressure` uses that exact quantity (`gained[]`) — but a side that
  // converted a lead into material and cash typically mined more to pay for
  // it, so this remains a cheap proxy for the same idea; a future tuning pass
  // may switch it to `gained[]` directly. The 300 cc lead and the
  // `killNow.count === 0` clause are unrelated to the clock and untouched.
  if (p.drawRuleOn === 1 && p.clock >= INACTIVITY_WARNING && leadCc(p, side) >= 300 && killNow.count === 0) bits |= bit(16);

  // --- 17: structural zero ------------------------------------------------
  // Pending commitments do not block movement. Once arrived, a snapshot alone
  // does not establish a causal before/after route cost for that commitment.

  // --- 18: protocol rule only (DESIGN F7) ---------------------------------
  // Always 0: `END_PLACE_PHASE` is emitted only when legal
  // (`src/ai/simulate.ts:118-120`), which `core/state.ts isLegal` enforces.

  if (softMinerExposed) bits |= bit(19);
  if (strandNoRetreat) bits |= bit(20);

  return bits;
}

/**
 * A weight-free proxy for "who is ahead", in centi-crystals: catalogue
 * material plus bank and refundable pending principal. `eval/features.ts` imports it for `DrawPressure`
 * (DESIGN §5.12.1's `sign(v0 + v1 so far)`); invariant 16's "ahead by >= 300
 * cc" uses it here. It lives in this module and not in `features.ts` because
 * `features.ts` already imports this one, and the reverse edge would close a
 * cycle. See DEVIATIONS under M12.
 */
export function leadCc(p: PackedState, side: Side): Centi {
  const other = (1 - side) as Side;
  return p.materialCc[side] - p.materialCc[other]
    + (p.bank[side] + p.pendCostSum[side] - p.bank[other] - p.pendCostSum[other]) * CC;
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
