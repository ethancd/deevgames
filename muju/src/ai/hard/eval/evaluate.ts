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
  Result,
  WIN_CC,
  type Centi,
  type PackedState,
  type Side,
} from '../types';
import { Scratch } from '../core/bits';
import type { Replica } from '../core/state';
import type { ReachMemo } from '../core/movement';
import { allocTables, buildTables, type NodeTables } from '../tables/context';
import type { EvalFix, Weights } from '../config';
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
 * `±(WIN_CC − ply · MATE_PLY_CC)` for a decided position, `DRAW_CC` for a
 * draw, `null` while the game is running (DESIGN §4.15, §5.11.1). `ply` is the
 * distance from the root, so a mate found sooner scores higher.
 */
export function terminalScore(p: PackedState, root: Side, ply: number): Centi | null {
  switch (p.result) {
    case Result.ONGOING:
      return null;
    case Result.DRAW:
      return DRAW_CC;
    case Result.WHITE_WIN:
      return root === 0 ? WIN_CC - ply * MATE_PLY_CC : -(WIN_CC - ply * MATE_PLY_CC);
    case Result.BLACK_WIN:
      return root === 1 ? WIN_CC - ply * MATE_PLY_CC : -(WIN_CC - ply * MATE_PLY_CC);
    default: {
      const never: never = p.result;
      throw new Error(`terminalScore: unknown result ${String(never)}`);
    }
  }
}
