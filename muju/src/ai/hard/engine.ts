/**
 * `HardEngine` — the whole-turn entry point (DESIGN §4.17, §1, §5.11.6).
 *
 * One object owns everything a search needs: the replica, the two turn
 * generators, the tables, the transposition table, the evaluator and the work
 * meter. `searchTurn` packs the canonical `GameState`, picks a work rung, runs
 * `searchRoot`, and hands back a canonical `AIAction[]` that has already been
 * replayed through `applyAction`.
 *
 * TIME. The engine is the ONLY place besides `search/time.ts` that reads a
 * clock (`lab/hard-ai/deps.ts` enforces it), and it does so exactly four
 * times: to open the wall-funded call, to arm the abort watchdog, to measure
 * the search for `updateProfile`, and — on either fallback return — to report
 * what the failed call still cost (E5.1: `useAI.ts` debits the turn's
 * allowance by `stats.elapsedMs`, so a fallback reporting zero would re-fund
 * the fallback path with the whole turn budget). `searchTurn(state, {work})`
 * bypasses all four — the lab, the ladder and CI always pass `work`, so their
 * results are machine independent (DESIGN §5.11.6, §7.4). E1.5's cold probe
 * adds two more reads (around the probe search), on the same `search/time.ts#now`
 * and only when `time.calibrateCold` is on; fixed-work mode never reaches them.
 *
 * COLD PROBE (E1.5, the patch E1.4 §5 chose; `time.calibrateCold`, off by
 * default and on only for `hard@ablate:calib`). `makeConfig` starts every
 * engine at `INITIAL_UNITS_PER_MS` = 200 with `samples: 0`, and a fresh engine
 * per game means every game starts there: on a ~100 units/ms box
 * `chooseWork({200, 0}, 3000)` picks 400,000 units, about 4 s of search, and
 * A11's deadline cuts the first turn instead. With the flag on, a wall-funded
 * `searchTurn` whose profile has measured nothing runs ONE `COLD_PROBE_WORK`
 * (`WORK_LADDER[0]`, 25,000 units) search of the REAL root first, folds
 * `work / elapsedMs` into the profile through `updateProfile` (which replaces
 * from `samples: 0`) subject to A16's floors, and only then sizes the rung —
 * for the allowance that is LEFT. The probe's plan is kept as this turn's
 * fallback, the cost is reported in `stats.calibratedMs` and the measurement
 * in `stats.calibratedUnitsPerMs`, and the deadline is armed from BEFORE the
 * probe so probe and search together fit inside the allowance.
 *
 * WHY NOT `calibrate()`. E1.4 §5 proposed seeding the profile from DESIGN
 * §4.17's 40 ms micro-benchmark. Measured on this box it reports 264-348
 * units/ms where the same engine's own search then measures 75-127, so it
 * sized the first rung at 800,000 — one rung ABOVE the uncalibrated default,
 * i.e. the opposite of the patch's purpose (`docs/hard-ai/e1/E1.5-CALIB-ARM.md`
 * §4). It is a hot loop over one position charging only KILLTABLE + EVAL1 +
 * EVAL2, and a real search spends most of its units elsewhere. `calibrate()`
 * is untouched for its existing caller; nothing in the search path calls it.
 *
 * WHAT THE PROBE COSTS THE SEARCH. The probe leaves the transposition table,
 * the proof cache and the ordering tables WARM for the main search — they are
 * cleared once per `searchTurn`, not once per `searchRoot` — so the 25,000
 * units are spent on the position rather than thrown away. The price is that a
 * probing turn's main search is not the same object as a cold search at the
 * same rung; it is a wall-mode-only behaviour of one ablation arm, and
 * fixed-work mode (every determinism gate) never probes.
 *
 * THE TURN ALLOWANCE IS THE CALLER'S, NOT THE PROFILE'S (the turn paces,
 * `src/ai/turnTime.ts`). A player picks how long the Hard seat may think per
 * turn — 10 s, 30 s or 60 s — and that number arrives here as `opts.targetMs`
 * (the worker sends the turn's REMAINING allowance as `decisionMs`,
 * `worker/handler.ts`). An explicit `targetMs` is used VERBATIM: DESIGN
 * §5.11.6's `targetMs(p, t, cfg, ...)` — the position multipliers and the
 * `clamp(minMs, maxMs)` with them — is the default when the caller names no
 * allowance, and the profile's `time.maxMs` (6,000 on desktop, 2,500 on a
 * phone) is a default, never a ceiling on what was asked for. That has been
 * true since A5 funded the release row at `wall:8000`
 * (`tests/ai/hard/deadline.test.ts`); the paces make it load-bearing, and
 * `tests/ai/hard/turn-pace.test.ts` pins it at all three Hard allowances.
 * `deadlineMs` below moves the watchdog the same way, and the WORK LADDER now
 * reaches 51,200,000 units so a long allowance can actually be spent
 * (`search/time.ts WORK_LADDER`).
 *
 * AND THE DEFAULT SEAT IS STILL THE ONE THE RELEASE MEASURED. The allowance is
 * the caller's, but an allowance AT OR BELOW `search/time.ts
 * QUICK_TURN_ALLOWANCE_MS` (10,000 ms — default Hard, `?hardMs`, every
 * profile's `time.maxMs`, every mid-turn re-request) may not select a rung above
 * `RELEASE_TOP_RUNG` however fast the box measures itself, and so keeps the
 * profile's own transposition table too. The bigger rungs, the √2 ladder and
 * E4.3's iteration-cost rule are reachable only from `normal` and `deep`, where
 * no release, golden or determinism row exists to contradict. `chooseTurnWork`
 * is the one function that decides it; see `searchTurn` below.
 *
 * DEADLINE (AMENDMENTS-DECIDED A11, option (b)). The watchdog fires at
 * `startedAt + abortFactor × targetMs` by default. A caller that knows the real
 * wall allowance — the lab adapter, which funds a TURN and not a search — passes
 * `deadlineMs` instead, and the watchdog fires at `startedAt + deadlineMs`,
 * larger or smaller than the default; the TARGET rung `chooseWork(profile,
 * targetMs)` is NOT moved by it. So the rung still says how much work the turn
 * is worth and the deadline says when the turn must be over, which before A11
 * were the same number times `abortFactor` — the reason E0.5 measured turns at
 * 1.15×-1.67× their allowance. `deadlineMs` is ignored with `work` (that mode
 * reads no clock at all) and a non-finite or non-positive value throws.
 *
 * PROFILE ON ABORT (A11). `updateProfile` is called after EVERY measured
 * search, aborted ones included. `work / elapsedMs` is a throughput
 * measurement, and it is just as true of a search that was cut as of one that
 * finished: both numbers were measured over the same interval. Skipping the
 * aborted sample was safe only while an abort was the rare `abortFactor ×
 * target` emergency; with A11 the deadline IS the allowance, so aborts are
 * ordinary, and a profile that OVERESTIMATES the box would abort every search
 * and therefore never see the sample that would correct it. An externally
 * CANCELLED search (`cancel()`) is the one exception and still updates
 * nothing: it can be cut at any moment, including inside the fixed per-search
 * overhead, so its interval is not the deadline-long sample the rule is about.
 * The residual bias
 * — a short search pays proportionally more unmetered canonical verification
 * (`verify/replay.ts`) per unit of metered work — is bounded by the EWMA's
 * α = 1/4, by the ladder's factor-of-two rungs, and by A16's TINY-SAMPLE
 * GUARD: a search under `MIN_PROFILE_SAMPLE_MS` or under
 * `MIN_PROFILE_SAMPLE_WORK` units is mostly fixed per-search cost and updates
 * nothing, so a run of doomed re-searches cannot talk the profile down into
 * shorter searches still. See
 * `docs/hard-ai/e0/E0.2-E0.4-RECORD.md` §E0.2 "Amended 2026-09-16".
 * (`search/time.ts`'s `updateProfile` header still describes the pre-A11 rule;
 * that module is out of this lane's scope.)
 *
 * WEIGHTS. `config.ts` still ships M4's placeholder vector (all feature weights
 * zero) because `config` may not import `eval`. An engine constructed with it
 * would evaluate on material alone, so the constructor substitutes
 * `DEFAULT_WEIGHTS` whenever the config carries the placeholder
 * (`version === 0`). An explicitly supplied vector is always honoured. See
 * DEVIATIONS under M14.
 *
 * DETERMINISM. The transposition table, the proof cache and the ordering
 * tables are cleared at the start of every `searchTurn`, so a search depends
 * only on its position, its weights and its work rung — never on what the same
 * engine searched before it. That is what makes `hard:determinism`'s
 * three-in-process/one-fresh-process comparison meaningful, and it costs one
 * 8 MB memset against a multi-second search.
 */
import { createInitialGameState } from '../../game/board';
import type { GameState } from '../../game/types';
import type { AIAction, AIResult } from '../types';
import { DEAD, MAX_SLOTS, type PackedState, type Side } from './types';
import { Scratch } from './core/bits';
import { activeCatalog, type Catalog } from './core/catalog';
import { newKeepSetTable, type KeepSetTable } from './core/action';
import { PackError, Replica, allocState, newUndo } from './core/state';
import { createReachMemo } from './core/movement';
import { allocTables, buildTables, type NodeTables } from './tables/context';
import { PhasingEconomyProofCutoff } from './tables/phasing-economy';
import { Evaluator, setKillClockRootClock } from './eval/evaluate';
import { withinTurnScore } from './eval/turnScore';
import { DEFAULT_WEIGHTS } from './eval/weights';
import { TurnPool, type Turn } from './gen/turn';
import { RescueCap, TurnGenerator, newGenStats, outCapacityFor } from './gen/generate';
import { newDfpnResult } from './tactics/dfpn';
import { EMPTY_BOOK } from './book/format';
import { findCompatibleBookEntry } from './book/probe';
import { ProofCache, TranspositionTable, newTTEntry } from './search/tt';
import { newOrderTables, clearOrderTables } from './search/order';
import {
  WORK_LADDER,
  WorkClass,
  WorkMeter,
  chooseTurnWork,
  isAboveQuickAllowance,
  now,
  targetMs,
  ttBitsForRung,
  updateProfile,
} from './search/time';
import { INF, allocTurn, newSearchStats, type SearchContext } from './search/pvs';
import { installRescueWitness, searchRoot, type RootOptions, type RootResult } from './search/root';
import { DESKTOP, type Book, type DeviceProfile, type GenConfig, type HardConfig, type Weights } from './config';

export type { RootResult, RootOptions } from './search/root';

/**
 * `TurnPool` capacity. One pool serves every ply (the search copies a node's
 * candidates out before recursing, `search/pvs.ts`), so it only has to hold
 * ONE `generate` call: `maxPlacePlans` (≤ 16) × the per-plan `keep` ceiling
 * (`MAX_KEEP_LINES` 64) plus the forced injections. The generator degrades
 * gracefully rather than throwing when it runs low (`gen/generate.ts` checks
 * `pool.free`), so this is a ceiling and not a hard requirement.
 */
const POOL_CAPACITY = 1536;

/** Quiescence lives above `maxDepth`, and the SEE pass borrows `ply + 1`. */
const PLY_HEADROOM = 3;

/** `calibrate()`'s fixed budget (DESIGN §4.17: "40 ms fixed micro-benchmark"). */
export const CALIBRATE_MS = 40;

/**
 * E1.5: the work rung `time.calibrateCold`'s probe search spends before the
 * turn's real search (`searchTurn`). `WORK_LADDER[0]` — the smallest rung the
 * ladder has, and the one `chooseWork` clamps every budget up to — so the
 * measurement costs the turn as little as a measurement can while still
 * funding a search long enough to be a sample of this box.
 *
 * It does NOT guarantee that the probe SPENDS half a rung: iterative deepening
 * stops before a depth it cannot fit, so the spend is bounded below only by the
 * last completed depth. `searchTurn`'s probe guard therefore reads the stop
 * reason rather than relying on the budget to clear A16's work floor; the note
 * there has the measurement.
 */
export const COLD_PROBE_WORK = WORK_LADDER[0];

/**
 * The tiny-sample guard on `updateProfile` (AMENDMENTS-DECIDED A16). A search
 * shorter than this, or one that spent less than half a work rung, is mostly
 * the FIXED cost of a search — packing, the level-2 table build, root
 * generation, the canonical replay — none of which `chooseWork` models and all
 * of which a throughput sample would attribute to a slow box. Folding those in
 * would push the profile down, which shortens the next search, which makes the
 * next sample worse still. Above these floors the fixed cost is a small
 * fraction of the interval and the sample measures what it claims to.
 */
export const MIN_PROFILE_SAMPLE_MS = 20;
export const MIN_PROFILE_SAMPLE_WORK = WORK_LADDER[0] / 2;

/** `ProofCache` size (DESIGN §8: 2^15). */
const PROOF_BITS = 15;

/**
 * DESIGN §5.11.4's quiescence generator: the interior cone narrowed to
 * `quiesce.maxCandidates`. The place phase is narrowed with it — a tactical
 * turn is usually an Act line. Prepare home fortification remains tactical;
 * purchases create delayed commitments and cannot supply a same-turn strike.
 */
function quiesceGenConfig(cfg: HardConfig): GenConfig {
  const base = cfg.genInterior;
  const plans = base.maxPlacePlans < 2 ? base.maxPlacePlans : 2;
  // A tactical line is short — approach, strike — and `actionPriority` already
  // ranks kills first, so the quiescence cone is narrow rather than deep-wide.
  const widths = Int32Array.from(base.action.widths, (w, i) => {
    const narrow = i === 0 ? 4 : i === 1 ? 2 : 1;
    return w < narrow ? w : narrow;
  });
  return {
    K: cfg.quiesce.maxCandidates,
    maxPlacePlans: plans,
    action: { widths, keep: base.action.keep, ttBits: base.action.ttBits },
    purchase: base.purchase,
    maxPromotions: base.maxPromotions,
    reference: false,
  };
}

function mergeConfig(base: HardConfig, patch?: Partial<HardConfig>): HardConfig {
  const cfg: HardConfig = { ...base, ...(patch ?? {}) };
  // Nested objects must not be shared with the frozen profile constants: the
  // engine writes `profile` back after every completed search.
  cfg.time = { ...cfg.time };
  cfg.profile = { ...cfg.profile };
  cfg.quiesce = { ...cfg.quiesce };
  cfg.dfpn = { ...cfg.dfpn };
  return cfg;
}

export class HardEngine {
  readonly config: HardConfig;
  readonly ctx: SearchContext;
  readonly rootState: PackedState;

  private deadlineMs = 0;
  private aborted = false;
  /** E4.3 candidate A's rescue budget, or `null` (every profile). Re-armed at
   * the top of every `searchTurn`, the cold probe included, so the bound it
   * carries is the bound on ONE TURN'S witness calls. */
  private readonly rescueCap: RescueCap | null;
  /** E1.5: the cold probe fires at most once per engine (see `searchTurn`). */
  private coldProbed = false;

  constructor(cfg?: Partial<HardConfig>) {
    const config = mergeConfig(DESKTOP, cfg);
    if (config.book === null) config.book = EMPTY_BOOK;
    // M4's placeholder vector scores nothing but material; `eval/weights.ts`
    // is the authority once it exists (see the module header).
    if (config.weights.version === 0 && (cfg === undefined || cfg.weights === undefined)) {
      config.weights = DEFAULT_WEIGHTS;
    }
    this.config = config;

    const cat: Catalog = activeCatalog();
    // E4.3 candidate C (lane 8), `searchFix.reachCache`: ONE reach memo per
    // engine, shared by the `Replica`'s distance cache, the evaluator's tables
    // and every per-ply `NodeTables` below. `null` — and so not allocated at
    // all — unless the arm turns the flag on; `core/movement.ts ReachMemo`
    // states why a hit is byte-identical to the BFS it replaces.
    const reachMemo = config.searchFix?.reachCache === true ? createReachMemo() : null;
    const rep = new Replica(cat, reachMemo);
    const maxPly = config.maxDepth + config.quiesce.maxPly + PLY_HEADROOM;
    const sc = new Scratch(maxPly, 8, 4, 4);
    const pool = new TurnPool(POOL_CAPACITY);
    const gen = new TurnGenerator(rep, config.gen, pool, sc);
    const genInterior = new TurnGenerator(rep, config.genInterior, pool, sc);
    const genQuiesce = new TurnGenerator(rep, quiesceGenConfig(config), pool, sc);
    installRescueWitness(gen);
    installRescueWitness(genInterior);
    installRescueWitness(genQuiesce);
    // E4.3 candidate A (P8, `docs/hard-ai/e4/E4.3-RESCUE-CAP.md`): ONE budget
    // for injection 4's witness, shared by all three generators and re-armed
    // once per `searchTurn`, so the bound is on the TURN and not on a node.
    // `config.searchFix` is absent on every profile, so `rescueCap` is `null`
    // and no generator is told anything.
    const capCalls = config.searchFix?.rescueCap;
    this.rescueCap = capCalls !== undefined && capCalls > 0 ? new RescueCap(capCalls) : null;
    if (this.rescueCap !== null) {
      gen.setRescueCap(this.rescueCap);
      genInterior.setRescueCap(this.rescueCap);
      genQuiesce.setRescueCap(this.rescueCap);
    }

    const tables: NodeTables[] = [];
    const keep: KeepSetTable[] = [];
    const turns: Turn[][] = [];
    const rootCapacity = outCapacityFor(config.gen);
    const interiorCapacity = outCapacityFor(config.genInterior);
    // E3.2 B1-B5: the correctness block, `null` on every profile (see
    // `config.ts EvalFix`). Stamped on every table this engine owns, so the
    // search path and the evaluator path agree; nothing else writes it.
    const evalFix = config.evalFix ?? null;
    for (let ply = 0; ply < maxPly; ply++) {
      const t = allocTables(reachMemo);
      t.evalFix = evalFix;
      tables.push(t);
      keep.push(newKeepSetTable());
      const capacity = ply === 0 ? rootCapacity : interiorCapacity;
      const row: Turn[] = new Array<Turn>(capacity);
      for (let i = 0; i < capacity; i++) row[i] = allocTurn();
      turns.push(row);
    }
    const genOut: Turn[] = new Array<Turn>(rootCapacity > interiorCapacity ? rootCapacity : interiorCapacity);

    const evaluator = new Evaluator(rep, config.weights, evalFix, reachMemo);
    const ctx: SearchContext = {
      rep,
      cat,
      gen,
      genInterior,
      genQuiesce,
      tt: new TranspositionTable(config.ttBitsMacro),
      proof: new ProofCache(PROOF_BITS),
      ord: newOrderTables(maxPly),
      eval: evaluator,
      meter: new WorkMeter(1),
      cfg: config,
      root: 0,
      sc,
      tables,
      keep,
      undo: newUndo(),
      pool,
      stats: newSearchStats(),
      stop: () => this.aborted || (this.deadlineMs > 0 && now() >= this.deadlineMs),
      turns,
      genOut,
      genStats: newGenStats(),
      scoreMover: 0,
      // DESIGN §5.4's within-turn score. It is NOT charged `EVAL1`: §5.11.6's
      // own arithmetic for a macro node — "16 place plans × (4 + ~100 TURN) +
      // 8 + 24 evals" — charges one `TURN` per within-turn node and reserves
      // the `24 evals` for the macro leaf evaluations. `gen/actionsearch.ts`
      // spends that `TURN` once per within-turn node and scores its end
      // position in the same breath, so charging `EVAL1` here as well would
      // bill the same work twice and halve the rung. See DEVIATIONS under M14.
      // `eval/turnScore.ts` holds the one definition; every lab instrument and
      // generator test builds its closure from the same helper, so they all
      // describe the generator that plays. Includes the unconditional pending
      // summon credit (repair-2026-09-20).
      score: (p, scratch, ply) => withinTurnScore(evaluator, p, ctx.scoreMover, scratch, ply),
      maxPly,
      ttScratch: newTTEntry(),
      useTT: true,
      ttExactSameDepthOnly: false,
      truncated: false,
      quiesceWork: 0,
      quiesceCapOn: true,
      rootBest: allocTurn(),
      rootHasBest: false,
      rootPartial: allocTurn(),
      rootHasPartial: false,
      dfpnOut: newDfpnResult(),
      // E2 lane 1's root instrument is off unless a caller asks for it per
      // search; `search/root.ts` installs one for the duration of that call.
      probe: null,
    };
    this.ctx = ctx;
    this.rootState = allocState();
  }

  /** No-op: the search has no RNG. Accepted for the `EngineBot` contract
   * (DESIGN §4.17). */
  setSeed(seed: number): void {
    void seed;
  }

  setWeights(w: Weights): void {
    this.config.weights = w;
    this.ctx.eval.setWeights(w);
  }

  setBook(b: Book | null): void {
    this.config.book = b === null ? EMPTY_BOOK : b;
  }

  /** Turns the transposition table off; the M14 bench's TT-off arm. */
  setUseTT(on: boolean): void {
    this.ctx.useTT = on;
  }

  /**
   * DIAGNOSTIC ONLY. Narrows TT EXACT hits to exactly the requested depth, so a
   * fixed-depth search stays one. Nothing in the shipped path and nothing in
   * any gate turns it on — `hard:bench --calibrate --tt-check` used to set it on
   * both arms of the TT-on/off comparison and no longer does, because measured
   * over that clause's own corpus the shipped semantics mismatch on nothing and
   * a clause about the table has to be measured on the engine that ships
   * (`search/tt.ts`'s header; DEVIATIONS under M14). The shipped search leaves
   * it off and takes DESIGN §5.11.2's rule as written.
   */
  setTtExactSameDepthOnly(on: boolean): void {
    this.ctx.ttExactSameDepthOnly = on;
  }

  /**
   * Disables `search/quiesce.ts`'s R5 enforcement, so quiescence spends what it
   * naturally would. `hard:bench --calibrate` runs one arm this way and reports
   * `quiesceShareUncappedMax` next to the capped `quiesceShareMax`, so the
   * artifact says which of the two each number is (see DEVIATIONS under M14).
   */
  setQuiesceCap(on: boolean): void {
    this.ctx.quiesceCapOn = on;
  }

  get profile(): DeviceProfile {
    return this.config.profile;
  }

  /** Cancels an in-flight search at the next poll (DESIGN §5.11.6's `stop`). */
  cancel(): void {
    this.aborted = true;
  }

  /**
   * DESIGN §4.17. One whole turn.
   *
   * `opts.work` bypasses the device rung entirely — no clock is read at all,
   * which is what every lab/CI caller relies on. Without it the engine sizes
   * the rung from the device profile and arms the abort watchdog.
   *
   * `opts.deadlineMs` (A11) moves the watchdog and only the watchdog: the
   * search is abandoned `deadlineMs` after its timing starts, whether that is
   * sooner or later than the default `abortFactor × targetMs`, while the work
   * rung stays `chooseWork(profile, targetMs)`. It is measured from the same
   * `startedAt` as the default watchdog, so it does not cover the packing,
   * table build and book probe that precede it — a caller that owns a wall
   * allowance (`lab/hard-ai/bots/hard.ts`) times the WHOLE call itself and
   * treats the difference as its overrun. Ignored with `work`; a non-finite or
   * non-positive value throws.
   */
  async searchTurn(
    state: GameState,
    opts?: {
      work?: number;
      targetMs?: number;
      deadlineMs?: number;
      onProgress?: RootOptions['onProgress'];
      /**
       * E2 lane 1. Fill `candidates`, `rootTrace` and `candidateSource` on the
       * result (`search/probe.ts`, `search/root.ts`). Off by default and off in
       * every production path; a lab caller sets it per search. It observes
       * only — the move, score, depth, work, node count and end key are the
       * ones the same call returns without it. The cold probe never carries it:
       * its search is a measurement of this box, not of this position.
       */
      expose?: boolean;
      /** Additionally fill `ply1`. Requires `expose`. */
      ply1Trace?: boolean;
    },
  ): Promise<RootResult> {
    const explicitDeadline = opts?.deadlineMs;
    if (explicitDeadline !== undefined && (!Number.isFinite(explicitDeadline) || explicitDeadline <= 0)) {
      throw new RangeError(`searchTurn: bad deadlineMs ${explicitDeadline}`);
    }
    this.aborted = false;
    this.deadlineMs = 0;
    const ctx = this.ctx;
    ctx.stats = newSearchStats();
    // Cleared for EVERY search, so only the wall-funded above-quick branch
    // below can turn it on and a fixed-work search is never touched by it.
    ctx.wallFit = false;
    // E4.3 candidate A: one rescue budget per TURN, armed before the cold
    // probe so the probe spends out of the turn's allowance here too. `null`
    // on every profile.
    if (this.rescueCap !== null) this.rescueCap.reset();
    ctx.tt.clear();
    ctx.proof.clear();
    clearOrderTables(ctx.ord);
    ctx.eval.invalidate();
    ctx.eval.setWeights(this.config.weights);

    const fixedWork = opts?.work;
    // E4.3 lane 5 (`searchFix.iterFit`, off on every profile). The per-step
    // iteration-cost prior is a WALL-mode quantity like `config.profile`: a
    // wall-funded turn may read what the previous wall-funded turn measured,
    // and a FIXED-work search starts from nothing, so this header's
    // DETERMINISM note — "a search depends only on its position, its weights
    // and its work rung", `hard:determinism`'s whole premise — is as true as
    // it was. A no-op unless the flag is on: nothing else allocates the table.
    if (fixedWork !== undefined && fixedWork > 0) this.ctx.iterCost?.clear();
    let work: number;
    let startedAt = 0;
    let measured = false;
    // E1.5: the cold probe's result, kept as this turn's fallback plan.
    let probe: RootResult | null = null;

    if (fixedWork !== undefined && fixedWork > 0) {
      work = fixedWork;
    } else {
      // A wall-funded call owes its caller a measured cost even when it
      // FAILS. `startedAt` below still times the search proper, so neither the
      // rung, the watchdog nor `updateProfile` moves; this one only exists so
      // a pack that throws can say how long it took before it did.
      const enteredAt = now();
      let calibratedMs = 0;
      let calibratedUnitsPerMs = 0;
      let packed: PackedState;
      try {
        packed = ctx.rep.pack(state, this.rootState);
        setKillClockRootClock(packed.clock);
      } catch (err) {
        ctx.stats.elapsedMs = now() - enteredAt;
        return {
          actions: [],
          scoreCc: 0,
          depth: 0,
          work: 0,
          stats: ctx.stats,
          source: 'fallback',
          endKey: '',
          fallback: err instanceof PackError ? 'pack-error' : 'engine-error',
        };
      }
      packed.proverMode = 2;
      const preparationTables = ctx.tables[0];
      const preparationBefore = preparationTables.economyProverCalls;
      const preparationCappedBefore = preparationTables.economyCappedProverCalls;
      let t: NodeTables;
      try {
        t = buildTables(packed, ctx.sc, 0, 2, preparationTables);
      } finally {
        // The rung and its meter have not started. Report this preparation
        // separately, even on a typed forecast veto, rather than hiding a
        // cache fill or charging it into the later search's fixed budget.
        ctx.stats.preparationEconomyProverCalls = preparationTables.economyProverCalls - preparationBefore;
        ctx.stats.preparationEconomyCappedProverCalls = preparationTables.economyCappedProverCalls - preparationCappedBefore;
      }
      const book = this.config.book;
      let bookHit = false;
      if (book !== null && book.size > 0) {
        bookHit = findCompatibleBookEntry(book, packed, this.config.weights) !== null;
      }
      const tms = opts?.targetMs ?? targetMs(packed, t, this.config.time, bookHit, candidateHint(packed));
      // The watchdog window. A11 anchors it at the start of the SEARCH; E1.5
      // anchors it at `enteredAt` whenever this call probes, so the probe is
      // spent OUT of the turn's allowance instead of being added to it (the
      // lab adapter times the whole `nextAction` call and A14 counts what runs
      // past the allowance). It is armed BEFORE the probe so the probe itself
      // is inside it on a box where 25,000 units is already the whole turn.
      const deadlineWindow = explicitDeadline ?? this.config.time.abortFactor * tms;
      let rungMs = tms;
      if (this.config.time.calibrateCold === true && this.config.profile.samples === 0 && !this.coldProbed) {
        // E1.5, the E1.4 §5 patch as revised: measure this box with a REAL
        // search on the REAL root instead of `calibrate()`'s micro-benchmark.
        // `calibrate()` is a hot loop over one position charging only
        // KILLTABLE + EVAL1 + EVAL2, and measured on this box it reports
        // 3-4× the throughput the same engine's own search then measures, so
        // it sized the cold rung ABOVE the uncalibrated default rather than
        // below it (`docs/hard-ai/e1/E1.5-CALIB-ARM.md` §4). One rung of real
        // search is the sample `chooseWork` is actually asking for.
        //
        // Once per engine, whether or not the sample survives A16's guard: a
        // position that finishes inside the probe rung is not evidence about
        // the box, and re-probing every turn would tax the whole game for it.
        this.coldProbed = true;
        this.deadlineMs = enteredAt + deadlineWindow;
        const probeStartedAt = now();
        try {
          probe = searchRoot(this, state, { work: COLD_PROBE_WORK, config: this.config, canonical: state });
        } catch (err) {
          if (err instanceof PhasingEconomyProofCutoff) throw err;
          ctx.stats.elapsedMs = now() - enteredAt;
          ctx.stats.calibratedMs = now() - probeStartedAt;
          return {
            actions: [], scoreCc: 0, depth: 0, work: ctx.meter.used, stats: ctx.stats,
            source: 'fallback', endKey: '',
            fallback: err instanceof PackError ? 'pack-error' : 'engine-error',
          };
        }
        calibratedMs = now() - probeStartedAt;
        // A16's floors, applied to the probe exactly as they are applied to a
        // search: a probe that finished the position before it spent the rung
        // measured the position, not the box, and updates nothing.
        //
        // The work floor is a PROXY for that sentence, and on the probe it is
        // the wrong one. `COLD_PROBE_WORK` is a whole rung and the floor is
        // half of it, so the header above claims the probe clears the floor
        // "by construction" — but iterative deepening stops a probe whose next
        // depth will not fit what is LEFT of the rung (`shouldDeepen`, and
        // `iterFitVerdict` under E4.3), so the spend lands anywhere above the
        // last completed depth's cost. A probe that stopped because its BUDGET
        // ran out, at whatever fraction of the rung the depth boundary fell,
        // searched for its whole interval and measured this box; only
        // `stopReason === 'complete'` means it ran out of POSITION instead.
        // So the probe asks the stop reason directly and keeps the work floor
        // as an alternative sufficient condition: this admits samples the
        // floor alone refused and refuses none it accepted.
        //
        // Measured on `tests/ai/hard/calibrate-cold.test.ts`'s MIDGAME root:
        // the probe completes depth 1 for 12,485 of its 25,000 units and stops
        // because depth 2 will not fit — 15 units under a floor it can only
        // clear by luck, after ~600 ms of real search. The millisecond floor
        // still guards the fixed-cost case the A16 header describes.
        const measuredTheBox = probe.work >= MIN_PROFILE_SAMPLE_WORK || probe.stats.stopReason === 'work';
        if (calibratedMs >= MIN_PROFILE_SAMPLE_MS && measuredTheBox) {
          // `samples === 0`, so `updateProfile` REPLACES rather than blends.
          this.config.profile = updateProfile(this.config.profile, probe.work, calibratedMs);
          calibratedUnitsPerMs = this.config.profile.unitsPerMs;
        }
        // The main search gets its own stats object: `nodes`, `evals` and the
        // rest accumulate inside one `HardSearchStats`, and a turn's stats
        // should describe the turn's search. The two calibration fields below
        // are written onto the fresh one.
        const { preparationEconomyProverCalls, preparationEconomyCappedProverCalls } = ctx.stats;
        ctx.stats = newSearchStats();
        ctx.stats.preparationEconomyProverCalls = preparationEconomyProverCalls;
        ctx.stats.preparationEconomyCappedProverCalls = preparationEconomyCappedProverCalls;
        // Size the rung for what is LEFT of the allowance. `now() - enteredAt`
        // rather than the probe's own time, because the deadline window starts
        // at `enteredAt`: the packing and the level-2 build are already spent
        // out of it too.
        const spentMs = now() - enteredAt;
        rungMs = tms - spentMs > 1 ? tms - spentMs : 1;
      }
      ctx.stats.calibratedMs = calibratedMs;
      ctx.stats.calibratedUnitsPerMs = calibratedUnitsPerMs;
      // THE ALLOWANCE DECIDES WHICH ENGINE THIS IS (`search/time.ts
      // chooseTurnWork`, which states the rule and the evidence). At or below
      // `QUICK_TURN_ALLOWANCE_MS` — the default Hard seat, `?hardMs`, every
      // profile's own `time.maxMs`, every mid-turn re-request — this is
      // `chooseWork(profile, rungMs, config.time)` on the ladder the profile
      // asks for, capped at `RELEASE_TOP_RUNG`: the engine the E6 release
      // measured, whatever throughput the box reports. Above it — `normal` and
      // `deep` — the rung comes off the √2 ladder and `wallFit` below funds the
      // iterations to spend it. Fixed-work mode never reaches here.
      const aboveQuick = isAboveQuickAllowance(tms);
      work = chooseTurnWork(this.config.profile, rungMs, tms, this.config.time);
      // E4.3 lane 5's iteration-cost rule (`searchFix.iterFit`), for an
      // above-quick allowance only. DESIGN §5.11.2's gate refuses a new
      // iteration once 45% of the rung is spent, so a `deep` turn stops around
      // half of what the player paid for; the E4.3 probe measured the rule that
      // replaces it taking 83.5% of the rung to 100.1% with completed
      // iterations equal on 18 of 20 positions
      // (`docs/hard-ai/e4/E4.3-ITER-FIT.md` §3). It publishes a partial
      // iteration only under the principal-variation rule — meter-cut, PV
      // complete, beaten by another fully searched candidate — so the watchdog
      // still cannot alter a completed depth. An explicit `searchFix.iterFit`
      // (either way) still wins; this only speaks where the champion is silent.
      ctx.wallFit = aboveQuick;
      // E2 lane 1: the throughput the rung was chosen from. `unitsPerMsAfter`
      // is written below, once `updateProfile` has run.
      ctx.stats.unitsPerMsBefore = this.config.profile.unitsPerMs;
      startedAt = now();
      // A11: an explicit deadline replaces `abortFactor × target` in BOTH
      // directions — the caller that passes one knows the real allowance.
      // `calibratedMs === 0` (every call at all when the flag is off) leaves
      // the anchor exactly where A11 put it, so the champion is untouched.
      this.deadlineMs = (calibratedMs > 0 ? enteredAt : startedAt) + deadlineWindow;
      measured = true;
    }

    this.growTT(work);

    let result: RootResult;
    try {
      result = searchRoot(this, state, {
        work,
        config: this.config,
        canonical: state,
        onProgress: opts?.onProgress,
        expose: opts?.expose,
        ply1Trace: opts?.ply1Trace,
      });
    } catch (err) {
      if (err instanceof PhasingEconomyProofCutoff) throw err;
      // Same reason as the pack-error return above: report what the failed
      // search spent, so the caller's turn allowance is debited by it.
      // `measured` is false in fixed-work mode, which reads no clock at all.
      if (measured) ctx.stats.elapsedMs = now() - startedAt;
      return {
        actions: [],
        scoreCc: 0,
        depth: 0,
        work: ctx.meter.used,
        stats: ctx.stats,
        source: 'fallback',
        endKey: '',
        fallback: err instanceof PackError ? 'pack-error' : 'engine-error',
      };
    }

    if (measured) {
      // E1.5: the probe already paid for a completed rung of real search, so
      // when the main search comes back with nothing usable — no actions at
      // all, or the `phaseEndAction` its `iterativeDeepening` falls back to
      // when the deadline cut it before depth 1 — the probe's plan is strictly
      // better than ending the phase. A pack error or a replica divergence
      // (`result.fallback` set) is NOT substituted: those say the plan cannot
      // be trusted, not that none was found.
      if (
        probe !== null &&
        probe.source !== 'fallback' &&
        probe.actions.length > 0 &&
        result.source === 'fallback' &&
        result.fallback === undefined
      ) {
        result = { ...probe, work: result.work, stats: ctx.stats };
      }
      const elapsedMs = now() - startedAt;
      ctx.stats.elapsedMs = elapsedMs;
      // A11: a search the DEADLINE cut updates the profile too (the module
      // header's PROFILE ON ABORT). An externally cancelled one still does
      // not: `cancel()` can land anywhere, including inside the fixed
      // pre-search overhead, so its interval is not a throughput sample the
      // way a full deadline-long one is. A16 adds the tiny-sample floors above
      // for the same reason, applied to the interval instead of to its cause.
      // `updateProfile` ignores a zero/negative sample.
      const usable = elapsedMs >= MIN_PROFILE_SAMPLE_MS && result.work >= MIN_PROFILE_SAMPLE_WORK;
      if (!this.aborted && usable) this.config.profile = updateProfile(this.config.profile, result.work, elapsedMs);
      // E2 lane 1. `result.stats` is `ctx.stats` on every path but the cold
      // probe's substitution, where the returned stats are the probe's; write
      // through the result so the number always describes the search that was
      // returned.
      result.stats.unitsPerMsBefore = ctx.stats.unitsPerMsBefore;
      result.stats.unitsPerMsAfter = this.config.profile.unitsPerMs;
    }
    this.deadlineMs = 0;
    return result;
  }

  /**
   * Sizes the macro transposition table for the rung this search is funded at
   * (`search/time.ts ttBitsForRung`), before `searchRoot` arms the meter.
   *
   * WHY IT IS SIZED PER SEARCH AND NOT PER ENGINE. `ttBitsMacro` is DESIGN
   * §6.3's per-device constant, chosen for a rung that was never larger than
   * 3.2e6; a 60 s allowance can now fund eight times that work, and a table
   * sized for the old rung would spend the extra seconds evicting the entries
   * the deeper iterations are looking for. The engine is built once per GAME
   * and the allowance is a per-TURN choice, so the constructor cannot know it.
   *
   * IT IS NOT A CACHE THAT SURVIVES THE TURN. `searchTurn` clears the table at
   * the top of every search (the module header's DETERMINISM note), so
   * replacing it with a fresh, zeroed one of another size is exactly the clear
   * that was going to happen; a 10 s turn after a 60 s one gets the 10 s
   * table, not a lucky large one, which is what makes the rung — and so the
   * move — the only thing the table's size depends on. A rung at or below the
   * old ladder top asks for `ttBitsMacro` itself, the size the table already
   * has, and nothing is allocated.
   *
   * DEGRADE THE TABLE, NEVER THE SEARCH. The top row is 67.1 MB on a profile
   * whose default is 8.4 MB (`search/time.ts TT_GROWTH_MAX_BITS` states every
   * row), and a phone the player has asked for `deep` on is the device most
   * likely to refuse it. A refused allocation therefore steps the request down
   * one bit at a time rather than propagating: the turn is searched on a
   * smaller table, which costs nodes, not correctness. `ttBitsMacro` itself is
   * the floor, and if even that cannot be allocated the search keeps the table
   * it is already holding — which `searchTurn` has just cleared, so it is a
   * correct table of the wrong size, and a search on the wrong-sized table
   * beats no turn at all.
   */
  private growTT(work: number): void {
    const base = this.config.ttBitsMacro;
    for (let bits = ttBitsForRung(base, work); bits >= base; bits--) {
      if (bits === this.ctx.tt.bits) return;
      try {
        this.ctx.tt = new TranspositionTable(bits);
        return;
      } catch {
        // Out of memory at this size; try the next one down. A `RangeError`
        // from the constructor's own bounds check cannot happen here — `bits`
        // is between `ttBitsMacro` and `ttBitsMacro + 3` — so this is the
        // allocator refusing, and the only useful answer is a smaller table.
      }
    }
  }

  /** DESIGN §4.17's legacy shim: search the whole turn, hand back its first
   * action in `AIResult` shape. `turnActions` carries the rest (protocol 3). */
  async findBestAction(state: GameState, decisionMs?: number): Promise<AIResult> {
    const startedAt = now();
    const result = await this.searchTurn(state, decisionMs === undefined ? undefined : { targetMs: decisionMs });
    const first = result.actions.length > 0 ? [result.actions[0]] : ([] as AIAction[]);
    return {
      plan: { actions: first, score: result.scoreCc },
      nodesSearched: result.stats.nodes,
      timeMs: now() - startedAt,
      depth: result.depth,
      turnActions: result.actions,
      endKey: result.endKey,
    };
  }

  /**
   * DESIGN §4.17. A fixed 40 ms micro-benchmark of the engine's own hot path —
   * level-2 table builds and full evaluations on the initial position — which
   * yields the `unitsPerMs` `chooseWork` needs. NEVER called when `work` is
   * given.
   */
  calibrate(): DeviceProfile {
    const ctx = this.ctx;
    const state = createInitialGameState(undefined, 4, 0, 'phasing');
    const p = ctx.rep.pack(state, allocState());
    setKillClockRootClock(p.clock);
    p.proverMode = 2;
    const meter = new WorkMeter(0x7fffffff);
    const startedAt = now();
    while (now() - startedAt < CALIBRATE_MS) {
      for (let i = 0; i < 8; i++) {
        ctx.eval.invalidate();
        ctx.tables[0].keyLo = -1 >>> 0;
        ctx.tables[0].keyHi = -1 >>> 0;
        const tables = ctx.tables[0], before = tables.economyProverCalls;
        try { buildTables(p, ctx.sc, 0, 2, tables); }
        finally {
          const calls = tables.economyProverCalls - before;
          if (calls > 0) meter.spend(WorkClass.PROVER, calls);
        }
        meter.spend(WorkClass.KILLTABLE, 1);
        ctx.eval.evaluate(p, 0, -INF, INF, ctx.sc, 0, meter);
      }
    }
    const elapsedMs = now() - startedAt;
    const profile = updateProfile({ unitsPerMs: 0, samples: 0 }, meter.used, elapsedMs);
    this.config.profile = profile;
    return profile;
  }
}

/**
 * Cheap stand-in for "how many candidates does this node have?" — the input to
 * `targetMs`'s `0.5 [one candidate]` factor. Generating the real list before
 * the rung is chosen would cost a whole macro node of work on the UI path, so
 * the engine asks the only question the factor actually cares about: can the
 * mover do anything at all beyond ending the phase? A side with no live unit
 * and an empty bank has exactly one turn available.
 */
function candidateHint(p: PackedState): number {
  const mover = p.side as Side;
  let bodies = 0;
  for (let slot = 0; slot < MAX_SLOTS && bodies < 2; slot++) {
    if (p.sq[slot] !== DEAD && p.owner[slot] === mover) bodies++;
  }
  return bodies >= 2 || p.bank[mover] > 0 ? 2 : 1;
}
