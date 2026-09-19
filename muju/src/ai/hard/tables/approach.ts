/**
 * The approach table (DESIGN §4.10, §5.8; SU §2.3 and addendum 20a).
 *
 * For a defender's unit `v` and a would-be attacker `a`, the question is: can
 * `a` reach a square adjacent to `v`, hit it, and still walk away? The answer
 * has three values — `NONE` (it cannot get there and attack inside the turn),
 * `STRAND` (it can hit, but it must stand where it hit) and `RETREAT` (it can
 * hit and still move). `STRAND` is the punishable one: the attacker spends its
 * whole turn arriving and is a free target on our reply (the `StrandPunish`
 * feature).
 *
 * SEMANTICS, AGAINST THE CANONICAL TABLE. `server/analysis/tactics.ts:272
 * approachTable` is the oracle (M6 gate). It enumerates, per attacker, every
 * square adjacent to the target that is empty or the attacker's own, costs the
 * walk with `getMoveCost`, requires `cost + 1 <= actionsRemaining` and
 * `canAttack(u)`, then simulates the move-and-hit and calls the result
 * `strike-and-retreat` when `getMovementRange(attackSquare, speed, actionsLeft)`
 * is non-empty on the resulting board and `stranded` otherwise. This module
 * reproduces that literally:
 *
 *   - `d` is the CHEAPEST such square's cost IN ACTIONS (`ceil(dist/speed)`),
 *     which is what the canonical table reports as `moveActions`. DESIGN §5.8
 *     writes the classification as `d <= 2s ? RETREAT : d <= 3s ? STRAND`, on a
 *     raw BFS distance; `ceil(dist/speed) <= 2` and `dist <= 2·speed` are the
 *     same predicate, so the thresholds are unchanged and `d` is directly
 *     comparable with the oracle. See `docs/hard-ai/design/DEVIATIONS.md`.
 *   - the class is decided by whether a retreat square actually exists after
 *     the hit, not by the cost threshold alone. With `left >= 1` actions and
 *     `speed >= 1` a retreat exists exactly when the attack square still has an
 *     empty orthogonal neighbour once the attacker has moved in and a lethal
 *     hit has cleared the target, so the test is one `dilate`-free mask AND.
 *     On the shipped 4-action turn this agrees with §5.8's thresholds (cost
 *     <= 2 leaves an action, cost 3 does not) everywhere except when the
 *     attacker would box itself in — where the canonical table says `stranded`
 *     and the threshold rule would wrongly promise an escape.
 *   - an attack that ends the game leaves no reply to retreat from, so a lethal
 *     hit on the defender's LAST unit is `STRAND` (the canonical table sees
 *     `line.after.phase !== 'playing'` and reports zero retreat squares).
 *
 * `retreats` is DESIGN §5.8's own quantity, `|reach(attackSquare, s, 1) \
 * strike[defender]|` — retreat squares that are not already covered by us —
 * and is NOT the canonical table's raw `retreatSquares`; the M6 gate compares
 * class and `d` only.
 *
 * The action budget follows `NodeTables`' convention for `killNow` (DESIGN
 * §4.8): the side to move has the actions it actually has left, the other side
 * is assumed to arrive with a full turn. Likewise the `canAttack` flags only
 * gate every current-horizon unit. Only explicit nextAct resets them. For
 * the mover's next Act, the defender has healed at its intervening turn start.
 */
import {
  ACTIONS_PER_TURN,
} from '../core/state';
import {
  DEAD,
  F_CAN_ACT,
  F_LAST_KILLED,
  MAX_SLOTS,
  NO_SLOT,
  PEND_STRIDE,
  type DefId,
  type PackedState,
  type Side,
  type Slot,
  type Square,
} from '../types';
import {
  bbAndNot,
  bbCopy,
  bbCount,
  bbDilate,
  bbHas,
  bbIsEmpty,
  bbNext,
  bbNew,
  bbOr,
  bbSet,
  bbZero,
  type BB,
  type Scratch,
} from '../core/bits';
import { activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { nextActProjection } from '../core/spawn';
import { bfsFrom } from '../core/movement';
import { ADJ, MANHATTAN } from '../core/tables';
import type { NodeTables } from './context';

export const Approach = { NONE: 0, STRAND: 1, RETREAT: 2 } as const;
export type Approach = (typeof Approach)[keyof typeof Approach];

export interface ApproachResult {
  cls: Approach;
  /** Move actions to the cheapest attack square, `-1` when `cls === NONE`. */
  d: number;
  /** `|reach(attackSquare, speed, 1) \ strike[defender]|`. */
  retreats: number;
  /** Slot of the attacker standing on `attackerSq`, or `-1` for a purchase. */
  attackerSlot: number;
  buy: 0 | 1;
}

/** `Scratch` dimensions `classifyApproach`/`approachTable` require per ply. */
export const APPROACH_SCRATCH_BB = 7;
export const APPROACH_SCRATCH_I8 = 1;

const SC_CANDIDATES = 0;
const SC_AFTER = 1;
const SC_FREE = 2;
const SC_ACC = 3;
const SC_FRONTIER = 4;
const SC_VISITED = 5;
const SC_NEXT = 6;
const PENDING = bbNew();
const PROJECTED_OCC = bbNew();
const PRECEDING_ENEMY = bbNew();
const PROJECTED_DIST = new Int8Array(100);
const SCRATCH_RESULT = newApproachResult();

export function newApproachResult(): ApproachResult {
  return { cls: Approach.NONE, d: -1, retreats: 0, attackerSlot: -1, buy: 0 };
}

/**
 * Classify one (attacker square, speed) against one defender slot.
 *
 * `defId` is optional and additive to DESIGN §4.10's signature: lethality
 * decides whether the target's square is vacated before the retreat test, and
 * this low-level geometric query may explicitly model an empty origin. That
 * optional definition is a hypothetical what-if, not a legal purchase or
 * promotion. approachTable only passes actual or valid paid-arrival bodies. It defaults
 * to the definition of whatever stands on `attackerSq`, and to "assume the
 * target survives" when the square is empty.
 */
export function classifyApproach(
  p: PackedState,
  t: NodeTables,
  attackerSq: Square,
  speed: number,
  targetSlot: Slot,
  sc: Scratch,
  ply: number,
  defId: DefId = -1,
  horizon: 'current' | 'nextAct' = 'current',
): ApproachResult {
  return classifyApproachInto(p, t, attackerSq, speed, targetSlot, sc, ply, defId, newApproachResult(), horizon);
}

/** Allocation-free `classifyApproach`: writes into `out` and returns it. */
export function classifyApproachInto(
  p: PackedState,
  t: NodeTables,
  attackerSq: Square,
  speed: number,
  targetSlot: Slot,
  sc: Scratch,
  ply: number,
  defId: DefId,
  out: ApproachResult,
  horizon: 'current' | 'nextAct' = 'current',
): ApproachResult {
  out.cls = Approach.NONE;
  out.d = -1;
  out.retreats = 0;
  const standing = p.pieceAt[attackerSq];
  out.attackerSlot = standing === NO_SLOT ? -1 : standing;
  out.buy = standing === NO_SLOT ? 1 : 0;

  const targetSq = p.sq[targetSlot];
  if (targetSq === DEAD) return out;
  const defender = p.owner[targetSlot] as Side;
  const attacker = (1 - defender) as Side;
  if (standing !== NO_SLOT && p.owner[standing] !== attacker) return out;

  const cat = activeCatalog();
  const def = defId >= 0 ? defId : standing !== NO_SLOT ? p.defId[standing] : -1;
  if (horizon === 'current' && standing !== NO_SLOT && !attackerReady(p, standing, def, cat)) return out;

  const future = horizon === 'nextAct';
  if (future) {
    nextActProjection(p, attacker, PENDING, PROJECTED_OCC, PRECEDING_ENEMY);
    bfsFrom(PROJECTED_OCC, attackerSq, PROJECTED_DIST);
  }
  const dist = future ? PROJECTED_DIST : t.dist.get(p, attackerSq);
  const budget = future ? ACTIONS_PER_TURN : attacker === p.side ? (p.phase === 0 ? 0 : p.actions) : ACTIONS_PER_TURN;
  return classifyFrom(p, t, dist, attackerSq, speed, targetSlot, def, sc, ply, cat, livingCount(p, defender) + (future ? bbCount(PRECEDING_ENEMY) : 0), out,
    future ? PROJECTED_OCC : p.occ, budget, future ? t.exposure[attacker] : t.strike[defender],
    future && attacker === p.side ? 0 : p.damage[targetSlot]);
}

/** Cheapest lethal approach per defender slot. Current uses only actual
 * ready bodies; nextAct also resolves already-paid arrivals, with one shared
 * simultaneous occupancy. Hypothetical purchases/promotions are excluded. */
export function approachTable(
  p: PackedState, t: NodeTables, defender: Side, sc: Scratch, ply: number,
  outClass: Uint8Array, outRetreats: Uint8Array,
  horizon: 'current' | 'nextAct' = 'current',
): void {
  outClass.fill(Approach.NONE);
  outRetreats.fill(0);
  const cat = activeCatalog();
  const attacker = (1 - defender) as Side;
  const future = horizon === 'nextAct';
  const budget = future ? ACTIONS_PER_TURN : attacker === p.side ? (p.phase === 0 ? 0 : p.actions) : ACTIONS_PER_TURN;
  if (budget < 1) return;
  const maxMoves = budget - 1;
  if (future) {
    nextActProjection(p, attacker, PENDING, PROJECTED_OCC, PRECEDING_ENEMY);
  }
  const defenderUnits = livingCount(p, defender) + (future ? bbCount(PRECEDING_ENEMY) : 0);
  const occ = future ? PROJECTED_OCC : p.occ;
  const covered = future ? t.exposure[attacker] : t.strike[defender];
  const res = SCRATCH_RESULT;
  for (let v = 0; v < MAX_SLOTS; v++) {
    const targetSq = p.sq[v];
    if (targetSq === DEAD || p.owner[v] !== defender) continue;
    const targetDef = p.defId[v];
    const targetDamage = future && attacker === p.side ? 0 : p.damage[v];
    const effDef = cat.def[targetDef] - targetDamage;
    resetBest();
    for (let a = 0; a < MAX_SLOTS; a++) {
      const from = p.sq[a];
      if (from === DEAD || p.owner[a] !== attacker) continue;
      const def = p.defId[a];
      if (cat.power[powerIndex(attacker, def, targetDef)] < effDef) continue;
      if (!future && !attackerReady(p, a, def, cat)) continue;
      const speed = cat.spd[def];
      if (MANHATTAN[from * 100 + targetSq] > speed * maxMoves + 1) continue;
      if (future) bfsFrom(occ, from, PROJECTED_DIST);
      const dist = future ? PROJECTED_DIST : t.dist.get(p, from);
      classifyFrom(p, t, dist, from, speed, v, def, sc, ply, cat, defenderUnits, res, occ, budget, covered, targetDamage);
      considerCandidate(res, 0, a);
    }
    if (future) {
      for (let q = bbNext(PENDING, -1); q >= 0; q = bbNext(PENDING, q)) {
        const def = p.pendDef[attacker * PEND_STRIDE + q] - 1;
        if (cat.power[powerIndex(attacker, def, targetDef)] < effDef) continue;
        bfsFrom(occ, q, PROJECTED_DIST);
        classifyFrom(p, t, PROJECTED_DIST, q, cat.spd[def], v, def, sc, ply, cat, defenderUnits, res, occ, budget, covered, targetDamage);
        considerCandidate(res, 1, q);
      }
    }
    outClass[v] = BEST.cls;
    outRetreats[v] = BEST.retreats > 255 ? 255 : BEST.retreats;
  }
}

/**
 * The running winner of `approachTable`'s per-slot scan, module state so the
 * scan allocates nothing. Ranked by: fewest move actions, then the more
 * dangerous class (an attacker that can withdraw), then an existing unit
 * before a purchase, then the lowest tiebreak key (slot for a unit, the
 * catalogue's tier-1 index for a purchase).
 */
const BEST = { cls: Approach.NONE as Approach, d: -1, retreats: 0, buy: 1, key: 1 << 30 };

function resetBest(): void {
  BEST.cls = Approach.NONE;
  BEST.d = -1;
  BEST.retreats = 0;
  BEST.buy = 1;
  BEST.key = 1 << 30;
}

function considerCandidate(res: ApproachResult, buy: 0 | 1, key: number): void {
  if (res.cls === Approach.NONE) return;
  const better =
    BEST.d < 0 ||
    res.d < BEST.d ||
    (res.d === BEST.d &&
      (res.cls > BEST.cls ||
        (res.cls === BEST.cls && (buy < BEST.buy || (buy === BEST.buy && key < BEST.key)))));
  if (!better) return;
  BEST.cls = res.cls;
  BEST.d = res.d;
  BEST.retreats = res.retreats;
  BEST.buy = buy;
  BEST.key = key;
}

/**
 * The shared core. `dist` is the attacker's distance field — a single-source
 * BFS from `originSq` for a unit on the board, or a multi-source BFS from the
 * attacker's legal spawn mask for a purchase (`originSq === -1`), in which
 * case every spawn square carries distance 0 and therefore costs no move
 * action: buying next to the target and hitting is a zero-walk approach.
 */
function classifyFrom(
  p: PackedState,
  t: NodeTables,
  dist: Int8Array,
  originSq: number,
  speed: number,
  targetSlot: Slot,
  def: DefId,
  sc: Scratch,
  ply: number,
  cat: Catalog,
  /** `livingCount(p, defender)`, hoisted: `approachTable` calls this once per
   * (attacker, form) and the scan is over all `MAX_SLOTS`. */
  defenderUnits: number,
  out: ApproachResult,
  occupancy: BB,
  budget: number,
  covered: BB,
  targetDamage: number,
): ApproachResult {
  out.cls = Approach.NONE;
  out.d = -1;
  out.retreats = 0;
  out.attackerSlot = originSq >= 0 ? (p.pieceAt[originSq] === NO_SLOT ? -1 : p.pieceAt[originSq]) : -1;
  out.buy = originSq >= 0 && p.pieceAt[originSq] !== NO_SLOT ? 0 : 1;

  const targetSq = p.sq[targetSlot];
  if (targetSq === DEAD) return out;
  const defender = p.owner[targetSlot] as Side;
  const attacker = (1 - defender) as Side;
  if (budget < 1) return out;

  const targetDef = p.defId[targetSlot];
  const lethal = def >= 0 && cat.power[powerIndex(attacker, def, targetDef)] >= cat.def[targetDef] - targetDamage;
  const decisive = lethal && defenderUnits === 1;

  const candidates = sc.bb(ply, SC_CANDIDATES);
  bbAndNot(candidates, ADJ[targetSq], occupancy);
  if (originSq >= 0 && bbHas(ADJ[targetSq], originSq)) bbSet(candidates, originSq);

  // E3.2 B6 (`config.ts EvalFix.approachTieOrder`, OFF by default): the
  // ATTACK-SQUARE tie-break frame. The scan below walks the target's empty
  // neighbours in ASCENDING SQUARE INDEX and keeps the first of any pair that
  // ties on both `cost` and `cls`; the board's own rot180 symmetry maps
  // `s -> 99 - s`, which reverses that order, so the same position and its
  // mirror can settle on two different attack squares. `cls` and `d` are equal
  // by construction in such a tie, but `retreats` is
  // `|reach(attackSquare, speed, 1) \ strike[defender]|`, and two different
  // attack squares have two different reach sets — measured on
  // `fuzz-5150-4-132`, where the one lethal attacker sits at mirrored squares
  // 43 and 56, `classifyApproach` returns `d = 2` and RETREAT in both spellings
  // and `retreats` 0 in the position and 1 in the mirror
  // (`amendments/lane12.md` A2, `docs/hard-ai/e3/E3.2-CORRECTNESS-B6.md`).
  // With the flag on the tie is broken in the ATTACKER'S OWN corner-relative
  // frame — `q` for White, whose corner is square 0, and `99 - q` for Black,
  // whose corner is square 99 — the same total order `tables/economy.ts`
  // `bestRelocationTarget` uses under B2 (`rot180TieOrder`), which the mirror
  // transform (rot180 AND seat swap) carries with it.
  // The flag touches `retreats` ONLY: `cls` and `d` come out of the same tie
  // unchanged, and `t.retreats[slot]` is read in exactly one place
  // (`eval/invariants.ts:294`, itself gated on B4 `inv3RetreatConjunct`), so
  // with B4 off this flag changes no feature of any position.
  const tieFix = t.evalFix !== null && t.evalFix.approachTieOrder === true;
  let bestCost = -1;
  let bestCls: Approach = Approach.NONE;
  let bestRetreats = 0;
  /** `q` in the attacker's corner-relative frame; only read when `tieFix`. */
  let bestRel = 0;

  for (let q = bbNext(candidates, -1); q >= 0; q = bbNext(candidates, q)) {
    const d = dist[q];
    if (d < 0 || (speed === 0 && d > 0)) continue;
    const cost = d === 0 ? 0 : ((d + speed - 1) / speed) | 0;
    if (cost + 1 > budget) continue;
    const left = budget - cost - 1;

    let cls: Approach = Approach.STRAND;
    let retreats = 0;
    if (speed > 0 && !decisive && left >= 1) {
      const after = sc.bb(ply, SC_AFTER);
      bbCopy(after, occupancy);
      if (originSq >= 0) clearSquare(after, originSq);
      bbSet(after, q);
      if (lethal) clearSquare(after, targetSq);
      const free = sc.bb(ply, SC_FREE);
      bbAndNot(free, ADJ[q], after);
      if (!bbIsEmpty(free)) {
        cls = Approach.RETREAT;
        retreats = countRetreats(q, speed, after, covered, sc, ply);
      }
    }

    if (bestCost < 0 || cost < bestCost || (cost === bestCost && cls > bestCls)) {
      bestCost = cost;
      bestCls = cls;
      bestRetreats = retreats;
      if (tieFix) bestRel = attacker === 0 ? q : 99 - q;
    } else if (tieFix && cost === bestCost && cls === bestCls) {
      const rel = attacker === 0 ? q : 99 - q;
      if (rel < bestRel) {
        bestRetreats = retreats;
        bestRel = rel;
      }
    }
  }

  if (bestCost < 0) return out;
  out.cls = bestCls;
  out.d = bestCost;
  out.retreats = bestRetreats;
  return out;
}

/**
 * `|reach(from, speed, 1) \ strikeDefender|` over the post-attack occupancy —
 * the squares the attacker could withdraw to with its remaining action that we
 * do not already cover. `speed` ring expansions, no BFS.
 */
function countRetreats(from: Square, speed: number, occAfter: BB, strikeDefender: BB, sc: Scratch, ply: number): number {
  const acc = sc.bb(ply, SC_ACC);
  const frontier = sc.bb(ply, SC_FRONTIER);
  const visited = sc.bb(ply, SC_VISITED);
  const next = sc.bb(ply, SC_NEXT);
  bbZero(acc);
  bbZero(frontier);
  bbSet(frontier, from);
  bbZero(visited);
  bbSet(visited, from);
  for (let step = 0; step < speed; step++) {
    bbDilate(next, frontier);
    bbAndNot(next, next, occAfter);
    bbAndNot(next, next, visited);
    if (bbIsEmpty(next)) break;
    bbOr(acc, acc, next);
    bbOr(visited, visited, next);
    bbCopy(frontier, next);
  }
  bbAndNot(acc, acc, strikeDefender);
  return bbCount(acc);
}

/** `canAttack` (combat.ts:14-17) on the packed state, for the definition `def`. */
function attackerReady(p: PackedState, slot: Slot, def: DefId, cat: Catalog): boolean {
  if ((p.uflags[slot] & F_CAN_ACT) === 0) return false;
  const count = p.atkCount[slot];
  if (def >= 0 && count >= cat.tier[def]) return false;
  return count === 0 || (p.uflags[slot] & F_LAST_KILLED) !== 0;
}

function livingCount(p: PackedState, side: Side): number {
  let n = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] !== DEAD && p.owner[slot] === side) n++;
  }
  return n;
}

function clearSquare(d: BB, s: Square): void {
  d[s >>> 5] &= ~(1 << (s & 31));
}
