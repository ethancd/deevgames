/**
 * Feature groups for the E3 evaluation audit (`docs/hard-ai/e3/E3-PLAN.md`).
 *
 * One partition of the 58 features of `src/ai/hard/eval/features.ts` into the
 * five groups EPIC-PLAN §4 E3.1 asks to ablate ("material/economy/home/safety"
 * plus the remaining space-and-tempo terms). Every feature belongs to exactly
 * one group (`tests/lab/eval-groups.test.ts`). Lane 4's `eval-audit` reports
 * by these groups and lane 5's weight arms zero them; both import this module
 * so the two readings cannot drift. The grouping is a reading of DESIGN
 * §5.12.1 / §5.13, not a statement about the engine; a lane that disagrees
 * proposes an amendment rather than editing it.
 *
 * Coordinator-owned.
 */
import { F, FEATURE_COUNT, INV_BASE } from '../../../src/ai/hard/eval/features';

export type EvalGroup = 'material' | 'economy' | 'home' | 'safety' | 'space';

export const EVAL_GROUP_NAMES: readonly EvalGroup[] = ['material', 'economy', 'home', 'safety', 'space'];

/** Feature indices per group, ascending. */
export const EVAL_GROUPS: Readonly<Record<EvalGroup, readonly number[]>> = Object.freeze({
  material: [F.Material],
  economy: [
    F.Rent,
    F.BankLiquid,
    F.BankExcess,
    F.PstMine,
    F.BankConvertible,
    F.EconDelta,
    F.DepletionWaste,
    F.RunwayCliff,
    F.Insolvency,
    F.RelocationDebt,
    F.Inv5PoorMinerSquare,
    F.Inv7PromoteNoRunway,
    F.Inv14LiquidityFloor,
  ],
  home: [
    F.HomeInvaded,
    F.Infiltration,
    F.CornerSeal,
    F.HomeThreat,
    F.HomeCountdown,
    F.HomePlug,
    F.HomeRescuers,
    F.CornerInfiltration,
    F.Inv2CornerSeal,
    F.Inv10HomeReachable,
    F.Inv11HomeBare,
  ],
  safety: [
    F.Exposure,
    F.Hanging,
    F.HangingBuy,
    F.ApproachRetreat,
    F.ApproachStrand,
    F.StrandPunish,
    F.KillAvailable,
    F.CleaveExposure,
    F.AnchorFragility,
    F.BlockingDeficit,
    F.Inv3RetreatSquare,
    F.Inv4StrandUnpunished,
    F.Inv6FragileAnchor,
    F.Inv8NoPreAdjacency,
    F.Inv9ChipAcrossTurn,
    F.Inv12CleaveLine,
    F.Inv17SelfBlock,
    F.Inv19SoftMinerExposed,
    F.Inv20StrandNoRetreat,
  ],
  space: [
    F.SpawnArea,
    F.SpawnReserve,
    F.SpawnZero,
    F.AnchorDepth,
    F.DrawPressure,
    F.ActionsLeft,
    F.Corridor,
    F.TierClimb,
    F.ElementCoverage,
    F.Inv1SpawnZero,
    F.Inv13Turtle,
    F.Inv15UnknownAsSafe,
    F.Inv16ClockDiscipline,
    F.Inv18WastedEndPlace,
  ],
});

/** The twenty invariant penalty features (DESIGN §5.13), `Inv1..Inv20`. */
export const INVARIANT_FEATURES: readonly number[] = Object.freeze(
  Array.from({ length: FEATURE_COUNT - INV_BASE }, (_, i) => INV_BASE + i),
);

/** Stage-2 features (`F.EconDelta` .. the last invariant). */
export const STAGE2_FEATURES: readonly number[] = Object.freeze(
  Array.from({ length: FEATURE_COUNT - F.EconDelta }, (_, i) => F.EconDelta + i),
);

/** `GROUP_OF[i]` is the group of feature `i`. */
export const GROUP_OF: readonly EvalGroup[] = (() => {
  const out = new Array<EvalGroup | null>(FEATURE_COUNT).fill(null);
  for (const g of EVAL_GROUP_NAMES) {
    for (const i of EVAL_GROUPS[g]) {
      if (out[i] !== null) throw new Error(`eval-groups: feature ${i} in two groups`);
      out[i] = g;
    }
  }
  for (let i = 0; i < FEATURE_COUNT; i++) if (out[i] === null) throw new Error(`eval-groups: feature ${i} in no group`);
  return out as EvalGroup[];
})();
