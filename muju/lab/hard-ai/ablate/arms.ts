/**
 * The E1.3 ablation arm registry (EPIC-PLAN §4 E1.3, §5 campaign 3).
 *
 * E1.3 asks for "explicit K=24/96, action-width, placement-width and scoring
 * variants" with "one factor changes per arm; full configurations recorded".
 * This module is that list: a frozen table of named arms, each a
 * `Partial<HardConfig>` patch over `DESKTOP` that moves exactly ONE named
 * generator factor, with the factor named on the arm and the resolved
 * configuration hash (`ladder/identity.ts`) available per arm.
 *
 * LAB-ONLY. Nothing here changes an engine default, the `DESKTOP` shape, the
 * evaluation or a gate. `hard@desktop` resolves exactly as it did before this
 * module existed (`tests/lab/ablate.test.ts` pins its hash), and an arm reaches
 * an engine only through the `hard@ablate:<arm>` label.
 *
 * THE FIVE FACTORS. `src/ai/hard/config.ts`'s `ProfileShape` exposes five
 * generator knobs, and `makeConfig` spends them on two `GenConfig`s — `gen`
 * (the ROOT node) and `genInterior` (every ply ≥ 1, which is where the
 * opponent-reply node lives; `search/pvs.ts generateAt` picks
 * `ply === 0 ? s.gen : s.genInterior`):
 *
 * | factor         | `DESKTOP` | reaches                                   |
 * | ---            | ---       | ---                                       |
 * | `K`            | 24        | `gen.K` — the root candidate list          |
 * | `kInterior`    | 16        | `genInterior.K` — the reply/interior list  |
 * | `widths`       | [6,4,3,2] | `gen.action.widths` AND `genInterior`'s    |
 * | `placePlans`   | 24 / 12   | `gen.maxPlacePlans` / `genInterior`'s      |
 *
 * `widths` and `placePlans` are ONE knob of the shape each, spent on both
 * generators by `makeConfig`; an arm that moved only the root half of one of
 * them would be a different configuration from any device profile the game can
 * ship, so the arms move the SHAPE knob and the doc says so. `K` and
 * `kInterior` are already two separate knobs of the shape, so they are two
 * separate arms — which is what makes `reply-wide` (interior only) meaningful
 * next to `k48`/`k96` (root only).
 *
 * K IS ROOT-ONLY BY DECISION. `k48`/`k96` hold `kInterior` at 16 rather than
 * scaling it with `K`. Campaign 3 names the arm "K-only 24→96", and scaling
 * both would move root breadth and reply breadth together — the two things
 * E1.3 exists to separate, given E1.1's `reply-missed` classification. The cost
 * is that `k96` is not "the DESKTOP shape at K=96"; it is "the DESKTOP shape
 * with a 96-wide root". That is the arm the campaign asked for.
 *
 * NO `score-stage2-root` ARM. E1.3's scoring variant — full stage-2 evaluation
 * before the root truncation — has no configuration flag to move.
 * `GenConfig` carries no scorer, and the within-turn score is wired in code:
 * `src/ai/hard/engine.ts` and `lab/hard-ai/recall/run.ts` both build it as
 * `stage0 + stage1` (DESIGN §5.4) and hand it to `TurnGenerator.generate` as a
 * callback. Making the root score with `Evaluator.full` is a CODE change to the
 * scoring callback and its cost model, which EPIC-PLAN puts in E2.3 ("Root
 * breadth experiment … selective stage-2/reply reranking"). It is therefore
 * omitted here rather than faked; see `docs/hard-ai/e1/E1.3-ABLATIONS.md`.
 */
import { DESKTOP, type EvalFix, type GenConfig, type HardConfig, type SearchFix, type Weights } from '../../../src/ai/hard/config';
import { DEFAULT_WEIGHTS, assertCurrentWeights, cloneWeights, weightsHash } from '../../../src/ai/hard/eval/weights';
import { F, FEATURE_NAMES } from '../../../src/ai/hard/eval/features';
import { EVAL_GROUPS, INVARIANT_FEATURES, STAGE2_FEATURES } from '../audit/eval-groups';
import { resolvedConfigHash } from '../ladder/identity';
import type { WorkSpec } from '../ladder/engines';

/**
 * The one knob an arm is allowed to move. `none` is `base`.
 *
 * The first four are generator knobs (E1.3). `time` is E1.5's addition: the
 * `TimeConfig` block, which is where the E1.4 §5 patch lives
 * (`time.calibrateCold`). It is a factor like the others — one arm moves it,
 * nothing else does, and `maskFactor` restores the whole block — even though
 * it changes time ALLOCATION rather than generator breadth, so the one-factor
 * invariant covers the calibration arm exactly as it covers `k96`.
 *
 * `weights` is E3.1 lane 5's addition: the whole `Weights` vector. Such an arm
 * replaces it with `DEFAULT_WEIGHTS` with one named set of `w[]` entries set to
 * zero — a feature GROUP for lane 5's six arms, one SUB-BLOCK of the safety
 * group for E3.2 lane 11's three — nothing else does, and `maskFactor` restores
 * the whole vector. It changes JUDGMENT rather than breadth or allocation; the
 * one-factor invariant covers it exactly as it covers `calib`.
 *
 * `searchFix` is E4.2 lane 3's addition: the whole `HardConfig.searchFix` block
 * (`config.ts SearchFix`, the E4 search flags). It is ONE factor for the same
 * reason `evalFix` is one for the bundle that sets five flags — `factorsOf`
 * serialises the whole block and `maskFactor` restores the whole block — and it
 * changes how the search RESOLVES a choice, not what the evaluator believes
 * about a position or how much of the tree it looks at.
 *
 * `evalFix` is E3.2 lane 12's addition: the whole `HardConfig.evalFix` block
 * (`config.ts EvalFix`, the five correctness flags B1-B5 of
 * `docs/hard-ai/e3/E3.1-SYNTHESIS.md` §5). It is ONE factor even for the
 * bundle that sets all five, for the same reason `time` is one factor for an
 * arm that sets `calibrateCold` — `factorsOf` serialises the whole block and
 * `maskFactor` restores the whole block, so an arm that moved a flag AND
 * something else is still caught. It changes what the evaluator BELIEVES about
 * a position, not how much of the tree it looks at.
 *
 * `searchFix` is E4's addition and the twin of `evalFix` on the search side:
 * the whole `HardConfig.searchFix` block (`config.ts SearchFix`). ONE factor
 * however many keys an arm sets, for the reason `evalFix` is one —
 * `factorsOf` serialises the whole block and `maskFactor` restores the whole
 * block, so an arm that moved a key AND something else is still caught. It
 * changes how the search SPENDS its rung, not what the evaluator believes.
 */
export type ArmFactor =
  | 'none'
  | 'K'
  | 'kInterior'
  | 'widths'
  | 'placePlans'
  | 'time'
  | 'iterationGate'
  | 'weights'
  | 'evalFix'
  | 'searchFix'
  | 'combined';

export interface AblationArm {
  /** Registry key; the engine label is `hard@ablate:<name>`. */
  readonly name: string;
  /** The single knob this arm moves away from `DESKTOP`. */
  readonly factor: ArmFactor;
  /** One line, for the comparison table and the doc. */
  readonly change: string;
  /** The patch `hard@ablate:<name>` applies over `DESKTOP`. */
  readonly patch: Readonly<Partial<HardConfig>>;
  /**
   * `resolvedConfigHash('hard@ablate:<name>', ARM_HASH_WORK)` — the sha256 of
   * the configuration the ladder adapter actually applies (E0.1). Computed on
   * first read and memoised: `arms.ts -> identity.ts -> bots/hard.ts ->
   * arms.ts` is an import cycle, so a hash computed while this module's body is
   * still running would touch `identity.ts`'s module-scope constants inside
   * their temporal dead zone. Every read after load returns the same string.
   */
  readonly configHash: string;
  /**
   * False when the recall instrument cannot see this arm: it generates every
   * ROOT item with `gen`, so an arm that moves only `genInterior` changes
   * nothing at a root. `--reply-node-gen interior` is what makes such an arm
   * measurable (see `recall/run.ts`).
   */
  readonly rootDiagnostic: boolean;
}

/** The work spec every arm's `configHash` is taken at: E1's equal-time rung. */
export const ARM_HASH_WORK: WorkSpec = { mode: 'wall', ms: 3000 };

/** `DESKTOP`'s widths, the baseline every width arm steps from. */
export const BASE_WIDTHS: readonly number[] = [6, 4, 3, 2];

function withGen(base: GenConfig, over: { K?: number; maxPlacePlans?: number; widths?: readonly number[] }): GenConfig {
  return {
    K: over.K ?? base.K,
    maxPlacePlans: over.maxPlacePlans ?? base.maxPlacePlans,
    action:
      over.widths === undefined
        ? base.action
        : { widths: Int32Array.from(over.widths), keep: base.action.keep, ttBits: base.action.ttBits },
    purchase: base.purchase,
    maxPromotions: base.maxPromotions,
    reference: base.reference,
  };
}

/** Root candidate count only (`K`, `gen.K`); `kInterior` held at DESKTOP's 16. */
function rootK(k: number): Partial<HardConfig> {
  return { K: k, gen: withGen(DESKTOP.gen, { K: k }) };
}

/** Interior candidate count only (`kInterior`, `genInterior.K`). */
function interiorK(k: number): Partial<HardConfig> {
  return { kInterior: k, genInterior: withGen(DESKTOP.genInterior, { K: k }) };
}

/** The shape's `widths`, spent on both generators exactly as `makeConfig` does. */
function widths(w: readonly number[]): Partial<HardConfig> {
  return { gen: withGen(DESKTOP.gen, { widths: w }), genInterior: withGen(DESKTOP.genInterior, { widths: w }) };
}

/**
 * E1.5: the `TimeConfig` block with the cold-calibration flag on (the E1.4 §5
 * patch). Written as a whole `time` object rather than a nested partial because
 * `hardConfigFor` composes an arm patch with a plain `{ ...DESKTOP, ...patch }`
 * spread (`bots/hard.ts`, `ladder/identity.ts`), so a `time` key REPLACES
 * DESKTOP's block instead of merging into it; spreading `DESKTOP.time` first
 * keeps `minMs`/`maxMs`/`baseMs`/`abortFactor` at the champion's values, which
 * `maskFactor` then checks by restoring the block wholesale.
 */
function calibrateCold(): Partial<HardConfig> {
  return { time: { ...DESKTOP.time, calibrateCold: true } };
}

/**
 * E2 lane 1's work-fit arm: the same `TimeConfig` block with `chooseWork`
 * quantising onto the √2 ladder instead of the ×2 one (`search/time.ts
 * WORK_LADDER_FINE`). Written as a whole `time` object for the same reason
 * `calibrateCold` is — `hardConfigFor` spreads an arm patch over `DESKTOP`, so
 * a `time` key REPLACES the block rather than merging into it.
 *
 * It moves time ALLOCATION only, and only in WALL mode: under fixed work
 * nothing calls `chooseWork` at all, so the arm is invisible to the recall
 * instrument, to `hard:determinism` and to every fixed-work test.
 */
function workFit(): Partial<HardConfig> {
  return { time: { ...DESKTOP.time, ladderStep: 'sqrt2' } };
}

/**
 * E2 lane 1's deepening-gate arm: `iterativeDeepening` starts the next depth
 * when it is PREDICTED to fit instead of when `used ≤ 0.45 × limit`
 * (`search/pvs.ts shouldDeepen`). One field, and unlike the two `time` arms it
 * is a SEARCH field, so it applies in fixed-work mode as well as wall — which
 * is what makes it visible to a fixed-work instrument.
 */
function deepGate(): Partial<HardConfig> {
  return { iterationGate: 'predicted' };
}

/** E2 lane 1's combined arm: the √2 ladder AND the predicted gate. Two factors
 * on purpose (`factorsOf` reports `time` + `iterationGate`), so it is
 * registered as a `combined` arm and the one-factor invariant does not claim
 * it; it exists because the probe says neither half moves completed depth
 * alone. */
function workFitDeep(): Partial<HardConfig> {
  return { time: { ...DESKTOP.time, ladderStep: 'sqrt2' }, iterationGate: 'predicted' };
}

/**
 * E2.2's interior-only width arm. `makeConfig` spends ONE shape knob on both
 * generators, so `widths` normally moves root and interior together; this moves
 * `genInterior.action.widths` alone and leaves `gen` at DESKTOP's `[6,4,3,2]`.
 *
 * That is a configuration no device profile ships, and it is deliberate: E2.2's
 * stage trace found 20 of 21 missing reply targets removed by the interior
 * ACTION BEAM and 0 by `K` (`docs/hard-ai/e2/E2.2-COVERAGE-TRACE.md` §7), while
 * 28 of 28 root targets were already in the root list. Widening the root half
 * would therefore buy nothing the trace can see and cost time at every root
 * node. `factorsOf` still reports one moved factor (`widths`, whose string
 * carries both halves) and `maskFactor` still restores both, so the one-factor
 * invariant covers it exactly as it covers `action-width-wide`.
 */
function interiorWidths(w: readonly number[]): Partial<HardConfig> {
  return { genInterior: withGen(DESKTOP.genInterior, { widths: w }) };
}

/** E2.2's interior-only placement arm; the root's `maxPlacePlans` stays at DESKTOP's. */
function interiorPlacePlans(n: number): Partial<HardConfig> {
  return { genInterior: withGen(DESKTOP.genInterior, { maxPlacePlans: n }) };
}

/** The shape's placement breadth, root and interior together. */
function placePlans(root: number, interior: number): Partial<HardConfig> {
  return {
    gen: withGen(DESKTOP.gen, { maxPlacePlans: root }),
    genInterior: withGen(DESKTOP.genInterior, { maxPlacePlans: interior }),
  };
}

/**
 * The vector every `weights` arm is derived from, by label.
 *
 * DERIVED, NOT LITERAL, since the Phasing port. The arms used to hard-code the
 * prefix `default-v1`, the label of the Standard-era champion vector. M6
 * replaced `DEFAULT_WEIGHTS` with the accounting bootstrap
 * (`phasing-accounting-bootstrap-v1`, `docs/hard-ai/phasing/M6-BOOTSTRAP-CONTRACT.md`),
 * so a literal prefix would have made `default-v1-no-safety` name a vector that
 * is NOT `default-v1` minus safety — and a Phasing row would have been
 * indistinguishable by label from the Standard rows under
 * `lab/results/hard-ai-e3/**` that carry exactly that string. That is the
 * confusion `ladder/identity.ts` put the rules revision inside every resolved
 * configuration hash to prevent (its header, clause 3); the label now follows
 * the same rule. Arm labels therefore read
 * `phasing-accounting-bootstrap-v1-no-safety` on this tree, and move again with
 * the base vector rather than silently outliving it.
 */
export const BASE_WEIGHTS_LABEL = DEFAULT_WEIGHTS.label;

/** `<base label>-<suffix>`; the only place an arm label is spelled. */
export function armWeightsLabel(suffix: string): string {
  return `${BASE_WEIGHTS_LABEL}-${suffix}`;
}

/**
 * A weights arm's one-line `change`, COUNTED AND NAMED FROM THE LIVE INDEX SET.
 *
 * These lines used to be hand-written ("the 13 economy weights zeroed (Rent,
 * …)"). M6 added four Phasing features to `EVAL_GROUPS` — `PendingValue` and
 * `RentShortfall` to economy, `ArrivalThreat` and `DisruptPressure` to safety —
 * and every such line silently became a false statement about the arm the
 * runner was about to print it next to. Deriving both the count and the names
 * from the same array the patch zeroes makes that impossible.
 */
function zeroedChange(what: string, indices: readonly number[], tail: string): string {
  return `the ${indices.length} ${what} zeroed (${indices.map(i => FEATURE_NAMES[i]).join(', ')}); ${tail}`;
}

/**
 * Seals an arm's `w[]` into a full schema-v2 `Weights` and checks the runtime
 * boundary before anything can search with it.
 *
 * `material`, `version` and `featureSchema` are carried from the base vector
 * verbatim: an arm prices a JUDGMENT change, never a catalogue or a schema one.
 * `assertCurrentWeights` is called here rather than left to `new Evaluator`
 * because an arm that failed it used to surface as a lab CLI crash deep inside
 * an engine constructor with no arm name in the message.
 */
function finishArmWeights(base: Weights, w: Int32Array, label: string): Weights {
  if (base.version === 0) throw new Error('ablate arms: DEFAULT_WEIGHTS must not be version 0');
  const weights: Weights = Object.freeze({
    w,
    material: base.material,
    version: base.version,
    featureSchema: base.featureSchema,
    label,
  });
  assertCurrentWeights(weights);
  return weights;
}

/**
 * E3.1 lane 5's group-ablation patch: `DEFAULT_WEIGHTS` with the `w[]` entries
 * of one feature group set to zero, under a label that names the group.
 *
 * WHY A WHOLE VECTOR. `hardConfigFor` composes an arm patch with a plain
 * `{ ...DESKTOP, ...patch }` spread, so a `weights` key REPLACES the profile's
 * vector rather than merging into it — the same reason the two `time` arms are
 * written as whole blocks. Replacing it is also what makes the arm reach an
 * engine at all: `DESKTOP.weights` is M4's `placeholder-m4` (58 zeros,
 * `version: 0`) and `bots/hard.ts hardEnginePatch` substitutes
 * `DEFAULT_WEIGHTS` for a version-0 vector and KEEPS any other vector as given
 * (`hardEnginePatch`, `lab/hard-ai/bots/hard.ts`). So `version` stays at
 * `WEIGHTS_VERSION` here (`cloneWeights` carries it over): a version-0 arm
 * vector would be silently replaced by the champion's and the arm would be a
 * second copy of `base` (E0's I2 lesson).
 *
 * WHY `material` IS NEVER ZEROED. Two reasons, one of them a code fact:
 *
 *  - Zeroing the 18 `material` params would leave the engine unable to see a
 *    capture at all. Every other feature is a modifier on a material picture;
 *    without the picture the arm measures "an engine that cannot count", not
 *    "the champion without a concept", and its rows would price nothing.
 *  - `w[F.Material]` is INERT in the shipped evaluator anyway.
 *    `Evaluator.stage0` scores the material block from `weights.material`
 *    directly (`src/ai/hard/eval/evaluate.ts:122-126`, `materialCc`) and
 *    `sum(F.Rent, F.HomeInvaded)` starts at feature 1, so `w[F.Material] = 100`
 *    (`src/ai/hard/eval/weights.ts:56`) is read by nothing in `src/ai/hard/**`.
 *    An `eval-no-material` arm that zeroed `w[F.Material]` would therefore be a
 *    BYTE-IDENTICAL player to `base` with a different config hash — a silent
 *    A/A row. The `material` group is consequently not an arm.
 *
 * WHAT A ZEROED GROUP ALSO CHANGES. `boundStage2`
 * (`src/ai/hard/eval/features.ts:555-568`) sums the ABSOLUTE stage-2 weights,
 * so zeroing a stage-2 weight shrinks the lazy-evaluation bound and the
 * evaluator exits at stage 1 more often. A weights arm is therefore cheaper per
 * node as well as blinder, and a fixed-work row reads the two together. The doc
 * (`docs/hard-ai/e3/E3.1-GROUP-ABLATION.md`) says so where it reports the rows.
 *
 * SCHEMA v2 (Phasing, M6). `Weights` grew a `featureSchema` field and the
 * runtime boundary `assertCurrentWeights` (`src/ai/hard/eval/weights.ts`)
 * refuses any vector that does not carry `PHASING_EVAL_SCHEMA` at
 * `WEIGHTS_VERSION`. Before this port the arms rebuilt the object field by
 * field and dropped `featureSchema` on the floor, so every weights arm threw
 * "Phasing weight schema/version mismatch" the moment it reached a live
 * `Evaluator`. `finishArmWeights` below is now the ONLY way this module mints a
 * vector, and it asserts the boundary itself so a third field added to the
 * schema fails here rather than inside an engine constructor.
 */
function zeroWeights(group: string, indices: readonly number[]): Partial<HardConfig> {
  const base = cloneWeights(DEFAULT_WEIGHTS);
  const w = Int32Array.from(base.w);
  for (const i of indices) w[i] = 0;
  return { weights: finishArmWeights(base, w, armWeightsLabel(`no-${group}`)) };
}

/**
 * E3.2 lane 11: the SAFETY group cut into three descriptive sub-blocks.
 *
 * `EVAL_GROUPS.safety` is 19 features and `eval-no-safety` zeroes all of them
 * at once, so lane 5's +338 at fixed work cannot say WHICH part of the block
 * carries it (`E3.1-GROUP-ABLATION.md`, "What this lane did not measure": "No
 * within-group ablation"). `E3.1-SYNTHESIS.md` §4, second bullet, names the
 * three-way split below and asks for three fixed-work sub-arms on the same
 * four `e1-dev` openings.
 *
 * The three sets PARTITION `EVAL_GROUPS.safety` exactly: every safety feature
 * is in exactly one, and nothing outside the group is in any
 * (`tests/lab/ablate.test.ts`, "the three safety sub-arms partition the safety
 * group exactly"). The indices are written out as `F.*` names rather than
 * sliced out of `EVAL_GROUPS.safety` by position, so a reordering of the
 * coordinator's partition cannot silently re-cut the sub-blocks; the test
 * compares the union with the group and fails if it ever does.
 *
 * The split is by what the feature is about, not by index range:
 *
 * - THE THREAT STACK — the ten cc-scale terms that price a body under threat
 *   (`Exposure` at stage 1, and the stage-2 refinements DESIGN row 17
 *   calls a refinement of it). This is the block the E3.2 concept is about.
 * - THE ANCHOR PAIR PLUS `Inv6` — `AnchorFragility`, `BlockingDeficit` and the
 *   invariant that penalises the same fragile anchor.
 * - THE EIGHT REMAINING SAFETY INVARIANTS — DESIGN §5.13's flat penalties that
 *   the safety group owns, less `Inv6FragileAnchor`, which travels with the
 *   anchor pair it duplicates.
 *
 * PHASING (M6) ADDED TWO. `EVAL_GROUPS.safety` grew from 19 to 21 with
 * `ArrivalThreat` (59) and `DisruptPressure` (60), the two cc-scale terms the
 * Phasing pending-summon accounting adds (`eval/features.ts`, the
 * `pending.arrivalThreatCc` / `pending.disruptPressureCc` block). Both price a
 * body under threat in cc — one the threat an ARRIVING unit will make, one the
 * pressure to disrupt a pending arrival — so both join the threat stack rather
 * than the anchor pair (they say nothing about a spawn anchor) or the invariant
 * block (they are not DESIGN §5.13 flat penalties). Leaving them out of all
 * three would have broken the partition, which is exactly what
 * `tests/lab/ablate.test.ts` caught.
 */
const SAFETY_THREAT_STACK: readonly number[] = Object.freeze([
  F.Exposure,
  F.Hanging,
  F.HangingBuy,
  F.ApproachRetreat,
  F.ApproachStrand,
  F.StrandPunish,
  F.KillAvailable,
  F.CleaveExposure,
  F.ArrivalThreat,
  F.DisruptPressure,
]);

const SAFETY_ANCHOR: readonly number[] = Object.freeze([F.AnchorFragility, F.BlockingDeficit, F.Inv6FragileAnchor]);

const SAFETY_INVARIANTS: readonly number[] = Object.freeze([
  F.Inv3RetreatSquare,
  F.Inv4StrandUnpunished,
  F.Inv8NoPreAdjacency,
  F.Inv9ChipAcrossTurn,
  F.Inv12CleaveLine,
  F.Inv17SelfBlock,
  F.Inv19SoftMinerExposed,
  F.Inv20StrandNoRetreat,
]);

interface ArmSpec {
  name: string;
  factor: ArmFactor;
  change: string;
  patch: Partial<HardConfig>;
  rootDiagnostic?: boolean;
}

/**
 * Freezes one arm, giving `configHash` a memoising getter (see the field doc).
 * The getter is the "recorded at registration" of E1.3's "full configurations
 * recorded": it is defined here, it takes its value from `identity.ts`, and it
 * cannot be set from outside.
 */
function registerArm(spec: ArmSpec): AblationArm {
  let hash: string | null = null;
  const arm = {
    name: spec.name,
    factor: spec.factor,
    change: spec.change,
    patch: Object.freeze({ ...spec.patch }),
    rootDiagnostic: spec.rootDiagnostic ?? true,
  } as AblationArm;
  Object.defineProperty(arm, 'configHash', {
    enumerable: true,
    get(): string {
      hash ??= resolvedConfigHash(`hard@ablate:${spec.name}`, ARM_HASH_WORK);
      return hash;
    },
  });
  return Object.freeze(arm);
}

/**
 * The arms, in report order. `base` first so every table reads against it.
 *
 * The step sizes: `k48`/`k96` are campaign 3's "K-only 24→96" with its
 * midpoint; the width arms are one step wider and one step narrower at every
 * depth (narrow is PHONE's `[4,3,2,1]`, which is a shape the game really
 * ships); the place arms double and halve the shape's placement breadth;
 * `reply-wide` doubles the interior list the reply node is generated from.
 */
const SPECS: ArmSpec[] = [
  { name: 'base', factor: 'none', change: 'DESKTOP unchanged', patch: {} },
  { name: 'k48', factor: 'K', change: 'K 24 → 48 (kInterior held at 16)', patch: rootK(48) },
  { name: 'k96', factor: 'K', change: 'K 24 → 96 (kInterior held at 16)', patch: rootK(96) },
  {
    name: 'action-width-wide',
    factor: 'widths',
    change: 'action widths [6,4,3,2] → [8,6,4,3]',
    patch: widths([8, 6, 4, 3]),
  },
  {
    name: 'action-width-narrow',
    factor: 'widths',
    change: 'action widths [6,4,3,2] → [4,3,2,1]',
    patch: widths([4, 3, 2, 1]),
  },
  // Rebased 2026-09-23 when DESKTOP's place plans went 16/8 → 24/12 (per-class
  // pinned purchase plans): each arm keeps its ratio to DESKTOP (×2, ×½).
  { name: 'place-wide', factor: 'placePlans', change: 'place plans 24/12 → 48/24', patch: placePlans(48, 24) },
  { name: 'place-narrow', factor: 'placePlans', change: 'place plans 24/12 → 12/6', patch: placePlans(12, 6) },
  {
    name: 'reply-wide',
    factor: 'kInterior',
    change: 'kInterior 16 → 32 (the reply/interior node only)',
    patch: interiorK(32),
    rootDiagnostic: false,
  },
  {
    name: 'interior-action-wide',
    factor: 'widths',
    change: 'action widths [6,4,3,2] → [10,6,4,2] at the REPLY/interior node only (root gen unchanged). E2.2 arm: the trace attributes 20 of 21 missing reply targets to the interior action beam',
    patch: interiorWidths([10, 6, 4, 2]),
    rootDiagnostic: false,
  },
  {
    name: 'interior-place-wide',
    factor: 'placePlans',
    // Rebased 2026-09-23 (DESKTOP interior 8 → 12): the arm keeps its ×1.5.
    change: 'place plans 24/12 → 24/18 (the REPLY/interior node only). E2.2 arm: 5 traced reply misses had a buy set inside planCount 12 but outside comboCount 8',
    patch: interiorPlacePlans(18),
    rootDiagnostic: false,
  },
  {
    name: 'calib',
    factor: 'time',
    change: 'time.calibrateCold false → true (seed the cold device profile from a 25k-unit timed probe search). REJECTED 2026-09-16 by its preregistered rule (E1.5-CALIB-ARM.md: -27 Elo, mechanism confirmed); kept registered, never default',
    patch: calibrateCold(),
    // The recall instrument funds every item with fixed work and reads only
    // `gen`/`genInterior` off the arm, so it cannot see a time-allocation
    // change at all — at a root item or anywhere else. `calib` is priced by
    // the equal-time ladder row in `docs/hard-ai/e1/E1.5-CALIB-ARM.md`, not by
    // a recall column.
    rootDiagnostic: false,
  },
  {
    name: 'work-fit',
    factor: 'time',
    change:
      'time.ladderStep unset → sqrt2 (chooseWork quantises the wall-mode rung onto the √2 ladder: 25k, 35k, 50k, 71k, 100k, 141k, 200k, 283k, 400k, …). E2 lane 1: the E1 baseline seat spent a mean 1,951 ms of its 3,000 ms allowance, 57% of turns under 2,200 ms — the ×2 ladder leaving a third of the allowance unspent',
    patch: workFit(),
    // Wall-mode only, and the recall instrument funds every item with fixed
    // work — the same blindness that makes `calib` a ladder-priced arm.
    rootDiagnostic: false,
  },
  {
    name: 'deep-gate',
    factor: 'iterationGate',
    change:
      'iterationGate unset → predicted (start the next depth when used + lastIterationWork × measured ratio ≤ limit, instead of when used ≤ 0.45 × limit). E2 lane 1: the work-fit probe raised work 1.36× without moving completed depth, because the 0.45 rule refused the next iteration at every position',
    patch: deepGate(),
  },
  {
    name: 'work-fit-deep',
    factor: 'combined',
    change:
      'time.ladderStep sqrt2 AND iterationGate predicted — the rung that fits the allowance plus the gate that will spend it. TWO factors by design; the one-factor arms are work-fit and deep-gate',
    patch: workFitDeep(),
    rootDiagnostic: false,
  },
  // --- E4.3 candidate B (lane 5): the iteration-cost estimator --------------
  {
    name: 'search-iter-fit',
    factor: 'searchFix',
    change:
      'searchFix.iterFit unset → true (fund the next iteration when THIS turn\'s own per-step cost predicts it fits the remaining rung within a 1.25 margin — the previous wall-funded turn\'s measurement of the same step as the prior — and, when it does not fit, spend the remainder on a partial iteration that may publish only if it completed its principal variation). E2 lane 1 measured the estimator it replaces: a single previous-iteration ratio clamped at 6, against per-step medians of 12.32 (depth 1→2, n=19) and 3.02 (depth 2→3, n=17) over 126 pairs, so the clamp still over-predicts and refuses iterations the rung would have paid for',
    patch: searchFixPatch({ iterFit: true }),
    // A SEARCH field, like `iterationGate` and unlike the two `time` arms: the
    // rung is the budget in fixed-work mode too, so a fixed-work instrument
    // sees this arm.
    rootDiagnostic: true,
  },
  // --- E3.1 lane 5: the weight-group arms -----------------------------------
  //
  // One arm per feature group of `lab/hard-ai/audit/eval-groups.ts` (the
  // coordinator's partition of the 58 features), plus the two cross-cutting
  // cuts E3.1 asks for: all twenty invariants, and all of stage 2.
  //
  // The six are NOT a partition of each other. `eval-no-invariants` (features
  // 38-57) overlaps every group — each group owns some invariants — and
  // `eval-stage01` (features 23-57) is a superset of `eval-no-invariants`.
  // They answer different questions and their rows are read separately, never
  // added up.
  //
  // `rootDiagnostic: true` on all six (E3 lane 15, amendment A13-1). It was
  // `false` while `lab/hard-ai/recall/run.ts` built its own
  // `new Evaluator(this.rep)` with no weights argument — `DEFAULT_WEIGHTS`
  // whatever `--arm` said — which made a weights arm an A/A run against `base`
  // in every recall column, root and reply alike. Lane 13's A8 / L5-A1 fix
  // ended that: `recallEnginePatch(arm)` resolves the arm's weight vector and
  // stamps it on the evaluator and on both `NodeTables`, so a weights arm now
  // moves real recall columns (measured on 20 root + 10 reply positions of
  // `fuzz-1000.jsonl`: `eval-no-safety` top1 .30 -> .35, replyTop1 .20 -> .30,
  // regret_p90 1,432 -> 931 cc). These arms are also read by `hard:exam` and by
  // fixed-work ladder rows. What a weights arm does NOT get is a fixed
  // yardstick: its own evaluator scores the depth-2 leaves, so two weights arms
  // are not ranked against one truth the way two generator arms are
  // (`ablate/run.ts formatComparison` prints that sentence under the table).
  {
    name: 'eval-no-economy',
    factor: 'weights',
    change:
      zeroedChange('economy weights', EVAL_GROUPS.economy, 'material untouched'),
    patch: zeroWeights('economy', EVAL_GROUPS.economy),
    rootDiagnostic: true,
  },
  {
    name: 'eval-no-home',
    factor: 'weights',
    change:
      zeroedChange('home weights', EVAL_GROUPS.home, 'material untouched'),
    patch: zeroWeights('home', EVAL_GROUPS.home),
    rootDiagnostic: true,
  },
  {
    name: 'eval-no-safety',
    factor: 'weights',
    change:
      zeroedChange('safety weights', EVAL_GROUPS.safety, 'material untouched'),
    patch: zeroWeights('safety', EVAL_GROUPS.safety),
    rootDiagnostic: true,
  },
  {
    name: 'eval-no-space',
    factor: 'weights',
    change:
      zeroedChange('space-and-tempo weights', EVAL_GROUPS.space, 'material untouched'),
    patch: zeroWeights('space', EVAL_GROUPS.space),
    rootDiagnostic: true,
  },
  {
    name: 'eval-no-invariants',
    factor: 'weights',
    change:
      'all 20 invariant penalties zeroed (features 38-57, DESIGN §5.13). Cuts across the four group arms rather than partitioning with them',
    patch: zeroWeights('invariants', INVARIANT_FEATURES),
    rootDiagnostic: true,
  },
  {
    name: 'eval-stage01',
    factor: 'weights',
    change:
      'every stage-2 weight zeroed (features 23-57, EconDelta through Inv20StrandNoRetreat): stage 0 and stage 1 judgment only. `Evaluator.stage2` still runs and still costs work; its sum is 0 and `boundStage2` is 0, so the lazy stage-1 exit fires at every node',
    patch: zeroWeights('stage2', STAGE2_FEATURES),
    rootDiagnostic: true,
  },
  // --- E3.2 lane 11: the safety group's three sub-arms ----------------------
  //
  // A partition of `eval-no-safety`'s 19 weights into three descriptive
  // sub-blocks (E3.1-SYNTHESIS.md §4, second bullet). Their rows are fixed-work
  // rows on the four `e1-dev` development openings, they enter no ledger, and
  // they retain nothing: they exist to say which part of the safety block
  // carries lane 5's +338, not to price a candidate.
  //
  // `rootDiagnostic: true` for the same reason as the six group arms (A13-1):
  // `recallEnginePatch(arm)` resolves and stamps the arm's weight vector, so a
  // weights arm moves root and reply recall columns alike, and the depth-2
  // truth those columns are scored against is the arm's own.
  {
    name: 'eval-no-threat-stack',
    factor: 'weights',
    change:
      zeroedChange(
        'threat-stack safety weights',
        SAFETY_THREAT_STACK,
        `the price of a threatened own body. The other ${EVAL_GROUPS.safety.length - SAFETY_THREAT_STACK.length} safety weights (the anchor pair and the remaining safety invariants) and material are untouched`,
      ),
    patch: zeroWeights('threat-stack', SAFETY_THREAT_STACK),
    rootDiagnostic: true,
  },
  {
    name: 'eval-no-anchor',
    factor: 'weights',
    change:
      zeroedChange(
        'anchor safety weights',
        SAFETY_ANCHOR,
        `the spawn anchor's fragility and the blocking deficit that describes the same anchor. The threat stack, the ${SAFETY_INVARIANTS.length} remaining safety invariants and material are untouched`,
      ),
    patch: zeroWeights('anchor', SAFETY_ANCHOR),
    rootDiagnostic: true,
  },
  {
    name: 'eval-no-safety-inv',
    factor: 'weights',
    change:
      zeroedChange(
        'remaining safety invariants',
        SAFETY_INVARIANTS,
        "DESIGN §5.13's flat safety penalties, less Inv6FragileAnchor, which travels with the anchor pair. The threat stack and material are untouched",
      ),
    patch: zeroWeights('safety-inv', SAFETY_INVARIANTS),
    rootDiagnostic: true,
  },
  // --- E3.2 lane 12: the correctness arms (B1-B5 and the bundle) -----------
  //
  // One arm per engine defect of `docs/hard-ai/e3/E3.1-SYNTHESIS.md` §5, plus
  // the bundle that is priced by a row. A defect there is a feature
  // contradicting a CANONICAL FACT about the position (judge 4) or the engine
  // contradicting its own written specification with the quantity already
  // computed in hand — never a calibration opinion, which is what the `weights`
  // arms above are for.
  //
  // Each arm turns on exactly one `HardConfig.evalFix` flag
  // (`src/ai/hard/config.ts EvalFix`), which is ABSENT on every profile, so
  // `hard@desktop` stays byte-identical with the flags off — `npm run
  // hard:cross-commit` between the E3 head and this branch is the proof, and
  // `resolvedConfigHash('hard@desktop', wall:3000)` is still
  // `4e7afdf76b32fad…` (asserted below and in `tests/lab/ablate.test.ts`).
  //
  // `rootDiagnostic: true` on all seven, for the same reason the weight arms
  // carry it (A13-1). It was `false` while `recall/run.ts` built its own
  // `allocTables()` and its own `new Evaluator(this.rep)`, neither of which
  // carried an `evalFix` block, so a correctness arm was invisible to every
  // recall column. Lane 13's fix stamps the arm's `evalFix` block on the
  // evaluator and on both `NodeTables`, and the columns move
  // (`eval-correct-v1` top3 .50 -> .45, regret_p90 1,432 -> 1,222 cc). These
  // arms are also read by `hard:exam`, by the oracles and by
  // fixed-work/equal-time rows, and — like a weights arm — they score the
  // depth-2 leaves with their own evaluator.
  //
  // THE FIVE ARE NOT INDEPENDENT AS MEASUREMENTS. B1 and B2 both land inside
  // `bestRelocationTarget` (B1 changes WHEN it is asked, B2 which square it
  // returns on a tie) and B5 changes the `stream` those relocations feed, so
  // the bundle is not the sum of the five singles and no report adds them up.
  {
    name: 'eval-fix-b1',
    factor: 'evalFix',
    change:
      'B1: the economy DP relocates a miner when the best reachable cell beats what is left of this one, instead of only when the cell is completely dry (`take === 0`). E3.1: adding one crystal to the board LOWERED projected income at loss-g2-s5_0_2-A-white-t4 (income [7,4,2,7,3,2] -> [7,5,0,7,5,0], -130 cc), which no rule of the game can do',
    patch: evalFixPatch({ relocationCompare: true }),
    rootDiagnostic: true,
  },
  {
    name: 'eval-fix-b2',
    factor: 'evalFix',
    change:
      "B2: `bestRelocationTarget` breaks an exact argmax tie in the mover's own corner-relative frame instead of by lowest square index, which `s -> 99 - s` reverses. E3.1: EconDelta/DepletionWaste/RelocationDebt disagree with their own rot180 mirror on 585 of 1,000 fuzz positions, mean 211 cc, max 1,440",
    patch: evalFixPatch({ rot180TieOrder: true }),
    rootDiagnostic: true,
  },
  {
    name: 'eval-fix-b3',
    factor: 'evalFix',
    change:
      "B3: `Infiltration` counts the enemy anchors my bodies VOID (DESIGN §5.8, `core/spawn.ts anchorsVoidedBy`) instead of own-unit/enemy-unit pairs, whose relation is symmetric under the two corners and so makes the feature identically zero as a difference on every legal position",
    patch: evalFixPatch({ infiltrationPerAnchor: true }),
    rootDiagnostic: true,
  },
  {
    name: 'eval-fix-b4',
    factor: 'evalFix',
    change:
      'B4: `Inv3RetreatSquare` restores DESIGN §5.13 row 3\'s second conjunct, "and the attacker has `retreats > 0`" (DESIGN.md:1448). `t.retreats[slot]` is computed by `tables/approach.ts` and read nowhere; 943 of 965 firings on the fuzz corpus are the excluded case',
    patch: evalFixPatch({ inv3RetreatConjunct: true }),
    rootDiagnostic: true,
  },
  {
    name: 'eval-fix-b5',
    factor: 'evalFix',
    change:
      'B5: the economy DP stops subtracting the standing upkeep bill from `stream`, which the `Rent` feature already charges at `RENT_PV = 422` — DESIGN.md:1348 says rent is charged ONCE. The double charge is 1.72 x RENT_PV, measured -742 cc per crystal per turn at loss-g2-s5_0_2-A-white-t4. `turnsToInsolvency` keeps the full bill: it is cash flow, not score',
    patch: evalFixPatch({ rentOnce: true }),
    rootDiagnostic: true,
  },
  {
    name: 'eval-fix-b6',
    factor: 'evalFix',
    change:
      "B6: `tables/approach.ts classifyFrom` breaks a tie between two equally cheap attack squares of the same class in the ATTACKER's own corner-relative frame instead of by scan order, which `s -> 99 - s` reverses. E3.2 lane 14: `retreats` — and so `Inv3RetreatSquare` with B4 on — disagrees with its own rot180 mirror on 5 of 1,000 fuzz positions, 250 cc each (the residue `E3.2-CORRECTNESS-ARM.md` §6 records). The flag moves `retreats` and nothing else, and `t.retreats[slot]` is read only under `inv3RetreatConjunct`, so ALONE it is the champion's evaluation under a different hash; it is only useful beside B4",
    patch: evalFixPatch({ approachTieOrder: true }),
    rootDiagnostic: true,
  },
  {
    name: 'eval-correct-v1',
    factor: 'evalFix',
    change:
      'B2+B3+B4+B5+B6 together (B6 = approachTieOrder, AMENDMENTS-E3.md A-E3-4, so B4\'s retreats read is mirror-clean): the correctness bundle E3-PLAN\'s "Correctness arm plan" prices with its own screening row. ONE factor (the whole `evalFix` block), four flags. B1 (`relocationCompare`) is EXCLUDED by AMENDMENTS-E3.md A-E3-2: it leaves 10 of 13,183 reserve-monotonicity violations and needs a DESIGN §5.8 amendment; `eval-fix-b1` stays registered as an open flag. Correctness and strength are separate columns in the decision record',
    patch: evalFixPatch({
      rot180TieOrder: true,
      infiltrationPerAnchor: true,
      inv3RetreatConjunct: true,
      rentOnce: true,
      approachTieOrder: true,
    }),
    rootDiagnostic: true,
  },

  // --- E4.2 lane 3: the root's tie policy ------------------------------------
  //
  // The champion resolves two root candidates with EQUAL searched scores by
  // list position: `search/pvs.ts rootIteration` keeps the first on a strict
  // `score > best`, and `search/order.ts scoreTurns` puts the transposition
  // table's move first with `ORDER_TT` (+2,000,000). The answer at a tie is
  // therefore the PREVIOUS iteration's answer, re-served — a function of the
  // search's own history rather than of the position. This arm makes the root's
  // order a function of the position instead. It is a SEARCH arm and runs on
  // the CHAMPION's evaluator (`default-v1`), so its effect is attributable.
  {
    name: 'search-tie-break',
    factor: 'searchFix',
    change:
      "searchFix.tieBreak = 'end-key': at ply 0 the ORDER_TT move bonus is withheld and candidates tying on the ordering score are ordered by their canonical end key, so the root's answer at a tie is a function of the position and not of whichever iteration last broke one. Interior nodes keep the TT move first, where its cutoffs are earned. E4.2: at g2-s20_3_15-A-white white t3 all 28 root candidates score 1,870 cc at the 400,000- and 800,000-unit rungs and the champion returns the depth-2 winner because it carries the bonus",
    patch: searchFixPatch({ tieBreak: 'end-key' }),
    rootDiagnostic: true,
  },
  // --- E4.3 candidate C (lane 8): the movement-BFS reach memo ----------------
  //
  // A PURE OPTIMISATION: the only arm in this file whose fixed-work output is
  // required to be IDENTICAL to the champion's on every golden row. It buys
  // time, not judgment, so a wall row is the only place its effect can show.
  {
    name: 'search-reach-cache',
    factor: 'searchFix',
    change:
      'searchFix.reachCache unset → true (a second-level, full-key-verified memo for the movement BFS, shared by every DistanceCache the engine owns — the per-ply NodeTables, the evaluator\'s tables and the Replica\'s — so a (occupancy, origin) or (occupancy, sources) field computed at one ply is not recomputed at another, and multi-source calls are cached at all). E4.1 measured the cost it attacks: bfsFrom/bfsMulti are the top two functions by self time on every ordinary-position run, inside a tables bucket that is 71-76% of wall time at every budget. E4.3 lane 8 measured the duplication: on 16 development turn-6 positions at fixed:100,000 the existing per-tables cache answers 76.9% of 27,118,221 get calls, and of the 9,765,744 BFS runs that still happen only 4,938,223 carry a distinct key. Output-identical by construction: the BFS is a pure function of its inputs and every probe verifies the whole key',
    patch: searchFixPatch({ reachCache: true }),
    // A search-side field like the other two searchFix arms; a fixed-work
    // instrument sees it (and must see NO output difference).
    rootDiagnostic: true,
  },
  // --- E4.3 candidate A: the P8 rescue cap (factor `searchFix`) -------------
  //
  // A SEARCH arm on the CHAMPION'S evaluator (E4-PLAN, "E4 rows run search
  // arms on the champion's evaluator so the search effect is attributable"):
  // `weights` stays `default-v1` and `evalFix` stays absent, so the only
  // factor that moves is `searchFix`.
  {
    name: 'search-rescue-cap',
    factor: 'searchFix',
    change:
      "P8: DESIGN §5.6 injection 4 runs `tactics/prover.ts homeWitness` once per generation with no budget and no price, and in a mutual home race the generations are thousands — measured on P8's champion-seat turn 23 (`e1-g2-s40_3_3-A-white`, black, seat turn 23) at fixed:100,000: 92 witness calls, 62.8 s of an 82.2 s search, every call stopping at the prover's `PROOF_NODES` cutoff with no rescue proved. The arm caps the witness at 8 calls per `searchTurn`, charges each allowed call `WorkClass.PROVER` at DESIGN §8's rate, and marks the generation whose call it refused so that node cannot publish to the transposition table (the P6 lane-9 shape)",
    patch: searchFixPatch({ rescueCap: 8 }),
    rootDiagnostic: true,
  },
];


// --- E4 lane 7 (E3 follow-on arms): the combined arm and the per-weight -----
// safety rows (E3-CLOSE.md, Candidate 1 "Next bounded task"; A-E3-8;
// EPIC-PLAN's E3 handoffs 4-5) ------------------------------------------------
//
// The E3 close retains TWO candidates singly — `eval-no-safety` (weights) and
// `eval-correct-v1` (evalFix) — and never compares them with each other
// (E3-CLOSE.md, "Strength" axis). Two questions follow, and this section
// answers both with arms, not rows (no row is launched by this lane):
//
//  1. Do the two effects ADD? `combined` prices both at once.
//  2. WHICH of the 19 zeroed safety weights carries `eval-no-safety`'s +124,
//     and in particular which one protects `spawn-strike-purchase-1` at
//     M14's gate (A-E3-8, the champion's tactical regression)? One arm per
//     weight, each `eval-no-safety` with exactly that weight restored.

/**
 * E4 lane 7's two-factor arm: `eval-no-safety`'s weight vector (the 19 safety
 * weights of `EVAL_GROUPS.safety` at 0, label `default-v1-no-safety`) AND
 * `eval-correct-v1`'s five-flag `evalFix` bundle, together. TWO factors on
 * purpose — for the same reason `workFitDeep` (E2 lane 1) is `combined`
 * rather than a third single-factor arm: `factorsOf` reports both moved
 * factors (`weights` and `evalFix`) and `maskFactor`'s `combined` case
 * restores both, so the one-factor invariant skips this arm by its own
 * declaration instead of by an omission in the test. The one-factor arms it
 * is built from stay `eval-no-safety` and `eval-correct-v1`; this arm exists
 * to say whether the two effects add, which neither of those rows can.
 */
function combinedNoSafetyCorrectV1(): Partial<HardConfig> {
  return {
    weights: zeroWeights('safety', EVAL_GROUPS.safety).weights as Weights,
    evalFix: {
      rot180TieOrder: true,
      infiltrationPerAnchor: true,
      inv3RetreatConjunct: true,
      rentOnce: true,
      approachTieOrder: true,
    },
  };
}

/**
 * E4 lane 7's per-weight row: `eval-no-safety`'s vector (all 19 safety
 * weights at 0) with exactly ONE of them, `index`, restored to its
 * `default-v1` value. Everything outside the safety group, and the material
 * block, stay at `default-v1` throughout — the arm asks only which safety
 * weight carries the group's effect, not a new group.
 *
 * Label `default-v1-no-safety-keep-<index>`, so a report reads the one
 * restored feature off the label the way `zeroWeights`'
 * `default-v1-no-<group>` does. `version` stays `WEIGHTS_VERSION` (never 0),
 * carried over by `cloneWeights` exactly as `zeroWeights` carries it:
 * `hardEnginePatch` substitutes `DEFAULT_WEIGHTS` for a version-0 vector, so a
 * version-0 arm vector would silently play as the champion (E0's I2 lesson).
 */
function keepSafetyWeight(index: number): Partial<HardConfig> {
  return keepSafetyWeights([index], armWeightsLabel(`no-safety-keep-${index}`));
}

/**
 * The general form `keepSafetyWeight` is built on: `eval-no-safety`'s vector
 * with a SET of safety weights restored together, under a caller-given label.
 * E4 lane 7's follow-up arm (`eval-no-safety-keep-anchor`) is the first user
 * with more than one index — phase 1 of `chain-followon.sh` (the 19
 * single-weight keep arms, `spawn-strike-400k`) found that restoring any ONE
 * of `SAFETY_ANCHOR`'s three weights alone wins `spawn-strike-purchase-1`
 * back, so the follow-up prices restoring all three together.
 */
function keepSafetyWeights(keepIndices: readonly number[], label: string): Partial<HardConfig> {
  const base = cloneWeights(DEFAULT_WEIGHTS);
  const keep = new Set(keepIndices);
  const w = Int32Array.from(base.w);
  for (const i of EVAL_GROUPS.safety) if (!keep.has(i)) w[i] = 0;
  return { weights: finishArmWeights(base, w, label) };
}

SPECS.push({
  name: 'combined',
  factor: 'combined',
  change:
    `weights ${armWeightsLabel('no-safety')} (eval-no-safety's ${EVAL_GROUPS.safety.length} zeroed safety weights) AND evalFix b2+b3+b4+b5+b6 (eval-correct-v1's bundle) together. TWO factors by design; the one-factor arms are eval-no-safety and eval-correct-v1 — neither candidate is compared against the other at the E3 close (E3-CLOSE.md), and this arm is the row that says whether the two effects add`,
  patch: combinedNoSafetyCorrectV1(),
  rootDiagnostic: true,
});

// One arm per safety weight, in `EVAL_GROUPS.safety` order (ascending `F.*`
// index, per that module's header) — `<index>` in the arm name IS the
// weight's position in the 58-feature vector, not a 0-based ordinal into the
// group. A-E3-8: the arm that wins `spawn-strike-purchase-1` back at M14's
// gate setting (fixed 400k) is reported by name once its suite runs.
for (const i of EVAL_GROUPS.safety) {
  SPECS.push({
    name: `eval-no-safety-keep-${i}`,
    factor: 'weights',
    change: `eval-no-safety with F.${FEATURE_NAMES[i]} (index ${i}, ${BASE_WEIGHTS_LABEL} value ${DEFAULT_WEIGHTS.w[i]}) restored; the other ${EVAL_GROUPS.safety.length - 1} safety weights stay at 0; material untouched`,
    patch: keepSafetyWeight(i),
    rootDiagnostic: true,
  });
}

/**
 * E4 lane 7 follow-up (coordinator message after phase 1 of
 * `chain-followon.sh`, `docs/hard-ai/e4/E3-FOLLOWON-ARMS.md` "phase-1
 * results"): `eval-no-safety-keep-35`, `-36` and `-43` each independently win
 * `spawn-strike-purchase-1` back at M14's gate setting (16/20, matching the
 * champion); the other 16 single-weight keep arms stay at 15/20. `SAFETY_ANCHOR`
 * is exactly that triple — `AnchorFragility`, `BlockingDeficit`,
 * `Inv6FragileAnchor`, the anchor pair `eval-no-anchor` already zeroes as one
 * block — so this arm restores all three together rather than as three
 * separate single-weight arms.
 */
SPECS.push({
  name: 'eval-no-safety-keep-anchor',
  factor: 'weights',
  change:
    `eval-no-safety with F.AnchorFragility (35), F.BlockingDeficit (36) and F.Inv6FragileAnchor (43) restored together (SAFETY_ANCHOR, the triple eval-no-anchor zeroes as one block); the other ${EVAL_GROUPS.safety.length - SAFETY_ANCHOR.length} safety weights stay at 0; material untouched. Phase 1 of chain-followon.sh found each of the three alone wins spawn-strike-purchase-1 back at M14's gate (16/20); this arm restores all three together`,
  patch: keepSafetyWeights(SAFETY_ANCHOR, armWeightsLabel('no-safety-keep-anchor')),
  rootDiagnostic: true,
});


/**
 * The hand-prior repair, as ablations OF THE DEFAULT rather than towards it.
 *
 * HISTORY. The four arms that stood here from 2026-09-20 to 2026-09-21 —
 * `hand-priors`, `hand-priors-pc`, `bootstrap-pc`, `bank25-pc` — were written
 * while `DEFAULT_WEIGHTS` was still the five-nonzero M6 bootstrap and the
 * within-turn pending credit was label-gated on a `+pc` suffix. They built the
 * candidate vector by ADDING the priors to a clone of the default, and named
 * the scorer credit in their `change` lines. Both premises died at `71b41a39`,
 * which made the credit unconditional and the priors the default; from that
 * commit `hand-priors` ≡ `hand-priors-pc` ≡ `bank25-pc` ≡ `hard@desktop`
 * (silent A/A rows), and `bootstrap-pc` was not the bootstrap at all — it was
 * the default with BankExcess back at 100. The arms lied about what they
 * measured, which is the one thing an ablation may never do.
 *
 * WHAT REPLACES THEM. Three arms that subtract from the shipped vector, which
 * is what the sweep in `docs/hard-ai/phasing/repair-2026-09-20/results/` was
 * actually comparing: the whole repair off (`weights-bootstrap-m6`), the bank
 * discount off (`weights-bank100`), the tactical priors off with the discount
 * kept (`weights-no-priors`). No arm needs to say anything about the scorer any
 * more, because every arm shares it.
 */

/**
 * The retired M6 accounting bootstrap: the only five entries it priced.
 * `tests/ai/hard/fixtures/hand-priors-nonzero.ts` holds the same list for the
 * eval tests, and `tests/lab/ablate.test.ts` asserts the two agree.
 */
const BOOTSTRAP_M6_NONZERO: readonly (readonly [number, number])[] = [
  [F.Material, 100], [F.BankLiquid, 100], [F.BankExcess, 100], [F.EconDelta, 100], [F.PendingValue, 1],
];
/** The accounting core both vectors share — everything but the bank discount. */
const ACCOUNTING_CORE = BOOTSTRAP_M6_NONZERO.filter(([i]) => i !== F.BankExcess);

/** A vector holding exactly `nonzero`; catalogue material and schema carried over. */
function sparseArmWeights(nonzero: readonly (readonly [number, number])[], label: string): Partial<HardConfig> {
  const base = cloneWeights(DEFAULT_WEIGHTS);
  const w = new Int32Array(base.w.length);
  for (const [index, value] of nonzero) w[index] = value;
  return { weights: finishArmWeights(base, w, armWeightsLabel(label)) };
}

/** The default with one feature overwritten. */
function weightOverride(index: number, value: number, label: string): Partial<HardConfig> {
  const base = cloneWeights(DEFAULT_WEIGHTS);
  const w = Int32Array.from(base.w);
  w[index] = value;
  return { weights: finishArmWeights(base, w, armWeightsLabel(label)) };
}

SPECS.push({
  name: 'weights-bootstrap-m6',
  factor: 'weights',
  change: 'the whole 2026-09-20 repair off: the retired M6 accounting bootstrap (Material 100, BankLiquid 100, BankExcess 100, EconDelta 100, PendingValue 1; every other feature 0), built from that list and not from the default',
  patch: sparseArmWeights(BOOTSTRAP_M6_NONZERO, 'bootstrap-m6'),
  rootDiagnostic: true,
});
SPECS.push({
  name: 'weights-bank100',
  factor: 'weights',
  change: 'the bank discount off: the default with BankExcess back at 100, so cash above the free eight is worth as much as liquid cash again; the tactical priors stay. The discount is the repair\'s master switch (spend 24% -> 93% vs Rush)',
  patch: weightOverride(F.BankExcess, 100, 'bank100'),
  rootDiagnostic: true,
});
SPECS.push({
  name: 'weights-no-priors',
  factor: 'weights',
  change: 'the tactical priors off, the bank discount kept: the M6 accounting core with BankExcess 25 and every home/safety/space/invariant weight 0. Isolates the discount from the 38 default-v1 coefficients it shipped beside',
  patch: sparseArmWeights([...ACCOUNTING_CORE, [F.BankExcess, 25]], 'no-priors'),
  rootDiagnostic: true,
});

// --- L6 STRENGTH KNOBS (2026-09-21) ------------------------------------------
// APPEND-ONLY BLOCK. Everything above this line is owned by the CI/repair lane
// of the 2026-09-21 cutover; these seven arms are added after it so the two
// edits never meet. They price the four ranked generator/evaluation changes of
// `ai-strength-lab.md` §2 — R1b, R2, R3, R4 — each of which ships in
// `src/ai/hard/**` behind a knob that is ABSENT on every profile, so
// `hard@desktop` is byte-identical and its pinned hash does not move.
//
// FACTOR `evalFix`, NOT A NEW ONE. All four knobs live in one optional block,
// `EvalFix.strength` (`src/ai/hard/config.ts StrengthKnobs`), because
// `HardEngine`'s constructor stamps `config.evalFix` — and nothing else — onto
// every `NodeTables` and onto its `Evaluator`, and `NodeTables` is the only
// configuration `gen/promote.ts` and `eval/pending.ts` receive. `factorsOf`
// serialises the whole block through `evalFixKey` (extended below) and
// `maskFactor`'s `evalFix` case restores the whole block, so the one-factor
// invariant covers these arms exactly as it covers `eval-correct-v1`, which
// also sets several keys of one block.
//
// SCREEN THEM IN FIXED WORK. Every knob here is a GENERATOR or EVALUATION
// change, visible under `--work fixed:50000` (unlike `work-fit`/`calib`), so
// the screening rows need no idle box: `--a hard@ablate:<arm> --b Rush --work
// fixed:50000 --handicaps 0 --pairs 16 --seed 7101 --openings p1-dev.jsonl`.
// Read behaviour before result (spend, upkeep-eliminations, illegal actions,
// divergences, fallbacks); adoption is a separate commit that flips a default
// in `config.ts`, never an edit here.
SPECS.push({
  name: 'gen-purchase-score',
  factor: 'evalFix',
  change:
    'R1b: strength.purchaseScoreBeforeTruncate — planPurchases writes every enumerated multiset × assignment, scores all of them and truncates to maxPlans AFTER sortPlans, instead of stopping the write loop at 12 plans in cheapest-definition-first enumeration order (at bank >= 12 the shipped menu is fire_1 x1..4 and nothing else)',
  patch: { evalFix: { strength: { purchaseScoreBeforeTruncate: true } } },
});
SPECS.push({
  name: 'gen-promote-strength',
  factor: 'evalFix',
  change:
    'R2: strength.promoteStrengthMission — bestMission offers a fallback STRENGTH promotion worth (dAtk + dDef) x ACTION_VALUE_CC when no FORTIFY/SURVIVE/ANCHOR/INCOME/REACH mission applies, instead of returning -1 and never proposing the candidate (504 of 5,525 legal promotions offered in the knobs probe; fire_1->2 once in 2,940 opportunities)',
  patch: { evalFix: { strength: { promoteStrengthMission: true } } },
});
SPECS.push({
  name: 'gen-promote-rent211',
  factor: 'evalFix',
  change:
    'R3: strength.promoteOrderingRentPv 422 -> 211 — half rent in the promotion ORDERING expression only (the upkeep keep-set and the EconDelta leaf forecast keep RENT_PV), so promotion combos stop ranking below bare purchase plans in buildCombos; 32 of 40 proposals score <= 0 today',
  patch: { evalFix: { strength: { promoteOrderingRentPv: 211 } } },
});
SPECS.push({
  name: 'gen-promote-rent0',
  factor: 'evalFix',
  change:
    'R3 endpoint: strength.promoteOrderingRentPv 422 -> 0 — the promotion ordering charges no rent at all; the leaf still charges the real one, so this is the upper bound on what the ordering change can buy',
  patch: { evalFix: { strength: { promoteOrderingRentPv: 0 } } },
});
SPECS.push({
  name: 'eval-atrisk-8',
  factor: 'evalFix',
  change:
    'R4: strength.pendingAtRiskShare16 0 -> 8 — an at-risk pending summon keeps half its service present value instead of none, so a purchase against an aggressive opponent (which flags every commitment) stops losing every tie to the first-ordered plain turn. The summon-disruption suite family is the canary',
  patch: { evalFix: { strength: { pendingAtRiskShare16: 8 } } },
});
SPECS.push({
  name: 'eval-atrisk-4',
  factor: 'evalFix',
  change: 'R4 at a quarter: strength.pendingAtRiskShare16 0 -> 4, the milder half of the at-risk credit pair',
  patch: { evalFix: { strength: { pendingAtRiskShare16: 4 } } },
});
SPECS.push({
  name: 'stack-r1234',
  factor: 'evalFix',
  change:
    'R1b + R2 + R3(211) + R4(8) together: the whole 2026-09-21 strength stack in one block. ONE factor for the reason eval-correct-v1 is one — factorsOf serialises the block and maskFactor restores it — but four knobs, so it is read as a ceiling for the four single-knob arms above and never as evidence about any one of them',
  patch: {
    evalFix: {
      strength: {
        purchaseScoreBeforeTruncate: true,
        promoteStrengthMission: true,
        promoteOrderingRentPv: 211,
        pendingAtRiskShare16: 8,
      },
    },
  },
});

export const ARMS: readonly AblationArm[] = Object.freeze(SPECS.map(registerArm));

const BY_NAME = new Map<string, AblationArm>(ARMS.map(a => [a.name, a]));

export function armNames(): string[] {
  return ARMS.map(a => a.name);
}

export function findArm(name: string): AblationArm | undefined {
  return BY_NAME.get(name);
}

/** Throws with the full list rather than returning undefined: every caller is a CLI. */
export function requireArm(name: string): AblationArm {
  const arm = BY_NAME.get(name);
  if (arm === undefined) {
    throw new Error(`hard ablate: unknown arm "${name}". Known: ${armNames().join(', ')}`);
  }
  return arm;
}

/** The `ablate:<arm>` label prefix `lab/hard-ai/bots/hard.ts` parses. */
export const ABLATE_LABEL_PREFIX = 'ablate:';

/** `hard@ablate:<arm>` — the ladder/probe/recall engine name for an arm. */
export function armEngineName(name: string): string {
  return `hard@${ABLATE_LABEL_PREFIX}${name}`;
}

/**
 * `hardConfigFor`'s hook: the patch for `ablate:<arm>`, or null when the label
 * is not an ablation label. Returns a FULL config (DESKTOP under the patch) so
 * it behaves exactly like the profile labels next to it.
 */
export function ablationConfigFor(label: string): Partial<HardConfig> | null {
  if (!label.startsWith(ABLATE_LABEL_PREFIX)) return null;
  return armHardConfig(label.slice(ABLATE_LABEL_PREFIX.length));
}

/**
 * `DESKTOP` under an arm's patch, as a whole `HardConfig`. This is the exact
 * object `HardEngine`'s `mergeConfig(DESKTOP, patch)` ends up with for the
 * generator fields, and it is what the recall instrument reads `gen`/
 * `genInterior` out of for `--arm`.
 */
export function armHardConfig(name: string): HardConfig {
  return { ...DESKTOP, ...requireArm(name).patch };
}

// --- E3.2 lane 12: the correctness flags (B1-B5) ------------------------------

/**
 * The 2026-09-21 strength knobs in a fixed key order (`config.ts
 * StrengthKnobs`), for `evalFixKey`. Referenced off `EvalFix` rather than
 * imported by name so the import list above — which the CI/repair lane of the
 * cutover owns this pass — is left alone.
 *
 * A key added by a later lane MUST be added here, for the reason `searchFixKey`
 * states: `factorsOf` is what the one-factor invariant reads, and a knob it
 * cannot see is a knob an arm could move without declaring it.
 */
export function strengthKey(s: NonNullable<EvalFix['strength']> | undefined): string {
  if (s === undefined) return '';
  const on = [
    s.purchaseScoreBeforeTruncate === true ? 'purchaseScore' : '',
    s.promoteStrengthMission === true ? 'promoteStrength' : '',
    s.promoteOrderingRentPv === undefined ? '' : `promoteRentPv=${s.promoteOrderingRentPv}`,
    s.pendingAtRiskShare16 === undefined ? '' : `atRisk16=${s.pendingAtRiskShare16}`,
  ].filter(x => x !== '');
  // An empty block is still a PRESENT block, and `canonicalJson` serialises it,
  // so it reads as moved rather than as the champion.
  return `strength=${on.length === 0 ? 'none' : on.join(',')}`;
}

export function evalFixKey(fix: EvalFix | undefined): string {
  if (fix === undefined) return 'absent';
  const on = [
    fix.relocationCompare === true ? 'b1' : '',
    fix.rot180TieOrder === true ? 'b2' : '',
    fix.infiltrationPerAnchor === true ? 'b3' : '',
    fix.inv3RetreatConjunct === true ? 'b4' : '',
    fix.rentOnce === true ? 'b5' : '',
    fix.approachTieOrder === true ? 'b6' : '',
    strengthKey(fix.strength),
  ].filter(x => x !== '');
  return on.length === 0 ? 'none' : on.join('+');
}

/**
 * E3.2's correctness patch: `DESKTOP` plus one `evalFix` block.
 *
 * Written as a whole block for the reason the two `time` arms are — a patch is
 * composed with a plain `{ ...DESKTOP, ...patch }` spread (`bots/hard.ts`,
 * `ladder/identity.ts`), so an `evalFix` key REPLACES rather than merges — and
 * every flag this arm does not set is left ABSENT rather than written `false`,
 * so the block a row records names exactly the bugs the arm fixes.
 */
function evalFixPatch(fix: EvalFix): Partial<HardConfig> {
  return { evalFix: fix };
}

// --- E4: the search flags ----------------------------------------------------

/**
 * The `SearchFix` keys in a fixed order, for `factorsOf`. `absent` is the
 * champion — `HardConfig.searchFix` is not written by any profile, so the key
 * never reaches `canonicalJson` and `hard@desktop`'s hash does not move.
 */
export function searchFixKey(fix: SearchFix | undefined): string {
  if (fix === undefined) return 'absent';
  const on = [
    fix.tieBreak === undefined ? '' : `tieBreak=${fix.tieBreak}`,
    fix.iterFit === true ? 'iterFit' : '',
    fix.reachCache === true ? 'reachCache' : '',
    fix.rescueCap === undefined ? '' : `rescueCap=${fix.rescueCap}`,
  ].filter(x => x !== '');
  return on.length === 0 ? 'none' : on.join('+');
}

/**
 * E4's search patch: `DESKTOP` plus one `searchFix` block.
 *
 * Written as a whole block for the reason `evalFixPatch` is — a patch is
 * composed with a plain `{ ...DESKTOP, ...patch }` spread (`bots/hard.ts`,
 * `ladder/identity.ts`), so a `searchFix` key REPLACES rather than merges —
 * and every key this arm does not set is left ABSENT rather than written, so
 * the block a row records names exactly what the arm changes.
 */
function searchFixPatch(fix: SearchFix): Partial<HardConfig> {
  return { searchFix: fix };
}

// --- the one-factor invariant ------------------------------------------------

/**
 * The four factor values of a resolved configuration, as comparable strings.
 * `tests/lab/ablate.test.ts` diffs an arm's against `base`'s and requires the
 * difference to be exactly the arm's own `factor`.
 */
export function factorsOf(cfg: HardConfig): Record<Exclude<ArmFactor, 'none'>, string> {
  return {
    K: `${cfg.K}/${cfg.gen.K}`,
    kInterior: `${cfg.kInterior}/${cfg.genInterior.K}`,
    widths: `${[...cfg.gen.action.widths].join(',')}|${[...cfg.genInterior.action.widths].join(',')}`,
    placePlans: `${cfg.gen.maxPlacePlans}/${cfg.genInterior.maxPlacePlans}`,
    // The whole `TimeConfig` block, so an arm that moved `baseMs` as well as
    // `calibrateCold` would still read as ONE moved factor here and be caught
    // by `maskFactor` instead of slipping through both tests.
    time: `${cfg.time.minMs}/${cfg.time.maxMs}/${cfg.time.baseMs}/${cfg.time.abortFactor}/${cfg.time.calibrateCold === true}/${cfg.time.ladderStep ?? '2'}`,
    iterationGate: cfg.iterationGate ?? 'fixed45',
    // The whole `Weights` vector: `weightsHash` covers `version`, `w` and
    // `material` (it deliberately does NOT cover `label`, see
    // `eval/weights.ts`), so the label is carried alongside it and an arm that
    // renamed the vector without changing a number still reads as moved.
    weights: `${cfg.weights.label}#${weightsHash(cfg.weights)}`,
    // The whole `evalFix` block in a fixed flag order, so an arm that set a
    // sixth flag added later still reads as moved here and `maskFactor` catches
    // anything it moved besides. `absent` is the champion: the key is not in
    // the serialised configuration at all (see `config.ts EvalFix`).
    evalFix: evalFixKey(cfg.evalFix),
    // The whole `searchFix` block in a fixed key order, for the reason
    // `evalFix` is serialised whole. `absent` is the champion: the key is not
    // in the serialised configuration at all (see `config.ts SearchFix`).
    // A key added by a later lane MUST be added here and to `searchFixKey`.
    searchFix: searchFixKey(cfg.searchFix),
    // `combined` is not a knob: an arm that moves two named factors declares
    // itself and `factorsOf` reports both, so the one-factor test skips it by
    // its own declaration rather than by an omission here.
    combined: '',
  };
}

/**
 * `cfg` with the fields carrying `factor` restored to `reference`'s values.
 * A masked arm config that no longer differs from the masked base config is the
 * proof that the arm moved ONE factor and nothing else — stronger than diffing
 * `factorsOf`, which only looks at the four knobs.
 */
export function maskFactor(cfg: HardConfig, factor: ArmFactor, reference: HardConfig): HardConfig {
  const out: HardConfig = { ...cfg, gen: { ...cfg.gen }, genInterior: { ...cfg.genInterior } };
  switch (factor) {
    case 'none':
      break;
    case 'K':
      out.K = reference.K;
      out.gen.K = reference.gen.K;
      break;
    case 'kInterior':
      out.kInterior = reference.kInterior;
      out.genInterior.K = reference.genInterior.K;
      break;
    case 'widths':
      out.gen.action = reference.gen.action;
      out.genInterior.action = reference.genInterior.action;
      break;
    case 'placePlans':
      out.gen.maxPlacePlans = reference.gen.maxPlacePlans;
      out.genInterior.maxPlacePlans = reference.genInterior.maxPlacePlans;
      break;
    case 'time':
      out.time = reference.time;
      break;
    case 'iterationGate':
      out.iterationGate = reference.iterationGate;
      break;
    case 'weights':
      // The whole vector, for the same reason `time` restores the whole block:
      // an arm that zeroed a group AND changed a `material` param would still
      // read as one moved factor in `factorsOf` and must be caught here.
      out.weights = reference.weights;
      break;
    case 'evalFix':
      // The whole block, for the reason `weights` restores the whole vector:
      // the bundle arm moves five flags at once and a sixth field slipped in
      // beside them must not survive the mask. `reference.evalFix` is
      // `undefined` on `hard@desktop`, and `canonicalJson` DROPS an undefined
      // key, so the masked arm serialises exactly as the champion does.
      out.evalFix = reference.evalFix;
      break;
    case 'searchFix':
      // The whole block, for the reason `evalFix` restores the whole block.
      // `reference.searchFix` is `undefined` on `hard@desktop`, and
      // `canonicalJson` DROPS an undefined key, so the masked arm serialises
      // exactly as the champion does.
      out.searchFix = reference.searchFix;
      break;
    case 'combined':
      // Every factor ANY `combined` arm is allowed to move: `work-fit-deep`
      // (E2 lane 1) moves `time` + `iterationGate`; `combined` (E4 lane 7)
      // moves `weights` + `evalFix`. A combined arm only ever touches its own
      // declared pair, so restoring all four here is a no-op on the pair it
      // left alone and still catches a future combined arm that moved a
      // fifth field beside its declared two.
      out.time = reference.time;
      out.iterationGate = reference.iterationGate;
      out.weights = reference.weights;
      out.evalFix = reference.evalFix;
      break;
  }
  return out;
}

// --- deterministic ladder seeds ----------------------------------------------

/** FNV-1a 32, so a seed depends on the arm NAME and not on registry order. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Base of the E1.3 ladder seed space, so an ablation row can never collide with E1.1/E1.2. */
export const ABLATE_SEED_BASE = 1_300_000;

/**
 * The `--seed` for an arm's equal-time ladder row: derived from the arm name
 * alone, so re-ordering or extending the registry never moves an existing arm's
 * seed and a rerun of one arm reproduces its schedule.
 */
export function armLadderSeed(name: string): number {
  return ABLATE_SEED_BASE + (fnv1a32(name) % 100_000);
}
