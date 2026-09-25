/**
 * The root: the must-answer layer, the book probe, and the canonical replay
 * (DESIGN §4.16 `root.ts`, §5.10, §1 step 4).
 *
 * Before a single node of iterative deepening is spent, the root asks the
 * questions a search that merely "scores well" can get wrong, in DESIGN
 * §5.10's order, and returns the moment one of them is PROVEN by the canonical
 * engine:
 *
 *   1 ELIMINATION-IN-1 — a lethal attack on the last enemy body.
 *   2 HOME RESCUE — when the enemy stands on my corner, the prover's own
 *     witness line. `tactics/prover.ts homeWitness` supplies it and DESIGN §2's
 *     layering keeps `gen` from calling `tactics` directly, so the root wires
 *     it in through `TurnGenerator.setRescueWitness` (`installRescueWitness`
 *     below) and the ordering's `HOME_RESCUE +1,500,000` puts it first.
 *   3 HOME MATE-IN-1 — a corner entry by a body that already exists.
 *
 * 1 and 3 reduce to the same test — "does applying this candidate end the game
 * in the mover's favour, and does the CANONICAL engine agree?" — so they are
 * one scan in flag order rather than two separate enumerations. Every claimed
 * terminal still requires canonical replay before the root returns it as proven.
 *
 * DESIGN §5.10's LEADING HOME RACE PASS is not in that list under Phasing. A
 * race BUY is forced delayed INTENT: the commitment stays pending through the
 * handoff and is never a fresh live attacker, so no `HOME_RACE` candidate can
 * decide the game on the turn that carries it, and scanning them first only
 * paid a `PROVER_FULL` `makeTurn` each for candidates that cannot answer. They
 * are scanned in the trailing catch-all pass like anything else. Existing units
 * can still enter the corner during Act, and Prepare promotions can still
 * fortify an existing occupation.
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
import { newKeepSetTable } from '../core/action';
import { PROOF_NODES, homeWitness } from '../tactics/prover';
import { TurnFlag, type Turn } from '../gen/turn';
import { endKeyAfter } from './order';
import type { TurnGenerator } from '../gen/generate';
import { probeBook } from '../book/probe';
import { verifyTurn, type ReplayCheck } from '../verify/replay';
import type { HardConfig } from '../config';
import { getKillClockPolicy, setKillClockPolicy } from '../eval/evaluate';
import { activeCatalog } from '../core/catalog';
import type { StrategyLine, StrategyWitness } from '../gen/generate';
import { clockReading, type ClockReading } from '../strategy/clock';
import { forceContactPlans } from '../strategy/contact';
import { holdPlans } from '../strategy/hold';
import { newPlanScratch, type PlanScratch, type PlanSet } from '../strategy/plan';
import type { ClockReadingCore, InjectedPlan, StrategyChronicle } from '../strategy/types';
import { WorkClass } from './time';
import {
  PROVER_FULL,
  allocTurn,
  buildSearchTables,
  copyTurn,
  generateAt,
  iterativeDeepening,
  makeTurn,
  unmakeTurn,
  type HardSearchStats,
  type SearchContext,
  type SearchResult,
} from './pvs';
import { RootProbe, type Ply1Node, type RootCandidate, type RootTraceRow } from './probe';
import { applyVeto, armVeto, snapshotCandidates, type VetoArm, type VetoOutcome } from './veto';

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
  /** STRATEGOS: the Chronicle of a strategos search — clock reading,
   * posture, injected plans with their contracts, feasibility and queries,
   * what the root played and, when it refused a plan candidate, the veto
   * (W1.9 and W1.10, `chronicle` below, `search/veto.ts`). JSON-serialisable.
   * Absent unless the profile sets `searchFix.strategyPlans` (W1.9) or
   * `strategyVeto` (W1.10). */
  strategy?: StrategyChronicle;
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

/**
 * The plan layer's share of the search budget: its rollouts stop, recorded
 * `unresolved`, once it has spent `limit / STRATEGY_WORK_SHARE` units.
 * CHOICE (why: a sixteenth of the rung leaves the tactical search its depth at
 * every rung the ladder uses — 1,562 units at the smallest, 25,000, and 3,750
 * at A8's fixed:60,000, where the six ForceContact rollouts measured on the
 * W1.9 fixtures cost well under that; falsifier: a fixed-work root on the
 * Phasing determinism corpus whose completed depth drops against the same
 * search with `strategyPlans` off, or whose rollouts come back `unresolved`
 * at the ladder's rungs).
 */
export const STRATEGY_WORK_SHARE = 16;

/** The plan layer's scratch: allocated on first use, rebuilt when the
 * catalogue moves (a lab rules toggle), never read before it is rewritten
 * (`strategy/plan.ts newPlanScratch`). One is enough: the engine is
 * single-threaded and a search never nests another. */
let planScratch: PlanScratch | null = null;

function scratchForPlans(): PlanScratch {
  const cat = activeCatalog();
  if (planScratch === null || planScratch.cat.signature !== cat.signature) planScratch = newPlanScratch(cat);
  return planScratch;
}

const NO_LINES: readonly StrategyLine[] = [];

/** What `installStrategyWitness` hands back: the plan set the source computed
 * (null until the root first generates, and for ever when it never does). */
export type PlanSetRef = () => PlanSet | null;

/**
 * STRATEGOS W1.9 (plan B.2 step W1.9): wires the strategic layer's plan lines
 * into the ROOT generator for ONE search. The root owns the callback — `gen`
 * never imports `strategy` (DESIGN §2, `lab/hard-ai/deps.ts`) — exactly as
 * `installRescueWitness` owns injection 4's. `searchRootInner` calls it only
 * when `searchFix.strategyPlans` is on and clears it (`setStrategyWitness(
 * null)`) in the same `finally` that restores the kill-clock policy.
 *
 * The source answers only for the root it was installed for (`kpos`), with
 * the lines of `reading`'s posture: `strategy/contact.ts forceContactPlans`
 * on `force-contact`, `strategy/hold.ts holdPlans` on `hold`, none on `none`
 * (or when there is no reading). The root regenerates its list every
 * iteration, so the set is computed on the FIRST root generation and served
 * from memory after that; its work (`PlanSet.work`, every query's
 * `workCost`) is charged to the search meter once, at that first generation,
 * through the generation's own sink — `WorkClass.TURN`, one unit per unit,
 * the class `gen/actionsearch.ts` charges a within-turn node to — the way
 * injection 4 charges its prover call. `STRATEGY_WORK_SHARE` bounds the
 * rollouts inside it.
 */
export function installStrategyWitness(s: SearchContext, root: PackedState, reading: ClockReading | null): PlanSetRef {
  const rootLo = root.kposLo;
  const rootHi = root.kposHi;
  let computed: PlanSet | null = null;
  const source: StrategyWitness = (p, t, meter) => {
    if (reading === null || p.kposLo !== rootLo || p.kposHi !== rootHi) return NO_LINES;
    if (computed === null) {
      const scratch = scratchForPlans();
      scratch.cap = Math.floor(s.meter.limit / STRATEGY_WORK_SHARE);
      computed =
        reading.posture === 'force-contact'
          ? forceContactPlans(p, t, reading, scratch)
          : reading.posture === 'hold'
            ? holdPlans(p, t, reading, scratch)
            : { posture: reading.posture, lines: [], queries: [], work: 0 };
      if (computed.work > 0) meter.spend(WorkClass.TURN, computed.work);
    }
    return computed.lines;
  };
  s.gen.setStrategyWitness(source);
  return () => computed;
}

/** `ClockReadingCore`'s own fields, JSON-sized (the full reading carries the
 * ledger and both killETA readings). */
function readingCore(r: ClockReading): ClockReadingCore {
  return { side: r.side, r: r.r, verdict: r.verdict, marginL: r.marginL, marginMid: r.marginMid };
}

/**
 * The Chronicle of one strategos search (`StrategyChronicle`, plan B.1): the
 * reading, the posture, every injected plan with its contract, feasibility
 * and queries, and what the root played.
 *
 * W1.9 alone (`strategyPlans` without `strategyVeto`), and every root the
 * veto never reached — a posture-free reading, the must-answer scan's proven
 * win, the book, a search with no move — records `source: 'plan'` exactly
 * when the played end key is an injected plan's. Under W1.10's veto
 * (`search/veto.ts`) its `VetoOutcome` decides instead: `'plan'` for the
 * plan-consistent candidate it played (injected or not), `'search'` when it
 * played the tactical best, with `veto` set when a plan candidate was
 * refused, and its queries (`veto.classify`, `veto.research`) appended to the
 * plan layer's.
 */
function chronicle(
  reading: ClockReading | null,
  set: PlanSet | null,
  result: RootResult,
  vetoed: VetoOutcome | null = null,
): StrategyChronicle {
  const injected: InjectedPlan[] = (set?.lines ?? []).map(l => ({
    contract: l.contract,
    endKey: l.endKey,
    label: l.label,
    feasibility: l.feasibility,
    queries: l.queries,
  }));
  const moved = result.source !== 'fallback' && result.actions.length > 0;
  const played = moved ? injected.find(i => i.endKey === result.endKey) : undefined;
  const base: StrategyChronicle = {
    reading: reading === null ? null : readingCore(reading),
    posture: reading?.posture ?? 'none',
    injected,
    chosen: moved
      ? {
          endKey: result.endKey,
          source: played !== undefined ? 'plan' : 'search',
          scoreCc: result.scoreCc,
          ...(played !== undefined ? { planLabel: played.label } : {}),
        }
      : null,
    queries: set?.queries ?? [],
  };
  if (vetoed === null) return base;
  return {
    ...base,
    chosen: moved ? vetoed.chosen : null,
    ...(vetoed.veto !== undefined ? { veto: vetoed.veto } : {}),
    queries: [...base.queries, ...vetoed.queries],
  };
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
  // Flag masks in §5.10's order: elimination (a kill that ends the game), then
  // a corner entry by an existing body. A candidate carrying none of them can
  // still be a terminal — the last enemy body dying to a Cleave chain, say — so
  // the final pass considers everything.
  //
  // §5.10's leading HOME_RACE pass is gone under Phasing. It was written for
  // the Standard race, where BUY, END_PLACE and the same turn's move-actions
  // could end the game inside one turn; a Phasing race BUY only creates a
  // pending commitment, so no HOME_RACE candidate can ever decide the game on
  // the turn that carries it and scanning them first only paid `PROVER_FULL`
  // `makeTurn`s for candidates that cannot answer. Races are still scanned, in
  // the trailing catch-all pass, exactly like any other candidate.
  const passes = [TurnFlag.KILL, TurnFlag.HOME_ENTRY, 0];
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

/** At most this many candidates are saved and canonically replayed by `pickUnsearched`.
 * The deadline has already passed when it runs, so the salvage has to be
 * bounded by something; a divergence rate that eats eight of the generator's
 * own best candidates is a replica bug, not a position. */
const SALVAGE_ATTEMPTS = 8;

/**
 * P6. The root's answer when the DEADLINE cut the search before
 * `iterativeDeepening` completed — or even started — an iteration, and the
 * initial candidate list is all there is. Its ranked copies survive the next
 * generation's scratch storage; replay is deferred until salvage.
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
 * used only when deepening has no completed or partial answer to return.
 *
 * Returns independent copies of at most SALVAGE_ATTEMPTS ranked candidates.
 * No score, work charge or normal-search ordering changes while saving them.
 */
function preserveUnsearched(
  s: SearchContext,
  n: number,
  tieByEndKey: boolean,
): Turn[] {
  const turns = s.turns[0];
  const tried = new Uint8Array(n);
  const saved: Turn[] = [];
  for (let attempt = 0; attempt < SALVAGE_ATTEMPTS; attempt++) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (tried[i] === 1) continue;
      if (best < 0 || turns[i].gainCc > turns[best].gainCc) best = i;
      else if (tieByEndKey && turns[i].gainCc === turns[best].gainCc && endKeyAfter(turns[best], turns[i])) best = i;
    }
    if (best < 0) break;
    tried[best] = 1;
    // The first root iteration rewrites both turns[0] and the shared keep
    // table. Preserve actions AND the owned mask before it can begin.
    saved.push(copyTurn(allocTurn(), turns[best]));
  }
  return saved;
}

/** Verification is deferred until a search actually needs salvage. Generated
 * upkeep actions must own their mask; a later shared table cannot supply it. */
function pickUnsearched(
  s: SearchContext,
  p: PackedState,
  state: GameState,
  saved: readonly Turn[],
): { turn: Turn; check: ReplayCheck } | null {
  const noSharedChoice = newKeepSetTable();
  for (const turn of saved) {
    const check = verifyTurn(s.rep, state, p, turn, noSharedChoice);
    if (check.verified) return { turn, check };
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
  const published = probe.publish(s.rootHasBest, result.endKey, result.candidateSource === 'generator-list');
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

  // STRATEGOS W1.2 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`,
  // B.2 step W1.2, "the leak fix"; B.1b's code fact). `hard@desktop` — and
  // every other profile that leaves `SearchFix.killClockPolicy` absent — takes
  // NONE of this branch, so `eval/evaluate.ts`'s legacy `killClockRootClock`
  // module slot is read exactly as it is today: written only by `engine.ts`'s
  // wall-clock pack and `calibrate`, starting at `INACTIVITY_LIMIT − 1`, and
  // never saved or restored, so a wall-clock search's root clock can still
  // leak into a later FIXED-WORK search in the same process. That is
  // `hard@desktop`'s pinned behaviour, not a bug this step is allowed to fix.
  //
  // `hard@strategos` sets `killClockPolicy: 'ledger'`, and for THIS search
  // only: the previous policy (whatever it was — `null`, or another
  // strategos search's, should one ever nest, which it cannot: this function
  // is synchronous end to end) is saved, a fresh policy scoped to the packed
  // root's own clock is installed, the search runs, and the saved policy is
  // restored in a `finally` — so a THROW out of `searchRootFromPacked` still
  // restores it. `engine.ts` skips both legacy-slot writes for a `'ledger'`
  // profile, so no strategos search, fixed-work or wall-clock, can leak into
  // the next search of either profile.
  //
  // STRATEGOS W1.6: `reading` stays `null` here unless `evalFix.clockLedger`
  // is ALSO on, in which case `strategy/clock.ts clockReading` is computed
  // ONCE for this search, from the same packed root `p` and its own side to
  // move, and installed alongside `rootClock` in this one `setKillClockPolicy`
  // call — so it is saved and restored by the very same `finally` above, and
  // a throw inside `clockReading` itself (it allocates no scratch and touches
  // no module state) would simply propagate before any policy is installed,
  // leaving the saved policy untouched. The computation runs BEFORE
  // `s.meter.reset(opts.work)` (`searchRootFromPacked`, below), so it is not,
  // and cannot be, charged to this search's own work meter; it is cheap by
  // construction (`ledger.ts`/`killeta.ts`/`clock.ts`'s own "sound but loose"
  // bounds, none of which searches the game tree). Measured cost (W1.6
  // review, 2026-09-24): about 0.3 ms per call on the 24 roots of
  // `lab/hard-ai/positions/p4-determinism.jsonl`, against a search budget of
  // seconds, so it is left off the meter.
  //
  // STRATEGOS W1.9: `searchFix.strategyPlans` (again only `hard@strategos`)
  // additionally installs the root generator's plan-line source
  // (`installStrategyWitness`) for this search and clears it in the SAME
  // `finally`. It reads the same reading W1.6 installs — one `clockReading`
  // per search — and computes it itself when `clockLedger` is off; the
  // policy's own `reading` stays `null` then, exactly as before, so the
  // evaluator never sees a reading `clockLedger` did not ask for. With the
  // flag on, the result carries the Chronicle (`RootResult.strategy`).
  //
  // STRATEGOS W1.10: `searchFix.strategyVeto` (again only `hard@strategos`)
  // arms the plan-consistency veto (`search/veto.ts`) whenever the same
  // reading has a posture: deepening runs on the rung less the veto's
  // reserve, the best plan-consistent candidate is re-searched on it, and
  // the Chronicle records what was played and why. The veto ranks candidates
  // by the last completed iteration's scores, which only the root instrument
  // (`search/probe.ts`) keeps; when no instrument is installed (`opts.expose`
  // off) a private one is installed for this search and removed in the same
  // `finally` — observation only, so the search it watches is the search it
  // would have been, and an exposed search and an unexposed one decide alike.
  const fix = opts.config.searchFix;
  const policyOn = fix?.killClockPolicy === 'ledger';
  const plansOn = fix?.strategyPlans === true;
  const vetoOn = fix?.strategyVeto === true;
  if (!policyOn && !plansOn && !vetoOn) return searchRootFromPacked(engine, state, opts, p);
  const ledgerOn = opts.config.evalFix?.clockLedger === true;
  const reading = ledgerOn || plansOn || vetoOn ? clockReading(p, p.side) : null;
  const savedPolicy = getKillClockPolicy();
  if (policyOn) setKillClockPolicy({ rootClock: p.clock, reading: ledgerOn ? reading : null });
  const planSet = plansOn ? installStrategyWitness(s, p, reading) : null;
  const arm = vetoOn && reading !== null ? armVeto(reading, scratchForPlans(), planSet ?? NO_PLAN_SET, opts.work) : null;
  const ownProbe = arm !== null && s.probe === null;
  if (ownProbe) s.probe = new RootProbe(s.turns[0].length, false);
  try {
    const result = searchRootFromPacked(engine, state, opts, p, arm);
    if (planSet === null && !vetoOn) return result;
    const strategy = chronicle(reading, planSet === null ? null : planSet(), result, arm === null ? null : arm.outcome);
    return { ...result, strategy };
  } finally {
    if (ownProbe) s.probe = null;
    if (plansOn) s.gen.setStrategyWitness(null);
    if (policyOn) setKillClockPolicy(savedPolicy);
  }
}

/** The plan set of a search that injected none (`strategyVeto` without
 * `strategyPlans`): the veto still classifies every candidate itself. */
const NO_PLAN_SET: PlanSetRef = () => null;

function searchRootFromPacked(
  engine: RootEngine,
  state: GameState,
  opts: RootOptions,
  p: PackedState,
  arm: VetoArm | null = null,
): RootResult {
  const s = engine.ctx;
  const stats = s.stats;

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
  const t = buildSearchTables(s, p, 0);
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
    const hit = probeBook(book, p, s.turns[0], n, opts.config.weights);
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

  // A watchdog can expire between any two polls, including before the first
  // iteration or while its generation overwrites the initial list. Retain a
  // bounded ranked copy regardless of the earlier poll's answer. Normal
  // completed/partial search answers still win; verification is lazy.
  const unsearched = preserveUnsearched(s, n, opts.config.searchFix?.tieBreak === 'end-key');

  // STRATEGOS W1.10 (`search/veto.ts`, `searchFix.strategyVeto` with a
  // posture only): the veto classifies the pre-deepening list, so it is
  // copied before the first iteration rewrites it, and deepening runs on the
  // rung less the reserve the re-search spends afterwards.
  let result: SearchResult;
  if (arm === null) {
    result = iterativeDeepening(s, p, onDepth);
  } else {
    snapshotCandidates(arm, s.turns[0], n);
    const limit = s.meter.limit;
    s.meter.setLimit(limit - arm.reserve);
    try {
      result = iterativeDeepening(s, p, onDepth);
    } finally {
      s.meter.setLimit(limit);
    }
  }
  stats.work = s.meter.used;

  if (result.best === null) {
    // No completed or partial answer exists. The saved candidates remain
    // valid even if the first regeneration rewrote every scratch buffer.
    const salvaged = pickUnsearched(s, p, state, unsearched);
    if (salvaged !== null) {
      const turn = salvaged.turn;
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
        ...(s.probe !== null ? { candidateSource: 'generator-list' as const } : {}),
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

  // STRATEGOS W1.10: the veto may replace the move with a plan-consistent
  // candidate, re-searched on the reserve; that candidate is a copy that owns
  // its keep mask, so it is verified against no shared table.
  let play: Turn = result.best;
  let scoreCc = result.scoreCc;
  let keep = s.keep[0];
  if (arm !== null) {
    const rung = s.meter.limit;
    let pick: ReturnType<typeof applyVeto>;
    try {
      pick = applyVeto(s, p, result, arm);
    } finally {
      s.meter.setLimit(rung);
    }
    if (pick !== null) {
      play = pick.turn;
      scoreCc = pick.scoreCc;
      keep = newKeepSetTable();
      copyTurn(s.rootBest, play);
    }
    stats.work = s.meter.used;
    stats.byClass.set(s.meter.byClass);
    stats.turnNodes = s.meter.byClass[WorkClass.TURN];
    stats.evals = s.meter.byClass[WorkClass.EVAL1] + s.meter.byClass[WorkClass.EVAL2];
  }

  const check = verifyTurn(s.rep, state, p, play, keep);
  const rescue = (play.flags & TurnFlag.HOME_RESCUE) !== 0 && t.home[s.root].occupied === 1;
  if (!check.verified) {
    stats.replicaDivergences++;
    const actions = check.actions.length > 0 ? check.actions : [phaseEndAction(state)];
    return {
      actions,
      scoreCc,
      depth: result.depth,
      work: s.meter.used,
      stats,
      source: check.actions.length > 0 ? 'search' : 'fallback',
      endKey: keyHex(play.endHi, play.endLo),
      fallback: 'divergence',
    };
  }

  return {
    actions: check.actions,
    scoreCc,
    depth: result.depth,
    work: s.meter.used,
    stats,
    source: rescue ? 'rescue' : 'search',
    endKey: keyHex(play.endHi, play.endLo),
  };
}
