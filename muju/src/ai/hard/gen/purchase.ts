/**
 * Phasing Prepare purchase plans: commitments, never live units.
 *
 * All affordable tier-1 definitions remain candidates. Standard's same-turn
 * lethal-answer/dominance filters do not establish dominance across the enemy
 * reply and are deliberately absent. Enumeration is still bounded by config.
 * Every assignment uses the original live anchor union and excludes existing
 * and same-plan own commitments. A BUY neither occupies nor anchors a square.
 * Scores are ordering heuristics, not a prediction of a forced arrival.
 * Scratch is recomputed on every call; no cross-position/config memo is used.
 */
import {
  DEAD,
  PEND_STRIDE,
  MAX_SLOTS,
  Result,
  type Centi,
  type DefId,
  type PackedState,
  type Side,
  type Square,
} from '../types';
import {
  bbAnd,
  bbAndNot,
  bbCopy,
  bbCount,
  bbHas,
  bbNew,
  bbNext,
  type BB,
  type Scratch,
} from '../core/bits';
import { BOARD, RECT } from '../core/tables';
import { activeCatalog, type Catalog } from '../core/catalog';
import { AKind, paA, paB, paMake } from '../core/action';
import { ACTIONS_PER_TURN } from '../core/state';
import { moveCost } from '../core/movement';
import { GAMMA_Q16, pstMine } from '../core/income';
import type { NodeTables } from '../tables/context';
import { TurnFlag } from './turn';
import type { PurchaseConfig, PurchaseWeights } from '../config';

export type { PurchaseConfig, PurchaseWeights } from '../config';

/**
 * One Prepare purchase prefix: the BUY actions, what they cost, how they
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
  /** `TurnFlag` bits the buys justify (`PURCHASE`, delayed `HOME_RACE`). */
  flags: number;
  /** Uncommitted purchase squares remaining; live spawn geometry is unchanged. */
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
export function newPlacePlan(): PlacePlan {
  return { actions: new Int32Array(PURCHASE_MAX_BODIES), count: 0, spend: 0, scoreCc: 0, flags: 0, spawnAfter: 0 };
}

// --- module scratch -----------------------------------------------------------

/** The node's untouched legal spawn mask; every per-plan walk copies it. */
const SC_SPAWN_LEGAL: BB = bbNew();
const SC_LEGAL: BB = bbNew();
const SC_DISRUPT: BB = bbNew();
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


/** Affordable classes only: no same-turn attack or blockade dominance. */
export function candidateDefs(p: PackedState, t: NodeTables, side: Side, out: Uint8Array): number {
  void t;
  const cat = activeCatalog();
  let n = 0;
  for (const def of cat.tier1) {
    if (cat.cost[def] <= p.bank[side] && n < out.length) out[n++] = def;
  }
  return n;
}

/** Copy the live spawn union, removing only this owner's paid commitments. */
function purchaseMask(p: PackedState, t: NodeTables, side: Side, out: BB): BB {
  bbCopy(out, t.spawn[side].legal);
  for (let q = bbNext(out, -1); q >= 0; q = bbNext(out, q)) {
    if (p.pendDef[side * PEND_STRIDE + q] !== 0) out[q >>> 5] &= ~(1 << (q & 31));
  }
  return out;
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

/**
 * A single enemy mover can delay this commitment if it can finish its next
 * Act on the target, or inside EVERY currently supporting anchor rectangle.
 * Intersection (not union) preserves alternative anchors. Movement uses the
 * live board: pending bodies never block a path. This partial ordering
 * probe omits captures, combinations and future arrivals; it is not a proof.
 */
function canDisruptCommitment(p: PackedState, t: NodeTables, side: Side, q: Square): boolean {
  let first = true;
  for (let anchor = bbNext(t.spawn[side].anchors, -1); anchor >= 0; anchor = bbNext(t.spawn[side].anchors, anchor)) {
    const box = RECT[side][anchor];
    if (!bbHas(box, q)) continue;
    if (first) { bbCopy(SC_DISRUPT, box); first = false; }
    else bbAnd(SC_DISRUPT, SC_DISRUPT, box);
  }
  if (first) return true;
  bbAndNot(SC_DISRUPT, SC_DISRUPT, p.occ);
  const cat = activeCatalog();
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const from = p.sq[slot];
    if (from === DEAD || p.owner[slot] === side) continue;
    const row = t.dist.get(p, from);
    for (let s = bbNext(SC_DISRUPT, -1); s >= 0; s = bbNext(SC_DISRUPT, s)) {
      const cost = moveCost(row, s, cat.spd[p.defId[slot]]);
      if (cost > 0 && cost <= ACTIONS_PER_TURN) return true;
    }
  }
  return false;
}

/**
 * One extra gamma step prices the missed current mining cycle using the
 * existing income discount, not a fitted coefficient. A disruptable purchase
 * is refunded, so its risk charge is only one cycle's tied-up cash value
 * `(1-gamma) * price`, scaled by the existing safeCc (cc/crystal), not a lost
 * unit or a guaranteed kill. blockCc/strikeCc intentionally have no effect.
 * A commitment consumes an available square but adds no immediate anchor.
 */
function squareScoreCc(
  p: PackedState, t: NodeTables, cat: Catalog, side: Side,
  def: DefId, q: Square, w: PurchaseWeights, disruptable: boolean,
): Centi {
  const gamma = GAMMA_Q16[1];
  let score = Math.round(w.mineCc * pstMine(def, p.reserve[q]) * gamma / 65536);
  if (disruptable) {
    score -= Math.round(w.safeCc * cat.cost[def] * (65536 - gamma) / 65536);
  }
  score -= w.anchorCc;
  const cornerCost = moveCost(t.cornerDist[(1 - side) as Side], q, cat.spd[def]);
  if (cornerCost > 0 && cornerCost <= ACTIONS_PER_TURN) score += Math.round(w.homeRaceCc * gamma / 65536);
  return score | 0;
}

/**
 * Scores every available commitment square under every candidate definition
 * (stored in `DEF_SQUARE_SCORE` only for this call) and keeps the top `squares` by their best definition,
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
  const legal = SC_SPAWN_LEGAL;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    let best = -0x7fffffff;
    const disruptable = w.safeCc !== 0 && canDisruptCommitment(p, t, side, q);
    for (let i = 0; i < defCount; i++) {
      const def = defs[i];
      const score = squareScoreCc(p, t, cat, side, def, q, w, disruptable);
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
 * Record distinct commitments against the untouched live spawn mask. No BUY
 * can extend it; bank and commitment availability are the only per-plan changes.
 */
function assignOrder(p: PackedState, cat: Catalog, side: Side, count: number, out: PlacePlan): number {
  bbCopy(SC_LEGAL, SC_SPAWN_LEGAL);
  let spend = 0;
  for (let i = 0; i < count; i++) {
    const q = ORDER_SQ[i];
    const def = ORDER_DEF[i];
    spend += cat.cost[def];
    if (!bbHas(SC_LEGAL, q) || spend > p.bank[side]) return -1;
    out.actions[i] = paMake(AKind.BUY, def, q, 0);
    SC_LEGAL[q >>> 5] &= ~(1 << (q & 31));
  }
  out.count = count;
  out.spend = spend;
  return bbCount(SC_LEGAL);
}

function planFlags(t: NodeTables, cat: Catalog, side: Side, plan: PlacePlan): number {
  const enemy = (1 - side) as Side;
  let flags = TurnFlag.PURCHASE;
  for (let i = 0; i < plan.count; i++) {
    const a = plan.actions[i];
    const def = paA(a);
    const q = paB(a);
    const cornerCost = moveCost(t.cornerDist[enemy], q, cat.spd[def]);
    if (cornerCost > 0 && cornerCost <= ACTIONS_PER_TURN) flags |= TurnFlag.HOME_RACE;
  }
  return flags;
}

/**
 * Plan score: the assignment's square scores, less DESIGN §5.5's zero-spawn
 * penalty (a penalty, never a rejection — F16) and an ordering-only liquidity
 * penalty below the root's phase-aware next-bill reserve. This fixed baseline
 * is an ordering heuristic: a new commitment may itself change future income;
 * no plan is rejected for missing the reserve.
 */
function planScore(
  p: PackedState,
  cat: Catalog,
  side: Side,
  plan: PlacePlan,
  assignmentCc: Centi,
  spawnAfter: number,
  requiredReserve: number,
  w: PurchaseWeights,
): Centi {
  let score = assignmentCc;
  const left = p.bank[side] - plan.spend;
  if (spawnAfter === 0 && left >= cat.cost[cat.tier1[0]]) score -= w.zeroSpawnCc;
  if (left < requiredReserve) score -= w.liquidityCc * (requiredReserve - left);
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
 * `cfg.maxPlans` Prepare plans into `out` — the empty plan at index 0, then the
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
  purchaseMask(p, t, side, SC_SPAWN_LEGAL);
  empty.spawnAfter = bbCount(SC_SPAWN_LEGAL);
  let written = 1;
  if (p.result !== Result.ONGOING || p.upkeepPending === 1 || p.phase !== 0) return written;

  const cat = activeCatalog();
  const bank = p.bank[side];
  const available = empty.spawnAfter;
  const cheapest = cat.cost[cat.tier1[0]];
  if (bank < cheapest || available === 0) return written;

  const defCount = candidateDefs(p, t, side, SC_DEFS);
  if (defCount === 0) return written;

  const topCount = rankSquares(p, t, cat, side, SC_DEFS, defCount, cfg.weights, cfg.squares > 0 ? cfg.squares : 1);
  if (topCount === 0) return written;

  const maxBodies = Math.min((bank / cheapest) | 0, available, cfg.maxBodies, PURCHASE_MAX_BODIES);
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
      plan.flags = planFlags(t, cat, side, plan);
      plan.scoreCc = planScore(p, cat, side, plan, MS_BEST_SCORE[a], after, t.econ[side].firstBillReached ? t.econ[side].requiredReserve : 0, cfg.weights);
      written++;
    }
  }

  sortPlans(out, written);
  return written;
}
