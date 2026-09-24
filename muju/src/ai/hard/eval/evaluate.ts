/**
 * The staged evaluator (DESIGN §4.15, §5.12).
 *
 * Every score is an integer centi-crystal count from `root`'s point of view:
 * `Σ_i w[i] · f[i]` over the 62 symmetric-difference features of
 * `eval/features.ts`, plus the 18-parameter material block (see MATERIAL
 * below). Three stages, run in order and each returning only its OWN
 * contribution, so DESIGN §5.12.4's driver reads exactly as written
 * (`v1 = stage0 + stage1`):
 *
 *   - stage 0: features 0–4, incremental sums only, no tables.
 *   - stage 1: features 5–22. Builds its OWN level-1 `NodeTables` (DESIGN F6 —
 *     the macro node's tables belong to the generator and the ordering; a leaf
 *     position has none), from the caller's per-ply `Scratch`.
 *   - stage 2: features 23–61. Upgrades the same tables to level 2.
 *
 * MATERIAL. Feature 0's value is `Σ material[def]` and `material` is the
 * tunable 18-parameter half of `Weights`, which `extract` cannot see (DESIGN
 * §4.15 gives it no `Weights`). `stage0` therefore scores the material block
 * itself, as `Σ_d material[d] · (n_root[d] − n_other[d])` in cc — identical to
 * `w[Material] · f[Material]` whenever `w[Material] === 100` and `material[d]`
 * is the catalogue prior `cost × 100` (DESIGN F9), which is what
 * `DEFAULT_WEIGHTS` holds. `full`'s `outFeatures[Material]` carries `extract`'s
 * weight-free prior version for Texel's reporting. See DEVIATIONS under M12.
 *
 * WORK. `search/time.ts` owns `WorkMeter` and `WorkClass`, and DESIGN §2's
 * layering forbids `eval` from importing `search`, so the meter is taken
 * structurally (`EvalMeter`) and the two class ids are restated — the same
 * arrangement `tactics/prover.ts` uses for `ProverMeter`/`WORK_CLASS_PROVER`.
 */
import {
  DEAD,
  DRAW_CC,
  MATE_PLY_CC,
  MAX_SLOTS,
  Reason,
  Result,
  WIN_CC,
  type Centi,
  type PackedState,
  type Side,
} from '../types';
import { Scratch } from '../core/bits';
import { INACTIVITY_LIMIT } from '../core/state';
import type { Replica } from '../core/state';
import type { ReachMemo } from '../core/movement';
import { allocTables, buildTables, type NodeTables } from '../tables/context';
import type { EvalFix, Weights } from '../config';
import type { KillClockPolicy } from '../strategy/types';
import { DEFAULT_WEIGHTS, assertCurrentWeights } from './weights';
import { F, FEATURE_COUNT, extract } from './features';

/** `WorkClass.EVAL1` / `WorkClass.EVAL2` (DESIGN §4.16), restated here so
 * `eval` need not import `search` (DESIGN §2 layering). */
export const WORK_CLASS_EVAL1 = 6;
export const WORK_CLASS_EVAL2 = 7;
/** Existing search/time PROVER class; retain its existing pricing. */
export const WORK_CLASS_PROVER = 8;

/** The slice of `search/time.ts`'s `WorkMeter` the evaluator uses. */
export interface EvalMeter {
  spend(cls: number, n?: number): void;
}

/** A meter for callers with no work budget (gates, Texel, the bench). */
export const NULL_METER: EvalMeter = { spend: () => undefined };

/** `extract(stage 0)` touches no scratch; this satisfies the signature DESIGN
 * §4.15 prints without allocating a buffer. */
const SCRATCH0 = new Scratch(1, 0, 0, 0);

export class Evaluator {
  readonly rep: Replica;
  private weights: Weights;
  /** The evaluator's own tables (DESIGN F6); never the macro node's. */
  private readonly tables: NodeTables;
  private readonly f: Int32Array;

  /**
   * `fix` is the E3.2 correctness block (`config.ts EvalFix`, B1-B5), OFF
   * (`null`) for every existing caller and for the champion. It is stamped on
   * the evaluator's OWN tables, which is where `features.ts`, `invariants.ts`
   * and `tables/economy.ts` read it; `HardEngine` stamps the same block on the
   * search's per-ply tables so a node evaluated through `buildTables` in
   * `pvs`/`quiesce`/`root` sees the same engine.
   *
   * `memo` is E4.3 candidate C's shared reach memo (`searchFix.reachCache`),
   * `null` for every existing caller and for the champion; passing the
   * engine's own memo is what lets a distance field computed for the search's
   * tables be reused by the evaluator's, and the other way round.
   */
  constructor(rep: Replica, w: Weights = DEFAULT_WEIGHTS, fix: EvalFix | null = null, memo: ReachMemo | null = null) {
    assertCurrentWeights(w);
    this.rep = rep;
    this.weights = w;
    this.tables = allocTables(memo);
    this.tables.evalFix = fix;
    this.f = new Int32Array(FEATURE_COUNT);
  }

  /** Stores the reference, not a copy: a tuner mutating its vector in place
   * (Texel, SPSA) sees the change on the next evaluation. */
  setWeights(w: Weights): void {
    assertCurrentWeights(w);
    this.weights = w;
  }

  get currentWeights(): Weights {
    return this.weights;
  }

  /**
   * Drops the evaluator's cached tables and BFS distances. Only two callers
   * need it: a benchmark that wants every position to pay its real first-touch
   * cost, and the search when the catalogue changes underneath it. Additive to
   * DESIGN §4.15 (see DEVIATIONS under M12).
   */
  invalidate(): void {
    this.tables.keyLo = -1 >>> 0;
    this.tables.keyHi = -1 >>> 0;
    this.tables.dist.invalidate();
  }

  /** `Σ_d material[d] · (n_root[d] − n_other[d])`, in cc. */
  private materialCc(p: PackedState, root: Side): Centi {
    const m = this.weights.material;
    let sum = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      if (p.sq[slot] === DEAD) continue;
      const v = m[p.defId[slot]];
      sum += p.owner[slot] === root ? v : -v;
    }
    return sum;
  }

  private sum(from: number, to: number): Centi {
    const w = this.weights.w;
    const f = this.f;
    let s = 0;
    for (let i = from; i <= to; i++) s += w[i] * f[i];
    return s;
  }

  stage0(p: PackedState, root: Side): Centi {
    extract(p, null, root, 0, SCRATCH0, 0, this.f);
    // `F.Material` is scored from the 18 `material` params, not from `w[0]`.
    return this.materialCc(p, root) + this.sum(F.Rent, F.HomeInvaded);
  }

  stage1(p: PackedState, root: Side, sc: Scratch, ply: number): Centi {
    const t = buildTables(p, sc, ply, 1, this.tables);
    extract(p, t, root, 1, sc, ply, this.f);
    return this.sum(F.PstMine, F.ElementCoverage);
  }

  stage2(p: PackedState, root: Side, sc: Scratch, ply: number): Centi {
    const t = buildTables(p, sc, ply, 2, this.tables);
    extract(p, t, root, 2, sc, ply, this.f);
    return this.sum(F.EconDelta, FEATURE_COUNT - 1);
  }

  /** Phasing bootstrap deliberately evaluates every stage. The old live-only
   * lazy bound does not cover pending escrow/service or chronological releases.
   * Window arguments remain API-compatible; no unproved early exit is used. */
  evaluate(
    p: PackedState,
    root: Side,
    alpha: Centi,
    beta: Centi,
    sc: Scratch,
    ply: number,
    meter: EvalMeter,
  ): Centi {
    const v1 = this.stage0(p, root) + this.stage1(p, root, sc, ply);
    meter.spend(WORK_CLASS_EVAL1, 1);
    void alpha; void beta;
    meter.spend(WORK_CLASS_EVAL2, 1);
    const before = this.tables.economyProverCalls;
    try { return v1 + this.stage2(p, root, sc, ply); }
    finally {
      const calls = this.tables.economyProverCalls - before;
      if (calls > 0) meter.spend(WORK_CLASS_PROVER, calls);
    }
  }

  /** Every stage, unconditionally — the gates' and Texel's entry point. */
  full(p: PackedState, root: Side, sc: Scratch, ply: number, outFeatures?: Int32Array): Centi {
    const score = this.stage0(p, root) + this.stage1(p, root, sc, ply) + this.stage2(p, root, sc, ply);
    if (outFeatures !== undefined) outFeatures.set(this.f);
    return score;
  }

  /** The level-1-or-2 tables the last `stage1`/`stage2`/`full` built. */
  get lastTables(): NodeTables {
    return this.tables;
  }
}

/**
 * What a kill-clock verdict is worth when it is NOT yet forced. A clock ending
 * that lies more than two hand-offs beyond the root can still be reset by
 * either side's next kill, and the interior search is candidate-limited, so a
 * mate-scale score there is an unverified promise: on the ten-ply clock the
 * terminal sits inside the horizon along every quiet line, and the DESKTOP
 * profile preferred "hand the turn back" (clock-out found nine hand-offs deep,
 * scored as a win) over a free capture (2026-09-22, kill-clock lane 5). A
 * distant clock-out is therefore a mild flat preference, like a draw is a flat
 * zero; `DrawPressure` carries the growing urgency. Two-thirds of a tier-1.
 *
 * Coordinator decision (2026-09-24): this is also the desktop VALUE reused
 * under `EvalFix.clockLedger` (`decidedCc` below) for an `open` root reading
 * — the intervals overlap and neither side is established as the clock's
 * winner, so there is no verdict to sign a bigger score with; see
 * `BOUNDED_CLOCK_CC`'s doc for why `bounded-*` earns more but `open` does not.
 */
export const KILL_CLOCK_SOFT_CC: Centi = 200;
/** Hand-offs from the root within which a kill-clock verdict is forced: the
 * mover's own hand-off (1) or the opponent's single reply (2), which the search
 * explores full-width at the top of the tree. */
export const KILL_CLOCK_FORCED_HANDOFFS = 2;

/**
 * STRATEGOS W1.6 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * B.2 step W1.6), `EvalFix.clockLedger` only. CHOICE: `WIN_CC / 8`
 * (125,000 cc). The magnitude of a kill-clock terminal beyond the forced
 * hand-offs whenever the root `ClockReading` (`strategy/clock.ts`) is
 * `bounded-win` or `bounded-loss` — the disjoint interval already holds (one
 * side's stay-put floor beats the other's ceiling) but a kill, an earlier
 * ending or a cancellable arrival is not yet ruled out, so the grade falls
 * short of `proven`.
 *
 * CHOICE, coordinator decision (2026-09-24), superseding W1.6's original
 * "bounded and open alike" brief: an `open` reading (the intervals overlap)
 * no longer gets this score — it gets the flat `KILL_CLOCK_SOFT_CC` instead
 * (`decidedCc` below). The plan itself describes this score as "signed by
 * the verdict", and `open` names no verdict to sign: the root has not
 * established that either side is winning the clock at all, so there is
 * nothing for the sign to track. Paying `WIN_CC / 8` on an open reading
 * reproduced the 2026-09-22 failure one flag later — a 125,000 cc prize on a
 * deep, unverified clock-out that the candidate-limited interior search
 * cannot confirm, which prefers a clock-out found nine hand-offs deep over a
 * free capture available now. `bounded-*` earns the bigger prize precisely
 * because it already has a disjoint interval behind it; `open` has not.
 *
 * Why `WIN_CC / 8` at all: a distant `bounded-*` clock-out is worth more than
 * a tier-1 (the legacy flat `KILL_CLOCK_SOFT_CC` made it worth less, the
 * plan's F1 root cause) but must stay far below a proven ending, since an
 * unproven reading means a kill could still flip or reset the clock before
 * it fires. The sign is always the LEAF's own result relative to the root
 * side, never the reading's own `side`/`verdict` (`decidedCc` below).
 * Falsifier: the paired exam cases plan W1.13 builds, which must score a
 * distant bounded clock-out below a proven one, above an open one, and above
 * a flat draw on the same corpus.
 */
export const BOUNDED_CLOCK_CC: Centi = WIN_CC / 8;

/** The root position's clock, set by the engine when it packs the root. The
 * default makes every direct caller (tests, tools) treat the verdict as forced. */
let killClockRootClock = INACTIVITY_LIMIT - 1;
export function setKillClockRootClock(clock: number): void {
  killClockRootClock = clock;
}

/**
 * STRATEGOS W1.2 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * B.2 step W1.2, "the leak fix"). The per-search kill-clock policy
 * (`strategy/types.ts KillClockPolicy`): `search/root.ts searchRootInner`
 * saves the current value, sets a fresh one scoped to ONE search when
 * `SearchFix.killClockPolicy === 'ledger'` (`hard@strategos` only), and
 * restores the saved value in a `finally` — synchronous end to end, so no
 * search can leak its root clock into a search that runs after it.
 *
 * `null` — every profile but strategos, ALWAYS, `hard@desktop` included —
 * means "this slot has nothing to say"; `killClockHandoffsFromRoot` then
 * falls back to the legacy `killClockRootClock` module slot exactly as it did
 * before this policy existed, leak and all. `hard@desktop`'s bytes are pinned
 * (`tests/lab/ablate.test.ts DESKTOP_WALL3000_HASH`), so that fallback path
 * must never move for any input.
 */
let killClockPolicy: KillClockPolicy | null = null;

/** Sets or clears the per-search kill-clock policy (see `KillClockPolicy`
 * and the field above). `null` restores the legacy-slot fallback. */
export function setKillClockPolicy(policy: KillClockPolicy | null): void {
  killClockPolicy = policy;
}

/** The per-search kill-clock policy currently installed, or `null` when none
 * is (every profile but strategos, always). */
export function getKillClockPolicy(): KillClockPolicy | null {
  return killClockPolicy;
}

/** Hand-offs between the root and the clock's end, given no kill on the way.
 * Reads the per-search policy's `rootClock` when one is installed
 * (`hard@strategos`, W1.2); otherwise reads the legacy module slot exactly as
 * before (`hard@desktop`, always — see `killClockPolicy` above). */
export function killClockHandoffsFromRoot(): number {
  const rootClock = killClockPolicy !== null ? killClockPolicy.rootClock : killClockRootClock;
  return INACTIVITY_LIMIT - rootClock;
}

/**
 * STRATEGOS W1.6. `decidedCc` has no `EvalFix` of its own to read — DESIGN
 * gives `terminalScore` no such parameter, and its signature is pinned
 * (`tests/ai/hard/interfaces.test.ts:962`), so adding one is not an option.
 * The installed `KillClockPolicy.reading` (`strategy/types.ts
 * ClockReadingCore`) is used as the flag's proxy instead: `search/root.ts`
 * installs a NON-null `reading` on exactly the searches that opted into
 * `evalFix.clockLedger` (W1.6's change there), and leaves it `null` on every
 * other search — `hard@desktop` and every other profile, always, even under
 * `searchFix.killClockPolicy === 'ledger'` alone (W1.2) without the eval
 * flag. So gating on "a reading is installed" is exactly gating on the flag,
 * one level removed, and this branch is unreachable whenever the flag is off.
 *
 * WHERE THE TERMINAL LIES. `ply` counts TURNS from the root: `search/pvs.ts`
 * and `search/quiesce.ts` score a child terminal at `ply + 1` per
 * `makeTurn` (one hand-off each), while the turn generator scores a
 * completed candidate turn at its generating node's `ply`, one less. On a
 * kill-free line from a fresh root, `killClockHandoffsFromRoot()` (the
 * root's own hand-offs to the clock's end, the legacy test) IS the clock
 * terminal's distance in turns. A line that kills first restarts the clock,
 * so its clock terminal lies at least `INACTIVITY_LIMIT` turns deep —
 * inside `maxDepth` (12) in principle — and the root's count says nothing
 * about it. The flagged branch therefore calls a terminal "within the forced
 * hand-offs" only when BOTH counts say so: the root's hand-offs (exact on
 * kill-free lines, and immune to the generator's one-turn offset) and the
 * terminal's own `ply` (which rules out the post-kill case).
 *
 * OUTSIDE THE FORCED WINDOW, coordinator decision (2026-09-24): the magnitude
 * further splits on the reading's own grade. `bounded-win`/`bounded-loss`
 * score `BOUNDED_CLOCK_CC` (a disjoint interval is behind them); `open`
 * scores the flat desktop `KILL_CLOCK_SOFT_CC` (no disjoint interval, so no
 * verdict to sign a bigger score with) — see `BOUNDED_CLOCK_CC`'s doc for the
 * full rationale and falsifier. The sign in every case is the LEAF's own
 * result relative to the root side (`terminalScore`'s `root === 0`/`1`
 * branches below), never the installed `reading`'s own `side` or `verdict`.
 */
function decidedCc(p: PackedState, ply: number): Centi {
  if (p.reason === Reason.KILL_CLOCK) {
    const policy = getKillClockPolicy();
    const reading = policy !== null ? policy.reading : null;
    if (reading !== null) {
      const proven = reading.verdict === 'proven-win' || reading.verdict === 'proven-loss';
      const forced = killClockHandoffsFromRoot() <= KILL_CLOCK_FORCED_HANDOFFS && ply <= KILL_CLOCK_FORCED_HANDOFFS;
      if (proven || forced) return WIN_CC - ply * MATE_PLY_CC;
      const bounded = reading.verdict === 'bounded-win' || reading.verdict === 'bounded-loss';
      return bounded ? BOUNDED_CLOCK_CC : KILL_CLOCK_SOFT_CC;
    }
    if (killClockHandoffsFromRoot() > KILL_CLOCK_FORCED_HANDOFFS) return KILL_CLOCK_SOFT_CC;
  }
  return WIN_CC - ply * MATE_PLY_CC;
}

/**
 * `±(WIN_CC − ply · MATE_PLY_CC)` for a decided position, `DRAW_CC` for a
 * draw, `null` while the game is running (DESIGN §4.15, §5.11.1). `ply` is the
 * distance from the root, so a mate found sooner scores higher. A kill-clock
 * verdict more than `KILL_CLOCK_FORCED_HANDOFFS` beyond the root scores
 * `±KILL_CLOCK_SOFT_CC` instead (see there).
 */
export function terminalScore(p: PackedState, root: Side, ply: number): Centi | null {
  switch (p.result) {
    case Result.ONGOING:
      return null;
    case Result.DRAW:
      return DRAW_CC;
    case Result.WHITE_WIN:
      return root === 0 ? decidedCc(p, ply) : -decidedCc(p, ply);
    case Result.BLACK_WIN:
      return root === 1 ? decidedCc(p, ply) : -decidedCc(p, ply);
    default: {
      const never: never = p.result;
      throw new Error(`terminalScore: unknown result ${String(never)}`);
    }
  }
}
