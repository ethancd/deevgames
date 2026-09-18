/**
 * The turn-generator facade (DESIGN §4.13 `gen/generate.ts`, §5.6, §5.10).
 *
 * One macro turn is: an optional `PAY_UPKEEP` keep-set, a Place-phase prefix
 * (buys and promotions, then `END_PLACE`), an action-phase line, and the turn
 * boundary. `gen/upkeep.ts`, `gen/purchase.ts` and `gen/promote.ts` own the
 * first two; `gen/actionsearch.ts` owns the third. This module drives them in
 * the order DESIGN §5.6 prints and then adds the part no beam can be trusted
 * with — the **forced injections**, eight kinds of line that belong in the
 * candidate list whether or not the beam happened to score them well:
 *
 *   1 every `homeRaceAvailable` line                         (HOME_RACE)
 *   2 every `killNow[me]` entry inside the action budget,
 *     realised by its cheapest witness                       (KILL)
 *   3 every legal home-corner entry by an existing unit      (HOME_ENTRY)
 *   4 the home-rescue witness when an enemy holds my corner  (HOME_RESCUE)
 *   5 the mine-only turn — the null-move substitute          (QUIET)
 *   6 the best pure-defence retreat                          (RETREAT)
 *   7 the best spawn-denial move                             (SPAWN_DENY)
 *   8 the best summon-and-strike                             (SUMMON_STRIKE)
 *
 * A FORCED candidate is never counted against `K`, never displaced by the beam,
 * and (at M14) never reduced or futility-pruned. Injection 5 is also why DESIGN
 * F7's "the generator can never return an empty list" holds: the mine-only turn
 * exists in every non-terminal position the mover can act in, upkeep nodes
 * included (where it is `PAY_UPKEEP` of the best-ranked keep set, then the two
 * phase terminators).
 *
 * **Injections at an upkeep node.** Injections 1-4 and 6-8 are computed from
 * `NodeTables` built for the PRE-payment position, and `PAY_UPKEEP` can release
 * bodies those tables refer to. Rather than rebuild the tables per keep set,
 * only the QUIET line is injected there; the keep-set × place-plan × action
 * beam below covers the rest, and the root's must-answer layer (§5.10, M14)
 * re-asks the tactical questions after the payment. See DEVIATIONS under M13.
 *
 * **Injection 4 and layering.** DESIGN §5.6 sources the rescue witness from
 * `tactics/prover.ts homeWitness`, but §2's layering forbids `gen` from
 * importing `tactics` (and `lab/hard-ai/deps.ts` enforces it). The witness is
 * therefore taken through `setRescueWitness`, which `search/root.ts` (M14)
 * wires to the prover; with no source installed the injection is skipped, and
 * §5.10 already has the root inject a proved rescue FORCED ahead of everything
 * else. See DEVIATIONS under M13.
 *
 * **Root versus interior.** §5.10 caps the keep-set branch at "all ≤ 64 at the
 * root, 4 at interior nodes". `GenConfig` carries no root flag, so `ply === 0`
 * is the root — the same convention the evaluator and the search use for
 * distance from the root.
 *
 * Nothing here allocates during a search: the `PlacePlan`/`PromoCandidate`
 * records, the line buffers and the two `ActionSearch` instances are built in
 * the constructor.
 */
import {
  DEAD,
  MAX_SLOTS,
  MAX_TURN_ACTIONS,
  NO_SLOT,
  Result,
  type Centi,
  type PackedState,
  type Side,
} from '../types';
import { bbHas, bbNext, type BB, type Scratch } from '../core/bits';
import { ADJ_LIST, BOARD, CORNER, RECT } from '../core/tables';
import { powerIndex, type Catalog } from '../core/catalog';
import { AKind, paKind, paMake, type KeepSetTable } from '../core/action';
import { ACTIONS_PER_TURN, Replica, newUndo, type Undo } from '../core/state';
import { moveCost } from '../core/movement';
import { HOME_RACE_LINE_LEN, homeRaceAvailable } from '../tables/home';
import {
  KILL_IMPOSSIBLE,
  KILL_MAX_LANES,
  KILL_NO_ATTACKER,
  minActionsToKill,
  newKillPlan,
  type KillOpts,
  type KillPlan,
} from '../tables/kill';
import type { NodeTables } from '../tables/context';
import { TACTICAL_FLAGS, TurnFlag, turnSignature, type Turn, type TurnPool } from './turn';
import { ActionSearch, type WithinTurnScorer, type WorkSink } from './actionsearch';
import { PURCHASE_MAX_BODIES, newPlacePlan, planPurchases, type PlacePlan } from './purchase';
import { newPromoCandidate, planPromotions, type PromoCandidate } from './promote';
import { genKeepSets } from './upkeep';
import { TRACE_UNKNOWN, traceBuysMatch, traceCaptureLine, type GenTrace } from './trace';
import type { ActionSearchConfig, GenConfig, PurchaseConfig } from '../config';

export type { GenConfig } from '../config';
export type { PlacePlan } from './purchase';

export interface GenStats {
  placePlans: number;
  rawLines: number;
  dedupedTo: number;
  nodes: number;
  injected: number;
  /**
   * E4.3 candidate A (P8). How many times THIS generation wanted injection 4's
   * rescue witness and was refused by `HardConfig.searchFix.rescueCap`
   * (`RescueCap`); 0 in every generation with the flag absent, and at most 1,
   * since `inject` asks for the witness once. `search/pvs.ts generateAt` reads
   * it and sets `SearchContext.truncated`, so a node whose candidate list is
   * short BECAUSE of the cap cannot publish to the transposition table — the
   * rule `GEN_SINK.cut` already enforces for a deadline-cut generation.
   */
  rescueCapped: number;
}

export function newGenStats(): GenStats {
  return { placePlans: 0, rawLines: 0, dedupedTo: 0, nodes: 0, injected: 0, rescueCapped: 0 };
}

/**
 * The rescue witness DESIGN §5.6 injection 4 needs, taken structurally so `gen`
 * need not import `tactics` (DESIGN §2 layering). A bound
 * `tactics/prover.ts homeWitness` satisfies it.
 *
 * `keep` is this node's keep-set table. The prover's witness line opens with
 * its OWN `PAY_UPKEEP` indexing the prover's private keep-set table
 * (DESIGN §4.14), so the installer has to copy that set into the node's table
 * and re-index the action — or drop it when no upkeep is pending. It cannot do
 * either without the table, which is why it is a parameter. Added by M14; see
 * DEVIATIONS.
 */
export type RescueWitness = (p: PackedState, invader: Side, out: Int32Array, keep: KeepSetTable) => number;

/** `WorkClass.PROVER` (DESIGN §4.16), spelled here so `gen` need not import
 * `search` — the convention `gen/actionsearch.ts` uses for `WorkClass.TURN`. */
const WORK_CLASS_PROVER = 8;

/**
 * E4.3 candidate A's budget for DESIGN §5.6 injection 4
 * (`docs/hard-ai/e3/P8-SLOW-TURNS.md` §6, `docs/hard-ai/e4/E4.3-RESCUE-CAP.md`).
 *
 * WHY A BUDGET AND NOT A PER-`generate` CONSTANT. `inject` asks for the rescue
 * witness AT MOST ONCE per generation, so a per-generation cap can never bite;
 * what runs away is the NUMBER OF GENERATIONS that each pay for one. Measured
 * on P8's champion-seat turn 23 at fixed:100,000: 92 witness calls, 62.8 s,
 * every one of them stopping at the prover's `PROOF_NODES` cutoff with no
 * rescue proved, inside a search that spent 82.2 s to reach depth 2. The
 * quantity worth bounding is therefore the count per TURN, which is what one
 * instance of this class — shared by the engine's three generators and reset
 * once per `HardEngine.searchTurn` — counts.
 *
 * `null` on every profile: `HardConfig.searchFix` is absent everywhere and
 * `engine.ts` installs a cap only when `searchFix.rescueCap` is a positive
 * number, so with the flag absent `injectRescue` pays one null test and
 * nothing else moves.
 */
export class RescueCap {
  private readonly cap: number;
  private left: number;

  constructor(cap: number) {
    if (!Number.isInteger(cap) || cap < 0) throw new RangeError(`RescueCap: bad cap ${cap}`);
    this.cap = cap;
    this.left = cap;
  }

  /** Re-arms the budget for a fresh turn. */
  reset(): void {
    this.left = this.cap;
  }

  /** Spends one witness call, or returns false when the cap has bitten. */
  take(): boolean {
    if (this.left <= 0) return false;
    this.left -= 1;
    return true;
  }

  /** Calls still available this turn; for the lab and the tests. */
  get remaining(): number {
    return this.left;
  }
}

/** §5.10's interior-node keep-set cap; the root takes all of them. */
export const INTERIOR_KEEP_SETS = 4;
/** DESIGN §5.6: the reference generator's `K`, widths and place-plan budget. */
export const REFERENCE_K = 2000;
export const REFERENCE_WIDTHS: readonly number[] = [40, 16, 8, 4];
export const REFERENCE_PLACE_PLANS = 200;
export const REFERENCE_KEEP = 12;
/** Room for the forced injections on top of `K` (eight kinds, a few lines each). */
export const FORCED_CAPACITY = 128;
/**
 * Ceiling on the action-search lines kept per place plan.
 *
 * DESIGN §8 fixes `keep = 4`, which fills `K = 24` only when the place phase
 * offers several plans (§5.6: `maxPlacePlans` is 16 at the root). A node with
 * ONE plan — the whole early game, where the bank cannot afford a body and
 * `finishPlacement` auto-advances straight into the action phase — would then
 * return four candidates against a `K` of 24 and throw away most of the beam's
 * recall. `keep` is therefore raised to `ceil(K / placePlans)`, never below
 * §8's 4 and never above this ceiling. See DEVIATIONS under M13.
 */
export const MAX_KEEP_LINES = 64;
/** The same ceiling for `generateReference`, whose whole job is breadth (F25). */
export const REFERENCE_MAX_KEEP = 512;
/** Open-addressed end-position dedupe table; must exceed the largest candidate list. */
const DEDUPE_SLOTS = 32768;
/**
 * Node budget for one `generateReference` call.
 *
 * DESIGN §5.6 sizes the reference by shape — widths `[40, 16, 8, 4]`, 200 place
 * plans — not by cost, and on a wide-open board those numbers multiply out to
 * tens of millions of within-turn nodes (a width-40 step re-scores every legal
 * action of the node, and a two-anchor position has ~300 of them). The
 * instrument that consumes the reference measures hundreds of positions inside
 * a ten-minute gate, so the call carries its own deterministic budget: the beam
 * keeps its shape and simply stops where the budget runs out, always after the
 * forced injections and the first (best-scoring) place plans. See DEVIATIONS
 * under M13.
 */
export const REFERENCE_NODE_BUDGET = 120_000;
/** `homeRaceAvailable` writes `[BUY, END_PLACE?, MOVE]` triples. */
const HOME_RACE_LINES = 24;
/** Working line buffer: the longest injection is buys + terminators + 4 actions. */
const LINE_CAPACITY = MAX_TURN_ACTIONS;

/** Candidate-array capacity `generate` requires. */
export function outCapacityFor(cfg: GenConfig): number {
  return cfg.K + FORCED_CAPACITY;
}

/** Candidate-array capacity `generateReference` requires. */
export function referenceCapacity(): number {
  return REFERENCE_K + FORCED_CAPACITY;
}

interface PlaceCombo {
  /** Index into the purchase-plan array. */
  purchase: number;
  /** Index into the promotion array, or -1. */
  promo: number;
  scoreCc: Centi;
}

function newPlaceCombo(): PlaceCombo {
  return { purchase: 0, promo: -1, scoreCc: 0 };
}

interface Ctx {
  p: PackedState;
  t: NodeTables;
  score: WithinTurnScorer;
  meter: WorkSink;
  ply: number;
  keep: KeepSetTable;
  out: Turn[];
  stats: GenStats;
  reference: boolean;
  /** Number of candidates written so far. */
  count: number;
  /** Candidates `[0, forced)` are FORCED and are never displaced. */
  forced: number;
  capacity: number;
  /** Beam budget, i.e. how many non-forced candidates survive. */
  k: number;
}

/**
 * Open-addressed `endLo -> candidate index + 1` map, valid for ONE `generate`.
 * The candidate list runs to 2,128 entries in the reference generator, where a
 * linear dedupe scan would be quadratic.
 *
 * The table is NEVER cleared between calls: a 32,768-slot `fill(0)` is a 128 KB
 * memset, and `generate` is called once per search node against DESIGN §8's
 * `WORK_COST GEN = 4` (≈ 4 µs) — the clear alone would swamp the whole budget,
 * at an interior node whose candidate list is 24 entries no less. Instead every
 * slot carries the generation that wrote it (`DEDUPE_STAMP`), and a slot whose
 * stamp is not the current `dedupeEpoch` reads as empty. See DEVIATIONS under
 * M13.
 */
const DEDUPE = new Int32Array(DEDUPE_SLOTS);
const DEDUPE_STAMP = new Int32Array(DEDUPE_SLOTS);
const DEDUPE_MASK = DEDUPE_SLOTS - 1;
/** Bumped per `generate`; stamps start at 0, so the first epoch is 1. */
let dedupeEpoch = 0;

/** Starts a fresh dedupe generation in O(1). */
function dedupeReset(): void {
  dedupeEpoch++;
  if (dedupeEpoch === 0x7fffffff) {
    DEDUPE_STAMP.fill(0);
    dedupeEpoch = 1;
  }
}

export class TurnGenerator {
  private readonly rep: Replica;
  private readonly cfg: GenConfig;
  private readonly pool: TurnPool;
  private readonly sc: Scratch;
  private readonly undo: Undo = newUndo();
  private readonly search: ActionSearch;
  private readonly referenceSearch: ActionSearch;
  private readonly referencePurchase: PurchaseConfig;
  /** The generator's OWN copies of the two action-search configs: `keep` is
   * retuned per node (see `MAX_KEEP_LINES`), and `ActionSearch` reads the object
   * it was constructed with on every `run`. */
  private readonly actionCfg: ActionSearchConfig;
  private readonly referenceCfg: ActionSearchConfig;

  private readonly plans: PlacePlan[] = [];
  private readonly promos: PromoCandidate[] = [];
  private readonly combos: PlaceCombo[] = [];
  private readonly prefix = new Int32Array(LINE_CAPACITY);
  private readonly line = new Int32Array(LINE_CAPACITY);
  private readonly homeRace = new Int32Array(HOME_RACE_LINES * HOME_RACE_LINE_LEN);
  private readonly witnessLine = new Int32Array(LINE_CAPACITY);
  private readonly killPlan: KillPlan = newKillPlan();
  private readonly killOpts: KillOpts = {
    actionBudget: ACTIONS_PER_TURN,
    crystalBudget: 0,
    allowBuys: true,
    allowPromotes: false,
    maxLanes: KILL_MAX_LANES,
  };
  private readonly lineTurns: Turn[] = [];
  private readonly referenceWork = new BoundedWork(REFERENCE_NODE_BUDGET);
  private rescue: RescueWitness | null = null;
  /** E4.3 candidate A's rescue budget; `null` — no cap — on every profile. */
  private rescueCap: RescueCap | null = null;
  /** E2.2's opt-in stage trace; `null` in every search. See `gen/trace.ts`. */
  private trace: GenTrace | null = null;

  constructor(rep: Replica, cfg: GenConfig, pool: TurnPool, sc: Scratch) {
    this.rep = rep;
    this.cfg = cfg;
    this.pool = pool;
    this.sc = sc;
    this.actionCfg = { widths: cfg.action.widths, keep: cfg.action.keep, ttBits: cfg.action.ttBits };
    this.referenceCfg = referenceActionConfig(cfg.action);
    this.search = new ActionSearch(rep, this.actionCfg, pool, sc);
    this.referenceSearch = new ActionSearch(rep, this.referenceCfg, pool, sc);
    this.referencePurchase = referencePurchaseConfig(cfg.purchase);
    const planCount = Math.max(cfg.purchase.maxPlans, REFERENCE_PLACE_PLANS) + 1;
    for (let i = 0; i < planCount; i++) this.plans.push(newPlacePlan());
    for (let i = 0; i < Math.max(cfg.maxPromotions, 1); i++) this.promos.push(newPromoCandidate());
    const comboCount = Math.max(cfg.maxPlacePlans, REFERENCE_PLACE_PLANS) + planCount;
    for (let i = 0; i < comboCount; i++) this.combos.push(newPlaceCombo());
    for (let i = 0; i < REFERENCE_MAX_KEEP; i++) this.lineTurns.push(placeholderTurn());
  }

  /** Installs (or clears) DESIGN §5.6 injection 4's source. */
  setRescueWitness(source: RescueWitness | null): void {
    this.rescue = source;
  }

  /**
   * Installs (or clears) E4.3 candidate A's budget for that source
   * (`HardConfig.searchFix.rescueCap`). `null` — every profile — leaves
   * injection 4 exactly as DESIGN §5.6 has it: unbounded and unpriced.
   *
   * NOT a `GenConfig` field, for the reason `setTrace` is not one: `HardConfig`
   * is serialised into the engine identity hash `tests/lab/ablate.test.ts`
   * pins, and the generator configs are part of it. The FLAG lives on
   * `HardConfig.searchFix`, which no profile writes; `engine.ts` reads it and
   * hands the same budget object to all three generators.
   */
  setRescueCap(cap: RescueCap | null): void {
    this.rescueCap = cap;
  }

  /**
   * Installs (or clears) E2.2's stage trace, which records at each shortlist
   * whether a nominated target turn was still present (`gen/trace.ts`). Pure
   * instrumentation: with a trace installed the emitted list, its order, its
   * scores and `GenStats` are byte-identical to the untraced call, and with
   * `null` installed — every search — the cost is one null test per stage.
   *
   * NOT a `GenConfig` field: `HardConfig` is serialised into the engine
   * identity hash `tests/lab/ablate.test.ts` pins.
   */
  setTrace(trace: GenTrace | null): void {
    this.trace = trace;
    this.search.setTrace(trace);
    this.referenceSearch.setTrace(trace);
  }

  /**
   * DESIGN §4.13's `generate`. Writes the candidate turns into `out` — forced
   * injections first, then the beam's best by within-turn score — and returns
   * how many. `keep` receives the node's keep-set table when `p.upkeepPending`,
   * and every `PAY_UPKEEP` in an emitted turn indexes into it.
   *
   * The caller owns `out` (`outCapacityFor(cfg)` slots) and the `TurnPool`,
   * which it resets per node.
   */
  generate(
    p: PackedState,
    t: NodeTables,
    score: WithinTurnScorer,
    meter: WorkSink,
    ply: number,
    keep: KeepSetTable,
    out: Turn[],
    stats: GenStats,
  ): number {
    return this.run(p, t, score, meter, ply, keep, out, stats, false);
  }

  /**
   * DESIGN §4.13's reference generator, for the recall instrument: `K` 2000,
   * widths `[40, 16, 8, 4]`, 200 place plans, and every `strikeIfBought`
   * witness and denial move injected rather than only the best of each (F25).
   */
  generateReference(
    p: PackedState,
    t: NodeTables,
    score: WithinTurnScorer,
    ply: number,
    keep: KeepSetTable,
    out: Turn[],
    stats: GenStats = newGenStats(),
  ): number {
    this.referenceWork.reset(REFERENCE_NODE_BUDGET);
    return this.run(p, t, score, this.referenceWork, ply, keep, out, stats, true);
  }

  // --- the driver ------------------------------------------------------------

  private run(
    p: PackedState,
    t: NodeTables,
    score: WithinTurnScorer,
    meter: WorkSink,
    ply: number,
    keep: KeepSetTable,
    out: Turn[],
    stats: GenStats,
    reference: boolean,
  ): number {
    stats.placePlans = 0;
    stats.rawLines = 0;
    stats.dedupedTo = 0;
    stats.nodes = 0;
    stats.injected = 0;
    stats.rescueCapped = 0;
    if (p.result !== Result.ONGOING) return 0;

    const ctx: Ctx = {
      p,
      t,
      score,
      meter,
      ply,
      keep,
      out,
      stats,
      reference,
      count: 0,
      forced: 0,
      capacity: out.length,
      k: reference ? REFERENCE_K : this.cfg.K,
    };

    dedupeReset();
    const sets = p.upkeepPending === 1 ? genKeepSets(p, t, keep) : 0;
    const tr = this.trace;
    if (tr !== null) {
      tr.upkeepPending = p.upkeepPending;
      tr.keepSetsOffered = sets;
      tr.keepSetLimit = p.upkeepPending === 1 ? (ply === 0 || reference ? sets : Math.min(sets, INTERIOR_KEEP_SETS)) : 0;
      tr.keepPresent =
        p.upkeepPending !== 1 || tr.targetKeepIndex < 0 ? TRACE_UNKNOWN : tr.targetKeepIndex < tr.keepSetLimit ? 1 : 0;
      tr.activeKeep = 1;
      tr.k = ctx.k;
    }

    // Forced injections come first, so the beam can never squeeze them out and a
    // duplicate end position the beam rediscovers is dropped instead (§5.6).
    this.inject(ctx, sets);
    ctx.forced = ctx.count;
    stats.injected = ctx.count;

    this.undo.top = 0;
    if (p.upkeepPending === 1) {
      const limit = ply === 0 || reference ? sets : Math.min(sets, INTERIOR_KEEP_SETS);
      for (let i = 0; i < limit; i++) {
        if (tr !== null) tr.activeKeep = tr.targetKeepIndex < 0 || tr.targetKeepIndex === i ? 1 : 0;
        const a = paMake(AKind.PAY_UPKEEP, i, 0, 0);
        if (!this.rep.isLegal(p, a, keep)) continue;
        const top = this.undo.top;
        this.prefix[0] = a;
        this.rep.make(p, a, this.undo, keep);
        if (p.result === Result.ONGOING) this.expand(ctx, 1);
        else this.recordPrefixTerminal(ctx, 1, TurnFlag.QUIET);
        this.rep.unmake(p, this.undo);
        this.undo.top = top;
        if (meter.exhausted()) break;
      }
    } else {
      this.expand(ctx, 0);
    }

    stats.dedupedTo = ctx.count;
    this.finish(ctx);
    if (tr !== null) this.traceFinal(ctx, tr);
    return ctx.count;
  }

  /**
   * Builds the place plans for the state `p` is in right now (upkeep paid,
   * `prefixLen` prefix actions applied and recorded) and runs the action search
   * from each of them.
   */
  private expand(ctx: Ctx, prefixLen: number): void {
    const { p, t } = ctx;
    if (p.phase !== 0) {
      // Already in the action phase: an upkeep payment that left nothing buyable
      // or promotable auto-advances (`core/state.ts finishPlacement`).
      ctx.stats.placePlans += 1;
      this.tuneKeep(ctx, 1);
      this.runSearch(ctx, prefixLen, -1);
      return;
    }
    const purchaseCfg = ctx.reference ? this.referencePurchase : this.cfg.purchase;
    const planCount = planPurchases(p, t, purchaseCfg, this.sc, ctx.ply, this.plans);
    const promoCount = planPromotions(p, t, this.cfg.maxPromotions, this.promos);
    const maxPlans = ctx.reference ? REFERENCE_PLACE_PLANS : this.cfg.maxPlacePlans;
    const comboCount = this.buildCombos(p, planCount, promoCount, maxPlans);
    ctx.stats.placePlans += comboCount;
    const tr = this.trace;
    if (tr !== null && tr.activeKeep === 1) {
      this.tracePlace(tr, purchaseCfg.maxPlans, planCount, promoCount, comboCount, maxPlans);
    }
    this.tuneKeep(ctx, comboCount);
    for (let i = 0; i < comboCount; i++) {
      this.runCombo(ctx, prefixLen, this.combos[i], i);
      if (ctx.meter.exhausted()) return;
    }
  }

  /**
   * `(purchase plan) × (promotion candidate)` pruned to `maxPlans` by combined
   * score, with the empty plan pinned first and every home-race buy appended
   * afterwards (DESIGN §5.5's last paragraph, F13).
   */
  private buildCombos(p: PackedState, planCount: number, promoCount: number, maxPlans: number): number {
    const side = p.side as Side;
    const bank = p.bank[side];
    const limit = Math.min(maxPlans, this.combos.length);
    const first = this.combos[0];
    first.purchase = 0;
    first.promo = -1;
    first.scoreCc = 0;
    let n = 1;
    for (let i = 0; i < planCount; i++) {
      const plan = this.plans[i];
      for (let j = -1; j < promoCount; j++) {
        if (i === 0 && j === -1) continue;
        const promo = j >= 0 ? this.promos[j] : null;
        const spend = plan.spend + (promo === null ? 0 : promo.cost);
        if (spend > bank) continue;
        const scoreCc = plan.scoreCc + (promo === null ? 0 : promo.scoreCc);
        let slot: number;
        if (n < limit) slot = n++;
        else {
          if (n <= 1) continue;
          let worst = 1;
          for (let k = 2; k < n; k++) if (this.combos[k].scoreCc < this.combos[worst].scoreCc) worst = k;
          if (scoreCc <= this.combos[worst].scoreCc) continue;
          slot = worst;
        }
        const combo = this.combos[slot];
        combo.purchase = i;
        combo.promo = j;
        combo.scoreCc = scoreCc;
      }
    }
    // Every home-race purchase stays a place plan even when the pruning above
    // would have dropped it (DESIGN F13).
    for (let i = 1; i < planCount && n < this.combos.length; i++) {
      if ((this.plans[i].flags & TurnFlag.HOME_RACE) === 0) continue;
      let present = false;
      for (let k = 0; k < n && !present; k++) if (this.combos[k].purchase === i) present = true;
      if (present) continue;
      const combo = this.combos[n++];
      combo.purchase = i;
      combo.promo = -1;
      combo.scoreCc = this.plans[i].scoreCc;
    }
    // Descending score over `[1, n)`; index 0 stays the empty plan.
    for (let i = 2; i < n; i++) {
      const combo = this.combos[i];
      let j = i - 1;
      while (j >= 1 && this.combos[j].scoreCc < combo.scoreCc) {
        this.combos[j + 1] = this.combos[j];
        j--;
      }
      this.combos[j + 1] = combo;
    }
    return n;
  }

  /** Applies one place plan, runs the action search from it, and unmakes. */
  private runCombo(ctx: Ctx, prefixLen: number, combo: PlaceCombo, placeIndex: number): void {
    const { p } = ctx;
    const plan = this.plans[combo.purchase];
    const top = this.undo.top;
    let applied = 0;
    let len = prefixLen;
    let ok = true;

    for (let i = 0; i < plan.count && ok; i++) {
      const a = plan.actions[i];
      if (!this.rep.isLegal(p, a)) ok = false;
      else {
        this.prefix[len++] = a;
        this.rep.make(p, a, this.undo);
        applied++;
      }
    }
    if (ok && combo.promo >= 0) {
      const a = paMake(AKind.PROMOTE, this.promos[combo.promo].slot, 0, 0);
      if (!this.rep.isLegal(p, a)) ok = false;
      else {
        this.prefix[len++] = a;
        this.rep.make(p, a, this.undo);
        applied++;
      }
    }
    if (ok && p.result === Result.ONGOING && p.phase === 0) {
      const a = paMake(AKind.END_PLACE, 0, 0, 0);
      if (!this.rep.isLegal(p, a)) ok = false;
      else {
        this.prefix[len++] = a;
        this.rep.make(p, a, this.undo);
        applied++;
      }
    }

    if (ok) {
      if (p.result !== Result.ONGOING) this.recordPrefixTerminal(ctx, len, plan.flags);
      else this.runSearch(ctx, len, placeIndex);
    }
    for (let i = 0; i < applied; i++) this.rep.unmake(p, this.undo);
    this.undo.top = top;
  }

  /**
   * Spreads the beam budget `K` over the place plans: `ceil(K / plans)` lines
   * per plan, never below DESIGN §8's `keep` and never above `MAX_KEEP_LINES`.
   */
  private tuneKeep(ctx: Ctx, plans: number): void {
    const target = Math.ceil(ctx.k / Math.max(1, plans));
    const floor = ctx.reference ? REFERENCE_KEEP : this.cfg.action.keep;
    const ceiling = ctx.reference ? REFERENCE_MAX_KEEP : MAX_KEEP_LINES;
    const keep = Math.min(Math.max(target, floor), ceiling, this.lineTurns.length);
    if (ctx.reference) this.referenceCfg.keep = keep;
    else this.actionCfg.keep = keep;
  }

  /** One `ActionSearch.run` from the current state, folded into the candidate list. */
  private runSearch(ctx: Ctx, prefixLen: number, placeIndex: number): void {
    const { p, t } = ctx;
    if (p.phase !== 1 || p.result !== Result.ONGOING) return;
    const search = ctx.reference ? this.referenceSearch : this.search;
    if (this.pool.free < (ctx.reference ? this.referenceCfg.keep : this.actionCfg.keep)) return;
    const n = search.run(p, t, this.prefix, prefixLen, placeIndex, ctx.score, ctx.meter, ctx.ply, this.lineTurns);
    ctx.stats.rawLines += n;
    ctx.stats.nodes += search.nodes;
    for (let i = 0; i < n; i++) this.offer(ctx, this.lineTurns[i]);
  }

  /**
   * Records a turn whose PLACE phase already ended the game — an upkeep payment
   * that eliminated the side, a buy whose home occupation the gate proved.
   * There is no action phase to search, but the end position is a candidate.
   */
  private recordPrefixTerminal(ctx: Ctx, prefixLen: number, flags: number): void {
    const { p } = ctx;
    if (this.pool.free === 0) return;
    const turn = this.pool.alloc();
    for (let i = 0; i < prefixLen; i++) turn.actions[i] = this.prefix[i];
    turn.count = prefixLen;
    turn.endLo = p.kposLo;
    turn.endHi = p.kposHi;
    turn.gainCc = ctx.score(p, this.sc, ctx.ply);
    turn.place = -1;
    turn.flags = (flags & TACTICAL_FLAGS) === 0 ? flags | TurnFlag.QUIET : flags;
    this.offer(ctx, turn);
  }

  // --- candidate bookkeeping --------------------------------------------------

  /**
   * Adds a beam candidate unless its end position is already listed. Beyond `K`
   * it displaces the weakest non-forced entry; forced entries are untouchable.
   */
  private offer(ctx: Ctx, turn: Turn): void {
    const out = ctx.out;
    const tr = this.trace;
    const watched = tr !== null && turn.endLo === tr.watchLo && turn.endHi === tr.watchHi;
    if (watched) {
      const t = tr as GenTrace;
      t.offered = 1;
      t.beamEmitted = 1;
      traceCaptureLine(t, turn.actions, turn.count, turn.flags);
    }
    const at = dedupeFind(ctx, turn);
    if (at >= 0) return;
    if (ctx.count - ctx.forced < ctx.k && ctx.count < ctx.capacity) {
      dedupeInsert(turn, ctx.count);
      out[ctx.count++] = turn;
      return;
    }
    let worst = -1;
    for (let i = ctx.forced; i < ctx.count; i++) {
      if (worst < 0 || out[i].gainCc < out[worst].gainCc) worst = i;
    }
    if (worst < 0 || turn.gainCc <= out[worst].gainCc) {
      if (watched) (tr as GenTrace).offerDisplaced++;
      return;
    }
    if (tr !== null && worst >= 0 && out[worst].endLo === tr.watchLo && out[worst].endHi === tr.watchHi) {
      tr.offerDisplaced++;
    }
    // The displaced candidate's table entry is left behind: `dedupeFind`
    // validates every hit against the live `out[index]`, so a stale entry is
    // skipped rather than believed, and removing it would break the linear
    // probe chains of the keys stored after it.
    dedupeInsert(turn, worst);
    out[worst] = turn;
  }

  /** A forced candidate is appended unless its end position is already listed. */
  private offerForced(ctx: Ctx, turn: Turn): void {
    const tr = this.trace;
    if (tr !== null && turn.endLo === tr.watchLo && turn.endHi === tr.watchHi) {
      tr.offered = 1;
      tr.injected = 1;
      tr.injectedFlags |= turn.flags;
      traceCaptureLine(tr, turn.actions, turn.count, turn.flags);
    }
    const at = dedupeFind(ctx, turn);
    if (at >= 0) {
      ctx.out[at].flags |= turn.flags;
      return;
    }
    if (ctx.count >= ctx.capacity) return;
    dedupeInsert(turn, ctx.count);
    ctx.out[ctx.count++] = turn;
  }

  /** Orders the beam half best-first and signs every candidate. The dedupe map
   * indexes positions, not slots, so it is not maintained across this sort. */
  private finish(ctx: Ctx): void {
    const { p, out } = ctx;
    for (let i = ctx.forced + 1; i < ctx.count; i++) {
      const turn = out[i];
      let j = i - 1;
      while (j >= ctx.forced && out[j].gainCc < turn.gainCc) {
        out[j + 1] = out[j];
        j--;
      }
      out[j + 1] = turn;
    }
    for (let i = 0; i < ctx.count; i++) out[i].sig = turnSignature(p, out[i]);
  }

  // --- trace helpers -----------------------------------------------------------

  /**
   * Records the three place-phase shortlists against the target's own buy set
   * and promotion. Called once per `expand`, and only while the keep-set loop
   * is on the target's own set; the first expansion that LOCATES the target's
   * combo wins, so a later keep set cannot overwrite a hit with a miss.
   */
  private tracePlace(
    tr: GenTrace,
    planLimit: number,
    planCount: number,
    promoCount: number,
    comboCount: number,
    comboLimit: number,
  ): void {
    if (tr.comboRank >= 0) return;
    tr.planCount = planCount;
    tr.planLimit = planLimit;
    tr.promoCount = promoCount;
    tr.promoLimit = this.cfg.maxPromotions;
    tr.comboCount = comboCount;
    tr.comboLimit = comboLimit;
    tr.planCutoffCc = planCount > 0 ? this.plans[planCount - 1].scoreCc : 0;
    tr.promoCutoffCc = promoCount > 0 ? this.promos[promoCount - 1].scoreCc : 0;
    tr.comboCutoffCc = comboCount > 0 ? this.combos[comboCount - 1].scoreCc : 0;
    if (tr.targetLen === 0) return;

    let planRank = TRACE_UNKNOWN;
    if (tr.targetBuyCount === 0) planRank = 0;
    else {
      for (let i = 1; i < planCount && planRank < 0; i++) {
        const plan = this.plans[i];
        if (traceBuysMatch(tr, plan.actions, plan.count)) planRank = i;
      }
    }
    tr.planRank = planRank;
    tr.planScoreCc = planRank >= 0 ? this.plans[planRank].scoreCc : 0;

    let promoRank = TRACE_UNKNOWN;
    if (tr.targetPromoCount === 1) {
      const want = tr.targetPromoSlots[0];
      for (let j = 0; j < promoCount && promoRank < 0; j++) if (this.promos[j].slot === want) promoRank = j;
      tr.promoRank = promoRank;
      tr.promoScoreCc = promoRank >= 0 ? this.promos[promoRank].scoreCc : 0;
    }
    // Two or more promotions are unrepresentable by construction (one `promo`
    // index per combo); `trace.ts firstRemovingStage` reports that explicitly.
    const wantPromo = tr.targetPromoCount === 0 ? -1 : promoRank;
    if (planRank < 0 || (tr.targetPromoCount === 1 && promoRank < 0) || tr.targetPromoCount >= 2) return;
    for (let i = 0; i < comboCount; i++) {
      const combo = this.combos[i];
      if (combo.purchase !== planRank || combo.promo !== wantPromo) continue;
      tr.comboRank = i;
      tr.comboScoreCc = combo.scoreCc;
      return;
    }
  }

  /** Records where the target landed in the list `run` is about to return. */
  private traceFinal(ctx: Ctx, tr: GenTrace): void {
    const out = ctx.out;
    tr.finalCount = ctx.count;
    tr.k = ctx.k;
    tr.kthGainCc = ctx.count > 0 ? out[ctx.count - 1].gainCc : 0;
    for (let i = 0; i < ctx.count; i++) {
      if (out[i].endLo !== tr.watchLo || out[i].endHi !== tr.watchHi) continue;
      tr.finalRank = i;
      tr.finalGainCc = out[i].gainCc;
      traceCaptureLine(tr, out[i].actions, out[i].count, out[i].flags);
      return;
    }
  }

  // --- forced injections -------------------------------------------------------

  private inject(ctx: Ctx, keepSets: number): void {
    const { p, t } = ctx;
    const side = p.side as Side;
    const cat = this.rep.cat;
    this.undo.top = 0;

    if (p.upkeepPending === 1) {
      // See the module header: the tables describe the PRE-payment position, so
      // only the mine-only line (DESIGN F7's non-empty guarantee) is injected.
      if (keepSets > 0) {
        this.line[0] = paMake(AKind.PAY_UPKEEP, 0, 0, 0);
        this.injectLine(ctx, 1, TurnFlag.QUIET);
      }
      // ...with ONE exception. The rescue witness is the only injection that
      // does not read `t`: the prover runs on `p`, models the defender's upkeep
      // itself, and hands back a line that OPENS with its own `PAY_UPKEEP`
      // (DESIGN §4.14, §5.10 item 3). An answerable occupation arrives with the
      // upkeep review more often than not — the defender is being asked to pay
      // for the units it needs to clear its own corner — so skipping it here
      // loses exactly the positions §5.10 built it for. Measured on
      // `home-mate`: four `*-rescue` cases went from a lost corner to the
      // witness line. Added by M14; see DEVIATIONS.
      this.injectRescue(ctx, side);
      return;
    }

    // 5 — the mine-only turn, first so the list is never empty even if every
    // other injection and the beam fail (DESIGN F7).
    this.injectQuiet(ctx);

    // 1 — home race with purchases (DESIGN F13, §5.10).
    const races = homeRaceAvailable(p, t, side, this.homeRace);
    for (let i = 0; i < races; i++) {
      let len = 0;
      for (let k = 0; k < HOME_RACE_LINE_LEN; k++) {
        const a = this.homeRace[i * HOME_RACE_LINE_LEN + k];
        if (a >= 0) this.line[len++] = a;
      }
      this.injectLine(ctx, len, TurnFlag.HOME_RACE);
    }

    this.injectKills(ctx, side);
    this.injectHomeEntries(ctx, cat, side);
    this.injectRescue(ctx, side);
    this.injectRetreat(ctx, cat, side);
    this.injectDenial(ctx, cat, side);
    this.injectSummonStrike(ctx, cat, side);
  }

  private injectQuiet(ctx: Ctx): void {
    let len = 0;
    if (ctx.p.phase === 0) this.line[len++] = paMake(AKind.END_PLACE, 0, 0, 0);
    this.line[len++] = paMake(AKind.END_ACTION, 0, 0, 0);
    this.injectLine(ctx, len, TurnFlag.QUIET);
  }

  /** Injection 2: every enemy the side can already remove, cheapest witness first. */
  private injectKills(ctx: Ctx, side: Side): void {
    const { p, t } = ctx;
    const budget = p.phase === 0 ? ACTIONS_PER_TURN : p.actions;
    if (budget <= 0) return;
    this.killOpts.actionBudget = budget;
    this.killOpts.crystalBudget = p.bank[side];
    this.killOpts.allowBuys = p.phase === 0;
    for (let victim = 0; victim < MAX_SLOTS; victim++) {
      const vs = p.sq[victim];
      if (vs === DEAD || p.owner[victim] === side) continue;
      const entry = t.killNow[side].entry[victim];
      if (entry.minActions === KILL_IMPOSSIBLE || entry.minActions > budget) continue;
      if (!minActionsToKill(p, t, side, victim, this.killOpts, this.sc, ctx.ply, this.killPlan)) continue;
      // A promote-then-kill plan names no slot to promote; the place plans (and
      // `gen/promote.ts`'s KILL mission) cover that case.
      if (this.killPlan.needsPromo === 1) continue;
      this.injectKillPlan(ctx, victim, this.killPlan);
    }
  }

  /**
   * Turns one `KillPlan` into a dispatchable line: the plan's purchases, the
   * phase terminator, then per lane a move onto the lane square and the blow. A
   * line the replica will not accept end to end is dropped — the beam still
   * sees the position, and a forced line that cannot be played is worse than
   * none.
   */
  private injectKillPlan(ctx: Ctx, victim: number, plan: KillPlan): void {
    const { p } = ctx;
    const victimSq = p.sq[victim];
    let len = 0;
    let buys = 0;
    for (let i = 0; i < KILL_MAX_LANES; i++) {
      const attacker = plan.attackers[i];
      if (attacker === KILL_NO_ATTACKER || attacker >= 0) continue;
      const at = plan.spawnAt[i];
      if (at < 0 || len >= LINE_CAPACITY) return;
      this.line[len++] = paMake(AKind.BUY, -attacker - 1, at, 0);
      buys++;
    }
    if (p.phase === 0) {
      if (len >= LINE_CAPACITY) return;
      this.line[len++] = paMake(AKind.END_PLACE, 0, 0, 0);
    } else if (buys > 0) {
      return;
    }
    // `make`'s BUY handler claims the lowest DEAD slot, in order, so a
    // purchase's slot is predictable before anything is applied.
    let nextSlot = 0;
    for (let i = 0; i < KILL_MAX_LANES; i++) {
      const attacker = plan.attackers[i];
      if (attacker === KILL_NO_ATTACKER) continue;
      let slot: number;
      let from: number;
      if (attacker < 0) {
        while (nextSlot < MAX_SLOTS && p.sq[nextSlot] !== DEAD) nextSlot++;
        if (nextSlot >= MAX_SLOTS) return;
        slot = nextSlot++;
        from = plan.spawnAt[i];
      } else {
        slot = attacker;
        from = p.sq[slot];
      }
      const lane = plan.lanes[i];
      if (lane >= 0 && from !== lane) {
        if (len >= LINE_CAPACITY) return;
        this.line[len++] = paMake(AKind.MOVE, slot, lane, 0);
      }
      if (len >= LINE_CAPACITY) return;
      this.line[len++] = paMake(AKind.ATTACK, slot, victimSq, 0);
    }
    this.injectLine(ctx, len, TurnFlag.KILL);
  }

  /**
   * Injection 3: every legal home-corner entry by an existing unit.
   *
   * Only the bare entry. An occupation WINS only when the defender cannot
   * answer it (`resolveHomeCheckmate`, `homeCheckmate.ts:173`), so the mate is
   * usually "remove the rescuer, then step in" — and deciding which body is a
   * rescuer is `tactics/prover.ts`'s job, which DESIGN §2's layering keeps out
   * of `gen`. DESIGN §5.10 puts that pair in the root's must-answer layer
   * (M14) for exactly this reason. See DEVIATIONS under M13.
   */
  private injectHomeEntries(ctx: Ctx, cat: Catalog, side: Side): void {
    const { p, t } = ctx;
    const corner = CORNER[(1 - side) as Side];
    if (p.pieceAt[corner] !== NO_SLOT) return;
    const budget = p.phase === 0 ? ACTIONS_PER_TURN : p.actions;
    if (budget <= 0) return;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD || p.owner[slot] !== side) continue;
      const cost = moveCost(t.dist.get(p, s), corner, cat.spd[p.defId[slot]]);
      if (cost <= 0 || cost > budget) continue;
      let len = 0;
      if (p.phase === 0) this.line[len++] = paMake(AKind.END_PLACE, 0, 0, 0);
      this.line[len++] = paMake(AKind.MOVE, slot, corner, cost);
      this.injectLine(ctx, len, TurnFlag.HOME_ENTRY);
    }
  }

  /** Injection 4: the rescue witness, when an enemy holds my corner. */
  private injectRescue(ctx: Ctx, side: Side): void {
    const source = this.rescue;
    if (source === null) return;
    const { p } = ctx;
    const occupant = p.pieceAt[CORNER[side]];
    if (occupant === NO_SLOT || p.owner[occupant] === side) return;
    // E4.3 candidate A (P8 §6): the witness is a FULL PROVER CALL and until
    // this flag it was neither bounded nor billed — `search/pvs.ts
    // countProver` prices the calls `Replica.make` runs during generation, and
    // the witness does not go through `Replica`. Two things change, and only
    // when a cap is installed (never on a profile):
    //
    //   - the call is taken from a per-TURN budget, and a refusal is recorded
    //     on `GenStats` so the node cannot publish to the transposition table
    //     (`generateAt`); the candidate list it emits is short in exactly the
    //     sense a deadline-cut one is;
    //   - the call it does allow is CHARGED, at DESIGN §8's `PROVER` rate of
    //     40 units per full-prover call — the same price `tactics/prover.ts
    //     homeVerdict` pays through its `ProverMeter`. The rate is known to
    //     under-price a witness that runs to the `PROOF_NODES` cutoff by about
    //     four orders of magnitude (40 units against a measured 683 ms), which
    //     is why the BUDGET and not the price is what bounds the phase; the
    //     charge is what makes the phase visible in `byClass[PROVER]` and what
    //     makes a fixed-work search self-limit alongside a wall one.
    //
    // The cap is consulted AFTER the occupation test, so a budget is spent
    // only where a witness would really have run.
    const cap = this.rescueCap;
    if (cap !== null) {
      if (!cap.take()) {
        ctx.stats.rescueCapped += 1;
        return;
      }
      ctx.meter.spend(WORK_CLASS_PROVER, 1);
    }
    const n = source(p, (1 - side) as Side, this.witnessLine, ctx.keep);
    if (n <= 0) return;
    // The witness carries its own place-phase structure — promotions, then
    // `END_PLACE` when the phase will not auto-advance (DESIGN §4.14) — so
    // prepending one here would end the place phase BEFORE those promotions and
    // `injectLine` would drop the line at the first illegal action. Prepend only
    // when the witness brought no place-phase actions of its own; an `END_PLACE`
    // the replica refuses is skipped either way. (Added by M14; see DEVIATIONS.)
    let carriesPlace = false;
    for (let i = 0; i < n; i++) {
      const kind = paKind(this.witnessLine[i]);
      if (kind === AKind.END_PLACE || kind === AKind.PROMOTE || kind === AKind.BUY) {
        carriesPlace = true;
        break;
      }
    }
    let len = 0;
    if (p.phase === 0 && !carriesPlace) this.line[len++] = paMake(AKind.END_PLACE, 0, 0, 0);
    for (let i = 0; i < n && len < LINE_CAPACITY; i++) this.line[len++] = this.witnessLine[i];
    this.injectLine(ctx, len, TurnFlag.HOME_RESCUE);
  }

  /**
   * Injection 6: retreat the highest-value body standing inside `exposure[me]`
   * that the enemy can remove within a turn, to the nearest square outside it.
   */
  private injectRetreat(ctx: Ctx, cat: Catalog, side: Side): void {
    const { p, t } = ctx;
    const budget = p.phase === 0 ? ACTIONS_PER_TURN : p.actions;
    if (budget <= 0) return;
    const exposed = t.exposure[side];
    let bestSlot = -1;
    let bestValue = -1;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD || p.owner[slot] !== side) continue;
      if (!bbHas(exposed, s) || t.killActions[slot] > ACTIONS_PER_TURN) continue;
      const value = cat.cost[p.defId[slot]];
      if (value > bestValue) {
        bestValue = value;
        bestSlot = slot;
      }
    }
    if (bestSlot < 0) return;
    const row = t.dist.get(p, p.sq[bestSlot]);
    const spd = cat.spd[p.defId[bestSlot]];
    let bestTo = -1;
    let bestCost = 0;
    for (let q = 0; q < BOARD; q++) {
      if (bbHas(exposed, q) || p.pieceAt[q] !== NO_SLOT) continue;
      const cost = moveCost(row, q, spd);
      if (cost <= 0 || cost > budget) continue;
      if (bestTo < 0 || cost < bestCost) {
        bestTo = q;
        bestCost = cost;
      }
    }
    if (bestTo < 0) return;
    let len = 0;
    if (p.phase === 0) this.line[len++] = paMake(AKind.END_PLACE, 0, 0, 0);
    this.line[len++] = paMake(AKind.MOVE, bestSlot, bestTo, bestCost);
    this.injectLine(ctx, len, TurnFlag.RETREAT);
  }

  /**
   * Injection 7: the move maximising `anchorsVoidedBy` against the enemy. The
   * reference generator emits EVERY denial move (F25), production only the best.
   */
  private injectDenial(ctx: Ctx, cat: Catalog, side: Side): void {
    const { p, t } = ctx;
    const budget = p.phase === 0 ? ACTIONS_PER_TURN : p.actions;
    if (budget <= 0) return;
    voidedCounts(p, (1 - side) as Side, VOIDED);
    let bestSlot = -1;
    let bestTo = -1;
    let bestVoid = 0;
    let bestCost = 0;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const s = p.sq[slot];
      if (s === DEAD || p.owner[slot] !== side) continue;
      const row = t.dist.get(p, s);
      const spd = cat.spd[p.defId[slot]];
      for (let q = 0; q < BOARD; q++) {
        if (VOIDED[q] <= 0 || p.pieceAt[q] !== NO_SLOT) continue;
        const cost = moveCost(row, q, spd);
        if (cost <= 0 || cost > budget) continue;
        if (ctx.reference) {
          let len = 0;
          if (p.phase === 0) this.line[len++] = paMake(AKind.END_PLACE, 0, 0, 0);
          this.line[len++] = paMake(AKind.MOVE, slot, q, cost);
          this.injectLine(ctx, len, TurnFlag.SPAWN_DENY);
          continue;
        }
        if (VOIDED[q] > bestVoid || (VOIDED[q] === bestVoid && cost < bestCost)) {
          bestVoid = VOIDED[q];
          bestCost = cost;
          bestSlot = slot;
          bestTo = q;
        }
      }
    }
    if (ctx.reference || bestSlot < 0) return;
    let len = 0;
    if (p.phase === 0) this.line[len++] = paMake(AKind.END_PLACE, 0, 0, 0);
    this.line[len++] = paMake(AKind.MOVE, bestSlot, bestTo, bestCost);
    this.injectLine(ctx, len, TurnFlag.SPAWN_DENY);
  }

  /**
   * Injection 8: buy a body that one-shots an adjacent enemy the moment it
   * lands (SU §2.5). The reference generator emits every such witness (F25),
   * production the most valuable one.
   */
  private injectSummonStrike(ctx: Ctx, cat: Catalog, side: Side): void {
    const { p, t } = ctx;
    if (p.phase !== 0) return;
    const legal: BB = t.spawn[side].legal;
    const bank = p.bank[side];
    let bestDef = -1;
    let bestSq = -1;
    let bestVictim = -1;
    let bestValue = -0x7fffffff;
    for (let ti = 0; ti < cat.tier1.length; ti++) {
      const def = cat.tier1[ti];
      if (cat.cost[def] > bank) continue;
      for (let q = bbNext(legal, -1); q >= 0; q = bbNext(legal, q)) {
        const base = q * 4;
        for (let k = 0; k < 4; k++) {
          const adj = ADJ_LIST[base + k];
          if (adj < 0) continue;
          const victim = p.pieceAt[adj];
          if (victim === NO_SLOT || p.owner[victim] === side) continue;
          const need = Math.max(0, cat.def[p.defId[victim]] - p.damage[victim]);
          if (cat.power[powerIndex(side, def, p.defId[victim])] < need) continue;
          if (ctx.reference) {
            this.emitSummonStrike(ctx, def, q, adj);
            continue;
          }
          const value = (cat.cost[p.defId[victim]] - cat.cost[def]) * 100;
          if (value > bestValue) {
            bestValue = value;
            bestDef = def;
            bestSq = q;
            bestVictim = adj;
          }
        }
      }
    }
    if (ctx.reference || bestDef < 0) return;
    this.emitSummonStrike(ctx, bestDef, bestSq, bestVictim);
  }

  private emitSummonStrike(ctx: Ctx, def: number, at: number, victimSq: number): void {
    const { p } = ctx;
    let slot = 0;
    while (slot < MAX_SLOTS && p.sq[slot] !== DEAD) slot++;
    if (slot >= MAX_SLOTS) return;
    this.line[0] = paMake(AKind.BUY, def, at, 0);
    this.line[1] = paMake(AKind.END_PLACE, 0, 0, 0);
    this.line[2] = paMake(AKind.ATTACK, slot, victimSq, 0);
    this.injectLine(ctx, 3, TurnFlag.SUMMON_STRIKE);
  }

  /**
   * Replays `line[0..len)` through the replica, appending `END_PLACE` /
   * `END_ACTION` as needed, and records the result as a FORCED candidate. A
   * PHASE TERMINATOR the replica rejects (an `END_PLACE` the buy already
   * auto-advanced past) is skipped rather than fatal, so a line stays usable
   * when only its padding was wrong; any other rejection, or a line that
   * reaches no turn boundary, discards the line.
   */
  private injectLine(ctx: Ctx, len: number, flags: number): void {
    const { p } = ctx;
    if (len === 0 || this.pool.free === 0) return;
    const side = p.side;
    const turnNumber = p.turnNumber;
    const top = this.undo.top;
    let applied = 0;
    let written = 0;
    const turn = this.pool.alloc();
    const done = (): boolean => p.result !== Result.ONGOING || p.side !== side || p.turnNumber !== turnNumber;

    let ok = true;
    for (let i = 0; i < len && !done(); i++) {
      const a = this.line[i];
      if (!this.rep.isLegal(p, a, ctx.keep)) {
        const kind = paKind(a);
        if (kind === AKind.END_PLACE || kind === AKind.END_ACTION) continue;
        ok = false;
        break;
      }
      turn.actions[written++] = a;
      this.rep.make(p, a, this.undo, ctx.keep);
      applied++;
    }
    if (ok && !done() && p.phase === 0) {
      const a = paMake(AKind.END_PLACE, 0, 0, 0);
      if (this.rep.isLegal(p, a, ctx.keep)) {
        turn.actions[written++] = a;
        this.rep.make(p, a, this.undo, ctx.keep);
        applied++;
      }
    }
    if (ok && !done() && p.phase === 1) {
      const a = paMake(AKind.END_ACTION, 0, 0, 0);
      if (this.rep.isLegal(p, a, ctx.keep)) {
        turn.actions[written++] = a;
        this.rep.make(p, a, this.undo, ctx.keep);
        applied++;
      } else {
        ok = false;
      }
    }
    if (ok && done()) {
      turn.count = written;
      turn.endLo = p.kposLo;
      turn.endHi = p.kposHi;
      turn.gainCc = ctx.score(p, this.sc, ctx.ply);
      turn.place = -1;
      turn.hangCc = 0;
      turn.flags = flags | TurnFlag.FORCED;
      this.offerForced(ctx, turn);
    }
    for (let i = 0; i < applied; i++) this.rep.unmake(p, this.undo);
    this.undo.top = top;
  }
}

/** Index of the listed candidate with this end position, or -1. */
function dedupeFind(ctx: Ctx, turn: Turn): number {
  let i = turn.endLo & DEDUPE_MASK;
  for (let probe = 0; probe < DEDUPE_SLOTS; probe++) {
    if (DEDUPE_STAMP[i] !== dedupeEpoch) return -1;
    const entry = DEDUPE[i];
    const index = entry - 1;
    const other = ctx.out[index];
    if (index < ctx.count && other.endLo === turn.endLo && other.endHi === turn.endHi) return index;
    i = (i + 1) & DEDUPE_MASK;
  }
  return -1;
}

function dedupeInsert(turn: Turn, index: number): void {
  let i = turn.endLo & DEDUPE_MASK;
  for (let probe = 0; probe < DEDUPE_SLOTS; probe++) {
    if (DEDUPE_STAMP[i] !== dedupeEpoch) {
      DEDUPE_STAMP[i] = dedupeEpoch;
      DEDUPE[i] = index + 1;
      return;
    }
    i = (i + 1) & DEDUPE_MASK;
  }
}

/** A `WorkSink` that stops a beam after a fixed number of within-turn nodes. */
class BoundedWork implements WorkSink {
  private left: number;

  constructor(budget: number) {
    this.left = budget;
  }

  reset(budget: number): void {
    this.left = budget;
  }

  spend(cls: number, n = 1): void {
    void cls;
    this.left -= n;
  }

  exhausted(): boolean {
    return this.left <= 0;
  }
}

/** Per-square count of the enemy's unblocked anchors an intruder would void. */
const VOIDED = new Int32Array(BOARD);
const VOID_FRIENDLY = new Uint32Array(4);

function voidedCounts(p: PackedState, victimSide: Side, out: Int32Array): void {
  out.fill(0);
  const mover = (1 - victimSide) as Side;
  VOID_FRIENDLY[0] = p.occBy[mover * 4];
  VOID_FRIENDLY[1] = p.occBy[mover * 4 + 1];
  VOID_FRIENDLY[2] = p.occBy[mover * 4 + 2];
  VOID_FRIENDLY[3] = p.occBy[mover * 4 + 3];
  const rect = RECT[victimSide];
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const anchor = p.sq[slot];
    if (anchor === DEAD || p.owner[slot] !== victimSide) continue;
    const box = rect[anchor];
    let blocked = false;
    for (let w = 0; w < 4 && !blocked; w++) if ((box[w] & VOID_FRIENDLY[w]) !== 0) blocked = true;
    if (blocked) continue;
    for (let s = bbNext(box, -1); s >= 0; s = bbNext(box, s)) out[s]++;
  }
}

function referenceActionConfig(base: ActionSearchConfig): ActionSearchConfig {
  return { widths: Int32Array.from(REFERENCE_WIDTHS), keep: REFERENCE_KEEP, ttBits: base.ttBits };
}

function referencePurchaseConfig(base: PurchaseConfig): PurchaseConfig {
  // `squares` and `maxMultisets` stay at DESIGN §8's numbers: the assignment
  // search is `P(squares, bodies)` per multiset, so widening S from 8 to 12
  // multiplies the Place phase's cost by seven for breadth the reference does
  // not need (its extra reach is in the widths, the 200 place plans and the
  // lines kept per plan). See DEVIATIONS under M13.
  return {
    maxBodies: base.maxBodies,
    maxMultisets: base.maxMultisets,
    maxPlans: REFERENCE_PLACE_PLANS,
    squares: base.squares,
    keepPerMultiset: PURCHASE_MAX_BODIES,
    weights: base.weights,
  };
}

/** `ActionSearch.run` overwrites every entry of the array it is handed, so these
 * placeholders only have to exist. */
function placeholderTurn(): Turn {
  return {
    actions: new Int32Array(MAX_TURN_ACTIONS),
    count: 0,
    endLo: 0,
    endHi: 0,
    sig: 0,
    flags: 0,
    gainCc: 0,
    place: -1,
    hangCc: 0,
  };
}
