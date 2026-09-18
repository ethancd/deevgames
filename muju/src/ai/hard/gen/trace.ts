/**
 * Opt-in stage trace for the turn generator (E2.2, `docs/hard-ai/e2/E2.2-COVERAGE-TRACE.md`).
 *
 * The generator is a ladder of shortlists: upkeep keep-set -> purchase plan ->
 * promotion candidate -> (plan, promo) combo -> action beam -> per-plan `keep`
 * -> the final `K`. A turn the engine never considered fell off ONE of those
 * rungs, and E1's analyser could not say which. This module is the sink that
 * says which: a caller nominates a TARGET turn (its end `Kpos`, and optionally
 * the packed action line that reaches it) and the generator records, per rung,
 * whether the target was still present and by what margin it was not.
 *
 * **Behaviour.** A `GenTrace` is pure instrumentation. Installing one must not
 * change a single emitted candidate, its order, its `gainCc` or the `GenStats`
 * the call reports (`tests/ai/hard/gen-trace.test.ts` pins that on eight
 * positions). Every hook is a `trace === null` test in a place the generator
 * already branches once per STAGE — never once per within-turn node — and the
 * whole record is preallocated, so tracing allocates nothing after
 * `newGenTrace()`.
 *
 * **Not a config field.** `GenTrace` is installed with
 * `TurnGenerator.setTrace`, never through `GenConfig`/`HardConfig`:
 * `lab/hard-ai/ladder/identity.ts` serialises the whole `HardConfig` into the
 * engine identity hash that `tests/lab/ablate.test.ts` pins at
 * `4e7afdf76b32fad…`, and a new config key would make the frozen E1 champion a
 * different engine for no behaviour change.
 *
 * **What it cannot see.** The trace ends at the generator's output list. Whether
 * the root SEARCH then examined the candidate is `search/root.ts`'s business
 * (lane 1's `RootResult.candidates`); a target that reaches `finalRank >= 0`
 * here was offered to the search and removed by nothing in `gen/`.
 */
import { MAX_TURN_ACTIONS } from '../types';
import { AKind, paA, paKind } from '../core/action';

/** Sentinel for "this stage had nothing to say" (no target line, stage not run). */
export const TRACE_UNKNOWN = -1;
/** Longest target line the trace stores; a macro turn cannot exceed it. */
export const TRACE_LINE_CAPACITY = MAX_TURN_ACTIONS;
/** Most BUY/PROMOTE actions a target line can carry, for the derived sets. */
const TRACE_MAX_BUYS = 8;

/**
 * The ladder, in the order the generator walks it. A verdict names the FIRST
 * rung whose `present` is 0; `SEARCH` is the rung `gen/` cannot see and is only
 * ever reported by a consumer that merges a root-search record.
 */
export const GenStage = {
  UPKEEP: 'upkeep',
  PURCHASE: 'purchase',
  PROMOTION: 'promotion',
  COMBO: 'combo',
  BEAM: 'beam',
  KEEP: 'keep',
  FINAL_K: 'final-k',
  PRESENT: 'present',
  SEARCH: 'search',
} as const;
export type GenStage = (typeof GenStage)[keyof typeof GenStage];

/**
 * One generation's stage record. Every field is a number or a preallocated
 * typed array; `-1` reads as "unknown/absent" throughout.
 */
export interface GenTrace {
  // --- the watch -------------------------------------------------------------
  /** Target end `Kpos`. A boundary matches when BOTH lanes match. */
  watchLo: number;
  watchHi: number;
  /** Packed target line, or `targetLen === 0` when only the end key is known. */
  target: Int32Array;
  targetLen: number;

  // --- derived from the target line (filled by `resetGenTrace`) --------------
  /** `paA` of the target's leading `PAY_UPKEEP`, or -1. */
  targetKeepIndex: number;
  /** The target's `BUY` actions, packed, ascending. */
  targetBuys: Int32Array;
  targetBuyCount: number;
  /** The target's `PROMOTE` slots, ascending. */
  targetPromoSlots: Int32Array;
  targetPromoCount: number;

  // --- stage 1: upkeep keep-set ---------------------------------------------
  upkeepPending: number;
  /** Keep sets `gen/upkeep.ts` offered. */
  keepSetsOffered: number;
  /** Keep sets the node actually iterated (`INTERIOR_KEEP_SETS` at ply > 0). */
  keepSetLimit: number;
  /** 1 present, 0 cut by the interior cap, -1 unknown. */
  keepPresent: number;
  /** Set while the keep-set iteration is on the target's own set. */
  activeKeep: number;

  // --- stage 2: purchase shortlist ------------------------------------------
  planCount: number;
  planLimit: number;
  /** Index of the plan whose BUY set equals the target's, or -1. */
  planRank: number;
  planScoreCc: number;
  /** Score of the last plan `planPurchases` kept (the shortlist's cutoff). */
  planCutoffCc: number;

  // --- stage 3: promotion candidates ----------------------------------------
  promoCount: number;
  promoLimit: number;
  promoRank: number;
  promoScoreCc: number;
  promoCutoffCc: number;
  /** 1 when the target promotes two or more units — unrepresentable here. */
  multiPromotion: number;

  // --- stage 4: (plan, promo) combo shortlist -------------------------------
  comboCount: number;
  comboLimit: number;
  comboRank: number;
  comboScoreCc: number;
  comboCutoffCc: number;

  // --- stage 5/6: the action beam and its per-plan `keep` -------------------
  /** The beam reached a turn boundary with the watched end key. */
  beamReached: number;
  /** `placeIndex` of the run that reached it, -1 when none did. */
  beamPlaceIndex: number;
  /** Action-phase depth at the boundary. */
  beamDepth: number;
  /** Within-turn score the boundary scored. */
  beamGainCc: number;
  /** Times the per-plan `keep` list refused it. */
  beamKeepDrops: number;
  /** Worst gain in the `keep` list the last time it was refused. */
  beamKeepCutoffCc: number;
  /** `ActionSearch.keep` in force for the run that reached it. */
  beamKeepWidth: number;
  /** It survived the per-plan `keep` and was handed to `offer`. */
  beamEmitted: number;

  // --- stage 7: the final K --------------------------------------------------
  /** `offer`/`offerForced` saw the target. */
  offered: number;
  /** `offer` refused or displaced it against `K`. */
  offerDisplaced: number;
  /** Beam budget `K` in force. */
  k: number;
  finalCount: number;
  /** Rank in the returned list, or -1. */
  finalRank: number;
  finalGainCc: number;
  /** Gain of the last beam candidate in the returned list (the K-th). */
  kthGainCc: number;

  // --- injections ------------------------------------------------------------
  /** A forced injection produced the target. */
  injected: number;
  injectedFlags: number;

  // --- capture ---------------------------------------------------------------
  /** The first line found to reach the watched end key; `hitLineLen === 0` when none did. */
  hitLine: Int32Array;
  hitLineLen: number;
  hitFlags: number;
}

export function newGenTrace(): GenTrace {
  return {
    watchLo: 0,
    watchHi: 0,
    target: new Int32Array(TRACE_LINE_CAPACITY),
    targetLen: 0,
    targetKeepIndex: -1,
    targetBuys: new Int32Array(TRACE_MAX_BUYS),
    targetBuyCount: 0,
    targetPromoSlots: new Int32Array(TRACE_MAX_BUYS),
    targetPromoCount: 0,
    upkeepPending: 0,
    keepSetsOffered: 0,
    keepSetLimit: 0,
    keepPresent: TRACE_UNKNOWN,
    activeKeep: 1,
    planCount: 0,
    planLimit: 0,
    planRank: TRACE_UNKNOWN,
    planScoreCc: 0,
    planCutoffCc: 0,
    promoCount: 0,
    promoLimit: 0,
    promoRank: TRACE_UNKNOWN,
    promoScoreCc: 0,
    promoCutoffCc: 0,
    multiPromotion: 0,
    comboCount: 0,
    comboLimit: 0,
    comboRank: TRACE_UNKNOWN,
    comboScoreCc: 0,
    comboCutoffCc: 0,
    beamReached: 0,
    beamPlaceIndex: TRACE_UNKNOWN,
    beamDepth: TRACE_UNKNOWN,
    beamGainCc: 0,
    beamKeepDrops: 0,
    beamKeepCutoffCc: 0,
    beamKeepWidth: 0,
    beamEmitted: 0,
    offered: 0,
    offerDisplaced: 0,
    k: 0,
    finalCount: 0,
    finalRank: TRACE_UNKNOWN,
    finalGainCc: 0,
    kthGainCc: 0,
    injected: 0,
    injectedFlags: 0,
    hitLine: new Int32Array(TRACE_LINE_CAPACITY),
    hitLineLen: 0,
    hitFlags: 0,
  };
}

/**
 * Arms the trace on one target and clears every per-generation field.
 * `line`/`lineLen` are optional: with no line the structural rungs (upkeep,
 * purchase, promotion, combo) report `-1` and only the beam and `K` rungs
 * answer, which is what a target known ONLY by its end key can support.
 */
export function resetGenTrace(tr: GenTrace, watchHi: number, watchLo: number, line?: Int32Array, lineLen = 0): void {
  // NOT coerced with `| 0`: `PackedState.kposLo`/`kposHi` are Zobrist lanes and
  // may arrive unsigned, so a sign-folding coercion here would never match.
  tr.watchHi = watchHi;
  tr.watchLo = watchLo;
  tr.targetLen = 0;
  tr.targetKeepIndex = -1;
  tr.targetBuyCount = 0;
  tr.targetPromoCount = 0;
  if (line !== undefined && lineLen > 0) {
    const n = lineLen > TRACE_LINE_CAPACITY ? TRACE_LINE_CAPACITY : lineLen;
    for (let i = 0; i < n; i++) tr.target[i] = line[i];
    tr.targetLen = n;
    for (let i = 0; i < n; i++) {
      const a = tr.target[i];
      const kind = paKind(a);
      if (kind === AKind.PAY_UPKEEP) tr.targetKeepIndex = paA(a);
      else if (kind === AKind.BUY) {
        if (tr.targetBuyCount < TRACE_MAX_BUYS) tr.targetBuys[tr.targetBuyCount++] = a;
      } else if (kind === AKind.PROMOTE) {
        if (tr.targetPromoCount < TRACE_MAX_BUYS) tr.targetPromoSlots[tr.targetPromoCount++] = paA(a);
      }
    }
    sortAsc(tr.targetBuys, tr.targetBuyCount);
    sortAsc(tr.targetPromoSlots, tr.targetPromoCount);
  }
  tr.upkeepPending = 0;
  tr.keepSetsOffered = 0;
  tr.keepSetLimit = 0;
  tr.keepPresent = TRACE_UNKNOWN;
  tr.activeKeep = 1;
  tr.planCount = 0;
  tr.planLimit = 0;
  tr.planRank = TRACE_UNKNOWN;
  tr.planScoreCc = 0;
  tr.planCutoffCc = 0;
  tr.promoCount = 0;
  tr.promoLimit = 0;
  tr.promoRank = TRACE_UNKNOWN;
  tr.promoScoreCc = 0;
  tr.promoCutoffCc = 0;
  tr.multiPromotion = tr.targetPromoCount >= 2 ? 1 : 0;
  tr.comboCount = 0;
  tr.comboLimit = 0;
  tr.comboRank = TRACE_UNKNOWN;
  tr.comboScoreCc = 0;
  tr.comboCutoffCc = 0;
  tr.beamReached = 0;
  tr.beamPlaceIndex = TRACE_UNKNOWN;
  tr.beamDepth = TRACE_UNKNOWN;
  tr.beamGainCc = 0;
  tr.beamKeepDrops = 0;
  tr.beamKeepCutoffCc = 0;
  tr.beamKeepWidth = 0;
  tr.beamEmitted = 0;
  tr.offered = 0;
  tr.offerDisplaced = 0;
  tr.k = 0;
  tr.finalCount = 0;
  tr.finalRank = TRACE_UNKNOWN;
  tr.finalGainCc = 0;
  tr.kthGainCc = 0;
  tr.injected = 0;
  tr.injectedFlags = 0;
  tr.hitLineLen = 0;
  tr.hitFlags = 0;
}

function sortAsc(a: Int32Array, n: number): void {
  for (let i = 1; i < n; i++) {
    const v = a[i];
    let j = i - 1;
    while (j >= 0 && a[j] > v) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = v;
  }
}

/** True when `buys[0..n)` (ascending) is the target's BUY set exactly. */
export function traceBuysMatch(tr: GenTrace, buys: Int32Array, n: number): boolean {
  if (n !== tr.targetBuyCount) return false;
  // A `PlacePlan`'s buys are emitted in descending square score, so compare as
  // sets: `n` is at most 4 (`PURCHASE_MAX_BODIES`).
  for (let i = 0; i < n; i++) {
    let found = false;
    for (let j = 0; j < n && !found; j++) if (tr.targetBuys[j] === buys[i]) found = true;
    if (!found) return false;
  }
  return true;
}

/** Records the line that first reached the watched end key. */
export function traceCaptureLine(tr: GenTrace, actions: Int32Array, count: number, flags: number): void {
  if (tr.hitLineLen !== 0) return;
  const n = count > TRACE_LINE_CAPACITY ? TRACE_LINE_CAPACITY : count;
  for (let i = 0; i < n; i++) tr.hitLine[i] = actions[i];
  tr.hitLineLen = n;
  tr.hitFlags = flags;
}

/**
 * The first rung of the ladder the target fell off, read off a finished trace.
 * `PRESENT` means nothing in `gen/` removed it: it was in the returned list, and
 * only the root search can have discarded it.
 */
export function firstRemovingStage(tr: GenTrace): GenStage {
  if (tr.finalRank >= 0) return GenStage.PRESENT;
  if (tr.upkeepPending === 1 && tr.keepPresent === 0) return GenStage.UPKEEP;
  if (tr.multiPromotion === 1) return GenStage.PROMOTION;
  if (tr.targetLen > 0 && tr.targetBuyCount > 0 && tr.planRank < 0) return GenStage.PURCHASE;
  if (tr.targetLen > 0 && tr.targetPromoCount === 1 && tr.promoRank < 0) return GenStage.PROMOTION;
  if (tr.targetLen > 0 && tr.planRank >= 0 && tr.comboRank < 0) return GenStage.COMBO;
  if (tr.beamReached === 0) return GenStage.BEAM;
  if (tr.beamEmitted === 0) return GenStage.KEEP;
  return GenStage.FINAL_K;
}
