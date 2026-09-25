/**
 * STRATEGOS W1.10 — the veto at the root, its search half (plan
 * `~/.claude/plans/can-you-respond-to-piped-book.md`, Part A items 2-3, Part
 * B.1 "Veto rule at the root", B.2 step W1.10). `strategy/veto.ts` is the pure
 * half: which candidates are plan-consistent, and the rule that turns a
 * re-search into "play the plan" or a veto with its reason.
 *
 * WHAT THE ROOT DOES under `searchFix.strategyVeto` (`hard@strategos` only),
 * when the root's clock reading has a posture (`hold` or `force-contact`):
 *
 *   1. RESERVE. Before iterative deepening the meter's limit is lowered by
 *      `reserveFor(work)` and put back afterwards (`WorkMeter.setLimit`), so
 *      deepening — its 45% start gate, its truncation, everything that reads
 *      `meter.limit` — runs on the smaller budget and stops early enough to
 *      leave the reserve; if deepening's last poll overshot its lowered limit,
 *      the veto's limit is raised to `used + reserve`, so the reserve is
 *      always whole and the search's total passes the rung by at most that
 *      overshoot (which it could before the veto). Fixed work: deterministic, since nothing reads a
 *      clock. Wall-funded: the rung IS a work budget sized from the box's
 *      throughput, so the same carve-out leaves the same share of the
 *      allowance; the deadline watchdog still bounds the whole turn, and a
 *      re-search it cuts is reported `unresolved` (4).
 *   2. PICK. After deepening, if the tactical best (the last completed
 *      depth's move) is itself plan-consistent it is the plan's move and
 *      nothing more is searched. Otherwise every candidate of the root list
 *      (the pre-deepening generation, copied before the first iteration
 *      rewrites it) is classified, and the best plan-consistent one is the
 *      one the last completed iteration scored highest (`RootProbe
 *      .completedScore`; a null-window score is a bound, and only ranks),
 *      then injected plan lines before other consistent candidates, then
 *      generator order.
 *   3. RE-SEARCH that one candidate with a FULL window: its own turn, then
 *      every opponent reply at ply 1 (PVS over the replies, each child at
 *      `childDepth − 1` through the exported `pvs`), charged to the meter,
 *      which now has the reserve back. `childDepth` is the completed depth
 *      minus one — the depth the root iteration searched the candidate's
 *      child at — floored at ONE full reply ply, because the contract is read
 *      off the opponent's best reply and a depth-0 child (quiescence) names
 *      none. The loop keeps the reply's index, so the principal variation's
 *      first reply is known exactly.
 *   4. DECIDE (`strategy/veto.ts vetoVerdict`): play the plan candidate unless
 *      its re-searched score is a terminal-scale loss the tactical best's is
 *      not, or an essential slot of its contract is dead after that best
 *      reply. A re-search the meter or the watchdog cut, or one whose turn the
 *      replica refused, proves nothing either way: the root then plays the
 *      tactical best and records the query `unresolved` — no plan move leaves
 *      the root unchecked, and no veto is claimed without a proof.
 *
 * Every step is an `AnalysisQuery` in the Chronicle (`veto.classify`,
 * `veto.research`), and the outcome — chosen, veto, queries — goes to
 * `RootResult.strategy` (`search/root.ts chronicle`).
 */
import { MAX_SLOTS, type Centi, type PackedState, type Side } from '../types';
import { newKeepSetTable } from '../core/action';
import { terminalScore } from '../eval/evaluate';
import type { Turn } from '../gen/turn';
import type { ClockReading } from '../strategy/clock';
import { holdEssentialSlots } from '../strategy/hold';
import type { PlanScratch, PlanSet } from '../strategy/plan';
import type { AnalysisQuery, InjectedPlan, StrategyChronicle } from '../strategy/types';
import {
  deadEssentials,
  lossReason,
  planConsistency,
  terminalLossThreshold,
  vetoVerdict,
  type ConsistencyWhy,
} from '../strategy/veto';
import { scoreTurns } from './order';
import { WorkClass } from './time';
import {
  INF,
  PROVER_FULL,
  allocTurn,
  buildSearchTables,
  copyTurn,
  evaluateLeaf,
  generateAt,
  makeTurn,
  pvs,
  unmakeTurn,
  type SearchContext,
  type SearchResult,
} from './pvs';

/**
 * The veto's share of the rung: deepening runs on `work − ⌊work /
 * VETO_RESERVE_SHARE⌋`, and the reserve pays for the classification
 * (`veto.classify`) and the re-search (`veto.research`). CHOICE (why: the
 * re-search is one candidate's child at the completed depth, about what the
 * root's FIRST, full-window candidate costs in a completed iteration, and on
 * wave-1-like ForceContact roots that is a large share of a small rung.
 * History: W1.10 shipped an eighth. Its own measurement (the 2026-09-24 W1.10
 * review: 57 posture root×rung runs at 25,000 / 40,000 / 60,000 over the
 * W1.9 and W1.10 fixtures, the Phasing corpus's posture roots and the
 * authored W1-W6 wave roots) found three re-searches cut for budget, after
 * which the plan was not played: W3-c6-mixed@25,000 (3,093 units),
 * W6-c6-far@40,000 (5,028 against 5,000) and W6-c6-far@60,000 (8,486 against
 * 7,500), about 13-14% of the rung; one run lost a completed depth. The
 * coordinator raised the share to a fifth (20%). Re-measured 2026-09-24 on
 * the same 57 runs: one re-search is still cut for budget,
 * W6-c6-far@40,000 (8,045 units against 8,000 after 7 of its 19 replies;
 * the same line's full re-search costs 11,731 units, 29% of that rung, when
 * the share is a third), and four runs lose a completed depth to the reserve
 * (vf-mate@40,000 3 → 2, pf-tooFarToReach@40,000 4 → 3, W6-c6-far@60,000 2 →
 * 1, pf-trailingNoContact@60,000 2 → 1); re-searches otherwise cost
 * 514-11,217 units, and the plan was played on 50 of the 57. Falsifier: a
 * posture root whose re-search still exceeds the reserve at a rung from
 * 25,000 to 60,000 — W6-c6-far@40,000 already is one, so this share is a
 * standing choice pending the coordinator's decision, not a measured fit —
 * or a ladder row where the depth the reserve costs outweighs the vetoes it
 * buys.)
 */
export const VETO_RESERVE_SHARE = 5;

/** The reserve for a rung of `work` units. */
export function reserveFor(work: number): number {
  return Math.floor(work / VETO_RESERVE_SHARE);
}

/** What `applyVeto` hands the Chronicle. */
export interface VetoOutcome {
  chosen: NonNullable<StrategyChronicle['chosen']>;
  veto?: StrategyChronicle['veto'];
  queries: AnalysisQuery[];
}

/** One search's veto state, armed by `search/root.ts` before deepening. */
export interface VetoArm {
  readonly reading: ClockReading;
  readonly scratch: PlanScratch;
  /** The injected plan set, when `strategyPlans` computed one. */
  readonly plans: () => PlanSet | null;
  /** Units deepening must leave (`reserveFor`). */
  readonly reserve: number;
  /** Copies of the pre-deepening root list (`snapshotCandidates`). */
  candidates: Turn[];
  /** Written by `applyVeto`; null until it runs (and for ever on a root that
   * returned before deepening). */
  outcome: VetoOutcome | null;
}

/** A turn that pays upkeep owns its keep mask (`gen/turn.ts keepForTurn`), so
 * a copied candidate never needs a shared table; this one is always empty. */
const NO_SHARED_KEEP = newKeepSetTable();

function keyHex(hi: number, lo: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

/** Arms the veto for one search, or null when the reading has no posture
 * (nothing to be consistent with, so no reserve is taken). */
export function armVeto(reading: ClockReading, scratch: PlanScratch, plans: () => PlanSet | null, work: number): VetoArm | null {
  if (reading.posture === 'none') return null;
  return { reading, scratch, plans, reserve: reserveFor(work), candidates: [], outcome: null };
}

/** Copies the root list before the first iteration rewrites `s.turns[0]`
 * (the same reason `search/root.ts preserveUnsearched` copies). */
export function snapshotCandidates(arm: VetoArm, turns: readonly Turn[], n: number): void {
  arm.candidates = [];
  for (let i = 0; i < n; i++) arm.candidates.push(copyTurn(allocTurn(), turns[i]));
}

/** The plan candidate's re-search (module doc, step 3). */
interface Research {
  scoreCc: Centi;
  /** The replica refused the candidate's own turn. */
  illegal: boolean;
  /** The meter or the watchdog cut a node of the re-search. */
  truncated: boolean;
  /** End key of the opponent's best reply; null when the plan's own turn
   * ended the game or the opponent had no reply. */
  replyKey: string | null;
  replies: number;
  observedReason: number | null;
  essentialLost: number[];
}

function research(s: SearchContext, p: PackedState, turn: Turn, childDepth: number, essentials: readonly number[]): Research {
  const mover = p.side as Side;
  const opp = (1 - mover) as Side;
  const ord = p.ord.slice(0, MAX_SLOTS);
  const out: Research = {
    scoreCc: 0,
    illegal: false,
    truncated: false,
    replyKey: null,
    replies: 0,
    observedReason: null,
    essentialLost: [],
  };
  const truncatedBefore = s.truncated;
  s.truncated = false;
  p.proverMode = PROVER_FULL;
  const applied = makeTurn(s, p, turn, NO_SHARED_KEEP);
  if (applied !== turn.count) {
    unmakeTurn(s, p, applied);
    s.truncated = truncatedBefore;
    out.illegal = true;
    return out;
  }
  try {
    const terminal = terminalScore(p, mover, 1);
    if (terminal !== null) {
      out.scoreCc = terminal;
      out.observedReason = lossReason(p, mover);
      out.essentialLost = deadEssentials(p, essentials, ord);
      return out;
    }
    // The opponent's node, as `pvs` would search it on a full window, but
    // one reply at a time so the best reply's index survives.
    s.meter.spend(WorkClass.MACRO);
    s.stats.nodes++;
    p.proverMode = PROVER_FULL;
    const t = buildSearchTables(s, p, 1);
    s.meter.spend(WorkClass.KILLTABLE);
    const n = generateAt(s, p, t, 1);
    if (n === 0) {
      out.scoreCc = -evaluateLeaf(s, p, -INF, INF, 1);
      out.essentialLost = deadEssentials(p, essentials, ord);
      return out;
    }
    scoreTurns(p, t, s.turns[1], n, null, s.ord, 1, turn.sig, s);
    const replies = s.turns[1];
    const keep = s.keep[1];
    const beta = INF;
    let alpha = -INF;
    let best = -INF;
    let bestIndex = -1;
    let searched = 0;
    for (let i = 0; i < n; i++) {
      const reply = replies[i];
      p.proverMode = PROVER_FULL;
      const a = makeTurn(s, p, reply, keep);
      if (a !== reply.count) {
        unmakeTurn(s, p, a);
        continue;
      }
      let score: Centi;
      const childTerminal = terminalScore(p, opp, 2);
      if (childTerminal !== null) {
        score = childTerminal;
      } else if (searched === 0) {
        score = -pvs(s, p, childDepth - 1, -beta, -alpha, 2, reply.sig);
      } else {
        score = -pvs(s, p, childDepth - 1, -alpha - 1, -alpha, 2, reply.sig);
        if (score > alpha && score < beta) score = -pvs(s, p, childDepth - 1, -beta, -alpha, 2, reply.sig);
      }
      unmakeTurn(s, p, a);
      searched++;
      if (score > best) {
        best = score;
        bestIndex = i;
      }
      if (score > alpha) alpha = score;
      if (i + 1 < n && (s.meter.exhausted() || s.stop())) {
        out.truncated = true;
        break;
      }
    }
    out.replies = searched;
    if (searched === 0) {
      out.scoreCc = -evaluateLeaf(s, p, -INF, INF, 1);
      out.essentialLost = deadEssentials(p, essentials, ord);
      return out;
    }
    out.scoreCc = -best;
    // Read the contract off the principal variation's first reply.
    const reply = replies[bestIndex];
    out.replyKey = keyHex(reply.endHi, reply.endLo);
    p.proverMode = PROVER_FULL;
    const a = makeTurn(s, p, reply, keep);
    if (a === reply.count) {
      out.observedReason = lossReason(p, mover);
      out.essentialLost = deadEssentials(p, essentials, ord);
    }
    unmakeTurn(s, p, a);
    return out;
  } finally {
    unmakeTurn(s, p, applied);
    if (s.truncated) out.truncated = true;
    s.truncated = truncatedBefore || out.truncated;
  }
}

/** What the ranking of plan-consistent candidates reads (step 2). */
export interface RankedPick {
  /** Position in the pre-deepening root list. */
  index: number;
  /** `RootProbe.completedScore`, or null when the last completed iteration
   * did not search it. */
  score: Centi | null;
  /** Its end key is an injected plan line's. */
  injected: boolean;
}

/** Step 2's order, best first: searched before unsearched, then the higher
 * completed-iteration score, then injected plan lines before other
 * consistent candidates, then generator order — a total order, so the pick
 * is a function of the list and the scores alone. */
export function comparePicks(a: RankedPick, b: RankedPick): number {
  if ((a.score === null) !== (b.score === null)) return a.score === null ? 1 : -1;
  if (a.score !== null && b.score !== null && a.score !== b.score) return b.score - a.score;
  if (a.injected !== b.injected) return a.injected ? -1 : 1;
  return a.index - b.index;
}

/** The Chronicle's label for a plan-consistent candidate. */
function planLabel(arm: VetoArm, line: InjectedPlan | undefined, why: ConsistencyWhy): string {
  return line !== undefined ? line.label : `${arm.reading.posture}:${why}`;
}

/**
 * Steps 2-4 of the module doc, after `iterativeDeepening` returned `result`
 * with a move. Writes `arm.outcome`; returns the plan candidate to play with
 * its re-searched score, or null to play `result.best` as deepening chose it.
 * `p` is the packed root, and is the packed root again on return.
 */
export function applyVeto(s: SearchContext, p: PackedState, result: SearchResult, arm: VetoArm): { turn: Turn; scoreCc: Centi } | null {
  const best = result.best;
  if (best === null) return null;
  const queries: AnalysisQuery[] = [];
  const bestKey = keyHex(best.endHi, best.endLo);
  const tactical = { endKey: bestKey, source: 'search' as const, scoreCc: result.scoreCc };
  if (result.depth < 1) {
    queries.push({ name: 'veto.select', workCost: 0, outcome: 'unresolved', result: { reason: 'no completed depth' } });
    arm.outcome = { chosen: tactical, queries };
    return null;
  }
  const reading = arm.reading;
  const lines = new Map<string, InjectedPlan>();
  for (const line of arm.plans()?.lines ?? []) lines.set(line.endKey, line);

  // The reserve is the veto's in full: deepening stops at its lowered limit
  // only at its next poll, and whatever it spent past that limit would
  // otherwise come out of the reserve (measured at the original eighth:
  // re-searches cut for budget at the 12,000- and 20,000-unit rungs on this
  // file's fixtures; at a fifth, the Hold fixture at 14,000). The root
  // puts the rung's own limit back afterwards (`search/root.ts`), so the
  // search's total can pass the rung by at most deepening's own overshoot,
  // which it could before the veto too.
  if (s.meter.used + arm.reserve > s.meter.limit) s.meter.setLimit(s.meter.used + arm.reserve);

  // Step 2: the tactical best, then — only if it is not consistent — the rest.
  const sc = arm.scratch;
  sc.work = 0;
  const first = planConsistency(p, reading, best, lines.has(bestKey), sc);
  interface Pick extends RankedPick {
    turn: Turn;
    key: string;
    why: ConsistencyWhy;
  }
  const picks: Pick[] = [];
  let checked = 1;
  if (!first.consistent) {
    for (let i = 0; i < arm.candidates.length; i++) {
      const turn = arm.candidates[i];
      const key = keyHex(turn.endHi, turn.endLo);
      if (key === bestKey) continue;
      checked++;
      const injected = lines.has(key);
      const c = planConsistency(p, reading, turn, injected, sc);
      if (!c.consistent) continue;
      const score = s.probe === null ? null : s.probe.completedScore(turn.endHi, turn.endLo);
      picks.push({ index: i, turn, key, why: c.why, score, injected });
    }
  }
  if (sc.work > 0) s.meter.spend(WorkClass.TURN, sc.work);
  queries.push({
    name: 'veto.classify',
    workCost: sc.work,
    outcome: first.consistent || picks.length > 0 ? 'witnessed' : 'refuted',
    result: {
      tacticalBest: first.why,
      checked,
      consistent: first.consistent ? 1 : picks.length,
    },
  });
  if (first.consistent) {
    arm.outcome = {
      chosen: { ...tactical, source: 'plan', planLabel: planLabel(arm, lines.get(bestKey), first.why) },
      queries,
    };
    return null;
  }
  if (picks.length === 0) {
    arm.outcome = { chosen: tactical, queries };
    return null;
  }
  picks.sort(comparePicks);
  const pick = picks[0];
  const line = lines.get(pick.key);

  // Step 3: the full-window re-search, on the reserve.
  const essentials =
    line !== undefined ? line.contract.essentialSlots : reading.posture === 'hold' ? holdEssentialSlots(p, reading, sc.cat) : [];
  const childDepth = result.depth - 1 >= 1 ? result.depth - 1 : 1;
  const before = s.meter.used;
  const rs = research(s, p, pick.turn, childDepth, essentials);
  const unresolved = rs.illegal || rs.truncated;
  const verdict = unresolved
    ? null
    : vetoVerdict({
        planScoreCc: rs.scoreCc,
        tacticalScoreCc: result.scoreCc,
        thresholdCc: terminalLossThreshold(s.maxPly),
        observedReason: rs.observedReason,
        reading,
        essentialLost: rs.essentialLost,
      });
  queries.push({
    name: 'veto.research',
    workCost: s.meter.used - before,
    outcome: unresolved ? 'unresolved' : verdict !== null ? 'refuted' : 'witnessed',
    result: {
      endKey: pick.key,
      planLabel: planLabel(arm, line, pick.why),
      rankScoreCc: pick.score,
      childDepth,
      scoreCc: rs.scoreCc,
      tacticalScoreCc: result.scoreCc,
      replyKey: rs.replyKey,
      replies: rs.replies,
      essentialSlots: [...essentials],
      essentialLost: rs.essentialLost,
      illegal: rs.illegal,
      truncated: rs.truncated,
    },
  });

  // Step 4.
  if (unresolved) {
    arm.outcome = { chosen: tactical, queries };
    return null;
  }
  if (verdict !== null) {
    arm.outcome = {
      chosen: tactical,
      veto: { reason: verdict.reason, vetoedEndKey: pick.key, detail: verdict.detail },
      queries,
    };
    return null;
  }
  arm.outcome = {
    chosen: { endKey: pick.key, source: 'plan', scoreCc: rs.scoreCc, planLabel: planLabel(arm, line, pick.why) },
    queries,
  };
  return { turn: pick.turn, scoreCc: rs.scoreCc };
}
