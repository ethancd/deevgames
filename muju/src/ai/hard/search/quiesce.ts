/**
 * Quiescence over tactical turns (DESIGN §4.16 `quiesce.ts`, §5.11.4, F24).
 *
 * At depth 0 the position is still allowed to be in the middle of a fight, so
 * the search keeps going — but only through turns that CHANGE the fight:
 * `KILL | HOME_ENTRY | HOME_RESCUE | HOME_RACE | HOME_FORTIFY` (F24 keeps
 * "voids or restores an anchor" out; an anchor void is an ordering bonus, not
 * a reason to extend). Stand-pat makes it safe to let income keep accruing
 * inside the search (JS §4.2 shows the alternative — freezing the economy
 * features — is internally inconsistent).
 *
 * THE R5 CAP. DESIGN §5.11.4 gates `byClass[QUIESCE] ≤ 0.35 × meter.limit` on
 * every corpus position. A gate you can only ever observe is a gate you
 * eventually fail, so the cap is ENFORCED here: once quiescence has spent its
 * share, every further call stands pat. The test is on the work counters alone,
 * so it is as deterministic as the rest of the search. The enforcement
 * threshold sits at 0.34 rather than 0.35 so the handful of calls already in
 * flight when the cap trips cannot carry the measured share past the gate's
 * number.
 *
 * Which means the shipped search's share is bounded by the ENFORCEMENT and not
 * by quiescence's own appetite, and reporting only that number would be
 * presenting a thermostat reading as a temperature. `hard:bench --calibrate`
 * therefore runs a second arm with `quiesceCapOn` false and reports
 * `quiesceShareUncappedMax` next to the capped `quiesceShareMax`, so the
 * artifact says which of the two each number is. See DEVIATIONS under M14.
 */
import { DEAD, MAX_SLOTS, type Centi, type PackedState, type Side } from '../types';
import type { NodeTables } from '../tables/context';
import { ACTIONS_PER_TURN } from '../core/state';
import { KILL_IMPOSSIBLE } from '../tables/kill';
import { HOME_NEVER } from '../tables/home';
import { terminalScore } from '../eval/evaluate';
import { TACTICAL_FLAGS, type Turn } from '../gen/turn';
import { WorkClass } from './time';
import { maxPlausibleGain } from './order';
import {
  PROVER_BOUND,
  buildSearchTables,
  evaluateLeaf,
  generateAt,
  makeTurn,
  unmakeTurn,
  type SearchContext,
} from './pvs';

export type { QuiesceConfig } from '../config';

/** DESIGN §5.11.4's R5 cap, with the margin the module header explains. */
export const QUIESCE_SHARE_NUM = 34;
export const QUIESCE_SHARE_DEN = 100;

/** DESIGN §4.16: `KILL | HOME_ENTRY | HOME_RESCUE | HOME_RACE | HOME_FORTIFY`.
 * `p` is accepted for the signature DESIGN prints; the classification is a pure
 * function of the flags `gen/actionsearch.ts` already recorded for the turn. */
export function isTacticalTurn(p: PackedState, t: Turn): boolean {
  void p;
  return (t.flags & TACTICAL_FLAGS) !== 0;
}

/**
 * The R5 cap, measured on the work quiescence actually COSTS.
 *
 * DESIGN §5.11.4 writes the gate as `byClass[QUIESCE] ≤ 0.35 × meter.limit`,
 * but `byClass[QUIESCE]` is a node COUNT and `limit` is in units, and at
 * `WORK_COST[QUIESCE] = 4` the quiescence bucket is a rounding error next to
 * what a quiescence node really spends: its own table build, its `generate`
 * (hundreds of `TURN` nodes and as many stage-1 evaluations) and its children.
 * Measured on the corpus, the literal reading puts the share at 0.01 while
 * quiescence is consuming more than half the rung — a cap that can never bind
 * is not a cap.
 *
 * `SearchContext.quiesceWork` therefore accumulates `meter.used` across each
 * TOP-LEVEL quiescence subtree (`qply === 0`, so nested calls are counted once)
 * and the cap is on that. While a subtree is active the checks also include
 * its in-flight meter delta; recursive children cannot all spend the same
 * unaccounted allowance. It is strictly stronger than the literal reading,
 * dimensionally correct, and still a pure function of the work counters — so
 * it costs the search nothing in determinism. See DEVIATIONS under M14.
 */
function quiesceCapped(s: SearchContext, rootWorkStart: number): boolean {
  if (!s.quiesceCapOn) return false;
  const spent = s.quiesceWork + s.meter.used - rootWorkStart;
  return spent * QUIESCE_SHARE_DEN >= s.meter.limit * QUIESCE_SHARE_NUM;
}

/**
 * Is there anything for quiescence to look at? A position where the mover can
 * kill nothing this turn and neither corner is within a turn of falling has no
 * tactical turn to generate, so the whole candidate list would be filtered away
 * — after paying for it.
 *
 * Generating costs a couple of hundred within-turn nodes and as many stage-1
 * evaluations; the two level-2 quantities below cost a table build the node has
 * to do anyway. Asking first is what keeps quiescence from consuming the work
 * rung on quiet leaves (measured: 868 quiescence nodes against 167 macro nodes
 * on a mid-game corpus position before this test existed). DESIGN §5.11.4's
 * candidate set is unchanged — every turn this skips would have been filtered
 * out by `isTacticalTurn` anyway.
 *
 * HOME_FORTIFY is relevant whenever an enemy home is occupied.
 */
function hasTacticalPotential(p: PackedState, t: NodeTables, mover: Side): boolean {
  const table = t.killNow[mover];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD || p.owner[slot] === mover) continue;
    const e = table.entry[slot];
    if (e.minActions !== KILL_IMPOSSIBLE && e.minActions <= ACTIONS_PER_TURN) return true;
  }
  // A corner within one turn of either side: home entry, race or rescue.
  if (t.home[0].actionsToCorner < HOME_NEVER && t.home[0].actionsToCorner <= ACTIONS_PER_TURN) return true;
  if (t.home[1].actionsToCorner < HOME_NEVER && t.home[1].actionsToCorner <= ACTIONS_PER_TURN) return true;
  return t.home[0].occupied === 1 || t.home[1].occupied === 1;
}

/**
 * DESIGN §5.11.4. Value of `p` from the side-to-move's point of view.
 *
 * The `qply === 0` wrapper is the R5 cap's accounting point: every unit the
 * whole quiescence subtree spends is attributed to quiescence exactly once.
 */
export function quiesce(
  s: SearchContext,
  p: PackedState,
  alpha: Centi,
  beta: Centi,
  ply: number,
  qply: number,
  rootWorkStart = s.meter.used,
): Centi {
  if (qply !== 0) return quiesceNode(s, p, alpha, beta, ply, qply, rootWorkStart);
  // Once the allowance is spent, this is an ordinary static leaf: do not
  // start another quiescence subtree merely to stand pat. Evaluation keeps
  // all of its normal EVAL meter charges. Work already spent inside an entered
  // subtree is never clipped or reassigned out of quiesceWork.
  if (quiesceCapped(s, rootWorkStart)) {
    return terminalScore(p, p.side as Side, ply) ?? evaluateLeaf(s, p, alpha, beta, ply);
  }
  const before = s.meter.used;
  try {
    return quiesceNode(s, p, alpha, beta, ply, qply, rootWorkStart);
  } finally {
    // A typed forecast veto still consumed the work already executed.
    s.quiesceWork += s.meter.used - before;
  }
}

function quiesceNode(
  s: SearchContext,
  p: PackedState,
  alpha: Centi,
  beta: Centi,
  ply: number,
  qply: number,
  rootWorkStart: number,
): Centi {
  s.meter.spend(WorkClass.QUIESCE);
  s.stats.qnodes++;
  if (ply > s.stats.seldepth) s.stats.seldepth = ply;

  const terminal = terminalScore(p, p.side as Side, ply);
  if (terminal !== null) return terminal;

  const standPat = evaluateLeaf(s, p, alpha, beta, ply);
  if (qply >= s.cfg.quiesce.maxPly) return standPat;
  if (ply + 1 >= s.maxPly) return standPat;
  if (quiesceCapped(s, rootWorkStart)) return standPat;
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  // DESIGN §5.11.4: the prover runs in `bound` mode inside quiescence.
  p.proverMode = PROVER_BOUND;
  const t = buildSearchTables(s, p, ply);
  s.meter.spend(WorkClass.KILLTABLE);

  const mover = p.side as Side;
  if (quiesceCapped(s, rootWorkStart) || !hasTacticalPotential(p, t, mover)) return alpha;

  const generated = generateAt(s, p, t, ply, s.genQuiesce, () => quiesceCapped(s, rootWorkStart));
  // A policy-capped list is discarded whole: this node stands pat under the
  // ordinary quiescence allowance, never searches a partial tactical list.
  if (quiesceCapped(s, rootWorkStart) || generated === 0) return alpha;

  // Compact the tactical turns to the front, preserving generator order, and
  // keep at most `maxCandidates` of them.
  const turns = s.turns[ply];
  let count = 0;
  const cap = s.cfg.quiesce.maxCandidates;
  for (let i = 0; i < generated && count < cap; i++) {
    if (!isTacticalTurn(p, turns[i])) continue;
    if (i !== count) {
      const swap = turns[count];
      turns[count] = turns[i];
      turns[i] = swap;
    }
    count++;
  }
  if (count === 0) return alpha;

  const keep = s.keep[ply];
  const gain = maxPlausibleGain(p, t);
  const margin = s.cfg.quiesce.deltaMarginCc;

  for (let i = 0; i < count; i++) {
    if (quiesceCapped(s, rootWorkStart)) break;
    const turn = turns[i];
    if (standPat + gain + margin < alpha) continue;
    p.proverMode = PROVER_BOUND;
    const applied = makeTurn(s, p, turn, keep);
    if (applied !== turn.count) {
      unmakeTurn(s, p, applied);
      continue;
    }
    let score: Centi;
    const childTerminal = terminalScore(p, mover, ply + 1);
    if (childTerminal !== null) score = childTerminal;
    else score = -quiesce(s, p, -beta, -alpha, ply + 1, qply + 1, rootWorkStart);
    unmakeTurn(s, p, applied);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
    if (s.meter.exhausted() || s.stop()) {
      // The value below is a partial maximum; `search/pvs.ts` reads
      // `ctx.truncated` and stops writing to the transposition table.
      s.truncated = true;
      break;
    }
  }
  return alpha;
}
