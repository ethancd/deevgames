/**
 * Purchase enumeration (DESIGN §4.13 `gen/purchase.ts`, §5.5, EG G7).
 *
 * The Place phase is the half of a macro turn no `ActionSearch` can see:
 * `gen/actionsearch.ts` starts from a state whose place-plan prefix is already
 * applied. This module builds those prefixes — which tier-1 bodies to buy and
 * where to stand them — in the three stages DESIGN §5.5 names:
 *
 *   1. **dominance** (`candidateDefs`) — six purchasable classes down to two or
 *      three, dropping a class only when EVERY condition of §5.5's table holds.
 *      Three of those conditions are F17's Göl clause, which is why `shadow_1`
 *      survives far more often than a naive "Göl mines nothing" filter would
 *      allow;
 *   2. **multisets** (`purchaseMultisets`) — non-decreasing multisets of at
 *      most `maxBodies` bodies over the surviving classes with `Σcost ≤ bank`.
 *      No liquidity floor is applied there (§5.5): the `BankLiquid` /
 *      `Inv14LiquidityFloor` features price leftover cash on the post-turn
 *      position;
 *   3. **square assignment** (`planPurchases`) — the top `S` legal spawn
 *      squares by `squareScoreCc`, all injective assignments of a multiset's
 *      bodies to them, best `keepPerMultiset` kept.
 *
 * **No rejection** (DESIGN F7, F16). Nothing here discards a legal plan. A plan
 * whose own buys fill the last spawn square is SCORED down by `w.zeroSpawnCc`
 * and kept, because F16's punisher
 * (`BUY water_1@C1 → Hi C2→D2 → Sjor C1→C2 → ATTACK C3`) vacates C1 again
 * inside the same turn; the eval's `SpawnZero`/`Inv1` on the POST-TURN position
 * is what finally prices it. The only plan this module refuses to emit is one
 * it could not make legal at all (the ordering rule below).
 *
 * **Ordering legality.** Buys are emitted in descending `squareScoreCc`; a buy
 * whose square is not legal YET is retried once the others have anchored
 * (§5.5). Own units never block own rectangles (`spawning.ts:85-92`), so buying
 * can only ADD legal squares and the retry always converges. `assignOrder`
 * replays `core/spawn.ts spawnInfo`'s mask arithmetic one buy at a time, so the
 * emitted order is legal by construction rather than by assumption.
 *
 * Nothing here allocates during a search: every buffer is module-level and
 * fixed-size (the same arrangement `tables/kill.ts` uses for its DP tables),
 * and `PlacePlan` records are owned by the caller.
 */
import {
  DEAD,
  MAX_SLOTS,
  NO_SLOT,
  Result,
  type Centi,
  type DefId,
  type PackedState,
  type Side,
  type Square,
} from '../types';
import {
  bbAndNot,
  bbCopy,
  bbCount,
  bbHas,
  bbIntersects,
  bbIsEmpty,
  bbNew,
  bbNext,
  bbOr,
  bbSet,
  bbZero,
  type BB,
  type Scratch,
} from '../core/bits';
import { ADJ_LIST, BOARD, CORRIDOR, RECT } from '../core/tables';
import { DEF_INDEX, activeCatalog, powerIndex, type Catalog } from '../core/catalog';
import { AKind, paA, paB, paMake } from '../core/action';
import { ACTIONS_PER_TURN } from '../core/state';
import { anchorsVoidedBy } from '../core/spawn';
import { moveCost } from '../core/movement';
import { pstMine } from '../core/income';
import type { NodeTables } from '../tables/context';
import { TurnFlag } from './turn';
import type { PurchaseConfig, PurchaseWeights } from '../config';

export type { PurchaseConfig, PurchaseWeights } from '../config';

/**
 * One Place-phase purchase prefix: the BUY actions, what they cost, how they
 * scored and how much legal spawn area survives them (DESIGN §4.13).
 * `gen/generate.ts` appends promotions and the phase terminator; this module
 * emits neither.
 */
export interface PlacePlan {
  /** Packed `BUY` actions in dispatch order. */
  actions: Int32Array;
  count: number;
  /** Crystals the buys cost. */
  spend: number;
  scoreCc: Centi;
  /** `TurnFlag` bits the buys justify (`PURCHASE`, `SUMMON_STRIKE`, `HOME_RACE`). */
  flags: number;
  /** Legal spawn squares remaining once every buy is applied. */
  spawnAfter: number;
}

/** Hard ceiling on `PurchaseConfig.maxBodies` (DESIGN §8: `MAX_BODIES = 4`). */
export const PURCHASE_MAX_BODIES = 4;
/** `Int32Array` stride of one `purchaseMultisets` entry: `[count, def0..def3]`. */
export const MULTISET_WORDS = 1 + PURCHASE_MAX_BODIES;
/** Ceiling on `PurchaseConfig.maxMultisets` this module's buffers can hold. */
export const MAX_MULTISETS = 64;
/** Ceiling on `PurchaseConfig.squares` (DESIGN §8: `S = 8`). */
export const MAX_TOP_SQUARES = 16;
/**
 * SU §1.6's liquidity floor (DESIGN §8 gives "6-8"); the low end is used so the
 * ORDERING penalty bites only on plans that leave a side genuinely cashless. It
 * is never a rejection — see the module header and DEVIATIONS under M13.
 */
export const LIQUIDITY_FLOOR = 6;
/** BFS radius inside which a reachable enemy corner keeps `lightning_1` (§5.5). */
const RADI_CORNER_RADIUS = 12;
/** F17's Göl band: an enemy fire/lightning body at BFS distance in `(4, 7]`. */
const GOEL_BAND_LO = 4;
const GOEL_BAND_HI = 7;
/** `core/catalog.ts ELEMENT_ORDER` indices. */
const ELEMENT_FIRE = 0;
const ELEMENT_LIGHTNING = 1;

export function newPlacePlan(): PlacePlan {
  return { actions: new Int32Array(PURCHASE_MAX_BODIES), count: 0, spend: 0, scoreCc: 0, flags: 0, spawnAfter: 0 };
}

// --- module scratch -----------------------------------------------------------

/** The node's untouched legal spawn mask; every per-plan walk copies it. */
const SC_SPAWN_LEGAL: BB = bbNew();
const SC_LEGAL: BB = bbNew();
const SC_OCC: BB = bbNew();
const SC_ENEMY: BB = bbNew();
const SC_RECT: BB = bbNew();
const SC_TMP: BB = bbNew();
const SC_SPAWN_DIST = new Int8Array(BOARD);
const SC_DEFS = new Uint8Array(18);
const SC_MULTISETS = new Int32Array(MAX_MULTISETS * MULTISET_WORDS);
/** Square list and its score, sorted descending by `rankSquares`. */
const SQ_LIST = new Int32Array(BOARD);
const SQ_SCORE = new Int32Array(BOARD);
/** Per (defId, square) square score for the current node. */
const DEF_SQUARE_SCORE = new Int32Array(18 * BOARD);
/** The assignment search's working state. */
const MS_BODY = new Int32Array(PURCHASE_MAX_BODIES);
const MS_PICK = new Int32Array(PURCHASE_MAX_BODIES);
const MS_BEST = new Int32Array(PURCHASE_MAX_BODIES * PURCHASE_MAX_BODIES);
const MS_BEST_SCORE = new Int32Array(PURCHASE_MAX_BODIES);
const MS_SWAP = new Int32Array(PURCHASE_MAX_BODIES);
/** `assignOrder`'s inputs. */
const ORDER_DEF = new Int32Array(PURCHASE_MAX_BODIES);
const ORDER_SQ = new Int32Array(PURCHASE_MAX_BODIES);
const ORDER_DONE = new Uint8Array(PURCHASE_MAX_BODIES);

function enemyOccInto(p: PackedState, side: Side, dst: BB): BB {
  const base = (1 - side) * 4;
  dst[0] = p.occBy[base];
  dst[1] = p.occBy[base + 1];
  dst[2] = p.occBy[base + 2];
  dst[3] = p.occBy[base + 3];
  return dst;
}

/** `cat.def[def] - damage`, floored at 0 — the canonical effective defence. */
function effectiveDef(p: PackedState, cat: Catalog, slot: number): number {
  const d = cat.def[p.defId[slot]] - p.damage[slot];
  return d < 0 ? 0 : d;
}

/** Does a body of `def` owned by `side` remove `victim` with one hit? */
function oneShots(p: PackedState, cat: Catalog, side: Side, def: DefId, victim: number): boolean {
  return cat.power[powerIndex(side, def, p.defId[victim])] >= effectiveDef(p, cat, victim);
}

/** Union of `side`'s unblocked spawn rectangles, occupancy included. */
function unblockedRectUnion(p: PackedState, side: Side, out: BB): BB {
  bbZero(out);
  const enemy = enemyOccInto(p, side, SC_ENEMY);
  const rect = RECT[side];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    const box = rect[s];
    if (bbIntersects(box, enemy)) continue;
    bbOr(out, out, box);
  }
  return out;
}

// --- stage 1: dominance --------------------------------------------------------

/**
 * Can `side` remove `victim` this turn with a body it already owns, buying
 * nothing? A lethal hit costs one action, so the attacker has `budget - 1`
 * actions to reach a square adjacent to the victim.
 *
 * This is deliberately NOT `t.killNow[side].entry[victim]`: that entry is a
 * full kill-combination plan built with `allowBuys: true`
 * (`tables/context.ts killOptsFor`), so reading it here would let a purchase
 * class justify keeping itself.
 */
function killableWithoutBuying(p: PackedState, t: NodeTables, cat: Catalog, side: Side, victim: number): boolean {
  const budget = p.phase === 0 ? ACTIONS_PER_TURN : p.actions;
  if (budget <= 0) return false;
  const victimSq = p.sq[victim];
  const need = effectiveDef(p, cat, victim);
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== side) continue;
    if (cat.power[powerIndex(side, p.defId[slot], p.defId[victim])] < need) continue;
    const base = victimSq * 4;
    for (let k = 0; k < 4; k++) {
      const q = ADJ_LIST[base + k];
      if (q < 0) continue;
      if (q === s) return true;
      if (p.pieceAt[q] !== NO_SLOT) continue;
      const cost = moveCost(t.dist.get(p, s), q, cat.spd[p.defId[slot]]);
      if (cost > 0 && cost <= budget - 1) return true;
    }
  }
  return false;
}

/**
 * Can a body of `def`, bought this turn, remove `victim` before the turn ends?
 * It must one-shot it (a purchase gets at most one blow after closing) and land
 * on a legal spawn square from which some empty square adjacent to `victim` is
 * within `budget - 1` actions. This is the `killNow` entry DESIGN §5.5's
 * "lethal answer" clauses mean, restricted to what a PURCHASE can contribute.
 */
function buyCanKill(p: PackedState, t: NodeTables, cat: Catalog, side: Side, def: DefId, victim: number): boolean {
  if (!oneShots(p, cat, side, def, victim)) return false;
  const budget = p.phase === 0 ? ACTIONS_PER_TURN : p.actions;
  if (budget <= 0) return false;
  const legal = t.spawn[side].legal;
  const spd = cat.spd[def];
  const base = p.sq[victim] * 4;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    for (let k = 0; k < 4; k++) {
      const r = ADJ_LIST[base + k];
      if (r < 0) continue;
      if (r === q) return true;
      if (p.pieceAt[r] !== NO_SLOT) continue;
      const cost = moveCost(t.dist.get(p, q), r, spd);
      if (cost > 0 && cost <= budget - 1) return true;
    }
  }
  return false;
}

/**
 * Is `def` the ONLY affordable class whose fresh body answers some enemy target
 * lethally (DESIGN §5.5: "never drop the sole lethal answer in `killNow`")?
 * Targets the side can already remove with the bodies it owns do not count —
 * those need no purchase at all.
 */
function isSoleLethalAnswer(
  p: PackedState,
  t: NodeTables,
  cat: Catalog,
  side: Side,
  def: DefId,
  affordable: Uint8Array,
  affordableCount: number,
): boolean {
  for (let victim = 0; victim < MAX_SLOTS; victim++) {
    if (p.sq[victim] === DEAD || p.owner[victim] === side) continue;
    if (!buyCanKill(p, t, cat, side, def, victim)) continue;
    if (killableWithoutBuying(p, t, cat, side, victim)) continue;
    let others = 0;
    for (let i = 0; i < affordableCount; i++) {
      const other = affordable[i];
      if (other !== def && buyCanKill(p, t, cat, side, other, victim)) others++;
    }
    if (others === 0) return true;
  }
  return false;
}

/** Does any legal spawn square of `side` lie inside an unblocked ENEMY rectangle? */
function canBlockEnemyRectangle(p: PackedState, t: NodeTables, side: Side): boolean {
  unblockedRectUnion(p, (1 - side) as Side, SC_RECT);
  const legal = t.spawn[side].legal;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    if (bbHas(SC_RECT, q)) return true;
  }
  return false;
}

/**
 * DESIGN §5.5's `ceil(d/3) < ceil(d/2)` — SPD 3 strictly beats SPD 2 to a
 * target `d` BFS steps away — with one added clause: the advantage must fall
 * INSIDE a turn's action budget.
 *
 * Without it the test is vacuous: `ceil(d/3) < ceil(d/2)` holds for every
 * distance but 1, 2 and 4, so a single enemy body anywhere on the board would
 * keep `lightning_1` and §5.5's "typically 6 -> 2-3 classes" could never
 * happen. With it, the clause says what Radi's speed actually buys — a target
 * it reaches this turn and Hi does not — and §5.5's own corner clause
 * (`RADI_CORNER_RADIUS = 12 = 4 x SPD 3`) becomes the same test applied to the
 * enemy corner. See DEVIATIONS under M13.
 */
function fasterAtThree(d: number): boolean {
  if (d <= 0) return false;
  const atThree = Math.ceil(d / 3);
  return atThree <= ACTIONS_PER_TURN && atThree < Math.ceil(d / 2);
}

/**
 * `lightning_1` loses to `fire_1` when its only advantage — SPD 3 — buys
 * nothing: no target is strictly closer at speed 3 than at speed 2, and the
 * enemy corner lies outside BFS `RADI_CORNER_RADIUS` of every legal spawn
 * square (so no home race is in reach either, DESIGN F13).
 */
function dropsLightning(p: PackedState, t: NodeTables, side: Side): boolean {
  const enemy = (1 - side) as Side;
  const legal = t.spawn[side].legal;
  const cornerDist = t.cornerDist[enemy];
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    const d = cornerDist[q];
    if (d > 0 && d <= RADI_CORNER_RADIUS) return false;
  }

  // Targets worth reaching: every empty square whose occupation would void an
  // unblocked enemy anchor, and every enemy body.
  t.dist.multi(p, legal, SC_SPAWN_DIST);
  unblockedRectUnion(p, enemy, SC_RECT);
  for (let q = 0; q < BOARD; q++) {
    if (!bbHas(SC_RECT, q) || p.pieceAt[q] !== NO_SLOT) continue;
    if (fasterAtThree(SC_SPAWN_DIST[q])) return false;
  }
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== enemy) continue;
    // An occupied square gets no distance from a multi-source BFS; the same BFS
    // run the other way round (from the body's own square) does.
    const row = t.dist.get(p, s);
    let best = -1;
    for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
      const d = row[q];
      if (d > 0 && (best < 0 || d < best)) best = d;
    }
    if (fasterAtThree(best)) return false;
  }
  return true;
}

/**
 * `metal_1` loses to `plant_1` when every candidate square already mines well
 * (`reserve ≥ 3`, so Muju's MINE 3 dominates Inyan's 2) and Inyan's ATK 1
 * completes no lethal answer Muju's ATK 0 cannot.
 */
function dropsMetal(p: PackedState, t: NodeTables, cat: Catalog, side: Side, metal1: DefId, plant1: DefId): boolean {
  const legal = t.spawn[side].legal;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    if (p.reserve[q] < 3) return false;
  }
  for (let victim = 0; victim < MAX_SLOTS; victim++) {
    if (p.sq[victim] === DEAD || p.owner[victim] === side) continue;
    if (buyCanKill(p, t, cat, side, metal1, victim) && !buyCanKill(p, t, cat, side, plant1, victim)) return false;
  }
  return true;
}

/**
 * F17. `shadow_1` loses to `water_1` only when all of Göl's jobs are
 * unavailable: no enemy fire/lightning body sits in the `(4, 7]` band its SPD 2
 * covers but Sjor's SPD 1 does not, no candidate square is a 0-reserve
 * (`CORRIDOR`) cell where Sjor's mining is worthless anyway, and no candidate
 * square voids an enemy anchor. The fourth condition — Göl is not a sole lethal
 * answer — is checked by the caller for every class alike.
 */
function dropsShadow(p: PackedState, t: NodeTables, cat: Catalog, side: Side): boolean {
  const enemy = (1 - side) as Side;
  const legal = t.spawn[side].legal;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    if (bbHas(CORRIDOR, q)) return false;
    if (anchorsVoidedBy(p, enemy, q) > 0) return false;
  }
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const s = p.sq[slot];
    if (s === DEAD || p.owner[slot] !== enemy) continue;
    const element = cat.element[p.defId[slot]];
    if (element !== ELEMENT_FIRE && element !== ELEMENT_LIGHTNING) continue;
    const row = t.dist.get(p, s);
    for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
      const d = row[q];
      if (d > GOEL_BAND_LO && d <= GOEL_BAND_HI) return false;
    }
  }
  return true;
}

function has(list: Uint8Array, count: number, def: DefId): boolean {
  for (let i = 0; i < count; i++) if (list[i] === def) return true;
  return false;
}

function defIdOf(id: string): DefId {
  const def = DEF_INDEX.get(id);
  if (def === undefined) throw new Error(`gen/purchase: catalogue has no definition "${id}"`);
  return def;
}

const FIRE_1 = defIdOf('fire_1');
const LIGHTNING_1 = defIdOf('lightning_1');
const WATER_1 = defIdOf('water_1');
const SHADOW_1 = defIdOf('shadow_1');
const PLANT_1 = defIdOf('plant_1');
const METAL_1 = defIdOf('metal_1');

/**
 * DESIGN §5.5's dominance filter. Writes the surviving tier-1 definition ids
 * into `out` (catalogue tier-1 order: ascending cost, then id) and returns the
 * count. Only classes the side can afford on their own are ever candidates;
 * `fire_1` is never dropped, and neither is a sole lethal answer nor — when it
 * is the only affordable class — the one body that could block an enemy
 * rectangle.
 */
export function candidateDefs(p: PackedState, t: NodeTables, side: Side, out: Uint8Array): number {
  const cat = activeCatalog();
  const bank = p.bank[side];
  let n = 0;
  for (let i = 0; i < cat.tier1.length; i++) {
    const def = cat.tier1[i];
    if (cat.cost[def] <= bank) out[n++] = def;
  }
  if (n <= 1 || bbIsEmpty(t.spawn[side].legal)) return n;

  const soleBlocker = n === 1 && canBlockEnemyRectangle(p, t, side);
  let drop = 0;
  if (has(out, n, LIGHTNING_1) && has(out, n, FIRE_1) && !soleBlocker && dropsLightning(p, t, side)) {
    if (!isSoleLethalAnswer(p, t, cat, side, LIGHTNING_1, out, n)) drop |= 1 << LIGHTNING_1;
  }
  if (has(out, n, METAL_1) && has(out, n, PLANT_1) && !soleBlocker && dropsMetal(p, t, cat, side, METAL_1, PLANT_1)) {
    if (!isSoleLethalAnswer(p, t, cat, side, METAL_1, out, n)) drop |= 1 << METAL_1;
  }
  if (has(out, n, SHADOW_1) && has(out, n, WATER_1) && !soleBlocker && dropsShadow(p, t, cat, side)) {
    if (!isSoleLethalAnswer(p, t, cat, side, SHADOW_1, out, n)) drop |= 1 << SHADOW_1;
  }
  if (drop === 0) return n;

  let w = 0;
  for (let i = 0; i < n; i++) {
    const def = out[i];
    if ((drop & (1 << def)) === 0) out[w++] = def;
  }
  return w;
}

// --- stage 2: multisets ---------------------------------------------------------

/**
 * Non-decreasing multisets of 1..`maxBodies` bodies over `defs[0..n)` with
 * `Σcost ≤ bank` (DESIGN §5.5). Each entry occupies `MULTISET_WORDS` words of
 * `out`: `[count, def0, def1, ...]`, unused body slots left at -1. Returns the
 * number of entries written, capped by `out`'s capacity.
 *
 * The empty multiset is NOT emitted: `planPurchases` always carries the empty
 * plan itself, as index 0.
 */
export function purchaseMultisets(
  defs: Uint8Array,
  n: number,
  bank: number,
  maxBodies: number,
  out: Int32Array,
): number {
  const capacity = (out.length / MULTISET_WORDS) | 0;
  if (capacity <= 0 || n <= 0 || maxBodies <= 0) return 0;
  const cat = activeCatalog();
  const bodies = maxBodies > PURCHASE_MAX_BODIES ? PURCHASE_MAX_BODIES : maxBodies;
  let written = 0;

  const visit = (start: number, depth: number, left: number): void => {
    for (let i = start; i < n && written < capacity; i++) {
      const def = defs[i];
      const cost = cat.cost[def];
      if (cost > left) continue;
      MS_BODY[depth] = def;
      const base = written * MULTISET_WORDS;
      out[base] = depth + 1;
      for (let k = 0; k < PURCHASE_MAX_BODIES; k++) out[base + 1 + k] = k <= depth ? MS_BODY[k] : -1;
      written++;
      if (depth + 1 < bodies) visit(i, depth + 1, left - cost);
    }
  };

  visit(0, 0, bank);
  return written;
}

// --- stage 3: square assignment --------------------------------------------------

/** Summon-and-strike (SU §2.5): a fresh `def` on `q` one-shots an adjacent enemy. */
function strikesFrom(p: PackedState, cat: Catalog, side: Side, def: DefId, q: Square): boolean {
  const base = q * 4;
  for (let k = 0; k < 4; k++) {
    const adj = ADJ_LIST[base + k];
    if (adj < 0) continue;
    const victim = p.pieceAt[adj];
    if (victim === NO_SLOT || p.owner[victim] === side) continue;
    if (oneShots(p, cat, side, def, victim)) return true;
  }
  return false;
}

/**
 * Legal spawn squares gained by anchoring on `q`, minus the one `q` consumes —
 * the negation of DESIGN §5.5's "RECT_AREA shrink caused by occupying q". A
 * square whose rectangle holds an enemy anchors nothing, so it is pure shrink.
 */
function netAreaDelta(p: PackedState, side: Side, q: Square): number {
  const box = RECT[side][q];
  if (bbIntersects(box, enemyOccInto(p, side, SC_ENEMY))) return -1;
  bbAndNot(SC_TMP, box, p.occ);
  bbAndNot(SC_TMP, SC_TMP, SC_SPAWN_LEGAL);
  return bbCount(SC_TMP) - 1;
}

/** DESIGN §5.5's `squareScoreCc(def, q)`, in centi-crystals. */
function squareScoreCc(
  p: PackedState,
  t: NodeTables,
  cat: Catalog,
  side: Side,
  def: DefId,
  q: Square,
  w: PurchaseWeights,
): Centi {
  const enemy = (1 - side) as Side;
  const cost = cat.cost[def];
  let score = w.mineCc * pstMine(def, p.reserve[q]);
  score += w.safeCc * (bbHas(t.exposure[side], q) ? -cost : (cost / 2) | 0);
  score += w.blockCc * anchorsVoidedBy(p, enemy, q);
  if (strikesFrom(p, cat, side, def, q)) score += w.strikeCc;
  score += w.anchorCc * netAreaDelta(p, side, q);
  const cornerCost = moveCost(t.cornerDist[enemy], q, cat.spd[def]);
  if (cornerCost > 0 && cornerCost <= ACTIONS_PER_TURN) score += w.homeRaceCc;
  return score | 0;
}

/**
 * Scores every legal spawn square under every candidate definition (memoised
 * in `DEF_SQUARE_SCORE`) and keeps the top `squares` by their best definition,
 * descending, in `SQ_LIST`. Returns how many squares were kept.
 */
function rankSquares(
  p: PackedState,
  t: NodeTables,
  cat: Catalog,
  side: Side,
  defs: Uint8Array,
  defCount: number,
  w: PurchaseWeights,
  squares: number,
): number {
  let n = 0;
  const legal = t.spawn[side].legal;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    let best = -0x7fffffff;
    for (let i = 0; i < defCount; i++) {
      const def = defs[i];
      const score = squareScoreCc(p, t, cat, side, def, q, w);
      DEF_SQUARE_SCORE[def * BOARD + q] = score;
      if (score > best) best = score;
    }
    SQ_LIST[n] = q;
    SQ_SCORE[n] = best;
    n++;
  }
  const take = Math.min(squares, n, MAX_TOP_SQUARES);
  for (let i = 0; i < take; i++) {
    let best = i;
    for (let j = i + 1; j < n; j++) {
      if (SQ_SCORE[j] > SQ_SCORE[best] || (SQ_SCORE[j] === SQ_SCORE[best] && SQ_LIST[j] < SQ_LIST[best])) best = j;
    }
    if (best === i) continue;
    const q = SQ_LIST[best];
    const s = SQ_SCORE[best];
    SQ_LIST[best] = SQ_LIST[i];
    SQ_SCORE[best] = SQ_SCORE[i];
    SQ_LIST[i] = q;
    SQ_SCORE[i] = s;
  }
  return take;
}

/**
 * All injective assignments of one multiset's `bodies` to the top `topCount`
 * squares (`P(S, k) ≤ 1,680` at `S = 8`, DESIGN §5.5), best `keep` kept in
 * `MS_BEST` / `MS_BEST_SCORE`, best first. Equal definitions are forced into
 * ascending square-index order, so an assignment is enumerated once rather than
 * `k!` times.
 */
function bestAssignments(multisets: Int32Array, base: number, bodies: number, topCount: number, keep: number): number {
  let found = 0;
  MS_BEST_SCORE.fill(-0x7fffffff, 0, keep);

  const consider = (score: number): void => {
    let slot: number;
    if (found < keep) slot = found++;
    else {
      let worst = 0;
      for (let i = 1; i < found; i++) if (MS_BEST_SCORE[i] < MS_BEST_SCORE[worst]) worst = i;
      if (score <= MS_BEST_SCORE[worst]) return;
      slot = worst;
    }
    MS_BEST_SCORE[slot] = score;
    for (let i = 0; i < bodies; i++) MS_BEST[slot * PURCHASE_MAX_BODIES + i] = MS_PICK[i];
  };

  const visit = (i: number, used: number, minIndex: number, score: number): void => {
    if (i === bodies) {
      consider(score);
      return;
    }
    const def = multisets[base + 1 + i];
    const from = i > 0 && multisets[base + i] === def ? minIndex : 0;
    for (let s = from; s < topCount; s++) {
      if ((used & (1 << s)) !== 0) continue;
      MS_PICK[i] = s;
      visit(i + 1, used | (1 << s), s + 1, score + DEF_SQUARE_SCORE[def * BOARD + SQ_LIST[s]]);
    }
  };

  visit(0, 0, 0, 0);

  for (let i = 1; i < found; i++) {
    const score = MS_BEST_SCORE[i];
    MS_SWAP.set(MS_BEST.subarray(i * PURCHASE_MAX_BODIES, (i + 1) * PURCHASE_MAX_BODIES));
    let j = i - 1;
    while (j >= 0 && MS_BEST_SCORE[j] < score) {
      MS_BEST_SCORE[j + 1] = MS_BEST_SCORE[j];
      MS_BEST.copyWithin((j + 1) * PURCHASE_MAX_BODIES, j * PURCHASE_MAX_BODIES, (j + 1) * PURCHASE_MAX_BODIES);
      j--;
    }
    MS_BEST_SCORE[j + 1] = score;
    MS_BEST.set(MS_SWAP, (j + 1) * PURCHASE_MAX_BODIES);
  }
  return found;
}

/**
 * Emits `count` buys into `out.actions`, highest-scoring square first, retrying
 * a buy whose square is not legal yet once the others have anchored (DESIGN
 * §5.5). Returns the legal spawn squares left afterwards, or -1 when some buy
 * could never be made legal (the caller drops that assignment).
 */
function assignOrder(p: PackedState, cat: Catalog, side: Side, count: number, out: PlacePlan): number {
  bbCopy(SC_LEGAL, SC_SPAWN_LEGAL);
  bbCopy(SC_OCC, p.occ);
  const enemy = enemyOccInto(p, side, SC_ENEMY);
  ORDER_DONE.fill(0, 0, count);
  let placed = 0;
  let spend = 0;
  let k = 0;
  while (placed < count) {
    let progress = false;
    for (let i = 0; i < count; i++) {
      if (ORDER_DONE[i] === 1) continue;
      const q = ORDER_SQ[i];
      if (!bbHas(SC_LEGAL, q)) continue;
      const def = ORDER_DEF[i];
      out.actions[k++] = paMake(AKind.BUY, def, q, 0);
      spend += cat.cost[def];
      ORDER_DONE[i] = 1;
      placed++;
      progress = true;
      bbSet(SC_OCC, q);
      const box = RECT[side][q];
      if (!bbIntersects(box, enemy)) bbOr(SC_LEGAL, SC_LEGAL, box);
      bbAndNot(SC_LEGAL, SC_LEGAL, SC_OCC);
    }
    if (!progress) return -1;
  }
  out.count = k;
  out.spend = spend;
  return bbCount(SC_LEGAL);
}

function planFlags(p: PackedState, t: NodeTables, cat: Catalog, side: Side, plan: PlacePlan): number {
  const enemy = (1 - side) as Side;
  let flags = TurnFlag.PURCHASE;
  for (let i = 0; i < plan.count; i++) {
    const a = plan.actions[i];
    const def = paA(a);
    const q = paB(a);
    if (strikesFrom(p, cat, side, def, q)) flags |= TurnFlag.SUMMON_STRIKE;
    const cornerCost = moveCost(t.cornerDist[enemy], q, cat.spd[def]);
    if (cornerCost > 0 && cornerCost <= ACTIONS_PER_TURN) flags |= TurnFlag.HOME_RACE;
  }
  return flags;
}

/**
 * Plan score: the assignment's square scores, less DESIGN §5.5's zero-spawn
 * penalty (a penalty, never a rejection — F16) and an ordering-only liquidity
 * penalty below `LIQUIDITY_FLOOR`.
 */
function planScore(
  p: PackedState,
  cat: Catalog,
  side: Side,
  plan: PlacePlan,
  assignmentCc: Centi,
  spawnAfter: number,
  w: PurchaseWeights,
): Centi {
  let score = assignmentCc;
  const left = p.bank[side] - plan.spend;
  if (spawnAfter === 0 && left >= cat.cost[cat.tier1[0]]) score -= w.zeroSpawnCc;
  if (left < LIQUIDITY_FLOOR) score -= w.liquidityCc * (LIQUIDITY_FLOOR - left);
  return score | 0;
}

/** Descending `scoreCc` over `out[1..count)`; the empty plan stays at index 0. */
function sortPlans(out: PlacePlan[], count: number): void {
  for (let i = 2; i < count; i++) {
    const plan = out[i];
    const score = plan.scoreCc;
    let j = i - 1;
    while (j >= 1 && out[j].scoreCc < score) {
      out[j + 1] = out[j];
      j--;
    }
    out[j + 1] = plan;
  }
}

/**
 * DESIGN §5.5's third stage and this module's entry point. Writes at most
 * `cfg.maxPlans` place plans into `out` — the empty plan at index 0, then the
 * purchase plans best-scoring first — and returns how many.
 *
 * `out` must hold pre-allocated `PlacePlan` records (`newPlacePlan`). `sc`/`ply`
 * are part of DESIGN §4.13's signature; this module's scratch is module-level
 * and fixed-size, so neither is read (the arrangement `tables/geometry.ts`
 * already uses).
 */
export function planPurchases(
  p: PackedState,
  t: NodeTables,
  cfg: PurchaseConfig,
  sc: Scratch,
  ply: number,
  out: PlacePlan[],
): number {
  void sc;
  void ply;
  if (out.length === 0) return 0;
  const side = p.side as Side;
  const empty = out[0];
  empty.count = 0;
  empty.spend = 0;
  empty.scoreCc = 0;
  empty.flags = 0;
  empty.spawnAfter = t.spawn[side].area;
  let written = 1;
  if (p.result !== Result.ONGOING || p.upkeepPending === 1 || p.phase !== 0) return written;

  const cat = activeCatalog();
  const bank = p.bank[side];
  const spawn = t.spawn[side];
  const cheapest = cat.cost[cat.tier1[0]];
  if (bank < cheapest || spawn.area === 0) return written;

  bbCopy(SC_SPAWN_LEGAL, spawn.legal);
  const defCount = candidateDefs(p, t, side, SC_DEFS);
  if (defCount === 0) return written;

  const topCount = rankSquares(p, t, cat, side, SC_DEFS, defCount, cfg.weights, cfg.squares > 0 ? cfg.squares : 1);
  if (topCount === 0) return written;

  const maxBodies = Math.min((bank / cheapest) | 0, spawn.area, cfg.maxBodies, PURCHASE_MAX_BODIES);
  if (maxBodies <= 0) return written;

  const wanted = Math.min(cfg.maxMultisets, MAX_MULTISETS) * MULTISET_WORDS;
  const msCount = purchaseMultisets(SC_DEFS, defCount, bank, maxBodies, SC_MULTISETS.subarray(0, wanted));

  const limit = Math.min(cfg.maxPlans, out.length);
  const keep = Math.min(cfg.keepPerMultiset > 0 ? cfg.keepPerMultiset : 1, PURCHASE_MAX_BODIES);
  for (let m = 0; m < msCount && written < limit; m++) {
    const base = m * MULTISET_WORDS;
    const bodies = SC_MULTISETS[base];
    if (bodies > topCount) continue;
    const found = bestAssignments(SC_MULTISETS, base, bodies, topCount, keep);
    for (let a = 0; a < found && written < limit; a++) {
      const plan = out[written];
      for (let i = 0; i < bodies; i++) {
        ORDER_DEF[i] = SC_MULTISETS[base + 1 + i];
        ORDER_SQ[i] = SQ_LIST[MS_BEST[a * PURCHASE_MAX_BODIES + i]];
      }
      const after = assignOrder(p, cat, side, bodies, plan);
      if (after < 0) continue;
      plan.spawnAfter = after;
      plan.flags = planFlags(p, t, cat, side, plan);
      plan.scoreCc = planScore(p, cat, side, plan, MS_BEST_SCORE[a], after, cfg.weights);
      written++;
    }
  }

  sortPlans(out, written);
  return written;
}
