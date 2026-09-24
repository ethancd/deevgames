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
 * normally the root mover). Verdict table (plan B.1, `strategy/clock.ts`,
 * whose module doc and `clockReading` derive this exactly):
 *
 *   `proven-win`   — my stay-put floor beats the opponent's ceiling strictly
 *                    (`L_me > U_opp`; a tie is a draw) AND ALL FOUR of:
 *                    neither side can kill before the clock ends (both
 *                    killETA > r); no home victory is possible for either
 *                    side within r (`clock.ts homeVictoryEta(p, side, r) > r`
 *                    for both sides — a sound reachability lower bound,
 *                    purchases and promotions included); upkeep elimination
 *                    is ruled out for both sides (`clock.ts
 *                    upkeepEliminationRuledOut` — each side holds a living
 *                    tier-1 body, which `settleRent` never releases); and the
 *                    winning side (me) has no pending commitment its floor
 *                    rests on (`clock.ts arrivalsSettled` — a pending arrival
 *                    can be cancelled by the loser without a kill, so a floor
 *                    that counts one is not yet proven).
 *   `proven-loss`  — the mirror (all four gates, with the opponent as the
 *                    winning side whose `arrivalsSettled` is checked).
 *   `bounded-win`  — intervals disjoint in my favour (`L_me > U_opp`), but at
 *                    least one of the four gates above does not hold: a kill,
 *                    a home victory, an upkeep elimination or a cancellable
 *                    pending arrival is not yet ruled out within r.
 *   `bounded-loss` — the mirror.
 *   `open`         — the intervals overlap (exact ties included); no other
 *                    gate is even checked, since (1) alone already caps the
 *                    grade below `proven`.
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
  /**
   * Plies left before the clock ends if no unit is killed, in `killEta`'s
   * convention: `strategy/killeta.ts clockPliesLeft(p)` (equal to
   * `strategy/ledger.ts pliesRemaining(p)`). That is `INACTIVITY_LIMIT − clock`
   * at every fresh root (`progress === 0`) and `INACTIVITY_LIMIT + 1` for a
   * mid-turn root whose turn already killed — one ply MORE than the naive
   * formula, which would make "killETA > r" unsound there (W1.4 review).
   */
  r: number;
  verdict: ClockVerdict;
  /**
   * Projected mined-total margin for `side` at the clock's end, in crystals,
   * from the stay-put floors: `L_side − L_opponent`. This is the margin the
   * evaluator reads (W1.6). CHOICE (why: the ceiling U grows with the bank
   * through reinvestment, so a U-weighted margin would pay the engine for
   * hoarding cash, the failure the 2026-09-20 repair handoff documents;
   * falsifier: a paired position where converting bank into miners raises
   * the true clock outcome but lowers `marginL`).
   */
  marginL: number;
  /** Midpoint margin: midpoint of `side`'s [L, U] minus the opponent's.
   * Reported in the Chronicle only; no decision reads it. */
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

/** The two Workflow 1 plans (plan B.1 `contact.ts`, `hold.ts`). */
export type PlanKind = 'force-contact' | 'hold';

/** What a plan must achieve (plan B.1, Part A item 2). The tactical search's
 * job is to FALSIFY this contract, not to protect material. */
export type PlanEndPredicate =
  /** ForceContact: a damaging attack has been made by the deadline. */
  | 'damaging-attack'
  /** ForceContact: the clock verdict no longer reads a loss. */
  | 'verdict-flipped'
  /** Hold: the enemy's killETA exceeds the plies left at every hand-off. */
  | 'enemy-killeta-exceeds-r';

/** A plan's contract (Part A item 2). */
export interface PlanContract {
  kind: PlanKind;
  /** What the plan may spend: units and crystals it is allowed to lose. */
  permittedLoss: { units: number; crystals: number };
  /** Live slots that must survive the opponent's best reply; losing one in
   * the first reply is a veto reason (W1.10). */
  essentialSlots: readonly number[];
  /** The last ply (killEta convention: ply 1 = the turn in progress) by
   * which `endPredicate` must hold. */
  deadlinePly: number;
  endPredicate: PlanEndPredicate;
}

/** One plan candidate injected at the root (W1.9). */
export interface InjectedPlan {
  contract: PlanContract;
  /** The injected turn's canonical end key (`RootResult.endKey` form). */
  endKey: string;
  /** Short human label, e.g. `approach:slot3->e5`, `buy:fire_1@c3`, `hold:pass`. */
  label: string;
  /**
   * ForceContact (`strategy/contact.ts`): `witnessed` when the rollouts
   * against BOTH scripted replies achieved the end predicate by the deadline,
   * `not-ruled-out` when one did, else `unknown`; never `forced`. Hold
   * (`strategy/hold.ts`): `forced` when the enemy's killETA on the position
   * the line reaches exceeds the plies left there — which forces the "no
   * enemy kill before the clock" clause, and only that clause — else
   * `unknown`.
   */
  feasibility: Feasibility;
  queries: readonly AnalysisQuery[];
}

/**
 * `RootResult.strategy`: the Chronicle of one strategos root search (plan
 * B.1, W1.10) — the question the strategic layer asked, what it found, and
 * what the root did about it. JSON-serialisable; the engine seat forwards it
 * in its `search` telemetry (W1.14). Absent on every non-strategos search.
 */
export interface StrategyChronicle {
  reading: ClockReadingCore | null;
  posture: Posture;
  injected: readonly InjectedPlan[];
  /** What the root played: a plan candidate or the search's own best. */
  chosen: { endKey: string; source: 'plan' | 'search'; scoreCc: number; planLabel?: string } | null;
  /** Present when the root refused the best plan-consistent candidate. */
  veto?: { reason: 'mate' | 'proven-clock-loss' | 'essential-lost'; vetoedEndKey: string; detail: string };
  /** Every strategic query this search ran, in order. */
  queries: readonly AnalysisQuery[];
}
