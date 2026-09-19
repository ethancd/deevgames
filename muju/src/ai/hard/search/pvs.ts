/**
 * Iterative-deepening principal-variation search over macro turns
 * (DESIGN §4.16 `pvs.ts`, §5.11.1–§5.11.3, §5.11.6).
 *
 * A node is the state `startTurn` produced: one side to move, a whole turn to
 * choose. `generateTurns` hands the node its candidates, `scoreTurns` orders
 * them, and the search recurses one macro turn per ply — so **negamax flips
 * sign exactly once per turn boundary**, never per action
 * (`tests/ai/hard/negamax-sign.test.ts` pins the bug
 * `docs/AI_CORRECTNESS-2026-09-07.md` repaired).
 *
 * A turn that ENDS the game does not flip `p.side` (a lethal attack that
 * eliminates, a corner entry the home gate resolves), so the parent — not the
 * child — reads the terminal: after `makeTurn` it asks `terminalScore(p,
 * mover, ply + 1)` directly and only recurses when the game is still running.
 * That is the one place a naive `-pvs(child)` would invert a mate.
 *
 * POOL DISCIPLINE. `TurnGenerator` writes into pool-owned `Turn` records and
 * the pool is reset once per node, so a parent's candidate list would be
 * shredded by its children. Each ply therefore owns a persistent candidate
 * array and the node COPIES the generator's output into it before recursing
 * (`copyTurn`, ~600 bytes per candidate against a ~3 ms node). One pool, one
 * generator pair, no per-ply `TurnTT`. See DEVIATIONS under M14.
 *
 * Refinements (`useLmr`, `useAspiration`, `useFutility`, `useExtensions`,
 * `useDfpn`) all default OFF at M14; M16/M17 turn them on behind their own
 * SPRT gates (DESIGN §5.11.5).
 */
import { MATE_PLY_CC, MAX_TURN_ACTIONS, WIN_CC, type Centi, type PackedState, type Side } from '../types';
import type { Scratch } from '../core/bits';
import type { Catalog } from '../core/catalog';
import type { KeepSetTable } from '../core/action';
import type { Replica, Undo } from '../core/state';
import { buildTables, type NodeTables } from '../tables/context';
import { minTurnsToCorner } from '../tables/home';
import { terminalScore } from '../eval/evaluate';
import type { Evaluator } from '../eval/evaluate';
import { TurnFlag, type Turn, type TurnPool } from '../gen/turn';
import { UNLIMITED_WORK, type WorkSink } from '../gen/actionsearch';
import type { GenStats, TurnGenerator } from '../gen/generate';
import { Proof as DfpnProof, forceHome, type DfpnResult } from '../tactics/dfpn';
import type { SearchConfig } from '../config';
import { IterCostPrior, WorkClass, iterFitDecision } from './time';
import type { IterFitVerdict, WorkMeter } from './time';
import { Bound, ProofValue, scoreFromTT, usable, type ProofCache, type TranspositionTable, type TTEntry } from './tt';
import { maxPlausibleGain, onCutoff, scoreTurns, type OrderTables } from './order';
import type { RootProbe } from './probe';
import { quiesce } from './quiesce';

export type { SearchConfig, QuiesceConfig } from '../config';

/** Beyond any real score; `-INF` is a safe "nothing searched yet". */
export const INF = 0x3fffffff;

/** Flags that exempt a candidate from futility pruning and from LMR
 * (DESIGN §5.11.2, §5.11.5). */
export const NO_PRUNE_FLAGS =
  TurnFlag.KILL | TurnFlag.HOME_ENTRY | TurnFlag.HOME_RESCUE | TurnFlag.HOME_RACE | TurnFlag.FORCED;
export const NO_REDUCE_FLAGS = NO_PRUNE_FLAGS | TurnFlag.SPAWN_DENY;

export interface HardSearchStats {
  nodes: number;
  qnodes: number;
  turnNodes: number;
  evals: number;
  ttHits: number;
  ttProbes: number;
  depth: number;
  seldepth: number;
  byClass: Int32Array;
  proverCalls: number;
  /**
   * `Replica.cappedProverCalls` as this search last saw it: full-prover calls
   * inside `make` that ended AT `PROOF_NODES` (canonical
   * `cutoffReason: 'node_limit'`).
   *
   * Exposure telemetry for the full home-checkmate calls made inside `make`.
   * The current act-only no-rescue argument establishes order invariance of
   * the MATE terminal decision. Successful witnesses and work can still differ
   * with order without a cutoff, so zero here does not certify identical
   * candidate lists, slot-table reuse or fixed-work search traces.
   *
   * A LIFETIME GAUGE, like `Replica.fullProverCalls` itself, not a per-search
   * delta: the counter is monotone and never reset by `unmake`, so a caller that
   * wants one search's share diffs it the way `chargeProver`'s callers diff
   * `fullProverCalls`. It stays 0 for the whole life of an engine that never
   * capped a proof, which is the assertion that matters.
   */
  cappedProverCalls: number;
  dfpnCalls: number;
  catalogRebuilds: number;
  replicaDivergences: number;
  work: number;
  /** Units spent inside quiescence (DESIGN §5.11.4's R5 cap; see
   * `search/quiesce.ts` for why it is measured in units and not in nodes). */
  quiesceWork: number;
  elapsedMs: number;
  /**
   * Wall-clock ms this call spent on its COLD PROBE — one `WORK_LADDER[0]`
   * search of the real root, run before the rung is chosen so the rung is
   * sized from a measurement of this box (E1.5; the E1.4 §5 patch). Nonzero
   * only on the first wall-funded search of an engine whose
   * `time.calibrateCold` is on. It sits OUTSIDE `elapsedMs`, which still times
   * the turn's main search, but INSIDE the deadline window: when a call
   * probes, the watchdog is armed from the moment the call was entered rather
   * than from the start of the main search, so probe and search together fit
   * the allowance (`engine.ts#searchTurn`). 0 everywhere else, fixed-work mode
   * included.
   */
  calibratedMs: number;
  /**
   * The throughput the cold probe measured, in units/ms, as adopted into
   * `config.profile` — 0 when this call did not probe, and 0 when the probe
   * ran but A16's tiny-sample guard rejected its sample (so an artifact can
   * tell "no probe" from "probe, no usable measurement" by reading it next to
   * `calibratedMs`).
   */
  calibratedUnitsPerMs: number;
  stopReason: 'complete' | 'work' | 'abort';
  /**
   * The RUNG this search was armed with: `opts.work` as `searchRoot` handed it
   * to `meter.reset` (E2 lane 1). `work` is what was spent, `rung` what was
   * available, and until this field the difference was invisible from outside
   * the engine — so a ladder artifact could not say whether a turn stopped
   * because the rung ran out or because deepening refused to start.
   *
   * A STATISTIC, NOT A CONFIGURATION: `HardSearchStats` is not serialised into
   * the resolved configuration, so no hash moves.
   */
  rung: number;
  /** `profile.unitsPerMs` the rung was chosen from, and the value
   * `updateProfile` adopted after this search (E2 lane 1). Both 0 in
   * fixed-work mode, which reads no clock and updates no profile. */
  unitsPerMsBefore: number;
  unitsPerMsAfter: number;
  /**
   * E4.3 lane 5 (`searchFix.iterFit`), and 0/absent on every other engine.
   * `iterFitRemainders` counts the iterations this search started KNOWING the
   * prediction did not fit — the remainder arm of `iterFitVerdict`. It can be
   * more than one: a remainder run that COMPLETES anyway (the prediction was
   * pessimistic) publishes normally and the loop goes on to ask again.
   * `iterFitPublished` is 1 when such an iteration did not complete and
   * replaced the move under the principal-variation rule instead.
   *
   * STATISTICS, NOT CONFIGURATION: `HardSearchStats` is not serialised into the
   * resolved configuration, so no hash moves. Optional, so `newSearchStats()`
   * does not write them and a reader takes `?? 0`.
   */
  iterFitRemainders?: number;
  iterFitPublished?: number;
}

export function newSearchStats(): HardSearchStats {
  return {
    nodes: 0,
    qnodes: 0,
    turnNodes: 0,
    evals: 0,
    ttHits: 0,
    ttProbes: 0,
    depth: 0,
    seldepth: 0,
    byClass: new Int32Array(9),
    proverCalls: 0,
    cappedProverCalls: 0,
    dfpnCalls: 0,
    catalogRebuilds: 0,
    replicaDivergences: 0,
    work: 0,
    quiesceWork: 0,
    elapsedMs: 0,
    calibratedMs: 0,
    calibratedUnitsPerMs: 0,
    stopReason: 'complete',
    rung: 0,
    unitsPerMsBefore: 0,
    unitsPerMsAfter: 0,
  };
}

export interface SearchContext {
  rep: Replica;
  cat: Catalog;
  /** Root-node generator (`cfg.gen`). */
  gen: TurnGenerator;
  /** Interior-node generator (`cfg.genInterior`). Additive to DESIGN §4.16,
   * which lists one `gen` while `SearchConfig` carries two `GenConfig`s. */
  genInterior: TurnGenerator;
  /** Quiescence generator: `cfg.genInterior` narrowed to
   * `cfg.quiesce.maxCandidates` (DESIGN §5.11.4: "generate with
   * `K = cfg.quiesce.maxCandidates`"). Additive, for the same reason. */
  genQuiesce: TurnGenerator;
  tt: TranspositionTable;
  proof: ProofCache;
  ord: OrderTables;
  eval: Evaluator;
  meter: WorkMeter;
  cfg: SearchConfig;
  root: Side;
  sc: Scratch;
  tables: NodeTables[];
  keep: KeepSetTable[];
  undo: Undo;
  pool: TurnPool;
  stats: HardSearchStats;
  stop: () => boolean;

  // --- additive plumbing (see the module header and DEVIATIONS under M14) ---
  /** Per-ply persistent candidate arrays; the pool's output is copied here. */
  turns: Turn[][];
  /** The generator's own output array (pool-owned records). */
  genOut: Turn[];
  genStats: GenStats;
  /** The side the within-turn scorer values from; set before every generate. */
  scoreMover: Side;
  score: (p: PackedState, sc: Scratch, ply: number) => Centi;
  /** Highest ply index the per-ply arrays cover. */
  maxPly: number;
  /** Probe target, reused (no allocation in the search). */
  ttScratch: TTEntry;
  /** `false` for the M14 bench's TT-off arm. */
  useTT: boolean;
  /** The TT-on/off comparison arm's narrowing: admit an EXACT entry only at
   * exactly the requested depth, so a fixed-depth search stays one
   * (`search/tt.ts`'s header). The shipped search leaves it false. */
  ttExactSameDepthOnly: boolean;
  /**
   * Set as soon as ANY node in this search was cut short by the work meter or
   * by `stop()`. From that point on nothing is written to the transposition
   * table: a node whose candidate scan — or whose child's — stopped part way
   * returns a partial maximum, and storing that as a bound or an EXACT value
   * would let a truncated search poison the next one. Reset per search.
   */
  truncated: boolean;
  /** Units spent inside top-level quiescence subtrees — the R5 cap's meter
   * (`search/quiesce.ts`). Reset per search. */
  quiesceWork: number;
  /** `false` disables the R5 cap's ENFORCEMENT (the measurement is unchanged);
   * `hard:bench --calibrate`'s uncapped arm sets it. */
  quiesceCapOn: boolean;
  /** The best root turn of the last COMPLETED iteration. */
  rootBest: Turn;
  rootHasBest: boolean;
  /**
   * The best candidate of a TRUNCATED iteration, kept apart from `rootBest` so
   * a partial search can never overwrite a completed depth's answer
   * (DESIGN §5.11.6: the watchdog "can only truncate iterative deepening
   * (returning the last completed depth), never alter a completed depth").
   * It is used only when NO iteration completed — the alternative there is no
   * move at all. Additive plumbing; see DEVIATIONS under M14.
   */
  rootPartial: Turn;
  rootHasPartial: boolean;
  /** `forceHome`'s reusable result record; `null` disables the probe. */
  dfpnOut: DfpnResult | null;
  /**
   * E2 lane 1's root instrument, or `null`. `search/root.ts` installs one for
   * the duration of an instrumented search and clears it afterwards; it is
   * `null` in every production path, and the four `probe !== null` guards
   * below are the whole of its cost when off (`search/probe.ts`).
   */
  probe: RootProbe | null;
  /**
   * E4.3 lane 5's per-step iteration-cost prior (`search/time.ts
   * IterCostPrior`), or absent. `iterativeDeepening` creates it on the first
   * search that has a ratio to record and only when `cfg.searchFix.iterFit` is
   * on; `engine.ts#searchTurn` clears it at the start of every FIXED-work
   * search, so a fixed-work search still carries nothing from one search into
   * the next (DESIGN §7.4). Nothing reads it with the flag off.
   */
  iterCost?: IterCostPrior;
  /**
   * E4.3 lane 5. True while the iteration now running is the REMAINDER run:
   * one the prediction refused, started anyway to spend the rest of the rung,
   * and allowed to publish only under the principal-variation rule. It is what
   * arms the three extra comparisons in `rootIteration`; false or absent
   * everywhere else, which is the whole of their cost when the flag is off.
   */
  iterFitRemainder?: boolean;
  /**
   * THE TURN PACES' ONE EFFECT ON THE SCHEDULE. True when `engine.ts` funded
   * this search from a wall allowance LONGER than `search/time.ts
   * QUICK_TURN_ALLOWANCE_MS` — `normal` (30 s) or `deep` (60 s), the two
   * allowances the release, the goldens and the determinism gates never
   * measured — and false for every other search, fixed-work ones included.
   *
   * It says one thing: run E4.3 lane 5's iteration-cost rule (`iterFit`
   * below), which is the mechanism designed to let the last iteration fit the
   * remaining rung instead of DESIGN §5.11.2 refusing it at 45% spent. An
   * explicit `cfg.searchFix.iterFit` still decides for itself; this only speaks
   * where the champion left the key absent.
   */
  wallFit?: boolean;
}

export interface SearchResult {
  best: Turn | null;
  scoreCc: Centi;
  depth: number;
  pv: Turn[];
  stats: HardSearchStats;
}

/** A standalone `Turn` record (the pool's are owned by the generator). */
export function allocTurn(): Turn {
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

export function copyTurn(dst: Turn, src: Turn): Turn {
  dst.actions.set(src.actions.subarray(0, src.count));
  dst.count = src.count;
  dst.endLo = src.endLo;
  dst.endHi = src.endHi;
  dst.sig = src.sig;
  dst.flags = src.flags;
  dst.gainCc = src.gainCc;
  dst.place = src.place;
  dst.hangCc = src.hangCc;
  return dst;
}

/**
 * Applies every action of `t` to `p`, stopping at the first the replica calls
 * illegal. Returns how many were applied; `applied === t.count` means the
 * whole turn went in. Always pair with `unmakeTurn(s, p, applied)`.
 */
/**
 * `Replica.make` adjudicates a corner entry with whatever `p.proverMode` it
 * finds, and a child node (quiescence, in particular) lowers it to the
 * admissible bound. Every caller that applies a turn therefore re-asserts the
 * mode it wants FIRST — otherwise the second candidate at a node would be
 * adjudicated by whatever the first candidate's subtree left behind, which is
 * both wrong and invisible.
 */
export const PROVER_FULL = 2;
export const PROVER_BOUND = 1;

export function makeTurn(s: SearchContext, p: PackedState, t: Turn, keep: KeepSetTable): number {
  const proverBefore = s.rep.fullProverCalls;
  let applied = 0;
  for (let i = 0; i < t.count; i++) {
    const a = t.actions[i];
    if (!s.rep.isLegal(p, a, keep)) break;
    s.rep.make(p, a, s.undo, keep);
    applied++;
  }
  chargeProver(s, proverBefore);
  return applied;
}

/**
 * DESIGN §5.11.6 prices the prover at "`PROVER` 40 per full-prover call", and
 * `Replica.make` runs one exactly when it applies an action at
 * `proverMode = 2` into a position `needsProof` accepts. `Replica` therefore
 * counts its own full-prover invocations and every caller that applies actions
 * charges the delta — the SEARCH loop, the ORDERING pass and the root's
 * must-answer scan alike, so `stats.proverCalls` is the number M14's
 * `proverCallsPer1000Macro` claims it is rather than a lower bound on it.
 */
export function chargeProver(s: SearchContext, before: number): void {
  const calls = s.rep.fullProverCalls - before;
  if (calls <= 0) return;
  s.stats.proverCalls += calls;
  // The order-exposure gauge, published wherever prover work is charged (see
  // `HardSearchStats.cappedProverCalls`): a lifetime total, not a delta.
  s.stats.cappedProverCalls = s.rep.cappedProverCalls;
  s.meter.spend(WorkClass.PROVER, calls);
}

/**
 * `chargeProver` without the price (P6). The GENERATOR's full-prover calls —
 * until this lane the one set nothing counted, which is why an exploded turn
 * reported `PROVER 0` for a generation that had run 330 of them and why
 * `bench/run.ts`'s `proverCallsPer1000Macro` was a lower bound rather than the
 * count it claims to be.
 *
 * This is HONEST ACCOUNTING AND NOT THE FIX, and the two halves are split on
 * purpose. Counting is free. Pricing is not: `WORK_COST[PROVER]` is 40 units
 * against a measured 348 ms per call, so adding the delta to `meter.used`
 * would move every fixed-`work` result in the lab, in CI and in the E1
 * baseline (the worst measured generation prices at 13,200 units) while still
 * leaving the rung three orders of magnitude from bounding the phase — a play
 * change bought for nothing. Re-pricing the prover is E2's, with its own A/B;
 * `GEN_SINK` in `generateAt` is what actually stops the explosion.
 */
export function countProver(s: SearchContext, before: number): void {
  const calls = s.rep.fullProverCalls - before;
  if (calls <= 0) return;
  s.stats.proverCalls += calls;
  s.stats.cappedProverCalls = s.rep.cappedProverCalls;
  s.meter.count(WorkClass.PROVER, calls);
}

export function unmakeTurn(s: SearchContext, p: PackedState, applied: number): void {
  for (let i = 0; i < applied; i++) s.rep.unmake(p, s.undo);
}

/** Leaf value, from the side-to-move's point of view. */
export function evaluateLeaf(s: SearchContext, p: PackedState, alpha: Centi, beta: Centi, ply: number): Centi {
  return s.eval.evaluate(p, p.side as Side, alpha, beta, s.sc, ply, s.meter);
}

/**
 * The generator's `WorkSink` with the search's `stop()` folded into
 * `exhausted()` (P6, `docs/hard-ai/e1/P6-TURN-TIME-EXPLOSION.md`).
 *
 * `TurnGenerator` polls `meter.exhausted()` at three places — the keep-set
 * loop and the place-plan loop in `gen/generate.ts`, and the action DFS in
 * `gen/actionsearch.ts` — and has no other interruption point and no clock of
 * its own (DESIGN §2 forbids `gen` importing `search`, which is where `stop()`
 * lives). Handing it a sink whose `exhausted()` is `base.exhausted() ||
 * stop()` reuses all three at their existing granularity — one within-turn
 * node — and is the whole of P6's interrupt: root generation on the two
 * exploded positions ran 63 s and 115 s with the meter three orders of
 * magnitude from its rung and the 3,000 ms deadline structurally unreachable.
 *
 * DETERMINISM. With fixed `work` (the lab, CI, `hard:determinism`,
 * `hard:perft`) `engine.ts` never arms the watchdog: `deadlineMs` is 0 and
 * `aborted` is false, so `stop()` is constantly false and `exhausted()` is
 * `base.exhausted()` — the same predicate, on the same meter, at the same
 * sites. Fixed-work generation is therefore bit-identical, and the only
 * behaviour this can change is a wall-funded search that was going to run past
 * its deadline anyway.
 *
 * `stopped` LATCHES so a generation that has already been cut reads no further
 * clock, and so the truncation cannot flicker back off inside one `generate`.
 * One instance is enough: the search is synchronous and `generate` never
 * re-enters `generateAt`, so no two generations are ever live at once.
 */
class StopAwareSink implements WorkSink {
  private base: WorkSink = UNLIMITED_WORK;
  private stopFn: () => boolean = NEVER_STOP;
  private stopped = false;

  arm(base: WorkSink, stopFn: () => boolean): this {
    this.base = base;
    this.stopFn = stopFn;
    this.stopped = false;
    return this;
  }

  spend(cls: number, n = 1): void {
    this.base.spend(cls, n);
  }

  exhausted(): boolean {
    if (this.base.exhausted()) return true;
    if (this.stopped) return true;
    if (!this.stopFn()) return false;
    this.stopped = true;
    return true;
  }

  /** True when the LAST armed generation was cut by `stop()` rather than by
   * the meter. Always false under fixed `work`. */
  get cut(): boolean {
    return this.stopped;
  }
}

function NEVER_STOP(): boolean {
  return false;
}

const GEN_SINK = new StopAwareSink();

/**
 * Fills `s.turns[ply][0..n)` with this node's candidates and returns `n`.
 * `p.upkeepPending` nodes get their keep-set table written into `s.keep[ply]`
 * by the generator; every emitted `PAY_UPKEEP` indexes into it.
 *
 * The list may be TRUNCATED — by the meter, as it always could be, and now
 * (P6) by the deadline as well. Every caller already treats a short list as a
 * short list; `search/root.ts` additionally has to make a move out of one.
 */
export function generateAt(
  s: SearchContext,
  p: PackedState,
  t: NodeTables,
  ply: number,
  generator?: TurnGenerator,
): number {
  const gen = generator ?? (ply === 0 ? s.gen : s.genInterior);
  s.pool.reset();
  // `ActionSearch` applies actions through `Replica.make`; the caller's mode
  // must be in force for the whole generation, not only for the first line.
  s.scoreMover = p.side as Side;
  const proverBefore = s.rep.fullProverCalls;
  const raw = gen.generate(p, t, s.score, GEN_SINK.arm(s.meter, s.stop), ply, s.keep[ply], s.genOut, s.genStats);
  countProver(s, proverBefore);
  // A generation the DEADLINE cut leaves a PARTIAL candidate list, and a node
  // that searches a partial list must not publish its value to the
  // transposition table — the same rule `isTruncating` enforces for a partial
  // candidate LOOP, which only notices when candidates are left over. Under
  // fixed `work` `cut` is never true and nothing here fires.
  if (GEN_SINK.cut) s.truncated = true;
  // E4.3 candidate A (P8): a generation whose DESIGN §5.6 injection 4 was
  // REFUSED by `searchFix.rescueCap` also leaves a partial candidate list —
  // the forced rescue line is missing from it — so the same rule applies. 0 in
  // every generation with the flag absent (`gen/generate.ts RescueCap`).
  if (s.genStats.rescueCapped > 0) s.truncated = true;
  // DESIGN §5.11.6 charges `GEN` per place plan.
  if (s.genStats.placePlans > 0) s.meter.spend(WorkClass.GEN, s.genStats.placePlans);
  const dst = s.turns[ply];
  const n = raw < dst.length ? raw : dst.length;
  for (let i = 0; i < n; i++) copyTurn(dst[i], s.genOut[i]);
  // E2 lane 1's ply-1 trace: which list the search consults at the OPPONENT'S
  // reply node, under whichever root candidate we are inside. One comparison
  // per generation when off, and generation is thousands of units of work.
  if (ply === 1 && s.probe !== null && s.probe.withPly1) {
    const which = gen === s.genQuiesce ? 2 : gen === s.gen ? 0 : 1;
    s.probe.ply1(which, n, GEN_SINK.cut, dst);
  }
  return n;
}

function isTruncating(s: SearchContext): boolean {
  return s.meter.exhausted() || s.stop();
}

/** DESIGN §5.11.2. Returns the value of `p` from the side-to-move's point of
 * view, searched `depth` macro turns deep inside `(alpha, beta)`. */
export function pvs(
  s: SearchContext,
  p: PackedState,
  depth: number,
  alpha: Centi,
  beta: Centi,
  ply: number,
  prevSig: number,
): Centi {
  s.meter.spend(WorkClass.MACRO);
  s.stats.nodes++;
  if (ply > s.stats.seldepth) s.stats.seldepth = ply;

  const terminal = terminalScore(p, p.side as Side, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) return quiesce(s, p, alpha, beta, ply, 0);
  if (ply + 1 >= s.maxPly) return evaluateLeaf(s, p, alpha, beta, ply);

  const originalAlpha = alpha;

  // DESIGN §5.11.4: the prover runs in `full` mode "at the root and at PV nodes
  // of depth >= 1", and in `bound` (admissible) mode everywhere else — inside
  // quiescence, and at the null-window scout nodes PVS spends most of its
  // budget on. A PV node is one searched on a real window; a scout window is
  // one centimo wide. The bound can only UNDER-claim a mate (its FAILURE is
  // what proves one), so a scout that misses a corner mate fails low and the
  // full-window re-search — a PV node — adjudicates it properly.
  const nodeProverMode = beta - alpha > 1 ? PROVER_FULL : PROVER_BOUND;
  const mover = p.side as Side;
  const other = (1 - mover) as Side;
  let tables: NodeTables | null = null;

  let ttEntry: TTEntry | null = null;
  if (s.useTT && s.tt.probe(p.kposLo, p.kposHi, s.ttScratch)) {
    const e = s.ttScratch;
    e.scoreCc = scoreFromTT(e.scoreCc, ply);
    ttEntry = e;
    if (usable(e, depth, alpha, beta, s.ttExactSameDepthOnly)) {
      // ...but a TRANSPOSITION carries the value across prover modes, and the
      // paragraph above is the reason that matters: an entry computed at a
      // scout node under the admissible bound may UNDER-claim a corner mate,
      // and returning it here would let a PV node skip the full-prover
      // adjudication §5.11.4 requires of it. The distinction can only change
      // the answer where a corner is actually in play, so the refusal is
      // narrowed to a live corner threat — which costs the table build this
      // node was about to do anyway. See DEVIATIONS under M14.
      if (!e.boundProver || nodeProverMode !== PROVER_FULL) return e.scoreCc;
      p.proverMode = nodeProverMode;
      tables = buildTables(p, s.sc, ply, 2, s.tables[ply]);
      s.meter.spend(WorkClass.KILLTABLE);
      if (minTurnsToCorner(p, tables, mover) > 1 && minTurnsToCorner(p, tables, other) > 1) return e.scoreCc;
    }
  }

  p.proverMode = nodeProverMode;
  if (tables === null) {
    tables = buildTables(p, s.sc, ply, 2, s.tables[ply]);
    s.meter.spend(WorkClass.KILLTABLE);
  }
  const t: NodeTables = tables;
  let ext = 0;
  if (s.cfg.useExtensions && (minTurnsToCorner(p, t, mover) <= 1 || minTurnsToCorner(p, t, other) <= 1)) ext = 1;

  if (
    s.cfg.useDfpn &&
    s.dfpnOut !== null &&
    depth >= 3 &&
    (minTurnsToCorner(p, t, mover) <= 3 || minTurnsToCorner(p, t, other) <= 3) &&
    s.proof.get(p.kposLo, p.kposHi) !== ProofValue.DISPROVEN
  ) {
    s.stats.dfpnCalls++;
    const verdict = forceHome(s, p, mover, s.cfg.dfpn, s.dfpnOut);
    if (verdict.proof === DfpnProof.PROVEN) {
      const mate = WIN_CC - ply * MATE_PLY_CC;
      s.proof.put(p.kposLo, p.kposHi, ProofValue.MATE);
      if (s.useTT) s.tt.store(p.kposLo, p.kposHi, mate, depth, Bound.EXACT, 0, ply, nodeProverMode === PROVER_BOUND);
      return mate;
    }
    if (verdict.proof === DfpnProof.DISPROVEN) s.proof.put(p.kposLo, p.kposHi, ProofValue.DISPROVEN);
  }

  const n = generateAt(s, p, t, ply);
  if (n === 0) return evaluateLeaf(s, p, alpha, beta, ply);
  scoreTurns(p, t, s.turns[ply], n, ttEntry, s.ord, ply, prevSig, s);

  const turns = s.turns[ply];
  const keep = s.keep[ply];
  const fullDepth = depth - 1 + ext;
  let best = -INF;
  let bestEnd = 0;
  let searched = 0;
  let truncated = false;
  let stage1Cache = 0;
  let stage1Valid = false;

  for (let i = 0; i < n; i++) {
    const turn = turns[i];

    if (s.cfg.useFutility && depth === 1 && (turn.flags & NO_PRUNE_FLAGS) === 0 && searched > 0) {
      if (!stage1Valid) {
        stage1Cache = s.eval.stage0(p, mover) + s.eval.stage1(p, mover, s.sc, ply);
        stage1Valid = true;
      }
      if (stage1Cache + maxPlausibleGain(p, t) + s.cfg.futilityMarginCc < alpha) continue;
    }

    let reduced = fullDepth;
    if (s.cfg.useLmr && i >= s.cfg.lmrRank1 && (turn.flags & NO_REDUCE_FLAGS) === 0) {
      reduced -= i >= s.cfg.lmrRank2 ? 2 : 1;
      if (reduced < 0) reduced = 0;
    }

    p.proverMode = nodeProverMode;
    const applied = makeTurn(s, p, turn, keep);
    if (applied !== turn.count) {
      unmakeTurn(s, p, applied);
      continue;
    }

    let score: Centi;
    const childTerminal = terminalScore(p, mover, ply + 1);
    if (childTerminal !== null) {
      score = childTerminal;
    } else if (searched === 0) {
      score = -pvs(s, p, fullDepth, -beta, -alpha, ply + 1, turn.sig);
    } else {
      score = -pvs(s, p, reduced, -alpha - 1, -alpha, ply + 1, turn.sig);
      if (score > alpha && (reduced < fullDepth || score < beta)) {
        score = -pvs(s, p, fullDepth, -beta, -alpha, ply + 1, turn.sig);
      }
    }
    unmakeTurn(s, p, applied);
    searched++;

    if (score > best) {
      best = score;
      bestEnd = turn.endLo;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      onCutoff(s.ord, turn, ply, prevSig, depth);
      break;
    }
    if (i + 1 < n && isTruncating(s)) {
      truncated = true;
      break;
    }
  }

  if (searched === 0) return evaluateLeaf(s, p, alpha, beta, ply);
  if (truncated) s.truncated = true;

  // `s.truncated` and not just the local flag: a child that stopped part way
  // handed this node a partial value, and `best` is only as sound as the worst
  // of them (DESIGN §5.11.6's watchdog "can only truncate").
  if (s.useTT && !s.truncated) {
    const bound = best <= originalAlpha ? Bound.UPPER : best >= beta ? Bound.LOWER : Bound.EXACT;
    s.tt.store(p.kposLo, p.kposHi, best, depth, bound, bestEnd, ply, nodeProverMode === PROVER_BOUND);
  }
  return best;
}

interface RootOutcome {
  score: Centi;
  bestIndex: number;
  completed: boolean;
  /**
   * E4.3 lane 5's REMAINDER run only (`s.iterFitRemainder`); absent otherwise.
   *
   * `pvSearched`/`pvScore` — the candidate whose end position is the currently
   * published move (`s.rootBest`, the last COMPLETED depth's answer) was
   * searched to the end at THIS depth, and what it scored. That is the
   * principal variation completing at the new depth.
   * `cleanBest`/`cleanBestIndex` — the best candidate among those searched
   * while `s.truncated` was still false, i.e. whose own subtree was not itself
   * cut part way. A truncated child returns a partial maximum, so its score is
   * not a value and must not be compared with one.
   * `cutByMeter` — the candidate loop was ended by the WORK METER and not by
   * `stop()`. A move published off a clock-cut iteration would be a function of
   * when the watchdog fired, which DESIGN §5.11.6 forbids.
   */
  pvSearched?: boolean;
  pvScore?: Centi;
  cleanBest?: Centi;
  cleanBestIndex?: number;
  cutByMeter?: boolean;
}

/**
 * One root iteration. Identical to `pvs` at `ply = 0` except that it keeps the
 * index of the best candidate and never takes a TT cutoff (the root's value
 * must be searched, not recalled — its move is the answer).
 */
function rootIteration(s: SearchContext, p: PackedState, depth: number, alpha: Centi, beta: Centi): RootOutcome {
  s.meter.spend(WorkClass.MACRO);
  s.stats.nodes++;
  p.proverMode = PROVER_FULL;
  const t = buildTables(p, s.sc, 0, 2, s.tables[0]);
  s.meter.spend(WorkClass.KILLTABLE);

  let ttEntry: TTEntry | null = null;
  if (s.useTT && s.tt.probe(p.kposLo, p.kposHi, s.ttScratch)) {
    s.ttScratch.scoreCc = scoreFromTT(s.ttScratch.scoreCc, 0);
    ttEntry = s.ttScratch;
  }

  const probe = s.probe;
  const iterationStartedAt = probe === null ? 0 : s.meter.used;
  const n = generateAt(s, p, t, 0);
  if (n === 0) {
    if (probe !== null) probe.traceEmpty(depth);
    return { score: evaluateLeaf(s, p, alpha, beta, 0), bestIndex: -1, completed: true };
  }
  scoreTurns(p, t, s.turns[0], n, ttEntry, s.ord, 0, 0, s);
  // E2 lane 1. AFTER the ordering pass, because the list the root WALKS is the
  // sorted one and `scoreTurns` overwrites `gainCc` with its ordering score.
  if (probe !== null) probe.beginIteration(depth, s.turns[0], n, iterationStartedAt);

  const turns = s.turns[0];
  const keep = s.keep[0];
  const mover = p.side as Side;
  let best = -INF;
  let bestIndex = -1;
  let searched = 0;
  let completed = true;
  // E4.3 lane 5. Off — and three dead comparisons per candidate — on every
  // engine but the remainder run of an `iterFit` search. `s.rootBest` still
  // holds the last COMPLETED depth's move here: `iterativeDeepening` copies
  // this iteration's answer into it only after the iteration returns.
  const pvWatch = s.iterFitRemainder === true && s.rootHasBest;
  let pvSearched = false;
  let pvScore = -INF;
  let cleanBest = -INF;
  let cleanBestIndex = -1;
  let cutByMeter = false;

  for (let i = 0; i < n; i++) {
    const turn = turns[i];
    p.proverMode = PROVER_FULL;
    const applied = makeTurn(s, p, turn, keep);
    if (applied !== turn.count) {
      unmakeTurn(s, p, applied);
      continue;
    }
    if (probe !== null) probe.enter(i);
    let score: Centi;
    const childTerminal = terminalScore(p, mover, 1);
    if (childTerminal !== null) {
      score = childTerminal;
    } else if (searched === 0) {
      score = -pvs(s, p, depth - 1, -beta, -alpha, 1, turn.sig);
    } else {
      score = -pvs(s, p, depth - 1, -alpha - 1, -alpha, 1, turn.sig);
      if (score > alpha && score < beta) score = -pvs(s, p, depth - 1, -beta, -alpha, 1, turn.sig);
    }
    unmakeTurn(s, p, applied);
    searched++;
    if (probe !== null) probe.score(i, score);
    if (pvWatch && !s.truncated) {
      if (turn.endLo === s.rootBest.endLo && turn.endHi === s.rootBest.endHi) {
        pvSearched = true;
        pvScore = score;
      }
      if (score > cleanBest) {
        cleanBest = score;
        cleanBestIndex = i;
      }
    }
    if (score > best) {
      best = score;
      bestIndex = i;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (probe !== null) probe.cutoff(i);
      break;
    }
    if (i + 1 < n && isTruncating(s)) {
      completed = false;
      // Which of `isTruncating`'s two clauses fired, without a second clock
      // read: the meter is the one that can be asked twice for free.
      cutByMeter = s.meter.exhausted();
      break;
    }
  }
  if (searched === 0) {
    if (probe !== null) probe.endIteration(true, s.truncated, -1, s.meter.used);
    return { score: evaluateLeaf(s, p, alpha, beta, 0), bestIndex: -1, completed: true };
  }
  if (probe !== null) probe.endIteration(completed, s.truncated, bestIndex, s.meter.used);
  if (s.useTT && completed && !s.truncated) {
    s.tt.store(p.kposLo, p.kposHi, best, depth, Bound.EXACT, bestIndex >= 0 ? turns[bestIndex].endLo : 0, 0);
  }
  if (!pvWatch) return { score: best, bestIndex, completed };
  return { score: best, bestIndex, completed, pvSearched, pvScore, cleanBest, cleanBestIndex, cutByMeter };
}

/** The `predicted` gate's DEFAULT lower clamp on the measured iteration cost
 * ratio; `cfg.iterationGateFloor` overrides it. Below the floor a prediction
 * would let a run of cheap iterations start one it cannot pay for; above
 * `GATE_RATIO_MAX` it would refuse depths that do fit. E2 lane 1's first probe
 * measured ratios frequently below 2, which made the gate REFUSE depths the
 * 0.45 rule completed (`docs/hard-ai/e2/E2-LANE1-DEEP-GATE.md` §C). */
const GATE_RATIO_MIN = 2;
const GATE_RATIO_MAX = 6;
/** The ratio assumed when only ONE depth has completed and there is nothing to
 * measure a ratio from. DESIGN §5.11.6's own arithmetic for a macro node
 * implies a branching factor in this region. */
const GATE_RATIO_DEFAULT = 3;

/**
 * Whether to START the next iteration (E2 lane 1's `iterationGate`).
 *
 * `fixed45` — absent, and every shipped shape — is DESIGN §5.11.2's constant,
 * unchanged and evaluated in the same integer arithmetic it always was.
 *
 * `predicted` asks whether the next depth FITS: it costs about
 * `lastIterationWork × ratio`, where `ratio` is what the last two completed
 * depths actually cost each other, clamped. It can only ever start an
 * iteration `fixed45` would have refused or refuse one `fixed45` would have
 * started — the deadline (A11) still bounds the wall-clock worst case, a
 * truncated iteration is still dropped, and the move still comes from the last
 * COMPLETED depth.
 */
function shouldDeepen(s: SearchContext, lastIterWork: number, prevIterWork: number): boolean {
  if (s.cfg.iterationGate !== 'predicted') return s.meter.used * 100 <= s.meter.limit * 45;
  if (lastIterWork <= 0) return s.meter.used * 100 <= s.meter.limit * 45;
  const floor = s.cfg.iterationGateFloor ?? GATE_RATIO_MIN;
  let ratio = GATE_RATIO_DEFAULT < floor ? floor : GATE_RATIO_DEFAULT;
  if (prevIterWork > 0) {
    ratio = lastIterWork / prevIterWork;
    if (ratio < floor) ratio = floor;
    else if (ratio > GATE_RATIO_MAX) ratio = GATE_RATIO_MAX;
  }
  return s.meter.used + lastIterWork * ratio <= s.meter.limit;
}

/**
 * E4.3 candidate B (lane 5), `searchFix.iterFit`. WHETHER THE NEXT ITERATION
 * IS FUNDED, AND WHAT HAPPENS TO THE RUNG WHEN IT IS NOT.
 *
 * THE RULE, stated once, here. At the moment depths 1..d of THIS search have
 * completed and depth d+1 is being considered, with `limit` the work rung,
 * `used` the work spent, `c_d` the cost of the last completed depth and
 * `c_{d-1}` the one before it (aspiration re-searches included in both; a
 * TRUNCATED iteration is not a sample and is not recorded):
 *
 *   1. The step ratio. `r = (c_d / c_{d-1}) × 0.25` when this search has two
 *      completed depths to divide; otherwise the previous wall-funded search's
 *      measurement of THIS STEP (`s.iterCost`, an α = 1/4 EWMA per step);
 *      otherwise 12, E2's measured median for the 1 → 2 step. Clamped to
 *      [2, 40]. The 0.25 is E2's own measurement: the 1 → 2 step's median is
 *      12.32 and the 2 → 3 step's is 3.02 (`search/time.ts`'s constants carry
 *      the samples).
 *   2. The prediction. `ĉ = c_d × r`.
 *   3. FUND the iteration when `ĉ ≤ (limit − used) × 1.25`. It then runs,
 *      completes, publishes and is deepened past exactly as any iteration is.
 *   4. Otherwise SPEND THE REMAINDER, while `limit − used ≥ limit / 8`: run
 *      depth d+1 anyway, as a partial, with no extra budget, and stop after
 *      it. It may replace the published move only when all three hold —
 *        a. the candidate loop was ended by the WORK METER and not by the
 *           deadline watchdog, so the move is a function of the rung and not
 *           of the clock (DESIGN §5.11.6);
 *        b. the candidate carrying the currently published move was searched
 *           to the end at this depth, and its subtree was not truncated — the
 *           principal variation COMPLETED at the new depth;
 *        c. another candidate, also searched to the end and untruncated,
 *           scored strictly higher than it.
 *      Then the comparison that publishes is between two fully searched
 *      candidates at the same depth, which is the only comparison a partial
 *      iteration can honestly make. `result.depth` still reports the last
 *      COMPLETED depth; only the move and its score move.
 *   5. Otherwise STOP and return the last completed depth, as today.
 *
 * WHAT IT IS NOT. It is not a wider root re-search — the root already searches
 * every candidate the generator returned, so "wider" means a larger `gen.K`,
 * which is generation and is another lane's file (E4 plan, lane 4) and another
 * factor. It is not a change to what a COMPLETED depth means, and it never
 * publishes a score that was not searched.
 */
function iterFitVerdict(s: SearchContext, depth: number, lastIterWork: number, prevIterWork: number): IterFitVerdict {
  const prior = s.iterCost === undefined ? 0 : s.iterCost.get(depth - 1);
  return iterFitDecision(s.meter.used, s.meter.limit, lastIterWork, prevIterWork, prior);
}

/**
 * Rule 4's three conditions, in the order they are cheapest to refute. The
 * strict `>` is what makes the third condition also say "and it is a DIFFERENT
 * candidate": the published move's own score cannot exceed itself.
 */
function partialPublishes(o: RootOutcome): boolean {
  if (o.cutByMeter !== true || o.pvSearched !== true) return false;
  if ((o.cleanBestIndex ?? -1) < 0) return false;
  return (o.cleanBest ?? -INF) > (o.pvScore ?? INF);
}

/**
 * DESIGN §5.11.2's driver. Deepens while the work rung has room, never
 * starting an iteration it cannot hope to finish ("`meter.used > 0.45 ×
 * limit`", or `cfg.iterationGate === 'predicted'`'s measured prediction), and
 * returns the last COMPLETED depth — a truncated iteration is dropped, which is
 * what makes the result independent of the abort watchdog.
 */
export function iterativeDeepening(
  s: SearchContext,
  p: PackedState,
  onDepth?: (r: SearchResult) => void,
): SearchResult {
  s.tt.newSearch();
  s.truncated = false;
  s.quiesceWork = 0;
  s.rootHasBest = false;
  s.rootHasPartial = false;
  const result: SearchResult = { best: null, scoreCc: 0, depth: 0, pv: [], stats: s.stats };

  let previousScore = 0;
  // E2 lane 1's `predicted` gate and E4.3's `iterFit` rule read these; the
  // shipped `fixed45` rule does not, and neither is written when it is off.
  let lastIterWork = 0;
  let prevIterWork = 0;
  // E4.3 lane 5. Absent on every shipped shape, so the two branches below are
  // one `undefined` comparison per iteration when the flag is off — EXCEPT on a
  // wall-funded turn above the quick allowance, where `s.wallFit` turns the
  // rule on (the field's own header says why, and `engine.ts` is where it is
  // set). An explicit flag, true or false, still wins over the allowance.
  const iterFit = s.cfg.searchFix?.iterFit ?? s.wallFit === true;
  if (iterFit) s.iterFitRemainder = false;
  let remainderRun = false;
  for (let depth = 1; depth <= s.cfg.maxDepth; depth++) {
    if (depth > 1) {
      if (iterFit) {
        const verdict = iterFitVerdict(s, depth, lastIterWork, prevIterWork);
        if (verdict === 'stop') {
          s.stats.stopReason = 'work';
          break;
        }
        remainderRun = verdict === 'remainder';
        s.iterFitRemainder = remainderRun;
        if (remainderRun) s.stats.iterFitRemainders = (s.stats.iterFitRemainders ?? 0) + 1;
      } else if (!shouldDeepen(s, lastIterWork, prevIterWork)) {
        s.stats.stopReason = 'work';
        break;
      }
    }
    if (s.stop()) {
      s.stats.stopReason = 'abort';
      break;
    }
    const usedAtDepthStart = s.meter.used;

    let alpha = -INF;
    let beta = INF;
    let window = s.cfg.aspirationCc;
    let outcome: RootOutcome;
    if (s.cfg.useAspiration && depth > 2) {
      alpha = previousScore - window;
      beta = previousScore + window;
    }
    for (;;) {
      outcome = rootIteration(s, p, depth, alpha, beta);
      if (!outcome.completed) break;
      if (outcome.score > alpha && outcome.score < beta) break;
      if (alpha === -INF && beta === INF) break;
      window *= 4;
      if (window > 8 * s.cfg.aspirationCc) {
        alpha = -INF;
        beta = INF;
      } else if (outcome.score <= alpha) {
        alpha = outcome.score - window;
      } else {
        beta = outcome.score + window;
      }
    }

    // A TRUNCATED iteration is DROPPED. Its best-so-far goes to `rootPartial`,
    // never to `rootBest`: publishing it would make the returned move a
    // function of exactly when the watchdog fired, which is what DESIGN
    // §5.11.6 forbids ("can only truncate ... never alter a completed depth").
    if (!outcome.completed) {
      // E4.3 lane 5, rule 4: the remainder run's partial iteration may replace
      // the move — and ONLY then does a non-completing iteration publish.
      if (remainderRun && partialPublishes(outcome)) {
        copyTurn(s.rootBest, s.turns[0][outcome.cleanBestIndex as number]);
        s.rootHasBest = true;
        result.best = s.rootBest;
        result.pv = [s.rootBest];
        result.scoreCc = outcome.cleanBest as Centi;
        s.stats.iterFitPublished = 1;
        if (onDepth !== undefined) onDepth(result);
      } else if (outcome.bestIndex >= 0) {
        copyTurn(s.rootPartial, s.turns[0][outcome.bestIndex]);
        s.rootHasPartial = true;
      }
      s.stats.stopReason = s.stop() ? 'abort' : 'work';
      break;
    }
    if (outcome.bestIndex >= 0) {
      copyTurn(s.rootBest, s.turns[0][outcome.bestIndex]);
      s.rootHasBest = true;
    }

    // What this depth actually cost, aspiration re-searches included. Only a
    // COMPLETED depth is recorded: a truncated one is dropped, so its cost is
    // not a sample of what a depth costs.
    prevIterWork = lastIterWork;
    lastIterWork = s.meter.used - usedAtDepthStart;
    // E4.3 lane 5: this step's measured ratio, folded into the per-step prior
    // the NEXT search of this engine reads. `depth - 1` is the step just
    // taken (the cost of depth `d` over the cost of depth `d - 1`).
    if (iterFit && prevIterWork > 0) {
      if (s.iterCost === undefined) s.iterCost = new IterCostPrior(s.cfg.maxDepth + 1);
      s.iterCost.record(depth - 1, lastIterWork / prevIterWork);
    }
    previousScore = outcome.score;
    result.depth = depth;
    result.scoreCc = outcome.score;
    result.best = s.rootHasBest ? s.rootBest : null;
    result.pv = result.best === null ? [] : [result.best];
    s.stats.depth = depth;
    if (onDepth !== undefined) onDepth(result);

    if (s.meter.exhausted()) {
      s.stats.stopReason = 'work';
      break;
    }
    if (s.stop()) {
      s.stats.stopReason = 'abort';
      break;
    }
  }

  s.stats.work = s.meter.used;
  s.stats.byClass.set(s.meter.byClass);
  s.stats.turnNodes = s.meter.byClass[WorkClass.TURN];
  s.stats.evals = s.meter.byClass[WorkClass.EVAL1] + s.meter.byClass[WorkClass.EVAL2];
  s.stats.ttHits = s.tt.hits;
  s.stats.ttProbes = s.tt.probes;
  s.stats.quiesceWork = s.quiesceWork;
  if (result.best === null && s.rootHasBest) {
    result.best = s.rootBest;
    result.pv = [s.rootBest];
  }
  // Last resort only: nothing completed, so there is no completed depth to
  // report and `result.depth` stays 0. Returning the partial iteration's
  // best-so-far beats returning no move at all, and it is reported as the
  // depth-0 answer it is.
  if (result.best === null && s.rootHasPartial) {
    result.best = s.rootPartial;
    result.pv = [s.rootPartial];
  }
  return result;
}
