/**
 * STRATEGOS W1.9 — ForceContact: the plan lines a root offers when the clock
 * reading says it is LOSING the kill clock (`posture: 'force-contact'`; plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part B.1's `contact.ts`
 * row, Part A items 1-2, B.1b, step W1.9).
 *
 * WHY CONTACT. A side behind on the clock loses at the hand-off that reaches
 * `INACTIVITY_LIMIT` unless a unit dies first: any kill — its own or the
 * opponent's — resets the clock (`core/state.ts makeEndPlace`, `progress`).
 * Wave 1 (2026-09-24) lost six games of seven that way, with Hard mining
 * quietly behind until the clock ran out. So the plan's end predicate is
 * contact: "a damaging attack has been made by ply `r − 1`"
 * (`PlanEndPredicate 'damaging-attack'`), and the search's job (W1.10) is to
 * falsify THAT, not to protect material.
 *
 * THE LINES (each a `strategy/plan.ts PlanLine`, forced into the ROOT
 * candidate list through `gen/generate.ts setStrategyWitness`):
 *
 *   (a) APPROACH — the move(s) that minimise OUR `killEta` on the position the
 *       line's whole turn reaches, toward the cheapest target (`contactTarget`:
 *       the live enemy unit an existing unit of ours can first damage, by real
 *       path distance), with the hit appended when the approach ends adjacent
 *       with an action to spare. Candidates: each of our damaging units walked
 *       as far toward the target as its budget allows (at most
 *       `APPROACH_CANDIDATES`), and one greedy multi-unit approach (the
 *       rollout policy's own Act). Offered only if its `killEta` is no worse
 *       than PASSING's on the same ply convention (see "killEta before and
 *       after" below).
 *   (b) BUY — that approach, then the fastest affordable class on the legal
 *       spawn square nearest the enemy (`plan.ts fastestBuyNearEnemy`), as a
 *       COMPLETE turn (`END_ACTION → PAY_UPKEEP → BUY → END_PLACE`, B.1b).
 *   (c) PROMOTE — that approach, then a promotion that crosses a one-shot
 *       threshold against the target: the unit's current power is below the
 *       target's printed DEF and its next tier's is not (the target heals at
 *       its owner's turn start, `board.ts resetUnitActions`, so the printed
 *       DEF is what a later hit meets). W1.8 made every legal promotion
 *       generable, but an unmissioned one usually loses the root's `K` cut;
 *       this line is what puts the useful one in front of the search.
 *
 * KILLETA BEFORE AND AFTER. `killEta`'s ply 1 is the turn in progress and it
 * credits every unit with that turn's whole action budget. Read at the root
 * it has already spent our current turn on an ideal approach; read after a
 * line it has not. The two are on different conventions, and an approach that
 * uses its actions less than ideally (blockers, a detour) can read LATER than
 * the root's reading even though it closed distance. "Before" is therefore
 * PASSING (END_ACTION at once, bare Prepare) read on the same post-turn
 * convention: an approach line is offered only when our `killEta` after it is
 * at most our `killEta` after passing (`tests/ai/hard/strategy-plans.test.ts`).
 *
 * FEASIBILITY (Part A item 1). Each line is rolled out from the position its
 * turn reaches, for at most `r − 1` plies (the deadline), with our side
 * continuing greedily (damaging attack when one exists; else approach the
 * nearest enemy; buy the fastest affordable class near the enemy) against
 * TWO scripted replies: `continue` (the opponent keeps mining — stays, or
 * steps to its best paying cell, buys the cheapest miner, and attacks only a
 * unit of ours it is adjacent to and kills in one hit) and `evade` (the
 * opponent first moves every unit inside our next-Act strike area out of it —
 * the blocker-free ball `strikeReach` explains — then mines, and buys outside
 * that area). Each rollout is an `AnalysisQuery` (`contact.rollout.continue`
 * / `contact.rollout.evade`, outcome `witnessed | refuted | unresolved`) that
 * carries the rollout's own actions (`ContactRollout.actions`), so a witness
 * is a line anyone can replay; rollouts run at `ROLLOUT_PROVER_MODE`, and a
 * replay at the root's full prover must reach the same attack at the same ply
 * (the test replays every witness that way). The line is `witnessed` only
 * if BOTH witnessed the predicate by the deadline; `not-ruled-out` if one
 * did (a replayed line reached contact, so it is not impossible); `unknown`
 * otherwise. NEVER `forced`: two scripted replies are not every reply, and
 * the search is what tests the rest.
 *
 * THE CONTRACT. `deadlinePly = r − 1`; `endPredicate 'damaging-attack'`;
 * `essentialSlots` EMPTY — under ForceContact the clock is being lost and any
 * kill, ours or theirs, resets it, so no single body's survival is what the
 * contract needs (W1.10's essential-unit veto therefore never fires on a
 * ForceContact line; mate and a proven clock loss still do); `permittedLoss`
 * `CONTACT_PERMITTED_UNITS` body (below) and, in crystals, what the line's
 * Prepare spends plus our most expensive unit's price — CHOICE (why: the
 * spend is the plan's own investment in contact, and the one body it may
 * trade is at most our costliest; falsifier: a W1.10 veto replay where a line
 * inside this allowance still loses the clock because of what it spent or
 * traded).
 */
import { DEAD, F_CAN_ACT, MAX_SLOTS, NO_SLOT, PEND_STRIDE, Result, type PackedState, type Side } from '../types';
import { AKind, paA, paB, paKind, paMake } from '../core/action';
import { DEF_ID, powerIndex } from '../core/catalog';
import { copyState } from '../core/state';
import { ADJ_LIST, MANHATTAN } from '../core/tables';
import { bbHas, bbSet, bbZero } from '../core/bits';
import { bfsMulti, moveCost } from '../core/movement';
import { STRIKE_MOVE_ACTIONS } from '../tables/threat';
import type { NodeTables } from '../tables/context';
import type { ClockReading } from './clock';
import {
  NO_ACTIONS,
  WORK_ROW,
  actDamages,
  canAttackNow,
  cellYield,
  damagingAttack,
  endKeyOf,
  enterPrepare,
  fastestBuyNearEnemy,
  forward,
  killEtaOn,
  lexLess,
  maxUnitCost,
  playLine,
  powerOf,
  prepSpend,
  sqName,
  type PlanLine,
  type PlanScratch,
  type PlanSet,
} from './plan';
import type { AnalysisQuery, Feasibility, PlanContract } from './types';

/**
 * Single-unit approach candidates evaluated per root (plus one greedy
 * multi-unit line). CHOICE (each costs one line replay and one `killEta`,
 * `plan.ts WORK_KILL_ETA`; six covers every unit of a typical Workflow 1
 * army; falsifier: a wave-2/exam root whose best approach used a unit ranked
 * seventh or later by distance to the target).
 */
export const APPROACH_CANDIDATES = 6;

/**
 * Bodies a ForceContact line may lose. CHOICE (why: any kill resets the clock
 * the line is losing, so trading one body for contact is inside the plan;
 * falsifier: a replay where the permitted one-body loss still ends in a clock
 * loss because the reset did not buy enough plies to flip the verdict).
 */
export const CONTACT_PERMITTED_UNITS = 1;

/**
 * The prover mode a rollout board runs under: `1`, the admissible damage bound
 * (`core/state.ts`, DESIGN §3.4), never the full prover. DERIVED (the bound can
 * only UNDER-claim a home checkmate — `search/pvs.ts`'s scout nodes rely on the
 * same property — so a rollout may miss a mate that would have ended it, never
 * invent one; and a full-prover call can cost hundreds of milliseconds,
 * `docs/hard-ai/e3/P8-SLOW-TURNS.md`, which no bounded rollout may spend). The
 * plan line itself is played at the root's own mode, so its end position is
 * the one the generator records.
 */
const ROLLOUT_PROVER_MODE = 1;

/** One rollout's result (`AnalysisQuery.result`). */
export interface ContactRollout {
  reply: 'continue' | 'evade';
  /** Ply (killEta convention, 1 = the line itself) of the first damaging
   * attack, or null. */
  ply: number | null;
  /** Plies actually rolled (the line's own included). */
  plies: number;
  /**
   * The rollout itself: every packed action (`core/action.ts paMake`) both
   * sides played after the line's own turn, in order, up to and including the
   * damaging `ATTACK` when `witnessed`. Each `PAY_UPKEEP` in it pays `gen/
   * generate.ts firstLegalKeepSet`'s choice. Replaying it on a `Replica` from
   * the position the line reaches is what makes a `witnessed` grade a
   * replayable line (Part A item 1), not just a claim
   * (`tests/ai/hard/strategy-plans.test.ts` replays every one). Empty when the
   * line's own turn decided the query.
   */
  actions: number[];
}

/** A unit of `side` that can damage at least one live enemy unit. */
function damager(s: PlanScratch, p: PackedState, u: number): boolean {
  for (let v = 0; v < MAX_SLOTS; v++) {
    if (p.sq[v] === DEAD || p.owner[v] === p.owner[u]) continue;
    if (powerOf(s.cat, p, u, v) > 0) return true;
  }
  return false;
}

/** Path distance (blockers included) from the field's sources to the unit on
 * `at`: 1 if a source is adjacent, else one more than its nearest reached
 * neighbour; 127 when nothing reaches it. */
function fieldDistanceTo(row: Int8Array, p: PackedState, at: number, sourceSide: Side): number {
  let best = 127;
  for (let k = 0; k < 4; k++) {
    const n = ADJ_LIST[at * 4 + k];
    if (n < 0) continue;
    const occupant = p.pieceAt[n];
    if (occupant !== NO_SLOT && p.owner[occupant] === sourceSide) return 1;
    if (occupant === NO_SLOT && row[n] > 0 && row[n] + 1 < best) best = row[n] + 1;
  }
  return best;
}

/**
 * The cheapest target: the live enemy unit one of our existing units can
 * first DAMAGE, by actions (approach over the real board, blockers included,
 * to a neighbour of the target, plus the hit), then by the damage it still
 * needs to die, then by square. Falls back to `killEta`'s first window's
 * unit, then to the Manhattan-nearest enemy unit, when no unit of ours can
 * reach any. -1 when the enemy has no live unit.
 */
export function contactTarget(root: PackedState, reading: ClockReading, s: PlanScratch): number {
  const me = root.side as Side;
  const cat = s.cat;
  let best = -1;
  let bestKey: number[] = [];
  for (let u = 0; u < MAX_SLOTS; u++) {
    if (root.sq[u] === DEAD || root.owner[u] !== me) continue;
    const spd = cat.spd[root.defId[u]];
    const row = s.rep.dist.get(root, root.sq[u]);
    s.work += WORK_ROW;
    for (let e = 0; e < MAX_SLOTS; e++) {
      if (root.sq[e] === DEAD || root.owner[e] === me || powerOf(cat, root, u, e) <= 0) continue;
      let moves = 127;
      for (let k = 0; k < 4; k++) {
        const n = ADJ_LIST[root.sq[e] * 4 + k];
        if (n < 0) continue;
        if (n === root.sq[u]) { moves = 0; break; }
        const c = moveCost(row, n, spd);
        if (c > 0 && c < moves) moves = c;
      }
      if (moves === 127) continue;
      const key = [moves + 1, cat.def[root.defId[e]] - root.damage[e], root.sq[e]];
      if (best < 0 || lexLess(key, bestKey)) {
        best = e;
        bestKey = key;
      }
    }
  }
  if (best >= 0) return best;
  const w = reading.killEta[me].firstNotRuledOut;
  if (w !== null && w.target === 'unit' && w.slot >= 0 && root.sq[w.slot] !== DEAD && root.owner[w.slot] !== me) return w.slot;
  let near = -1;
  let nearKey: number[] = [];
  for (let e = 0; e < MAX_SLOTS; e++) {
    if (root.sq[e] === DEAD || root.owner[e] === me) continue;
    let d = 100;
    for (let u = 0; u < MAX_SLOTS; u++) {
      if (root.sq[u] === DEAD || root.owner[u] !== me) continue;
      const m = MANHATTAN[root.sq[u] * 100 + root.sq[e]];
      if (m < d) d = m;
    }
    const key = [d, root.sq[e]];
    if (near < 0 || lexLess(key, nearKey)) {
      near = e;
      nearKey = key;
    }
  }
  return near;
}

// ---------------------------------------------------------------------------
// the rollout policies (also the greedy approach candidate)
// ---------------------------------------------------------------------------

/**
 * Our greedy approach step on `p` (our Act): the move that brings a damaging
 * unit strictly closer to the nearest enemy unit (real path distance), best
 * first by "ends adjacent with an action to spare", then distance, then
 * actions, slot and square. -1 when no move closes anything.
 */
function approachMove(s: PlanScratch, p: PackedState, me: Side): number {
  const cat = s.cat;
  bbZero(s.maskA);
  for (let v = 0; v < MAX_SLOTS; v++) if (p.sq[v] !== DEAD && p.owner[v] !== me) bbSet(s.maskA, p.sq[v]);
  bfsMulti(p.occ, s.maskA, s.rowA);
  s.work += WORK_ROW;
  let best = -1;
  let bestKey: number[] = [];
  for (let u = 0; u < MAX_SLOTS; u++) {
    if (p.sq[u] === DEAD || p.owner[u] !== me) continue;
    const spd = cat.spd[p.defId[u]];
    if (spd <= 0 || (p.uflags[u] & F_CAN_ACT) === 0 || !damager(s, p, u)) continue;
    const cur = fieldDistanceTo(s.rowA, p, p.sq[u], (1 - me) as Side);
    const row = s.rep.dist.get(p, p.sq[u]);
    s.work += WORK_ROW;
    for (let q = 0; q < 100; q++) {
      const c = moveCost(row, q, spd);
      if (c <= 0 || c > p.actions) continue;
      const d = s.rowA[q];
      if (d < 1 || d >= cur) continue;
      const key = [d === 1 && c < p.actions ? 0 : 1, d, c, u, q];
      if (best < 0 || lexLess(key, bestKey)) {
        best = paMake(AKind.MOVE, u, q, c);
        bestKey = key;
      }
    }
  }
  return best;
}

/** Our whole Act on `p` under the rollout policy, recording what it played
 * into `out` (when given). Returns whether a damaging attack was made. */
function planAct(s: PlanScratch, p: PackedState, me: Side, out: number[] | null): boolean {
  while (p.phase === 1 && p.result === Result.ONGOING && p.actions > 0) {
    const hit = damagingAttack(s, p, me);
    if (hit >= 0) {
      if (!forward(s, p, hit)) return false;
      out?.push(hit);
      return true;
    }
    const mv = approachMove(s, p, me);
    if (mv < 0 || !forward(s, p, mv)) break;
    out?.push(mv);
  }
  return false;
}

/** Our whole turn in a rollout. 'hit' as soon as a damaging attack lands. */
function planTurn(s: PlanScratch, t: NodeTables, p: PackedState, me: Side): 'hit' | 'ok' | 'fail' {
  if (planAct(s, p, me, null)) return 'hit';
  if (!enterPrepare(s, p, t)) return p.result !== Result.ONGOING ? 'ok' : 'fail';
  const buy = fastestBuyNearEnemy(s, p, -1);
  if (buy >= 0 && !forward(s, p, buy)) return 'fail';
  return forward(s, p, paMake(AKind.END_PLACE)) ? 'ok' : 'fail';
}

/** The best paying reachable empty square for unit `u` on `p` that pays MORE
 * than it pays where it stands, avoiding `avoid` squares when given; -1. */
function miningMove(s: PlanScratch, p: PackedState, u: number, avoid: boolean): number {
  const cat = s.cat;
  const def = p.defId[u];
  const spd = cat.spd[def];
  if (spd <= 0 || (p.uflags[u] & F_CAN_ACT) === 0 || p.actions <= 0) return -1;
  const here = cellYield(cat, p, def, p.sq[u]);
  if (here >= cat.mine[def]) return -1;
  const row = s.rep.dist.get(p, p.sq[u]);
  s.work += WORK_ROW;
  let best = -1;
  let bestKey: number[] = [];
  for (let q = 0; q < 100; q++) {
    const c = moveCost(row, q, spd);
    if (c <= 0 || c > p.actions) continue;
    if (avoid && bbHas(s.maskA, q)) continue;
    const y = cellYield(cat, p, def, q);
    if (y <= here) continue;
    const key = [-y, c, q];
    if (best < 0 || lexLess(key, bestKey)) {
      best = paMake(AKind.MOVE, u, q, c);
      bestKey = key;
    }
  }
  return best;
}

/**
 * `s.maskA` := where `me` could strike at its next Act, as the EVADING reply
 * reads it: every square within `speed × STRIKE_MOVE_ACTIONS + 1` squares
 * (Manhattan, blockers ignored) of a body of ours, live or paid-pending —
 * `tables/threat.ts strikeArea`'s ball-and-dilate with the empty board's
 * distances. CHOICE (why: the live-occupancy BFS `strikeArea` uses treats the
 * evader's OWN body as a blocker, so the squares just behind it read as safe
 * and a one-step "escape" walks straight into the strike once it has moved;
 * the blocker-free ball is a superset of every strike the rules allow;
 * falsifier: an exam case where an evader that respects this ball still gets
 * hit next Act).
 */
function strikeReach(s: PlanScratch, p: PackedState, me: Side): void {
  const cat = s.cat;
  bbZero(s.maskA);
  const add = (at: number, def: number): void => {
    const radius = cat.spd[def] * STRIKE_MOVE_ACTIONS + 1;
    for (let q = 0; q < 100; q++) if (MANHATTAN[at * 100 + q] <= radius) bbSet(s.maskA, q);
  };
  for (let u = 0; u < MAX_SLOTS; u++) if (p.sq[u] !== DEAD && p.owner[u] === me) add(p.sq[u], p.defId[u]);
  const base = me * PEND_STRIDE;
  for (let q = 0; q < 100; q++) if (p.pendDef[base + q] !== 0) add(q, p.pendDef[base + q] - 1);
  s.work += WORK_ROW;
}

/** The scripted opponent's whole turn (`continue` or `evade`). */
function replyTurn(s: PlanScratch, t: NodeTables, p: PackedState, me: Side, reply: 'continue' | 'evade'): boolean {
  const cat = s.cat;
  const opp = p.side as Side;
  const evade = reply === 'evade';
  if (evade) {
    strikeReach(s, p, me);
    const order: number[] = [];
    for (let u = 0; u < MAX_SLOTS; u++) if (p.sq[u] !== DEAD && p.owner[u] === opp && bbHas(s.maskA, p.sq[u])) order.push(u);
    order.sort((a, b) => cat.cost[p.defId[b]] - cat.cost[p.defId[a]] || a - b);
    for (const u of order) {
      if (p.actions <= 0) break;
      const spd = cat.spd[p.defId[u]];
      if (spd <= 0 || (p.uflags[u] & F_CAN_ACT) === 0) continue;
      const row = s.rep.dist.get(p, p.sq[u]);
      s.work += WORK_ROW;
      let best = -1;
      let bestKey: number[] = [];
      for (let q = 0; q < 100; q++) {
        const c = moveCost(row, q, spd);
        if (c <= 0 || c > p.actions || bbHas(s.maskA, q)) continue;
        const key = [-cellYield(cat, p, p.defId[u], q), c, q];
        if (best < 0 || lexLess(key, bestKey)) {
          best = paMake(AKind.MOVE, u, q, c);
          bestKey = key;
        }
      }
      if (best >= 0 && !forward(s, p, best)) return false;
    }
  } else {
    // Free kills only: an adjacent unit of ours it removes in one hit.
    let again = true;
    while (again && p.actions > 0 && p.result === Result.ONGOING) {
      again = false;
      for (let u = 0; u < MAX_SLOTS && !again; u++) {
        if (p.sq[u] === DEAD || p.owner[u] !== opp || !canAttackNow(p, u)) continue;
        for (let k = 0; k < 4 && !again; k++) {
          const q = ADJ_LIST[p.sq[u] * 4 + k];
          if (q < 0) continue;
          const v = p.pieceAt[q];
          if (v === NO_SLOT || p.owner[v] !== me) continue;
          if (powerOf(cat, p, u, v) < cat.def[p.defId[v]] - p.damage[v]) continue;
          if (!forward(s, p, paMake(AKind.ATTACK, u, q, 0))) return false;
          again = true;
        }
      }
    }
  }
  for (let u = 0; u < MAX_SLOTS && p.result === Result.ONGOING && p.phase === 1; u++) {
    if (p.sq[u] === DEAD || p.owner[u] !== opp) continue;
    const mv = miningMove(s, p, u, evade);
    if (mv >= 0 && !forward(s, p, mv)) return false;
  }
  if (!enterPrepare(s, p, t)) return p.result !== Result.ONGOING;
  // The cheapest miner, on the richest legal square (outside our strike area
  // when evading).
  const n = s.rep.genPlace(p, s.place);
  s.work += WORK_ROW;
  let buy = -1;
  let buyKey: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = s.place[i];
    if (paKind(a) !== AKind.BUY) continue;
    const def = paA(a);
    const sq = paB(a);
    if (cat.mine[def] <= 0 || (evade && bbHas(s.maskA, sq))) continue;
    const key = [cat.cost[def], -cat.mine[def], def, -p.reserve[sq], sq];
    if (buy < 0 || lexLess(key, buyKey)) {
      buy = a;
      buyKey = key;
    }
  }
  if (buy >= 0 && !forward(s, p, buy)) return false;
  return forward(s, p, paMake(AKind.END_PLACE));
}

/**
 * One rollout from the position `s.line` holds (the line's turn played), our
 * side under the greedy policy, the opponent under `reply`, until the
 * predicate holds, the deadline passes, the game ends, or the work cap bites.
 */
function rollout(
  s: PlanScratch,
  t: NodeTables,
  me: Side,
  deadline: number,
  reply: 'continue' | 'evade',
  damagedInLine: boolean,
): AnalysisQuery<ContactRollout> {
  const name = reply === 'continue' ? 'contact.rollout.continue' : 'contact.rollout.evade';
  const start = s.work;
  const actions: number[] = [];
  const done = (outcome: AnalysisQuery['outcome'], ply: number | null, plies: number): AnalysisQuery<ContactRollout> => {
    s.rec = null;
    return { name, workCost: s.work - start, outcome, result: { reply, ply, plies, actions } };
  };
  if (damagedInLine) return done(1 <= deadline ? 'witnessed' : 'refuted', 1 <= deadline ? 1 : null, 1);
  const p = s.roll;
  copyState(p, s.line);
  p.proverMode = ROLLOUT_PROVER_MODE;
  s.rec = actions;
  for (let ply = 2; ply <= deadline; ply++) {
    if (p.result !== Result.ONGOING) return done('refuted', null, ply - 1);
    if (s.work >= s.cap) return done('unresolved', null, ply - 1);
    const mover = p.side;
    if (mover === me) {
      const r = planTurn(s, t, p, me);
      if (r === 'hit') return done('witnessed', ply, ply);
      if (r === 'fail') return done('unresolved', null, ply);
    } else if (!replyTurn(s, t, p, me, reply)) {
      return done('unresolved', null, ply);
    }
    if (p.result === Result.ONGOING && p.side === mover) return done('unresolved', null, ply);
  }
  return done('refuted', null, deadline < 1 ? 0 : deadline);
}

/** `witnessed` iff both replies witnessed; `not-ruled-out` iff one did. */
function contactFeasibility(a: AnalysisQuery, b: AnalysisQuery): Feasibility {
  const n = (a.outcome === 'witnessed' ? 1 : 0) + (b.outcome === 'witnessed' ? 1 : 0);
  return n === 2 ? 'witnessed' : n === 1 ? 'not-ruled-out' : 'unknown';
}

/** A candidate Act, as built. */
interface ActCandidate {
  act: Int32Array;
  label: string;
}

/** Each damaging unit walked toward `target` (at most `APPROACH_CANDIDATES`,
 * nearest first), plus the greedy multi-unit Act. */
function approachCandidates(s: PlanScratch, root: PackedState, target: number): ActCandidate[] {
  const cat = s.cat;
  const me = root.side as Side;
  const tsq = root.sq[target];
  // Distance field from the target over the root's occupancy (1 = adjacent).
  bbZero(s.maskB);
  bbSet(s.maskB, tsq);
  bfsMulti(root.occ, s.maskB, s.rowB);
  s.work += WORK_ROW;
  const units: Array<[number, number]> = [];
  for (let u = 0; u < MAX_SLOTS; u++) {
    if (root.sq[u] === DEAD || root.owner[u] !== me || (root.uflags[u] & F_CAN_ACT) === 0) continue;
    if (powerOf(cat, root, u, target) <= 0) continue;
    units.push([fieldDistanceTo(s.rowB, root, root.sq[u], root.owner[target] as Side), u]);
  }
  units.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: ActCandidate[] = [];
  for (let i = 0; i < units.length && out.length < APPROACH_CANDIDATES; i++) {
    const [cur, u] = units[i];
    const hit = paMake(AKind.ATTACK, u, tsq, 0);
    if (cur === 1) {
      if (canAttackNow(root, u) && root.actions > 0) out.push({ act: Int32Array.of(hit), label: `approach:u${u}+hit@${sqName(tsq)}` });
      continue;
    }
    const spd = cat.spd[root.defId[u]];
    if (spd <= 0) continue;
    const row = s.rep.dist.get(root, root.sq[u]);
    s.work += WORK_ROW;
    let best = -1;
    let bestKey: number[] = [];
    for (let q = 0; q < 100; q++) {
      const c = moveCost(row, q, spd);
      if (c <= 0 || c > root.actions) continue;
      const d = s.rowB[q];
      if (d < 1 || d >= cur) continue;
      const key = [d === 1 && c < root.actions ? 0 : 1, d, c, q];
      if (best < 0 || lexLess(key, bestKey)) {
        best = q;
        bestKey = key;
      }
    }
    if (best < 0) continue;
    const move = paMake(AKind.MOVE, u, best, bestKey[2]);
    const strike = bestKey[0] === 0 && canAttackNow(root, u);
    out.push({
      act: strike ? Int32Array.of(move, hit) : Int32Array.of(move),
      label: `approach:u${u}->${sqName(best)}${strike ? `+hit@${sqName(tsq)}` : ''}`,
    });
  }
  // The greedy multi-unit Act (the rollout policy's own), from a root copy.
  copyState(s.roll, root);
  s.roll.proverMode = ROLLOUT_PROVER_MODE;
  const played: number[] = [];
  planAct(s, s.roll, me, played);
  if (played.length > 1) out.push({ act: Int32Array.from(played), label: `approach:greedy(${played.length})` });
  return out;
}

/** Manhattan distance from the nearest unit of ours that can damage the
 * target to the target, on `p` (0 when the target is gone). */
function closeness(s: PlanScratch, p: PackedState, me: Side, target: number, targetSq: number): number {
  if (p.sq[target] === DEAD || p.sq[target] !== targetSq) return 0;
  let best = 100;
  for (let u = 0; u < MAX_SLOTS; u++) {
    if (p.sq[u] === DEAD || p.owner[u] !== me || powerOf(s.cat, p, u, target) <= 0) continue;
    const d = MANHATTAN[p.sq[u] * 100 + targetSq];
    if (d < best) best = d;
  }
  return best;
}

/**
 * The ForceContact plan set for the root `root` (the side to move is the one
 * losing the clock; `reading` is its `clockReading`). `t` is the root's own
 * `NodeTables`, `s` the caller's scratch with `s.cap` set; `s.work` is reset
 * here and returned as `PlanSet.work`. Only an Act root (`phase 1`, no bill
 * pending) has lines; any other root, or a reading whose posture is not
 * `force-contact`, gets an empty set.
 */
export function forceContactPlans(root: PackedState, t: NodeTables, reading: ClockReading, s: PlanScratch): PlanSet {
  s.work = 0;
  s.rec = null;
  const queries: AnalysisQuery[] = [];
  const empty = (): PlanSet => ({ posture: reading.posture, lines: [], queries, work: s.work });
  if (reading.posture !== 'force-contact' || root.result !== Result.ONGOING || root.phase !== 1 || root.upkeepPending === 1) return empty();
  const cat = s.cat;
  const me = root.side as Side;
  const r = reading.r;
  const deadline = r - 1;

  const target = contactTarget(root, reading, s);
  queries.push({
    name: 'contact.target',
    workCost: 0,
    outcome: target >= 0 ? 'witnessed' : 'refuted',
    result: target >= 0 ? { slot: target, square: sqName(root.sq[target]), def: DEF_ID[root.defId[target]] } : null,
  });
  if (target < 0) return empty();
  const tsq = root.sq[target];
  const tdef = root.defId[target];

  // (a) approach, judged against passing on the same (post-turn) convention.
  const etaStart = s.work;
  if (!playLine(root, t, { act: NO_ACTIONS, prep: NO_ACTIONS }, s)) return empty();
  const passEta = killEtaOn(s, s.line, me, r).plies;
  const scored: Array<{ c: ActCandidate; eta: number; close: number }> = [];
  for (const c of approachCandidates(s, root, target)) {
    if (!playLine(root, t, { act: c.act, prep: NO_ACTIONS }, s)) continue;
    scored.push({ c, eta: killEtaOn(s, s.line, me, r).plies, close: closeness(s, s.line, me, target, tsq) });
  }
  let chosen: { c: ActCandidate; eta: number; close: number } | null = null;
  for (const x of scored) {
    if (x.eta > passEta) continue;
    if (chosen === null || x.eta < chosen.eta || (x.eta === chosen.eta && x.close < chosen.close)) chosen = x;
  }
  queries.push({
    name: 'contact.approach.killEta',
    workCost: s.work - etaStart,
    outcome: chosen !== null ? 'witnessed' : 'refuted',
    result: { passEta, candidates: scored.map(x => ({ label: x.c.label, eta: x.eta, close: x.close })), chosen: chosen?.c.label ?? null },
  });
  const act = chosen !== null ? chosen.c.act : NO_ACTIONS;
  const actLabel = chosen !== null ? chosen.c.label : 'stay';

  // (b), (c): read the Prepare that approach reaches.
  const drafts: Array<{ act: Int32Array; prep: Int32Array; label: string }> = [];
  if (chosen !== null) drafts.push({ act, prep: NO_ACTIONS, label: actLabel });
  copyState(s.line, root);
  let prepared = true;
  for (let i = 0; i < act.length && prepared; i++) prepared = forward(s, s.line, act[i]);
  if (prepared && enterPrepare(s, s.line, t)) {
    const buy = fastestBuyNearEnemy(s, s.line, tdef);
    if (buy >= 0) drafts.push({ act, prep: Int32Array.of(buy), label: `${actLabel}+buy:${DEF_ID[paA(buy)]}@${sqName(paB(buy))}` });
    if (s.line.sq[target] === tsq) {
      let promo = -1;
      let promoKey: number[] = [];
      const pl = s.line;
      for (let u = 0; u < MAX_SLOTS; u++) {
        if (pl.sq[u] === DEAD || pl.owner[u] !== me) continue;
        const a = paMake(AKind.PROMOTE, u, 0, 0);
        if (!s.rep.isLegal(pl, a)) continue;
        const def = pl.defId[u];
        const next = cat.nextDef[def];
        const need = cat.def[tdef];
        if (next < 0 || cat.power[powerIndex(me, def, tdef)] >= need || cat.power[powerIndex(me, next, tdef)] < need) continue;
        const key = [MANHATTAN[pl.sq[u] * 100 + tsq], u];
        if (promo < 0 || lexLess(key, promoKey)) {
          promo = a;
          promoKey = key;
        }
      }
      if (promo >= 0) {
        const u = paA(promo);
        drafts.push({ act, prep: Int32Array.of(promo), label: `${actLabel}+promote:u${u}(${DEF_ID[pl.defId[u]]}->${DEF_ID[cat.nextDef[pl.defId[u]]]})` });
      }
    }
  }

  const lines: PlanLine[] = [];
  const seen = new Set<string>();
  const costliest = maxUnitCost(cat, root, me);
  for (const d of drafts) {
    const damaged = actDamages(s, root, d.act);
    if (!playLine(root, t, d, s)) continue;
    const endKey = endKeyOf(s.line);
    if (seen.has(endKey)) continue;
    seen.add(endKey);
    const qc = rollout(s, t, me, deadline, 'continue', damaged);
    const qe = rollout(s, t, me, deadline, 'evade', damaged);
    queries.push(qc, qe);
    const contract: PlanContract = {
      kind: 'force-contact',
      permittedLoss: { units: CONTACT_PERMITTED_UNITS, crystals: prepSpend(cat, root, d.prep) + costliest },
      essentialSlots: [],
      deadlinePly: deadline,
      endPredicate: 'damaging-attack',
    };
    lines.push({ act: d.act, prep: d.prep, contract, endKey, label: d.label, feasibility: contactFeasibility(qc, qe), queries: [qc, qe] });
  }
  return { posture: reading.posture, lines, queries, work: s.work };
}
