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
import type { GenStats, TurnGenerator } from '../gen/generate';
import { Proof as DfpnProof, forceHome, type DfpnResult } from '../tactics/dfpn';
import type { SearchConfig } from '../config';
import { WorkClass } from './time';
import type { WorkMeter } from './time';
import { Bound, ProofValue, scoreFromTT, usable, type ProofCache, type TranspositionTable, type TTEntry } from './tt';
import { maxPlausibleGain, onCutoff, scoreTurns, type OrderTables } from './order';
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
  dfpnCalls: number;
  catalogRebuilds: number;
  replicaDivergences: number;
  work: number;
  /** Units spent inside quiescence (DESIGN §5.11.4's R5 cap; see
   * `search/quiesce.ts` for why it is measured in units and not in nodes). */
  quiesceWork: number;
  elapsedMs: number;
  stopReason: 'complete' | 'work' | 'abort';
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
    dfpnCalls: 0,
    catalogRebuilds: 0,
    replicaDivergences: 0,
    work: 0,
    quiesceWork: 0,
    elapsedMs: 0,
    stopReason: 'complete',
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
  s.meter.spend(WorkClass.PROVER, calls);
}

export function unmakeTurn(s: SearchContext, p: PackedState, applied: number): void {
  for (let i = 0; i < applied; i++) s.rep.unmake(p, s.undo);
}

/** Leaf value, from the side-to-move's point of view. */
export function evaluateLeaf(s: SearchContext, p: PackedState, alpha: Centi, beta: Centi, ply: number): Centi {
  return s.eval.evaluate(p, p.side as Side, alpha, beta, s.sc, ply, s.meter);
}

/**
 * Fills `s.turns[ply][0..n)` with this node's candidates and returns `n`.
 * `p.upkeepPending` nodes get their keep-set table written into `s.keep[ply]`
 * by the generator; every emitted `PAY_UPKEEP` indexes into it.
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
  const raw = gen.generate(p, t, s.score, s.meter, ply, s.keep[ply], s.genOut, s.genStats);
  // DESIGN §5.11.6 charges `GEN` per place plan.
  if (s.genStats.placePlans > 0) s.meter.spend(WorkClass.GEN, s.genStats.placePlans);
  const dst = s.turns[ply];
  const n = raw < dst.length ? raw : dst.length;
  for (let i = 0; i < n; i++) copyTurn(dst[i], s.genOut[i]);
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

  const n = generateAt(s, p, t, 0);
  if (n === 0) return { score: evaluateLeaf(s, p, alpha, beta, 0), bestIndex: -1, completed: true };
  scoreTurns(p, t, s.turns[0], n, ttEntry, s.ord, 0, 0, s);

  const turns = s.turns[0];
  const keep = s.keep[0];
  const mover = p.side as Side;
  let best = -INF;
  let bestIndex = -1;
  let searched = 0;
  let completed = true;

  for (let i = 0; i < n; i++) {
    const turn = turns[i];
    p.proverMode = PROVER_FULL;
    const applied = makeTurn(s, p, turn, keep);
    if (applied !== turn.count) {
      unmakeTurn(s, p, applied);
      continue;
    }
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
    if (score > best) {
      best = score;
      bestIndex = i;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
    if (i + 1 < n && isTruncating(s)) {
      completed = false;
      break;
    }
  }
  if (searched === 0) return { score: evaluateLeaf(s, p, alpha, beta, 0), bestIndex: -1, completed: true };
  if (s.useTT && completed && !s.truncated) {
    s.tt.store(p.kposLo, p.kposHi, best, depth, Bound.EXACT, bestIndex >= 0 ? turns[bestIndex].endLo : 0, 0);
  }
  return { score: best, bestIndex, completed };
}

/**
 * DESIGN §5.11.2's driver. Deepens while the work rung has room, never
 * starting an iteration it cannot hope to finish ("`meter.used > 0.45 ×
 * limit`"), and returns the last COMPLETED depth — a truncated iteration is
 * dropped, which is what makes the result independent of the abort watchdog.
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
  for (let depth = 1; depth <= s.cfg.maxDepth; depth++) {
    if (depth > 1 && s.meter.used * 100 > s.meter.limit * 45) {
      s.stats.stopReason = 'work';
      break;
    }
    if (s.stop()) {
      s.stats.stopReason = 'abort';
      break;
    }

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
      if (outcome.bestIndex >= 0) {
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
