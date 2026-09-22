/**
 * The two weight vectors the tests pin, in one place so they cannot drift.
 *
 * `HAND_PRIORS_NONZERO` is the SHIPPED `DEFAULT_WEIGHTS`, label
 * `phasing-hand-priors-v1`, `weightsHash` `14d06ba8`: 43 of 62 entries nonzero.
 * It landed on 2026-09-20 (`docs/hard-ai/phasing/repair-2026-09-20/HANDOFF.md`)
 * and is what the browser's Hard engine plays with.
 *
 * `BOOTSTRAP_M6_NONZERO` is the M6 accounting bootstrap it replaced — 5 nonzero
 * entries, cash valued exactly like units, every home/tactical feature 0. It is
 * kept because some tests were written as whole-score arithmetic that only holds
 * under a vector that prices nothing but cash; those evaluate against this
 * vector explicitly instead of against the shipped default.
 *
 * `sparseWeights` builds a `Weights` from either list. Anything not listed is 0;
 * `material` stays the catalogue prior, because it is a separate block the
 * evaluator scores directly (DESIGN F9) and neither vector changed it.
 */
import { DEFAULT_MATERIAL_CC, PHASING_EVAL_SCHEMA, type Weights } from '../../../../src/ai/hard/config';
import { F, FEATURE_COUNT } from '../../../../src/ai/hard/eval/features';
import { WEIGHTS_VERSION } from '../../../../src/ai/hard/eval/weights';

/** `[featureIndex, cc]` for every nonzero entry, in index order. */
export type NonzeroWeights = readonly (readonly [number, number])[];

/** The shipped vector: `Material`/`BankLiquid`/`EconDelta` accounting, a 25 cc
 * bank discount above the free eight, and the Standard-era `default-v1` values
 * for the features whose meaning survives Phasing. */
export const HAND_PRIORS_NONZERO: NonzeroWeights = [
  [F.Material, 100], [F.BankLiquid, 100], [F.BankExcess, 25], [F.HomeInvaded, -4000],
  [F.SpawnArea, 30], [F.SpawnReserve, 8], [F.SpawnZero, -800], [F.AnchorDepth, 25],
  [F.Infiltration, 90], [F.CornerSeal, -60],
  [F.HomeThreat, -400], [F.HomeCountdown, -180], [F.HomePlug, 220], [F.HomeRescuers, 90],
  [F.Exposure, -20], [F.DrawPressure, -8], [F.ActionsLeft, 40],
  [F.EconDelta, 100],
  [F.Hanging, -50], [F.ApproachRetreat, -25], [F.ApproachStrand, -10], [F.StrandPunish, 20],
  [F.KillAvailable, 35], [F.CleaveExposure, -40], [F.AnchorFragility, -120],
  [F.BlockingDeficit, -150], [F.CornerInfiltration, 300],
  [F.Inv1SpawnZero, -800], [F.Inv2CornerSeal, -300], [F.Inv3RetreatSquare, -250],
  [F.Inv4StrandUnpunished, -100], [F.Inv6FragileAnchor, -120], [F.Inv7PromoteNoRunway, -600],
  [F.Inv8NoPreAdjacency, -150], [F.Inv9ChipAcrossTurn, -150], [F.Inv10HomeReachable, -400],
  [F.Inv12CleaveLine, -40], [F.Inv13Turtle, -200], [F.Inv14LiquidityFloor, -200],
  [F.Inv16ClockDiscipline, -200], [F.Inv19SoftMinerExposed, -150], [F.Inv20StrandNoRetreat, -250],
  [F.PendingValue, 1],
];

/** The retired M6 accounting bootstrap (commit `e701ccc`), superseded 2026-09-20. */
export const BOOTSTRAP_M6_NONZERO: NonzeroWeights = [
  [F.Material, 100], [F.BankLiquid, 100], [F.BankExcess, 100], [F.EconDelta, 100], [F.PendingValue, 1],
];

/** A `Weights` holding exactly `nonzero`, catalogue material, current schema. */
export function sparseWeights(nonzero: NonzeroWeights, label: string): Weights {
  const w = new Int32Array(FEATURE_COUNT);
  for (const [index, value] of nonzero) w[index] = value;
  return {
    w,
    material: Int32Array.from(DEFAULT_MATERIAL_CC),
    version: WEIGHTS_VERSION,
    featureSchema: PHASING_EVAL_SCHEMA,
    label,
  };
}
