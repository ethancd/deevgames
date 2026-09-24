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
  /**
   * This plan is its class's pinned plan: the single-class buy with the most
   * bodies the bank and that class's squares allow. `gen/generate.ts
   * buildCombos` keeps every pinned plan on the Place menu ahead of score
   * pruning, so each affordable class reaches the evaluator whatever the
   * mining-only ordering score below thinks of it.
   */
  pinned: boolean;
}

/** Hard ceiling on `PurchaseConfig.maxBodies` (DESIGN §8: `MAX_BODIES = 4`). */
export const PURCHASE_MAX_BODIES = 4;
/** `Int32Array` stride of one `purchaseMultisets` entry: `[count, def0..def3]`. */
export const MULTISET_WORDS = 1 + PURCHASE_MAX_BODIES;
/**
 * Ceiling on `PurchaseConfig.maxMultisets` this module's buffers can hold.
 * Every non-empty multiset of at most `PURCHASE_MAX_BODIES` bodies over the six
 * tier-1 classes — `C(6 + 4, 4) − 1 = 209` — fits, so the enumeration is never
 * cut short in its cheapest-first order.
 */
export const MAX_MULTISETS = 256;
/** Ceiling on `PurchaseConfig.squares` (DESIGN §8: `S = 8`). */
export const MAX_TOP_SQUARES = 16;
export function newPlacePlan(): PlacePlan {
  return { actions: new Int32Array(PURCHASE_MAX_BODIES), count: 0, spend: 0, scoreCc: 0, flags: 0, spawnAfter: 0, pinned: false };
}

// --- module scratch -----------------------------------------------------------

/** The node's untouched legal spawn mask; every per-plan walk copies it. */
const SC_SPAWN_LEGAL: BB = bbNew();
const SC_LEGAL: BB = bbNew();
const SC_DISRUPT: BB = bbNew();
const SC_DEFS = new Uint8Array(18);
const SC_MULTISETS = new Int32Array(MAX_MULTISETS * MULTISET_WORDS);
/** Per (defId, square) square score for the current node. */
const DEF_SQUARE_SCORE = new Int32Array(18 * BOARD);
/** Each candidate class's own best squares, descending, and how many (`rankSquares`). */
const DEF_TOP = new Int32Array(18 * MAX_TOP_SQUARES);
const DEF_TOP_N = new Int32Array(18);
/** Squares taken by the assignment in progress; cleared after each multiset. */
const USED = new Uint8Array(BOARD);
/** `purchaseMultisets`' working state. */
const MS_BODY = new Int32Array(PURCHASE_MAX_BODIES);
/** Most candidate plans one call can hold: `keepPerMultiset` assignments per multiset. */
const MAX_CANDS = MAX_MULTISETS * PURCHASE_MAX_BODIES;
/** Candidate plans: bodies and squares in (class, square) order, size, plan score, pin. */
const CAND_DEF = new Int32Array(MAX_CANDS * PURCHASE_MAX_BODIES);
const CAND_SQ = new Int32Array(MAX_CANDS * PURCHASE_MAX_BODIES);
const CAND_N = new Int32Array(MAX_CANDS);
const CAND_SCORE = new Int32Array(MAX_CANDS);
const CAND_PINNED = new Uint8Array(MAX_CANDS);
/** Candidate indices in write order: pinned first, then the rest, each best first. */
const CAND_ORDER = new Int32Array(MAX_CANDS);
/** Per class: its pinned candidate so far, or -1. */
const PIN_OF = new Int32Array(18);
/** Squares withheld from one multiset's later assignments. */
const FORBID = new Int32Array(PURCHASE_MAX_BODIES);
/** The square `assignGreedy` placed last — its lowest-scoring pick. */
let lastPlaced = -1;
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
 * Scores every available commitment square under every candidate class
 * (`DEF_SQUARE_SCORE`, this call only) and keeps each class's OWN best
 * `squares` squares, descending, in `DEF_TOP`. Ranking per class rather than by
 * each square's best class matters: a square that is best for a fast body
 * racing the enemy corner says nothing about where a Plant should mine. Ties
 * keep the lower square, as the single shared ranking did.
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
): void {
  const keep = Math.min(squares, MAX_TOP_SQUARES);
  for (let i = 0; i < defCount; i++) DEF_TOP_N[defs[i]] = 0;
  const legal = SC_SPAWN_LEGAL;
  for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
    const disruptable = w.safeCc !== 0 && canDisruptCommitment(p, t, side, q);
    for (let i = 0; i < defCount; i++) {
      const def = defs[i];
      const score = squareScoreCc(p, t, cat, side, def, q, w, disruptable);
      DEF_SQUARE_SCORE[def * BOARD + q] = score;
      // Squares arrive in ascending order, so a strict comparison leaves an
      // equal-scoring lower square ahead.
      const top = def * MAX_TOP_SQUARES;
      let n = DEF_TOP_N[def];
      let at = n;
      while (at > 0 && DEF_SQUARE_SCORE[def * BOARD + DEF_TOP[top + at - 1]] < score) at--;
      if (at >= keep) continue;
      if (n < keep) n++;
      for (let j = n - 1; j > at; j--) DEF_TOP[top + j] = DEF_TOP[top + j - 1];
      DEF_TOP[top + at] = q;
      DEF_TOP_N[def] = n;
    }
  }
}

/**
 * Places one multiset's `bodies` on distinct squares not already marked in
 * `USED`, writing candidate `c`: repeatedly, the unplaced body whose class's
 * best still-free square scores highest takes that square. This is exact for
 * a single-class multiset (its class's top squares) and a sound ordering
 * heuristic for a mix; it replaces the exhaustive `P(S, k)` walk (up to 1,680
 * visits per multiset), which is unaffordable once every multiset is scored
 * rather than the first few. The placed bodies are stored in (class, square)
 * order, so a plan's BUY sequence is a pure function of what it buys; the last
 * square placed is left in `lastPlaced`. Returns the summed square score, or
 * `null` when some class runs out of free squares.
 */
function assignGreedy(multisets: Int32Array, base: number, bodies: number, c: number): number | null {
  const at = c * PURCHASE_MAX_BODIES;
  let placed = 0;
  let score = 0;
  let n = 0;
  for (; n < bodies; n++) {
    let bestBody = -1;
    let bestSq = -1;
    let bestScore = 0;
    for (let i = 0; i < bodies; i++) {
      if ((placed & (1 << i)) !== 0) continue;
      const def = multisets[base + 1 + i];
      const top = def * MAX_TOP_SQUARES;
      let q = -1;
      for (let k = 0; k < DEF_TOP_N[def]; k++) {
        if (USED[DEF_TOP[top + k]] === 0) { q = DEF_TOP[top + k]; break; }
      }
      if (q < 0) continue;
      const s = DEF_SQUARE_SCORE[def * BOARD + q];
      if (bestBody < 0 || s > bestScore) { bestBody = i; bestSq = q; bestScore = s; }
    }
    if (bestBody < 0) break;
    placed |= 1 << bestBody;
    USED[bestSq] = 1;
    lastPlaced = bestSq;
    CAND_DEF[at + n] = multisets[base + 1 + bestBody];
    CAND_SQ[at + n] = bestSq;
    score += bestScore;
  }
  for (let k = 0; k < n; k++) USED[CAND_SQ[at + k]] = 0;
  if (n < bodies) return null;
  for (let i = 1; i < n; i++) {
    const d = CAND_DEF[at + i];
    const q = CAND_SQ[at + i];
    let j = i - 1;
    while (j >= 0 && (CAND_DEF[at + j] > d || (CAND_DEF[at + j] === d && CAND_SQ[at + j] > q))) {
      CAND_DEF[at + j + 1] = CAND_DEF[at + j];
      CAND_SQ[at + j + 1] = CAND_SQ[at + j];
      j--;
    }
    CAND_DEF[at + j + 1] = d;
    CAND_SQ[at + j + 1] = q;
  }
  return score;
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
  spend: number,
  assignmentCc: Centi,
  spawnAfter: number,
  requiredReserve: number,
  w: PurchaseWeights,
): Centi {
  let score = assignmentCc;
  const left = p.bank[side] - spend;
  if (spawnAfter === 0 && left >= cat.cost[cat.tier1[0]]) score -= w.zeroSpawnCc;
  if (left < requiredReserve) score -= w.liquidityCc * (requiredReserve - left);
  return score | 0;
}

/**
 * Moves the best `take` of `CAND_ORDER[from..to)` to its front, descending by
 * `CAND_SCORE`, ties to the earlier candidate (enumeration order). A partial
 * selection: only the plans that can be written are ordered.
 */
function sortCandidates(from: number, to: number, take: number): void {
  const end = Math.min(to, from + take);
  for (let i = from; i < end; i++) {
    let best = i;
    for (let j = i + 1; j < to; j++) {
      const a = CAND_ORDER[j];
      const b = CAND_ORDER[best];
      if (CAND_SCORE[a] > CAND_SCORE[b] || (CAND_SCORE[a] === CAND_SCORE[b] && a < b)) best = j;
    }
    const c = CAND_ORDER[best];
    CAND_ORDER[best] = CAND_ORDER[i];
    CAND_ORDER[i] = c;
  }
}

/**
 * DESIGN §5.5's third stage and this module's entry point. Writes at most
 * `cfg.maxPlans` Prepare plans into `out` and returns how many: the empty plan
 * at index 0, then each affordable class's pinned plan (best first), then every
 * other plan best first.
 *
 * Every multiset the buffer holds is assigned and scored before anything is
 * truncated. Before 2026-09-23 the write loop stopped at `cfg.maxPlans` in
 * cheapest-first enumeration order (and the enumeration itself stopped at 35
 * multisets, every one of them containing a `fire_1`), so at a bank of 12 or
 * more the only purchases Hard ever evaluated were `fire_1 ×1..4`. The old
 * opt-in fix for the first half of that (R1b, `strength.purchaseScoreBeforeTruncate`)
 * is now unconditional and the knob is no longer read.
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
  empty.pinned = false;
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

  rankSquares(p, t, cat, side, SC_DEFS, defCount, cfg.weights, cfg.squares > 0 ? cfg.squares : 1);

  const maxBodies = Math.min((bank / cheapest) | 0, available, cfg.maxBodies, PURCHASE_MAX_BODIES);
  if (maxBodies <= 0) return written;

  const wanted = Math.min(cfg.maxMultisets, MAX_MULTISETS) * MULTISET_WORDS;
  const msCount = purchaseMultisets(SC_DEFS, defCount, bank, maxBodies, SC_MULTISETS.subarray(0, wanted));
  const reserve = t.econ[side].firstBillReached ? t.econ[side].requiredReserve : 0;

  // Up to `keep` assignments per multiset. Each later one withholds the square
  // the previous one placed last (its weakest pick), so the alternatives are
  // distinct and, for a single body, exactly the class's next-best squares.
  const keep = Math.min(cfg.keepPerMultiset > 0 ? cfg.keepPerMultiset : 1, PURCHASE_MAX_BODIES);
  for (let i = 0; i < defCount; i++) PIN_OF[SC_DEFS[i]] = -1;
  let cands = 0;
  for (let m = 0; m < msCount; m++) {
    const base = m * MULTISET_WORDS;
    const bodies = SC_MULTISETS[base];
    let spend = 0;
    for (let i = 0; i < bodies; i++) spend += cat.cost[SC_MULTISETS[base + 1 + i]];
    // Multisets are non-decreasing, so a single-class one has equal ends.
    const def = SC_MULTISETS[base + 1];
    const pure = SC_MULTISETS[base + bodies] === def;
    let forbidden = 0;
    for (let a = 0; a < keep; a++) {
      for (let k = 0; k < forbidden; k++) USED[FORBID[k]] = 1;
      const assignmentCc = assignGreedy(SC_MULTISETS, base, bodies, cands);
      for (let k = 0; k < forbidden; k++) USED[FORBID[k]] = 0;
      if (assignmentCc === null) break;
      FORBID[forbidden++] = lastPlaced;
      CAND_N[cands] = bodies;
      CAND_SCORE[cands] = planScore(p, cat, side, spend, assignmentCc, available - bodies, reserve, cfg.weights);
      CAND_PINNED[cands] = 0;
      if (pure) {
        const held = PIN_OF[def];
        if (held < 0 || bodies > CAND_N[held] || (bodies === CAND_N[held] && CAND_SCORE[cands] > CAND_SCORE[held])) {
          PIN_OF[def] = cands;
        }
      }
      cands++;
    }
  }

  let pins = 0;
  for (let i = 0; i < defCount; i++) {
    const c = PIN_OF[SC_DEFS[i]];
    if (c < 0) continue;
    CAND_PINNED[c] = 1;
    CAND_ORDER[pins++] = c;
  }
  let ordered = pins;
  for (let c = 0; c < cands; c++) if (CAND_PINNED[c] === 0) CAND_ORDER[ordered++] = c;
  const limit = Math.min(cfg.maxPlans, out.length);
  sortCandidates(0, pins, pins);
  sortCandidates(pins, ordered, Math.max(0, limit - 1 - pins));

  for (let k = 0; k < ordered && written < limit; k++) {
    const c = CAND_ORDER[k];
    const bodies = CAND_N[c];
    for (let i = 0; i < bodies; i++) {
      ORDER_DEF[i] = CAND_DEF[c * PURCHASE_MAX_BODIES + i];
      ORDER_SQ[i] = CAND_SQ[c * PURCHASE_MAX_BODIES + i];
    }
    const plan = out[written];
    const after = assignOrder(p, cat, side, bodies, plan);
    if (after < 0) continue;
    plan.spawnAfter = after;
    plan.flags = planFlags(t, cat, side, plan);
    plan.scoreCc = CAND_SCORE[c];
    plan.pinned = CAND_PINNED[c] === 1;
    written++;
  }
  return written;
}
