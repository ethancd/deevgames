/**
 * The root: the must-answer layer, the book probe, and the canonical replay
 * (DESIGN §4.16 `root.ts`, §5.10, §1 step 4).
 *
 * Before a single node of iterative deepening is spent, the root asks the four
 * questions a search that merely "scores well" can get wrong, in DESIGN
 * §5.10's order, and returns the moment one of them is PROVEN by the canonical
 * engine:
 *
 *   1 HOME RACE with purchases (F13) — the line SU addendum 20b found and
 *     SF's must-answer layer could not: buy a tier-1 body and walk it into the
 *     enemy corner this turn. `tables/home.ts homeRaceAvailable` enumerates the
 *     lines and `gen/generate.ts` injects each one FORCED, so they are already
 *     in the candidate list; the root only has to APPLY each and ask whether
 *     the replica's home gate declared a win, then confirm it canonically.
 *   2 ELIMINATION-IN-1 — a lethal attack on the last enemy body.
 *   3 HOME RESCUE — when the enemy stands on my corner, the prover's own
 *     witness line. `tactics/prover.ts homeWitness` supplies it and DESIGN §2's
 *     layering keeps `gen` from calling `tactics` directly, so the root wires
 *     it in through `TurnGenerator.setRescueWitness` (`installRescueWitness`
 *     below) and the ordering's `HOME_RESCUE +1,500,000` puts it first.
 *   4 HOME MATE-IN-1 — a corner entry by a body that already exists.
 *
 * 1, 2 and 4 all reduce to the same test — "does applying this candidate end
 * the game in the mover's favour, and does the CANONICAL engine agree?" — so
 * they are one scan in flag order rather than four separate enumerations.
 *
 * "Does the canonical engine agree" is TWO questions, and the second one is
 * easy to miss: `Kpos` carries the board, the banks, the side, the reserves and
 * the clock, but NOT `result`/`reason`. A replica that declared a home
 * checkmate the canonical prover does not would still match the `Kpos` of the
 * position it reached, and the root would return a "proven" win that is merely
 * a unit standing on a corner. Every proven terminal is therefore checked
 * against the canonical END STATE — `phase === 'victory'` with the mover as
 * `winner` — and a disagreement is counted as a replica divergence and the
 * candidate dropped.
 *
 * Nothing leaves here unverified: the chosen turn is decoded, replayed through
 * `applyAction` with `isLegalAction` before every action, and its end position
 * re-packed and compared (`verify/replay.ts`). A divergence truncates the line
 * at the first bad action and is counted in `stats.replicaDivergences`.
 *
 * LAYERING. DESIGN §4.16 types `searchRoot`'s first parameter `HardEngine`,
 * which lives one layer up (`engine.ts` imports `search`, not the other way
 * round). It is typed structurally as `RootEngine` here — the same arrangement
 * `tactics/prover.ts` uses for `ProverMeter` — and `HardEngine` satisfies it.
 * See DEVIATIONS under M14.
 */
import type { GameState } from '../../../game/types';
import { phaseEndAction } from '../../../game/legality';
import type { AIAction } from '../../types';
import { MATE_PLY_CC, Result, WIN_CC, type Centi, type PackedState, type Side } from '../types';
import { PackError } from '../core/state';
import { buildTables } from '../tables/context';
import { PROOF_NODES, homeWitness } from '../tactics/prover';
import { TurnFlag, type Turn } from '../gen/turn';
import { endKeyAfter } from './order';
import type { TurnGenerator } from '../gen/generate';
import { probeBook } from '../book/probe';
import { verifyTurn, type ReplayCheck } from '../verify/replay';
import type { HardConfig } from '../config';
import { WorkClass } from './time';
import {
  PROVER_FULL,
  copyTurn,
  generateAt,
  iterativeDeepening,
  makeTurn,
  unmakeTurn,
  type HardSearchStats,
  type SearchContext,
} from './pvs';
import { RootProbe, type Ply1Node, type RootCandidate, type RootTraceRow } from './probe';

export type { GeneratorId, Ply1Node, RootCandidate, RootTraceRow } from './probe';
export { PLY1_MAX_KEYS } from './probe';

export type RootSource = 'search' | 'home-race' | 'mate' | 'rescue' | 'dfpn' | 'book' | 'fallback';

export interface RootOptions {
  work: number;
  config: HardConfig;
  canonical: GameState;
  onProgress?: (p: { depth: number; scoreCc: Centi; work: number; firstAction: AIAction | null }) => void;
  /**
   * E2 lane 1. Fill `candidates`, `rootTrace` and `candidateSource` on the
   * result (`search/probe.ts`). OFF in every production path; a lab caller
   * asks for it per search. It observes only — with it on the search returns
   * the same `actions`, `scoreCc`, `depth`, `work`, `stats.nodes` and
   * `endKey` it returns with it off (`tests/ai/hard/root-exposure.test.ts`).
   * It lives here and NOT on `HardConfig`, so no engine's resolved
   * configuration hash moves.
   */
  expose?: boolean;
  /** Additionally fill `ply1`: for each searched root candidate, the
   * candidate list the search saw at the opponent's reply node. Requires
   * `expose`. */
  ply1Trace?: boolean;
}

export interface RootResult {
  actions: AIAction[];
  scoreCc: Centi;
  depth: number;
  work: number;
  stats: HardSearchStats;
  source: RootSource;
  endKey: string;
  fallback?: 'pack-error' | 'engine-error' | 'divergence';
  /**
   * `opts.expose` only. The candidate list of the root iteration that produced
   * the returned move, with a `searched` flag and the score the root assigned
   * to each candidate it searched. Absent when the instrument was off.
   */
  candidates?: RootCandidate[];
  /** `opts.expose` only. One row per root iteration run, in order. */
  rootTrace?: RootTraceRow[];
  /** `opts.expose` only. Which list `candidates` is: the last COMPLETED depth
   * (the normal answer), the truncated iteration `rootPartial` came from, or
   * the pre-deepening generator list (the must-answer scan, the book probe,
   * `pickUnsearched`'s salvage, and the fallback returns). */
  candidateSource?: 'completed-depth' | 'partial-iteration' | 'generator-list';
  /** `opts.ply1Trace` only. The ply-1 node under each searched candidate. */
  ply1?: Ply1Node[];
}

/** The slice of `engine.ts`'s `HardEngine` the root needs (see the header). */
export interface RootEngine {
  readonly ctx: SearchContext;
  /** The engine's own root `PackedState` buffer. */
  readonly rootState: PackedState;
}

function keyHex(hi: number, lo: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Wires DESIGN §5.6's injection 4 — the prover's rescue witness — into a
 * generator. `gen` may not import `tactics` (DESIGN §2), so the root owns the
 * connection; call it once per generator when the engine is built.
 *
 * Under Phasing the prover's line is pure ACT: MOVEs and ATTACKs from the
 * defender's `ready` position, with no `PAY_UPKEEP`, no promotion prefix and no
 * `END_PLACE` (`tactics/prover.ts homeWitness`). The keep-set adoption this
 * function used to do — copying the prover's private witness keep-set into the
 * node's table and re-indexing the leading `PAY_UPKEEP` — has nothing left to
 * adopt, so it is gone along with Standard's `prepare`. See DEVIATIONS under
 * M14 and `docs/hard-ai/phasing/M2-STATUS.md` §2.
 */
export function installRescueWitness(gen: TurnGenerator): void {
  gen.setRescueWitness((p, invader, out) => homeWitness(p, invader, PROOF_NODES, out));
}

/** The canonical engine's own verdict: the game is over and `mover` won. */
function canonicalWin(end: GameState, mover: Side): boolean {
  return end.phase === 'victory' && end.winner === (mover === 0 ? 'white' : 'black');
}

/** True when applying `t` left the game decided in `mover`'s favour. */
function decidedFor(p: PackedState, mover: Side): boolean {
  if (p.result === Result.ONGOING || p.result === Result.DRAW) return false;
  return (p.result === Result.WHITE_WIN) === (mover === 0);
}

interface ProvenTerminal {
  index: number;
  source: RootSource;
  check: ReplayCheck;
}

/**
 * DESIGN §5.10 items 1, 2 and 4. Scans the root candidates in the order the
 * must-answer layer prescribes and returns the first whose application decides
 * the game for the mover AND survives the canonical replay.
 *
 * P6: the scan is the root's SECOND unbounded phase. Each candidate costs a
 * `makeTurn` at `PROVER_FULL` and, when it decides the game, a canonical
 * `verifyTurn` — 0.57 s per candidate on the measured position at K=24 and
 * 0.73 s at K=96, for 21.6 s and 80.6 s of a 3,000 ms allowance. It polls
 * `s.stop()` once per candidate for the same reason `generateAt` now does, at
 * the same granularity, and abandons the scan when the deadline has passed.
 * ABANDONING IT IS SAFE: a proven terminal the scan has not reached is a
 * candidate still in the list, so the worst case is that the root plays it as
 * an ordinary (unproven) move rather than as a proven win — a strictly better
 * outcome than today's bare phase end. Under fixed `work` `stop()` is
 * constantly false and the scan is exactly the scan it was.
 */
function mustAnswer(
  s: SearchContext,
  p: PackedState,
  state: GameState,
  n: number,
): ProvenTerminal | null {
  const mover = p.side as Side;
  const turns = s.turns[0];
  const keep = s.keep[0];
  // Flag masks in §5.10's order: home race, then elimination (a kill that ends
  // the game), then a corner entry by an existing body. A candidate carrying
  // none of them can still be a terminal — the last enemy body dying to a
  // Cleave chain, say — so the final pass considers everything.
  const passes = [TurnFlag.HOME_RACE, TurnFlag.KILL, TurnFlag.HOME_ENTRY, 0];
  const seen = new Uint8Array(n);
  for (let pass = 0; pass < passes.length; pass++) {
    const mask = passes[pass];
    for (let i = 0; i < n; i++) {
      if (seen[i] === 1) continue;
      const turn = turns[i];
      if (mask !== 0 && (turn.flags & mask) === 0) continue;
      // Polled once per candidate the scan actually PAYS for, not once per
      // candidate it skips on a flag mask (see the header).
      if (s.stop()) return null;
      seen[i] = 1;
      p.proverMode = PROVER_FULL;
      const applied = makeTurn(s, p, turn, keep);
      const decided = applied === turn.count && decidedFor(p, mover);
      unmakeTurn(s, p, applied);
      if (!decided) continue;
      const check = verifyTurn(s.rep, state, p, turn, keep);
      if (!check.verified || !canonicalWin(check.endState, mover)) {
        s.stats.replicaDivergences++;
        continue;
      }
      const source: RootSource = (turn.flags & TurnFlag.HOME_RACE) !== 0 ? 'home-race' : 'mate';
      return { index: i, source, check };
    }
  }
  return null;
}

/** At most this many candidates are canonically replayed by `pickUnsearched`.
 * The deadline has already passed when it runs, so the salvage has to be
 * bounded by something; a divergence rate that eats eight of the generator's
 * own best candidates is a replica bug, not a position. */
const SALVAGE_ATTEMPTS = 8;

/**
 * P6. The root's answer when the DEADLINE cut the search before
 * `iterativeDeepening` completed — or even started — an iteration, and the
 * candidate list is all there is.
 *
 * Before this lane the root returned `phaseEndAction` here: on the two
 * measured positions the seat burned 85-180 s and then ended its turn without
 * moving. That is strictly worse than playing the generator's own top
 * candidate, which is a real turn, ranked by DESIGN §5.4's within-turn score,
 * and canonically verified before it leaves.
 *
 * The pick is `gainCc` order (the generator's `finish` already sorts the beam
 * that way; the forced injections ahead of it are re-ranked here rather than
 * privileged, because nothing has SEARCHED them and an injection's whole point
 * is that the search would look at it). Ties go to the lower index, so the
 * pick is a function of the candidate list alone.
 *
 * E4.2 lane 3, `HardConfig.searchFix.tieBreak === 'end-key'` only: a `gainCc`
 * tie goes to the smaller canonical end key instead of to the lower index, so
 * the salvage resolves a tie the same way `search/order.ts scoreTurns` resolves
 * one at the root — by the POSITION rather than by list position. This path is
 * reachable only when the DEADLINE fired before iterative deepening started, so
 * it never runs under fixed `work` and never touches a fixed-work golden.
 *
 * Returns the chosen candidate's index and its verified replay, or null when
 * the list holds nothing that replays — in which case the caller still owes
 * the game a legal phase end.
 */
function pickUnsearched(
  s: SearchContext,
  p: PackedState,
  state: GameState,
  n: number,
  tieByEndKey: boolean,
): { index: number; check: ReplayCheck } | null {
  const turns = s.turns[0];
  const tried = new Uint8Array(n);
  for (let attempt = 0; attempt < SALVAGE_ATTEMPTS; attempt++) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (tried[i] === 1) continue;
      if (best < 0 || turns[i].gainCc > turns[best].gainCc) best = i;
      else if (tieByEndKey && turns[i].gainCc === turns[best].gainCc && endKeyAfter(turns[best], turns[i])) best = i;
    }
    if (best < 0) return null;
    tried[best] = 1;
    const check = verifyTurn(s.rep, state, p, turns[best], s.keep[0]);
    if (check.verified) return { index: best, check };
    s.stats.replicaDivergences++;
  }
  return null;
}

/**
 * DESIGN §4.16. One whole turn from `state`, as canonical `AIAction`s.
 *
 * `opts.work` is the meter's budget in work units; it is always set by
 * `engine.ts` (from `chooseWork`, or verbatim from a lab/CI caller), so nothing
 * below reads a clock.
 */
export function searchRoot(engine: RootEngine, state: GameState, opts: RootOptions): RootResult {
  if (opts.expose !== true) return searchRootInner(engine, state, opts);
  // E2 lane 1. The instrument is installed for exactly this call and torn down
  // whatever happens, so a throwing search cannot leave `ctx.probe` armed for
  // the next one. `searchRootInner` below is the search as it was; nothing in
  // it reads `opts.expose`.
  const s = engine.ctx;
  const probe = new RootProbe(s.turns[0].length, opts.ply1Trace === true);
  s.probe = probe;
  let result: RootResult;
  try {
    result = searchRootInner(engine, state, opts);
  } finally {
    s.probe = null;
  }
  const published = probe.publish(s.rootHasBest, result.endKey);
  return {
    ...result,
    candidates: published.candidates,
    rootTrace: probe.trace,
    candidateSource: published.source,
    ...(probe.withPly1 ? { ply1: published.ply1 } : {}),
  };
}

function searchRootInner(engine: RootEngine, state: GameState, opts: RootOptions): RootResult {
  const s = engine.ctx;
  const stats = s.stats;

  let p: PackedState;
  try {
    p = s.rep.pack(state, engine.rootState);
  } catch (err) {
    return {
      actions: [],
      scoreCc: 0,
      depth: 0,
      work: 0,
      stats,
      source: 'fallback',
      endKey: '',
      fallback: err instanceof PackError ? 'pack-error' : 'engine-error',
    };
  }

  if (p.result !== Result.ONGOING) {
    return { actions: [], scoreCc: 0, depth: 0, work: 0, stats, source: 'fallback', endKey: keyHex(p.kposHi, p.kposLo) };
  }

  // The full prover adjudicates a corner entry inside `make` at the root.
  p.proverMode = PROVER_FULL;
  s.root = p.side as Side;
  s.meter.reset(opts.work);
  // E2 lane 1: the rung, recorded where it is armed so every return path
  // carries it (the must-answer scan and the book probe included).
  stats.rung = opts.work;
  const t = buildTables(p, s.sc, 0, 2, s.tables[0]);
  s.meter.spend(WorkClass.KILLTABLE);

  const n = generateAt(s, p, t, 0);
  if (s.probe !== null) s.probe.snapshotGenerated(s.turns[0], n);
  if (n === 0) {
    // DESIGN F7 forbids an empty list; if it ever happens the turn still has
    // to end legally.
    return {
      actions: [phaseEndAction(state)],
      scoreCc: 0,
      depth: 0,
      work: s.meter.used,
      stats,
      source: 'fallback',
      endKey: keyHex(p.kposHi, p.kposLo),
    };
  }

  const proven = mustAnswer(s, p, state, n);
  if (proven !== null) {
    const turn = s.turns[0][proven.index];
    copyTurn(s.rootBest, turn);
    s.rootHasBest = true;
    stats.work = s.meter.used;
    stats.depth = 1;
    return {
      actions: proven.check.actions,
      scoreCc: WIN_CC - MATE_PLY_CC,
      depth: 1,
      work: s.meter.used,
      stats,
      source: proven.source,
      endKey: keyHex(turn.endHi, turn.endLo),
    };
  }

  const book = opts.config.book;
  if (book !== null && book.size > 0) {
    const hit = probeBook(book, p, s.turns[0], n);
    if (hit >= 0) {
      const turn = s.turns[0][hit];
      const check = verifyTurn(s.rep, state, p, turn, s.keep[0]);
      if (check.verified) {
        copyTurn(s.rootBest, turn);
        s.rootHasBest = true;
        stats.work = s.meter.used;
        return {
          actions: check.actions,
          scoreCc: turn.gainCc,
          depth: 0,
          work: s.meter.used,
          stats,
          source: 'book',
          endKey: keyHex(turn.endHi, turn.endLo),
        };
      }
      stats.replicaDivergences++;
    }
  }

  const onDepth =
    opts.onProgress === undefined
      ? undefined
      : (r: { depth: number; scoreCc: Centi; best: Turn | null }): void => {
          const progress = opts.onProgress;
          if (progress === undefined) return;
          let firstAction: AIAction | null = null;
          if (r.best !== null) {
            const check = verifyTurn(s.rep, state, p, r.best, s.keep[0]);
            firstAction = check.actions.length > 0 ? check.actions[0] : null;
          }
          progress({ depth: r.depth, scoreCc: r.scoreCc, work: s.meter.used, firstAction });
        };

  // P6. Whether the deadline had ALREADY passed when iterative deepening was
  // entered, which is the only state in which `s.turns[0][0..n)` is still the
  // list generated above: `iterativeDeepening` polls `stop()` before its first
  // `rootIteration`, and `rootIteration`'s own `generateAt(s, p, t, 0)`
  // OVERWRITES both that array and `s.keep[0]`. Sampled once, before the call,
  // because `stop()` can flip inside it. Under fixed `work` it is false and
  // everything below is the code that was always there.
  const stoppedBeforeDeepening = s.stop();

  const result = iterativeDeepening(s, p, onDepth);
  stats.work = s.meter.used;

  if (result.best === null) {
    // P6. Nothing was searched. If the DEADLINE is what cut us — generation
    // and the must-answer scan both abandon their loops on `s.stop()` now, so
    // this is reachable with a full candidate list and no searched node — play
    // the best candidate rather than ending the turn on the spot. A deadline
    // that fired INSIDE iterative deepening is not salvaged here: that search
    // has already regenerated the list, and its own `rootPartial` is the answer
    // for it (`search/pvs.ts`).
    const salvaged = stoppedBeforeDeepening
      ? pickUnsearched(s, p, state, n, opts.config.searchFix?.tieBreak === 'end-key')
      : null;
    if (salvaged !== null) {
      const turn = s.turns[0][salvaged.index];
      copyTurn(s.rootBest, turn);
      s.rootHasBest = true;
      return {
        actions: salvaged.check.actions,
        scoreCc: turn.gainCc,
        // Depth 0: this is the generator's ranking, not a completed iteration.
        // `iterativeDeepening` reports its own partial best the same way.
        depth: 0,
        work: s.meter.used,
        stats,
        source: 'search',
        endKey: keyHex(turn.endHi, turn.endLo),
      };
    }
    return {
      actions: [phaseEndAction(state)],
      scoreCc: result.scoreCc,
      depth: result.depth,
      work: s.meter.used,
      stats,
      source: 'fallback',
      endKey: keyHex(p.kposHi, p.kposLo),
    };
  }

  const check = verifyTurn(s.rep, state, p, result.best, s.keep[0]);
  const rescue = (result.best.flags & TurnFlag.HOME_RESCUE) !== 0 && t.home[s.root].occupied === 1;
  if (!check.verified) {
    stats.replicaDivergences++;
    const actions = check.actions.length > 0 ? check.actions : [phaseEndAction(state)];
    return {
      actions,
      scoreCc: result.scoreCc,
      depth: result.depth,
      work: s.meter.used,
      stats,
      source: check.actions.length > 0 ? 'search' : 'fallback',
      endKey: keyHex(result.best.endHi, result.best.endLo),
      fallback: 'divergence',
    };
  }

  return {
    actions: check.actions,
    scoreCc: result.scoreCc,
    depth: result.depth,
    work: s.meter.used,
    stats,
    source: rescue ? 'rescue' : 'search',
    endKey: keyHex(result.best.endHi, result.best.endLo),
  };
}
