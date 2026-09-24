/**
 * STRATEGOS Workflow 1 — the strategic layer's shared vocabulary.
 *
 * Plan: `~/.claude/plans/can-you-respond-to-piped-book.md` (2026-09-24), Part A
 * items 1, 2 and 5, and the paragraph on what Workflow 1 does to prepare for
 * Workflow 2's beliefs. The change record is
 * `docs/changes/2026-09-24-strategos-w1.md`.
 *
 * Every module under `src/ai/hard/strategy/` is a pure function of the packed
 * root position: no cross-turn memory, no module state, so `hard:determinism`
 * keeps its meaning. `gen/` never imports this directory; `search/root.ts` owns
 * the calls and installs the results through setters.
 *
 * WHY THE TYPES CARRY THEIR GUARANTEE. The first STRATEGOS draft said
 * "killETA ≤ deadline ⇒ feasible", which is false: a lower bound can rule a
 * plan out, never in. Each strategic fact therefore says how strong it is and
 * what it assumes, so the decision rule can compare like with like and so
 * Workflow 2 can attach likelihoods to the same objects later.
 */
import type { Side } from '../types';

/**
 * How strong a strategic fact is.
 *
 *   `proven`    — holds against every legal continuation (a proof).
 *   `bounded`   — follows from sound bounds; the bounds' own assumptions are
 *                 listed and none of them is "the opponent cooperates".
 *   `projected` — a conditional forecast (e.g. stay-put mining) whose
 *                 assumptions may fail in play.
 *   `unknown`   — not computed, or the computation ran out of budget.
 */
export type Guarantee = 'proven' | 'bounded' | 'projected' | 'unknown';

/**
 * Feasibility of a plan's end predicate (Part A item 1).
 *
 *   `not-ruled-out` — an optimistic bound (killETA, the ledger's U) says it is
 *                     not impossible. Says nothing about achieving it.
 *   `witnessed`     — a replayable line achieves it against a passive or
 *                     scripted opponent.
 *   `forced`        — achieves it against every legal reply.
 *   `unknown`
 */
export type Feasibility = 'not-ruled-out' | 'witnessed' | 'forced' | 'unknown';

/** A typed strategic fact: the value, how strong it is, where it came from and
 * what it assumes. `assumptions` is empty only when `status` is `proven`. */
export interface Claim<T> {
  value: T;
  status: Guarantee;
  /** The computation that produced it, e.g. `ledger.L`, `killeta.lowerBound`. */
  evidence: string;
  /** Conditions under which `value` holds, in plain words. */
  assumptions: readonly string[];
}

/** The discrete outcome of one strategic search. Exact queries return only
 * `refuted` or `witnessed`; budgeted ones may return `unresolved`. */
export type QueryOutcome = 'refuted' | 'witnessed' | 'unresolved';

/** One search the strategic layer ran, with what it cost. Workflow 2 attaches
 * likelihoods to `outcome`; Workflow 1 only records it in the Chronicle. */
export interface AnalysisQuery<R = unknown> {
  /** Stable name, e.g. `contact.witness`, `hold.enemyKillEta`. */
  name: string;
  /** Work units charged to the search meter (0 for closed-form queries). */
  workCost: number;
  outcome: QueryOutcome;
  result: R;
}

/**
 * The kill-clock verdict from ONE side's point of view (`ClockReading.side`,
 * normally the root mover). Verdict table (plan B.1, `strategy/clock.ts`):
 *
 *   `proven-win`   — my stay-put floor beats the opponent's ceiling strictly
 *                    (`L_me > U_opp`; a tie is a draw) AND neither side can
 *                    kill before the clock ends (both killETA > r).
 *   `proven-loss`  — the mirror.
 *   `bounded-win`  — intervals disjoint in my favour, a kill not ruled out.
 *   `bounded-loss` — the mirror.
 *   `open`         — the intervals overlap (exact ties included).
 */
export type ClockVerdict = 'proven-win' | 'proven-loss' | 'bounded-win' | 'bounded-loss' | 'open';

/** What the strategic layer wants this turn. Hold on a clock win, ForceContact
 * on a clock loss, none when open (plan B.1). */
export type Posture = 'hold' | 'force-contact' | 'none';

/**
 * The part of a clock reading the evaluator needs, from `side`'s point of view.
 * `strategy/clock.ts`'s full `ClockReading` extends it.
 */
export interface ClockReadingCore {
  side: Side;
  /** Plies left before the clock ends if no unit dies: INACTIVITY_LIMIT − clock. */
  r: number;
  verdict: ClockVerdict;
  /** Projected mined-total margin for `side` at the clock's end, in crystals:
   * midpoint of `side`'s [L, U] minus midpoint of the opponent's. */
  marginMid: number;
}

/**
 * The per-search kill-clock policy (`eval/evaluate.ts setKillClockPolicy`,
 * plan W1.2). `search/root.ts` saves the module slot, sets this for the
 * duration of one strategos search and restores it in a `finally`, so no
 * search can leak its root clock into the next one. The desktop profile never
 * sets it and keeps the legacy `setKillClockRootClock` behaviour byte for byte.
 */
export interface KillClockPolicy {
  /** The root position's inactivity clock (0 … INACTIVITY_LIMIT − 1). */
  rootClock: number;
  /** The root reading, or null when it was not computed. */
  reading: ClockReadingCore | null;
}
