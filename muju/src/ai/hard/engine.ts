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
 * clock (`lab/hard-ai/deps.ts` enforces it), and it does so exactly three
 * times: to size the rung through `chooseWork`, to arm the abort watchdog at
 * `abortFactor × targetMs`, and to measure a completed search for
 * `updateProfile`. `searchTurn(state, {work})` bypasses all three — the lab,
 * the ladder and CI always pass `work`, so their results are machine
 * independent (DESIGN §5.11.6, §7.4).
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
import { allocTables, buildTables, type NodeTables } from './tables/context';
import { Evaluator, terminalScore } from './eval/evaluate';
import { DEFAULT_WEIGHTS } from './eval/weights';
import { TurnPool, type Turn } from './gen/turn';
import { TurnGenerator, newGenStats, outCapacityFor } from './gen/generate';
import { newDfpnResult } from './tactics/dfpn';
import { EMPTY_BOOK } from './book/format';
import { canonicalKey } from './book/probe';
import { ProofCache, TranspositionTable, newTTEntry } from './search/tt';
import { newOrderTables, clearOrderTables } from './search/order';
import { WorkClass, WorkMeter, chooseWork, now, targetMs, updateProfile } from './search/time';
import { allocTurn, newSearchStats, type SearchContext } from './search/pvs';
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

/** `ProofCache` size (DESIGN §8: 2^15). */
const PROOF_BITS = 15;

/**
 * DESIGN §5.11.4's quiescence generator: the interior cone narrowed to
 * `quiesce.maxCandidates`. The place phase is narrowed with it — a tactical
 * turn is overwhelmingly an ACTION-phase line, and the one place-phase family
 * quiescence must not lose (summon-and-strike) rides on the purchase plans the
 * kill table already ranks first.
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
    const rep = new Replica(cat);
    const maxPly = config.maxDepth + config.quiesce.maxPly + PLY_HEADROOM;
    const sc = new Scratch(maxPly, 8, 4, 4);
    const pool = new TurnPool(POOL_CAPACITY);
    const gen = new TurnGenerator(rep, config.gen, pool, sc);
    const genInterior = new TurnGenerator(rep, config.genInterior, pool, sc);
    const genQuiesce = new TurnGenerator(rep, quiesceGenConfig(config), pool, sc);
    installRescueWitness(gen);
    installRescueWitness(genInterior);
    installRescueWitness(genQuiesce);

    const tables: NodeTables[] = [];
    const keep: KeepSetTable[] = [];
    const turns: Turn[][] = [];
    const rootCapacity = outCapacityFor(config.gen);
    const interiorCapacity = outCapacityFor(config.genInterior);
    for (let ply = 0; ply < maxPly; ply++) {
      tables.push(allocTables());
      keep.push(newKeepSetTable());
      const capacity = ply === 0 ? rootCapacity : interiorCapacity;
      const row: Turn[] = new Array<Turn>(capacity);
      for (let i = 0; i < capacity; i++) row[i] = allocTurn();
      turns.push(row);
    }
    const genOut: Turn[] = new Array<Turn>(rootCapacity > interiorCapacity ? rootCapacity : interiorCapacity);

    const evaluator = new Evaluator(rep, config.weights);
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
      score: (p, scratch, ply) => {
        const mover = ctx.scoreMover;
        const terminal = terminalScore(p, mover, ply);
        if (terminal !== null) return terminal;
        return evaluator.stage0(p, mover) + evaluator.stage1(p, mover, scratch, ply);
      },
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
   */
  async searchTurn(
    state: GameState,
    opts?: { work?: number; targetMs?: number; onProgress?: RootOptions['onProgress'] },
  ): Promise<RootResult> {
    this.aborted = false;
    this.deadlineMs = 0;
    const ctx = this.ctx;
    ctx.stats = newSearchStats();
    ctx.tt.clear();
    ctx.proof.clear();
    clearOrderTables(ctx.ord);
    ctx.eval.invalidate();
    ctx.eval.setWeights(this.config.weights);

    const fixedWork = opts?.work;
    let work: number;
    let startedAt = 0;
    let measured = false;

    if (fixedWork !== undefined && fixedWork > 0) {
      work = fixedWork;
    } else {
      let packed: PackedState;
      try {
        packed = ctx.rep.pack(state, this.rootState);
      } catch (err) {
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
      const t = buildTables(packed, ctx.sc, 0, 2, ctx.tables[0]);
      const book = this.config.book;
      let bookHit = false;
      if (book !== null && book.size > 0) {
        const key = canonicalKey(packed);
        bookHit = book.lookup(key.lo, key.hi) !== null;
      }
      const tms = opts?.targetMs ?? targetMs(packed, t, this.config.time, bookHit, candidateHint(packed));
      work = chooseWork(this.config.profile, tms);
      startedAt = now();
      this.deadlineMs = startedAt + this.config.time.abortFactor * tms;
      measured = true;
    }

    let result: RootResult;
    try {
      result = searchRoot(this, state, { work, config: this.config, canonical: state, onProgress: opts?.onProgress });
    } catch (err) {
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
      const elapsedMs = now() - startedAt;
      ctx.stats.elapsedMs = elapsedMs;
      if (ctx.stats.stopReason !== 'abort' && !this.aborted) {
        this.config.profile = updateProfile(this.config.profile, result.work, elapsedMs);
      }
    }
    this.deadlineMs = 0;
    return result;
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
    const state = createInitialGameState();
    const p = ctx.rep.pack(state, allocState());
    p.proverMode = 2;
    const meter = new WorkMeter(0x7fffffff);
    const startedAt = now();
    while (now() - startedAt < CALIBRATE_MS) {
      for (let i = 0; i < 8; i++) {
        ctx.eval.invalidate();
        ctx.tables[0].keyLo = -1 >>> 0;
        ctx.tables[0].keyHi = -1 >>> 0;
        buildTables(p, ctx.sc, 0, 2, ctx.tables[0]);
        meter.spend(WorkClass.KILLTABLE, 1);
        ctx.eval.full(p, 0, ctx.sc, 0);
        meter.spend(WorkClass.EVAL1, 1);
        meter.spend(WorkClass.EVAL2, 1);
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
