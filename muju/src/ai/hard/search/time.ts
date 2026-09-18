/**
 * Work accounting and deterministic time (DESIGN §4.16 `time.ts`, §5.11.6, F18).
 *
 * The search never reads a clock. It spends WORK, an integer currency whose
 * unit is calibrated to ≈ 1 µs on the reference box (`hard:bench --calibrate`
 * measures the real ratio on the box it runs on and records it in the M14
 * artifact), and it stops when the budget is gone. The budget itself is one of
 * eight quantised rungs, so jitter in the only three clock reads in the whole
 * engine — `chooseWork`'s input, `updateProfile`'s measurement and the abort
 * watchdog — cannot move the rung and therefore cannot change the move.
 *
 * This is the ONLY module under `src/ai/hard/` besides `engine.ts` that
 * `lab/hard-ai/deps.ts` lets read a clock, and `now()` below is the single
 * place it happens.
 */
import { DEAD, MAX_SLOTS, type PackedState } from '../types';
import type { NodeTables } from '../tables/context';
import { KILL_IMPOSSIBLE } from '../tables/kill';
import { HOME_NEVER } from '../tables/home';
import { ACTIONS_PER_TURN } from '../core/state';

export type { DeviceProfile, TimeConfig } from '../config';
import type { DeviceProfile, TimeConfig } from '../config';

/** DESIGN §4.16. Every meter bucket; `WORK_COST` is indexed by these. */
export const WorkClass = {
  MACRO: 0,
  QUIESCE: 1,
  TURN: 2,
  GEN: 3,
  KILLTABLE: 4,
  DFPN: 5,
  EVAL1: 6,
  EVAL2: 7,
  PROVER: 8,
} as const;
export type WorkClass = (typeof WorkClass)[keyof typeof WorkClass];

export const WORK_CLASS_COUNT = 9;

/** DESIGN §8's table: units ≈ µs on the reference box. `MACRO 4, QUIESCE 4,
 * TURN 1, GEN 4 per place plan, KILLTABLE 8, DFPN 2, EVAL1 2, EVAL2 12,
 * PROVER 40 per full-prover call`. */
export const WORK_COST: readonly number[] = [4, 4, 1, 4, 8, 2, 2, 12, 40];

/** `25e3 × 2^k, k = 0..7` (DESIGN §5.11.6). */
export const WORK_LADDER: readonly number[] = [25e3, 50e3, 100e3, 200e3, 400e3, 800e3, 1.6e6, 3.2e6];

/**
 * E2 lane 1's work-fit ladder: `WORK_LADDER` interleaved at √2, as integer
 * literals (`25e3 × 2^(k/2)`, rounded to three figures). Reached only by
 * `time.ladderStep: 'sqrt2'`, which no shipped shape sets.
 *
 * WHY. `chooseWork` takes the largest rung at or under the budget, so a ×2
 * ladder can leave just under HALF the allowance unspent, and on this box it
 * does: the E1 baseline's `hard@desktop` seat spent a mean 1,951 ms of its
 * 3,000 ms allowance over 4,036 turns, 57% of them under 2,200 ms — the
 * 200,000-unit rung's signature at ~100 units/ms
 * (`docs/hard-ai/e2/E2-LANE1-WORK-FIT.md`). A √2 step halves that worst case
 * to 29% while keeping every ×2 rung a rung, so a budget that landed on
 * 200,000 either stays there or moves one step to 283,000 — never further.
 *
 * WHAT IT GIVES UP is stated where the quantisation is: `chooseWork`'s header.
 */
export const WORK_LADDER_FINE: readonly number[] = [
  25e3, 35e3, 50e3, 71e3, 100e3, 141e3, 200e3, 283e3, 400e3, 566e3, 800e3, 1.13e6, 1.6e6, 2.26e6, 3.2e6,
];

/**
 * DESIGN §4.16. A pure counter: `spend` adds `WORK_COST[cls] × n` to `used`
 * and `n` to `byClass[cls]`. Nothing here reads a clock, so two runs that
 * spend the same work stop at the same node.
 *
 * `count` (P6, additive) moves `byClass` alone, for work that is real but
 * that the engine deliberately does not price; see its own header.
 */
export class WorkMeter {
  readonly byClass = new Int32Array(WORK_CLASS_COUNT);
  private usedUnits = 0;
  private limitUnits: number;

  constructor(limit: number) {
    if (!Number.isFinite(limit) || limit < 0) throw new RangeError(`WorkMeter: bad limit ${limit}`);
    this.limitUnits = Math.floor(limit);
  }

  spend(cls: number, n = 1): void {
    this.byClass[cls] += n;
    this.usedUnits += WORK_COST[cls] * n;
  }

  /**
   * Records `n` events of `cls` WITHOUT pricing them: `byClass` moves, `used`
   * does not (P6, `docs/hard-ai/e1/P6-TURN-TIME-EXPLOSION.md`).
   *
   * One caller, `search/pvs.ts generateAt`, and one reason. The generator runs
   * full-prover calls through `Replica.make` like the search and the ordering
   * pass do, and until P6 nothing counted them — an exploded turn reported
   * `PROVER 0` for a generation that had run 330. Counting them is honest and
   * costs nothing. PRICING them is a different change: `WORK_COST[PROVER]` is
   * 40 units against a measured 348 ms, so adding the delta to `used` would
   * move every fixed-work result in the repo (the P6 generation alone prices
   * at 13,200 units) without bringing the rung any closer to bounding the
   * phase. The price model is E2's to fix; `used` stays the number the lab,
   * CI and the baseline were measured against.
   *
   * So `byClass[cls] × WORK_COST[cls]` is an upper bound on what `cls`
   * contributed to `used`, exact for every class but `PROVER`. `unitsIn` is
   * only ever asked about `QUIESCE` (DESIGN §5.11.4's R5 cap), which is
   * spent, never counted.
   */
  count(cls: number, n = 1): void {
    this.byClass[cls] += n;
  }

  exhausted(): boolean {
    return this.usedUnits >= this.limitUnits;
  }

  get used(): number {
    return this.usedUnits;
  }

  get limit(): number {
    return this.limitUnits;
  }

  /** Units this class has spent (count × its cost) — the numerator of the
   * R5 quiescence cap (DESIGN §5.11.4: `byClass[QUIESCE] ≤ 0.35 × limit`). */
  unitsIn(cls: number): number {
    return this.byClass[cls] * WORK_COST[cls];
  }

  /** Re-arms the meter for a fresh search. Additive to DESIGN §4.16 so one
   * `HardEngine` can serve many turns without reallocating. */
  reset(limit: number = this.limitUnits): void {
    if (!Number.isFinite(limit) || limit < 0) throw new RangeError(`WorkMeter: bad limit ${limit}`);
    this.limitUnits = Math.floor(limit);
    this.usedUnits = 0;
    this.byClass.fill(0);
  }
}

/** The clock. The only `Date.now` under `src/ai/hard/search/`. */
export function now(): number {
  return Date.now();
}

/**
 * DESIGN §4.16: the largest rung `≤ profile.unitsPerMs × targetMs`, floored at
 * `WORK_LADDER[0]`. Quantisation is the whole point — a 5 % swing in the
 * measured throughput leaves the rung, and so the move, untouched.
 *
 * WHAT THE QUANTISATION PROTECTS (E2 lane 1, asked before the ladder was
 * touched). Not reproducibility of a FIXED-work run: that path never calls
 * this function. What it protects is the wall-mode move against the two noisy
 * inputs that reach the rung — the box's instantaneous throughput, which
 * `updateProfile` tracks with an α = 1/4 EWMA that never settles, and
 * `targetMs`'s own multipliers. A ×2 ladder needs the profile to be wrong by
 * 2× before the rung moves, so a turn replayed on a loaded box picks the same
 * rung, spends the same work and returns the same move. It also keeps the
 * profile→rung→elapsed→profile loop coarse: the rung can only take eight
 * values, so a throughput measurement that drifts cannot walk the budget.
 *
 * WHAT A FINER LADDER GIVES UP is exactly that margin. At `ladderStep:
 * 'sqrt2'` a 41 % throughput error moves the rung instead of a 100 % one —
 * still eight times the 5 % swing this header names, but a box whose
 * throughput really does halve under load will now cross two rungs instead of
 * one, and two runs of the same position at different loads are likelier to
 * differ. It buys back the unspent third of the allowance (see
 * `WORK_LADDER_FINE`). Nothing about determinism under FIXED work changes: the
 * lab, CI, `hard:determinism` and `hard:perft` never reach this function.
 *
 * `time` is optional so every existing caller (and `tests/ai/hard/
 * interfaces.test.ts`'s pinned signature) keeps working; absent, or with
 * `ladderStep` unset, this is the function it has always been.
 */
export function chooseWork(profile: DeviceProfile, targetMs: number, time?: TimeConfig): number {
  const ladder = time?.ladderStep === 'sqrt2' ? WORK_LADDER_FINE : WORK_LADDER;
  const budget = profile.unitsPerMs * targetMs;
  let chosen = ladder[0];
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i] <= budget) chosen = ladder[i];
  }
  return chosen;
}

/**
 * EWMA with α = 1/4 over the measured `work / elapsedMs` (DESIGN §4.16).
 * Called after every MEASURED search, including one the deadline watchdog cut
 * (AMENDMENTS-DECIDED A11; `engine.ts#searchTurn`): `work / elapsedMs` is a
 * throughput sample whether or not the search finished, and with the deadline
 * equal to the turn allowance an aborted search is ordinary — skipping it would
 * freeze an optimistic profile forever. An externally `cancel()`ed search is
 * the one exception (it can be cut inside unmetered pre-search work).
 *
 * Returns a NEW profile; the caller decides whether to adopt it.
 */
export function updateProfile(profile: DeviceProfile, work: number, elapsedMs: number): DeviceProfile {
  if (elapsedMs <= 0 || work <= 0) return profile;
  const sample = work / elapsedMs;
  const blended = profile.samples === 0 ? sample : profile.unitsPerMs + (sample - profile.unitsPerMs) / 4;
  const unitsPerMs = Math.max(1, Math.round(blended));
  return { unitsPerMs, samples: profile.samples + 1 };
}

/** Highest `valueCc` among the targets `side` can actually remove this turn. */
function killNowWorth(p: PackedState, t: NodeTables, side: number): number {
  const table = t.killNow[side];
  let best = 0;
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (p.sq[slot] === DEAD) continue;
    const e = table.entry[slot];
    if (e.minActions === KILL_IMPOSSIBLE || e.minActions > ACTIONS_PER_TURN) continue;
    if (e.valueCc > best) best = e.valueCc;
  }
  return best;
}

/** `actionsToCorner` of the cheapest threat against either corner. */
function homeThreatActions(t: NodeTables): number {
  const a = t.home[0].actionsToCorner;
  const b = t.home[1].actionsToCorner;
  const best = a < b ? a : b;
  return best >= HOME_NEVER ? HOME_NEVER : best;
}

/**
 * DESIGN §5.11.6: `targetMs = clamp(baseMs × m / 100, minMs, maxMs)` with
 * `m = 100 · 1.5[home threat ≤ 4 actions either side] · 1.3[killNow worth ≥
 * 800 cc either side] · 0.5[one candidate] · 0.4[book hit]`, in integer
 * arithmetic (the multipliers are applied as `×3/2`, `×13/10`, `×1/2`,
 * `×2/5`, each truncating, so the result is machine-independent).
 *
 * `t` must be a level-2 `NodeTables` for `p`: both the home and the `killNow`
 * terms are level-2 quantities.
 */
export function targetMs(
  p: PackedState,
  t: NodeTables,
  cfg: TimeConfig,
  bookHit: boolean,
  candidates: number,
): number {
  let m = 100;
  if (homeThreatActions(t) <= ACTIONS_PER_TURN) m = ((m * 3) / 2) | 0;
  if (killNowWorth(p, t, 0) >= 800 || killNowWorth(p, t, 1) >= 800) m = ((m * 13) / 10) | 0;
  if (candidates <= 1) m = (m / 2) | 0;
  if (bookHit) m = ((m * 2) / 5) | 0;
  const raw = ((cfg.baseMs * m) / 100) | 0;
  if (raw < cfg.minMs) return cfg.minMs;
  if (raw > cfg.maxMs) return cfg.maxMs;
  return raw;
}

// --- E4.3 candidate B: the iteration-cost estimator (`searchFix.iterFit`) ----
//
// WHAT IT REPLACES. DESIGN §5.11.2 refuses the next iteration once
// `used > 0.45 × limit`, a constant that never looks at what this position's
// iterations cost; E2 lane 1's `iterationGate: 'predicted'` looks, but through
// a single previous-iteration cost RATIO clamped to [2, 6]
// (`search/pvs.ts shouldDeepen`). E2 measured the ratios that estimator is fed
// (`docs/hard-ai/e2/E2-LANE1-DEEP-GATE.md` §E, 126 consecutive
// completed-iteration pairs over 20 positions): median 9.05, and the
// distribution is not one distribution but one per STEP — depth 1 → 2 has
// median 12.32 (n = 19, min 3.66, max 39.17) and depth 2 → 3 median 3.02
// (n = 17, min 0.61, max 10.74). Predicting the 2 → 3 step from the 1 → 2
// ratio therefore over-predicts by about 4×, the clamp at 6 is still an
// over-prediction, and `used + lastIterWork × 6 > limit` fires long before the
// 0.45 rule does — which is exactly what the probe measured (`deep-gate` spent
// 23% LESS work than the champion and lost 0.3 completed depth).
//
// WHAT IS HERE. The step model, as pure functions over integers and floats, so
// `tests/ai/hard/iter-fit.test.ts` can exercise the rule on synthetic
// iteration costs without a search. `search/pvs.ts` holds the call sites.
// IEEE-754 multiply and compare are exactly specified, so the decision is the
// same on every box (DESIGN F18), exactly as `shouldDeepen`'s float ratio is.

/**
 * The ratio assumed for the depth 1 → 2 step, where this turn has measured no
 * step of its own and the prior is empty: E2's measured median for that step,
 * 12.32, rounded down.
 */
export const ITER_RATIO_COLD = 12;

/**
 * How much cheaper the NEXT step is than the one just measured. E2's two
 * measured steps are 12.32 (1 → 2) and 3.02 (2 → 3); 12.32 × 0.25 = 3.08
 * predicts 3.02. Two steps is all the evidence there is, so the decay is
 * floored (below) rather than extrapolated a third time — at the 3 → 4 step
 * 3.02 × 0.25 = 0.755 would predict a deeper iteration CHEAPER than its
 * predecessor, which no measured pair supports.
 */
export const ITER_STEP_DECAY = 0.25;

/** The floor the decayed ratio is clamped to: a deeper iteration is never
 * predicted to cost less than twice its predecessor. */
export const ITER_RATIO_FLOOR = 2;

/** The ceiling, at the largest ratio E2 measured (39.17, rounded up). It is
 * NOT the binding clamp the E2 estimator's 6 was; it exists so a degenerate
 * pair (a near-zero previous iteration) cannot produce an infinite prediction. */
export const ITER_RATIO_CEIL = 40;

/**
 * The stated margin. The prediction is allowed to exceed the remaining budget
 * by 25% before the iteration is refused.
 *
 * It points the way it does because the estimator's residual error is
 * one-sided and the downside is now bounded. The step model is built from two
 * measured steps and decays toward a floor, so it over-predicts more often
 * than it under-predicts; and an iteration that is funded and then does NOT
 * fit is no longer work thrown away, because the same rule lets a
 * non-completing iteration publish when it completed its principal variation
 * (`iterFitVerdict`'s remainder arm). A margin BELOW 1 would reproduce
 * `deep-gate`'s refusals, which is the failure this arm exists to fix.
 */
export const ITER_FIT_SLACK = 1.25;

/**
 * The remainder arm's floor: a refused iteration is still RUN, as a partial,
 * only while at least this share of the rung is unspent. Below it the
 * remainder cannot complete one root candidate's subtree at the new depth, so
 * running it would buy nothing and would only push the turn closer to the
 * deadline (P6/P8: a turn that overruns its allowance withholds the timing
 * columns).
 */
export const ITER_REMAINDER_MIN_SHARE = 0.125;

/**
 * The per-STEP prior: what the ratio of step `k` (the cost of depth `k+1` over
 * the cost of depth `k`) measured on the PREVIOUS searches of this engine.
 *
 * It is a wall-mode quantity, exactly like `config.profile`, and it is carried
 * for the same reason: the depth 1 → 2 decision has no measurement of its own
 * to make — this turn has completed exactly one iteration at that point — and
 * the same engine's previous turn has one. `engine.ts#searchTurn` CLEARS it at
 * the start of every FIXED-work search, so a fixed-work search still carries
 * nothing from one search into the next and DESIGN §7.4's determinism contract
 * ("a search depends only on its position, its weights and its work rung") is
 * as true as it was. Nothing writes it unless `searchFix.iterFit` is on.
 *
 * The blend is `updateProfile`'s: an α = 1/4 EWMA, so one unusual turn cannot
 * move the prior far and a run of them can.
 */
export class IterCostPrior {
  private readonly ratio: Float64Array;

  constructor(steps: number) {
    this.ratio = new Float64Array(steps);
  }

  clear(): void {
    this.ratio.fill(0);
  }

  /** The measured ratio for step `k`, or 0 when nothing has measured it. */
  get(step: number): number {
    return step >= 0 && step < this.ratio.length ? this.ratio[step] : 0;
  }

  record(step: number, measured: number): void {
    if (step < 0 || step >= this.ratio.length) return;
    if (!Number.isFinite(measured) || measured <= 0) return;
    const held = this.ratio[step];
    this.ratio[step] = held === 0 ? measured : held + (measured - held) / 4;
  }
}

/**
 * The predicted cost ratio of the step about to be taken — from this turn's
 * own completed iterations first, from the prior second, from E2's measured
 * cold value last — clamped to `[ITER_RATIO_FLOOR, ITER_RATIO_CEIL]`.
 *
 * `lastIterWork` is what the last COMPLETED depth cost (aspiration re-searches
 * included) and `prevIterWork` what the one before it cost, both of THIS
 * search; `priorRatio` is `IterCostPrior.get(step)` for the step being taken,
 * or 0.
 *
 * THIS TURN'S OWN EVIDENCE WINS over the step-matched prior, even though the
 * prior is step-matched and this turn's ratio is one step stale: the prior was
 * measured on a different position, and E2's per-step split says the spread
 * WITHIN a step (3.66 to 39.17 at step 1) is as wide as the gap between steps.
 * The prior fills the step where this turn has nothing to say, which in
 * practice is the depth 1 → 2 decision and nothing else.
 */
export function iterStepRatio(lastIterWork: number, prevIterWork: number, priorRatio: number): number {
  let r: number;
  if (prevIterWork > 0 && lastIterWork > 0) r = (lastIterWork / prevIterWork) * ITER_STEP_DECAY;
  else if (priorRatio > 0) r = priorRatio;
  else r = ITER_RATIO_COLD;
  if (!(r > ITER_RATIO_FLOOR)) return ITER_RATIO_FLOOR;
  if (r > ITER_RATIO_CEIL) return ITER_RATIO_CEIL;
  return r;
}

/**
 * What to do with the next iteration.
 *
 *   `fund`      — the prediction fits the remainder inside the margin; run the
 *                 iteration as an ordinary one, which may complete, publish
 *                 and be deepened past.
 *   `remainder` — it does not fit, but enough of the rung is left to be worth
 *                 spending: run it as a PARTIAL that may publish only under
 *                 the principal-variation rule (`search/pvs.ts`), then stop.
 *   `stop`      — it does not fit and the remainder is too small to complete
 *                 anything; return the last completed depth now.
 *
 * `used` and `limit` are the work meter's; the remainder is `limit - used` in
 * BOTH modes, because the rung is the budget in both. The wall deadline is not
 * predicted here — A11's watchdog is a separate backstop and the search cannot
 * price a millisecond in work units.
 */
export type IterFitVerdict = 'fund' | 'remainder' | 'stop';

export function iterFitDecision(
  used: number,
  limit: number,
  lastIterWork: number,
  prevIterWork: number,
  priorRatio: number,
): IterFitVerdict {
  const remaining = limit - used;
  if (remaining <= 0) return 'stop';
  if (lastIterWork <= 0) return 'fund';
  const predicted = lastIterWork * iterStepRatio(lastIterWork, prevIterWork, priorRatio);
  if (predicted <= remaining * ITER_FIT_SLACK) return 'fund';
  return remaining >= limit * ITER_REMAINDER_MIN_SHARE ? 'remainder' : 'stop';
}
