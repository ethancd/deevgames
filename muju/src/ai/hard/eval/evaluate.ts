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
 */
export const KILL_CLOCK_SOFT_CC: Centi = 200;
/** Hand-offs from the root within which a kill-clock verdict is forced: the
 * mover's own hand-off (1) or the opponent's single reply (2), which the search
 * explores full-width at the top of the tree. */
export const KILL_CLOCK_FORCED_HANDOFFS = 2;

/**
 * STRATEGOS W1.6 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
 * B.2 step W1.6), `EvalFix.clockLedger` only. CHOICE: `WIN_CC / 8`
 * (125,000 cc). A kill-clock terminal whose root `ClockReading`
 * (`strategy/clock.ts`) is only BOUNDED — the disjoint mined-total interval
 * holds, but a kill or an earlier ending (home victory, upkeep elimination)
 * is not yet ruled out — is worth more than `KILL_CLOCK_SOFT_CC`'s flat
 * two-hand-off preference, because the reading has already established the
 * disjoint interval `KILL_CLOCK_SOFT_CC`'s legacy path never computes; but it
 * must stay far below `WIN_CC` scale, since "bounded" means precisely that a
 * kill could still flip the verdict before the clock fires. Falsifier: the
 * paired exam cases plan W1.13 builds, which must score a bounded verdict
 * below a proven one and above a flat draw on the same corpus.
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
 */
function decidedCc(p: PackedState, ply: number): Centi {
  if (p.reason === Reason.KILL_CLOCK) {
    const policy = getKillClockPolicy();
    const reading = policy !== null ? policy.reading : null;
    if (reading !== null) {
      const proven = reading.verdict === 'proven-win' || reading.verdict === 'proven-loss';
      if (proven || killClockHandoffsFromRoot() <= KILL_CLOCK_FORCED_HANDOFFS) return WIN_CC - ply * MATE_PLY_CC;
      return BOUNDED_CLOCK_CC;
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
