/**
 * E4.2 — the tractable FULL-WIDTH REFERENCE SEARCH and the search safety audit
 * (`docs/hard-ai/e4/E4-PLAN.md` lane 2; EPIC-PLAN §4 E4.2; usefulness rule 3,
 * "Agreement").
 *
 * The production search is DESIGN §5.11's PVS: a null-window scout at every
 * candidate after the first, a transposition table that returns stored values, a
 * lazy evaluator that returns a BOUND instead of a value when the window allows,
 * a quiescence layer with stand-pat, a delta margin and the R5 cap, and a work
 * meter that can truncate any of it. Each of those can change the answer. The
 * reference here removes them and keeps everything else identical, so a
 * disagreement names one of them:
 *
 *   - no alpha-beta. Every child is searched on `(-INF, +INF)`, so no value is a
 *     bound, no candidate is skipped, and `Evaluator.evaluate`'s two lazy exits
 *     (`v1 - b >= beta`, `v1 + b <= alpha`) are both unreachable — every leaf of
 *     the reference is a full stage-0 + stage-1 + stage-2 evaluation.
 *   - no transposition table, no proof cache, no killers, no history, and no
 *     ordering pass at all (`scoreTurns` is never called): candidates are
 *     searched in the generator's own order.
 *   - no LMR, no futility, no aspiration, no extensions, no df-pn — which at
 *     `hard@desktop` are off in production too (`config.ts` sets `useLmr`,
 *     `useFutility`, `useAspiration`, `useExtensions`, `useDfpn` false), so this
 *     is a statement about future arms, not about the champion.
 *   - no truncation. The meter is armed with `REFERENCE_WORK` (1e15 units), so
 *     `meter.exhausted()` is never true; this module never enters
 *     `engine.searchTurn`, so the watchdog is unarmed and `ctx.stop()` is
 *     constantly false and the generator's `StopAwareSink` never cuts a
 *     candidate list. A NODE BUDGET bounds the wall clock instead, and a
 *     position that hits it is reported INTRACTABLE and excluded from every
 *     agreement count.
 *   - no R5 quiescence cap. `quiesceCapped` compares `quiesceWork` against
 *     `meter.limit`, and at 1e15 the cap can never bind.
 *
 * What is deliberately NOT changed, because the comparison is meaningless
 * otherwise:
 *
 *   - the generator. `generateAt` is the production function, so ply 0 uses
 *     `ctx.gen` (K = 24 at desktop) and interior plies `ctx.genInterior`
 *     (K = 16), exactly as `pvs` does. "Full width" is the full width of the
 *     SHIPPED candidate list, not an exhaustive turn enumeration — DESIGN §5.4's
 *     beam is the engine's move generator, and replacing it would be a different
 *     experiment (`verify/perft.ts` and `exam/witness.ts` already enumerate
 *     canonically, and neither of them scores).
 *   - the evaluator. `evaluateLeaf` on the engine's own `ctx.eval`, built from
 *     the engine's `weights` and `evalFix` (`hardEnginePatch` resolves both);
 *     `assertWeights` refuses M4's `version 0` placeholder vector.
 *   - the terminal rules. `terminalScore` at node entry from the side to move,
 *     and `terminalScore(p, mover, ply + 1)` after `makeTurn` for a turn that
 *     ended the game without flipping the side — `pvs`'s own two calls, in the
 *     same two places, with the same perspectives.
 *   - the prover mode, except that there is only one of it. `PROVER_FULL` at
 *     every reference node, which is what DESIGN §5.11.4 gives a PV node; the
 *     reference has no scout nodes, so it never lowers to `PROVER_BOUND`. The
 *     admissible bound can only UNDER-claim a corner mate, so the reference is
 *     the stronger adjudication, and a difference in that direction is
 *     classified rather than assumed away.
 *
 * TWO REFERENCE VALUES PER POSITION. The leaf rule is the one real choice.
 * `pvs` at `depth <= 0` calls `quiesce`, so a reference whose leaves are static
 * evaluations is not measuring the production quantity; but `quiesce` is
 * fail-hard and its delta margin reads `alpha`, so a reference that calls it is
 * not entirely pruning-free. Both are computed:
 *
 *   `refStatic`  — leaves are `evaluateLeaf(-INF, +INF)`. Pruning-free,
 *                  window-free, the clean full-width minimax of the generator's
 *                  tree.
 *   `refQuiesce` — leaves are `quiesce(-INF, +INF)`. The production leaf rule on
 *                  the widest window there is.
 *
 * The production score must lie in `[min(refStatic, refQuiesce),
 * max(refStatic, refQuiesce)]`; outside that interval it is a disagreement.
 * Inside it but not equal to `refQuiesce` is a stand-pat / quiescence artifact
 * and is reported as one.
 *
 * PRINCIPAL-TURN AGREEMENT is on the END-STATE KEY (`endHi:endLo`), not on the
 * action list: two action orders that reach the same end state are the same turn
 * to the evaluator, and `RootResult.endKey` is what the lab already compares
 * (`hard:cross-commit`). A full-width search with no pruning has an
 * order-independent VALUE but an order-dependent argmax, so agreement is
 * "production's principal turn is among the reference's OPTIMAL SET" — every
 * root candidate whose value equals the reference's root value. Reporting a
 * single reference argmax would manufacture disagreements out of ties, which is
 * the thing E4's leaf-tie lane (lane 3) exists to study.
 *
 * THREE MORE CHECKS need no reference tree and run on the production search
 * itself, through hooks that already exist. Nothing under `src/ai/hard` changes.
 *
 *   TT identity — `RecordingTT` subclasses `TranspositionTable` and records
 *     every `store` (with `ctx.truncated` as it stood at that moment) and every
 *     `probe`, delegating to `super` for the behaviour, so the search it watches
 *     is the search that ships. `auditStoreLog` then asks whether the log is
 *     self-consistent.
 *   Key-field sensitivity — `Kpos` is `piece ⊕ reserve ⊕ damage ⊕ side ⊕ clock ⊕
 *     bank ⊕ upkeepPending ⊕ rules ⊕ handicap` (`core/zobrist.ts`), i.e. NOT
 *     phase, actions, atkCount or uflags, which live only in `Kturn`.
 *     `kposSensitivity` packs one position per single-field mutation and reports
 *     which mutations move the macro table's key, measured rather than quoted.
 *   Switch A/Bs — `setQuiesceCap(false)` and `setUseTT(false)` are existing
 *     engine hooks (the M14 bench's arms). Running the same fixed work with each
 *     one flipped isolates the R5 cap and the table from everything else.
 *
 * CLI
 *
 *   node --import tsx lab/hard-ai/verify/reference.ts \
 *     [--engine desktop] [--depth 2] \
 *     [--sets e1dev,home-mate,spawn-strike,upkeep,draw,tactics] \
 *     [--limit N] [--node-limit N] [--work 25000,50000,100000,200000,400000] \
 *     [--checks agreement,tt,kpos,switches] [--out lab/results/hard-ai-e4/audit]
 *
 * One engine process, no heavy slot, no ladder, every invocation well inside
 * five minutes at `--depth 2`; `--node-limit` is what keeps that true.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState } from '../../../src/game/types';
import { setCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { HardEngine } from '../../../src/ai/hard/engine';
import { allocState } from '../../../src/ai/hard/core/state';
import { buildTables } from '../../../src/ai/hard/tables/context';
import { terminalScore } from '../../../src/ai/hard/eval/evaluate';
import {
  INF,
  PROVER_FULL,
  evaluateLeaf,
  generateAt,
  makeTurn,
  newSearchStats,
  unmakeTurn,
  type SearchContext,
} from '../../../src/ai/hard/search/pvs';
import { quiesce } from '../../../src/ai/hard/search/quiesce';
import { Bound, TranspositionTable, newTTEntry, type TTEntry } from '../../../src/ai/hard/search/tt';
import type { Centi, PackedState, Side } from '../../../src/ai/hard/types';
import type { RootResult } from '../../../src/ai/hard/search/root';
import { hardEnginePatch } from '../bots/hard';
import { DEFAULT_RULES, readPositions, type RulesBlock, type StoredPosition } from '../positions/corpus';
import { applyOpening, loadOpenings } from '../ladder/openings';
import { installExamRules, loadCaseState, loadStratum, restoreShippedRules } from '../exam/format';

const HERE = import.meta.dirname;
const REPO_ROOT = path.resolve(HERE, '../../..');
const POSITIONS_DIR = path.join(REPO_ROOT, 'lab/hard-ai/positions');
const SUITES_DIR = path.join(REPO_ROOT, 'lab/hard-ai/suites');
const OPENINGS_DIR = path.join(REPO_ROOT, 'lab/hard-ai/ladder/openings');
const DEFAULT_OUT = path.join(REPO_ROOT, 'lab/results/hard-ai-e4/audit');

/** The reference meter's limit: large enough that `exhausted()` is never true at
 * any depth this module can finish, small enough to stay an exact integer. */
export const REFERENCE_WORK = 1e15;

/** Default macro-node budget per reference arm. A position that exceeds it is
 * INTRACTABLE and is excluded from every agreement count. */
export const DEFAULT_NODE_LIMIT = 40_000;

/** The rungs the production side is run at, smallest first; the audit uses the
 * smallest that reaches the reference depth. `WORK_LADDER`'s first five. */
export const DEFAULT_WORK_LADDER: readonly number[] = [3_000, 6_000, 12_000, 25_000, 50_000, 100_000, 200_000, 400_000];

/** Scores at or beyond this are mate-like: `WIN_CC` is 1,000,000 and
 * `MATE_PLY_CC` 1,000, so a mate inside 64 plies never falls below it, and
 * M12's gate pins the evaluator's own range well under it. */
export const MATE_LIKE_CC = 900_000;

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export type AuditSet = 'e1dev' | 'home-mate' | 'spawn-strike' | 'upkeep' | 'draw' | 'tactics';

export const AUDIT_SETS: readonly AuditSet[] = ['e1dev', 'home-mate', 'spawn-strike', 'upkeep', 'draw', 'tactics'];

export interface AuditPosition {
  /** Unique within the audit run. */
  id: string;
  set: AuditSet;
  /** Where the position came from, verbatim, so the row is reproducible. */
  source: string;
  rules: RulesBlock;
  state: GameState;
}

/** Rules are PROCESS-GLOBAL in `src/game` (`suites/run.ts` says so); every
 * position installs its own block before it is packed or searched. */
export function applyRules(rules: RulesBlock): void {
  setElementGraph(rules.elementGraph);
  setUpkeepVariant(rules.upkeep);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
}

function storedFrom(
  file: string,
  set: AuditSet,
  take: (p: StoredPosition) => boolean,
  limit: number,
  idPrefix = '',
): AuditPosition[] {
  const out: AuditPosition[] = [];
  for (const p of readPositions(file)) {
    if (!take(p)) continue;
    out.push({
      id: `${idPrefix}${p.id}`,
      set,
      source: `${path.relative(REPO_ROOT, file)}#${p.id}`,
      rules: p.rules,
      state: p.state,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The `e1dev` rows: the position an `e1-dev` opening leaves — an early turn with
 * a small army, two to four plies from the initial state. `applyOpening` replays
 * the recipe through the canonical simulator under the default match rules, so
 * the state is a real game position and not an authored one.
 */
function e1devPositions(limit: number): AuditPosition[] {
  const file = path.join(OPENINGS_DIR, 'e1-dev.jsonl');
  const loaded = loadOpenings(file);
  const out: AuditPosition[] = [];
  for (const opening of loaded.openings) {
    out.push({
      id: `e1dev-${opening.id}`,
      set: 'e1dev',
      source: `lab/hard-ai/ladder/openings/e1-dev.jsonl#${opening.id} (${opening.actions.length} plies)`,
      rules: DEFAULT_RULES,
      state: applyOpening(opening),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * IMMINENT INACTIVITY DRAWS. `core/zobrist.ts` puts the clock in `Kpos`
 * (`CLOCK_VALUES = 11`, so `inactivityPlies` runs 0..10) and SU §8.1 puts the
 * boundary check in the canonical terminal order, so a position within a ply or
 * two of the draw is what exercises both.
 *
 * `lab/hard-ai/positions/authored.jsonl#clock-9` is the only purpose-built one
 * in the repo (the exam's `quiet-clock` demand has no cases). The rest are the
 * `fuzz-1000.jsonl` rows that carry `inactivityRule: "on"` AND a clock of 7 or
 * more — real reachable positions, not authored ones, and no fixture is edited
 * to make them.
 */
function drawPositions(limit: number): AuditPosition[] {
  const out = storedFrom(
    path.join(POSITIONS_DIR, 'authored.jsonl'),
    'draw',
    p => (p.tags ?? []).includes('inactivity'),
    limit,
    'draw-',
  );
  for (const p of readPositions(path.join(POSITIONS_DIR, 'fuzz-1000.jsonl'))) {
    if (out.length >= limit) break;
    if (p.state.inactivityRule === 'off') continue;
    if ((p.state.inactivityPlies ?? 0) < 7) continue;
    out.push({
      id: `draw-${p.id}`,
      set: 'draw',
      source: `lab/hard-ai/positions/fuzz-1000.jsonl#${p.id} (clock ${p.state.inactivityPlies ?? 0})`,
      rules: p.rules,
      state: p.state,
    });
  }
  return out;
}

/**
 * UPKEEP. Three shapes, in this order:
 *
 *   1. `authored.jsonl#upkeep-pending` — the plain upkeep node.
 *   2. the exam's two UPKEEP-ELIMINATION cases (`dev.jsonl`, tag
 *      `upkeep-elimination`): `loss-g2-s5_0_2-A-white-t4` and
 *      `loss-g4-s2_3_1-B-white-t2`, both recipes replayed from their opening.
 *   3. the home-mate suite's `-rescue` halves, which are all
 *      `upkeepPending: true` at `phase: "place"` — the forced-home-defence
 *      position where the defender must pay upkeep, choose a keep set and rescue
 *      inside one turn.
 */
function upkeepPositions(limit: number): AuditPosition[] {
  const out = storedFrom(
    path.join(POSITIONS_DIR, 'authored.jsonl'),
    'upkeep',
    p => p.state.upkeepPending === true,
    limit,
    'upkeep-',
  );
  for (const c of loadStratum('dev')) {
    if (out.length >= limit) break;
    if (!c.tags.includes('upkeep-elimination')) continue;
    installExamRules(c);
    let state: GameState;
    try {
      state = loadCaseState(c);
    } finally {
      restoreShippedRules();
    }
    out.push({
      id: `upkeep-${c.id}`,
      set: 'upkeep',
      source: `lab/hard-ai/exam/cases/dev.jsonl#${c.id} (${c.demand}, ${c.tags.join('/')})`,
      rules: c.rules,
      state,
    });
  }
  for (const p of readPositions(path.join(SUITES_DIR, 'home-mate.positions.jsonl'))) {
    if (out.length >= limit) break;
    if (p.state.upkeepPending !== true) continue;
    out.push({
      id: `upkeep-${p.id}`,
      set: 'upkeep',
      source: `lab/hard-ai/suites/home-mate.positions.jsonl#${p.id}`,
      rules: p.rules,
      state: p.state,
    });
  }
  return out;
}

export function loadAuditPositions(sets: readonly AuditSet[], limit: number): AuditPosition[] {
  const out: AuditPosition[] = [];
  for (const set of sets) {
    switch (set) {
      case 'e1dev':
        out.push(...e1devPositions(limit));
        break;
      case 'home-mate':
        // The forced home defence. Both halves are taken: `-rescue` (the
        // defender to move, upkeep pending) and `-mate` (the attacker to move).
        out.push(...storedFrom(path.join(SUITES_DIR, 'home-mate.positions.jsonl'), 'home-mate', () => true, limit, 'hm-'));
        break;
      case 'spawn-strike':
        out.push(...storedFrom(path.join(SUITES_DIR, 'spawn-strike.positions.jsonl'), 'spawn-strike', () => true, limit, 'ss-'));
        break;
      case 'upkeep':
        out.push(...upkeepPositions(limit));
        break;
      case 'draw':
        out.push(...drawPositions(limit));
        break;
      case 'tactics':
        out.push(...storedFrom(path.join(POSITIONS_DIR, 'tactics.jsonl'), 'tactics', () => true, limit, 'tac-'));
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The reference search
// ---------------------------------------------------------------------------

export interface ReferenceOptions {
  depth: number;
  /** Leaves are `quiesce(-INF, +INF)` rather than `evaluateLeaf(-INF, +INF)`. */
  quiesceLeaves: boolean;
  nodeLimit: number;
  /** Record `Kpos -> Replica.digest` at every interior node. */
  census: boolean;
}

export interface ReferenceCandidate {
  index: number;
  endKey: string;
  scoreCc: Centi;
  /** The replica refused the turn part-way, so it was never searched — the same
   * `applied !== turn.count` skip `pvs` makes. */
  illegal: boolean;
}

export interface ReferenceResult {
  depth: number;
  quiesceLeaves: boolean;
  scoreCc: Centi;
  /** Every root candidate, in GENERATOR order, with the reference's value.
   * Nothing here was ordered by `scoreTurns`. */
  candidates: ReferenceCandidate[];
  /** End keys whose value equals `scoreCc`: the reference's optimal set. */
  optimal: string[];
  nodes: number;
  /** The node budget bit; every number above is partial. */
  intractable: boolean;
  /** `Kpos` -> the distinct `Replica.digest`s seen at it (census only). */
  keyDigests: Map<string, Set<string>>;
}

interface RefState {
  nodes: number;
  nodeLimit: number;
  intractable: boolean;
  quiesceLeaves: boolean;
  census: boolean;
  keyDigests: Map<string, Set<string>>;
}

function keyHex(hi: number, lo: number): string {
  return `${(hi >>> 0).toString(16).padStart(8, '0')}${(lo >>> 0).toString(16).padStart(8, '0')}`;
}

function recordCensus(st: RefState, s: SearchContext, p: PackedState): void {
  if (!st.census) return;
  const key = keyHex(p.kposHi, p.kposLo);
  let seen = st.keyDigests.get(key);
  if (seen === undefined) {
    seen = new Set<string>();
    st.keyDigests.set(key, seen);
  }
  seen.add(s.rep.digest(p));
}

/** The leaf rule, chosen once per reference arm (see the module header). */
function refLeaf(s: SearchContext, p: PackedState, ply: number, st: RefState): Centi {
  if (!st.quiesceLeaves) return evaluateLeaf(s, p, -INF, INF, ply);
  p.proverMode = PROVER_FULL;
  return quiesce(s, p, -INF, INF, ply, 0);
}

/**
 * Full-width negamax: `pvs` with the window, the table, the ordering pass, the
 * reductions and the truncation taken out; the generator, the evaluator, the
 * terminal rules and the prover mode left in.
 */
function refNegamax(s: SearchContext, p: PackedState, depth: number, ply: number, st: RefState): Centi {
  st.nodes++;
  if (st.nodes > st.nodeLimit) {
    st.intractable = true;
    return evaluateLeaf(s, p, -INF, INF, ply);
  }

  const terminal = terminalScore(p, p.side as Side, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) return refLeaf(s, p, ply, st);
  if (ply + 1 >= s.maxPly) return evaluateLeaf(s, p, -INF, INF, ply);

  p.proverMode = PROVER_FULL;
  const t = buildTables(p, s.sc, ply, 2, s.tables[ply]);
  recordCensus(st, s, p);

  const n = generateAt(s, p, t, ply);
  if (n === 0) return evaluateLeaf(s, p, -INF, INF, ply);

  const turns = s.turns[ply];
  const keep = s.keep[ply];
  const mover = p.side as Side;
  let best = -INF;
  let searched = 0;

  for (let i = 0; i < n; i++) {
    const turn = turns[i];
    p.proverMode = PROVER_FULL;
    const applied = makeTurn(s, p, turn, keep);
    if (applied !== turn.count) {
      unmakeTurn(s, p, applied);
      continue;
    }
    let score: Centi;
    // `pvs`'s rule verbatim: a turn that ENDS the game does not flip the side,
    // so the PARENT reads the terminal, from the MOVER's point of view, and the
    // value is NOT negated. Everything else is.
    const childTerminal = terminalScore(p, mover, ply + 1);
    if (childTerminal !== null) score = childTerminal;
    else score = -refNegamax(s, p, depth - 1, ply + 1, st);
    unmakeTurn(s, p, applied);
    searched++;
    if (score > best) best = score;
    if (st.intractable) break;
  }

  if (searched === 0) return evaluateLeaf(s, p, -INF, INF, ply);
  return best;
}

/** `weights.version === 0` is M4's 58-zero placeholder: material-only
 * evaluation. Every lab instrument that scores a position must refuse it (E4
 * plan, "Rules every lane runs under"). */
export function assertWeights(engine: HardEngine): void {
  if (engine.config.weights.version === 0) {
    throw new Error(
      'reference: the engine carries the placeholder weight vector (version 0); build it through hardEnginePatch',
    );
  }
}

/**
 * Arms `ctx` for one reference search and runs the root, keeping every root
 * candidate's value.
 *
 * The context is the ENGINE's — the same generator instances, the same
 * evaluator, the same `evalFix`-stamped tables — but the meter is re-armed at
 * `REFERENCE_WORK` and the table is off for the duration, so nothing the
 * reference does can be pruned, recalled or cut. The caller's `useTT` is
 * restored on the way out.
 */
export function referenceSearch(engine: HardEngine, state: GameState, opts: ReferenceOptions): ReferenceResult {
  assertWeights(engine);
  const s = engine.ctx;
  const useTTBefore = s.useTT;
  s.useTT = false;
  s.stats = newSearchStats();
  s.truncated = false;
  s.quiesceWork = 0;
  s.eval.invalidate();
  s.eval.setWeights(engine.config.weights);
  s.meter.reset(REFERENCE_WORK);

  const st: RefState = {
    nodes: 0,
    nodeLimit: opts.nodeLimit,
    intractable: false,
    quiesceLeaves: opts.quiesceLeaves,
    census: opts.census,
    keyDigests: new Map<string, Set<string>>(),
  };

  const result: ReferenceResult = {
    depth: opts.depth,
    quiesceLeaves: opts.quiesceLeaves,
    scoreCc: 0,
    candidates: [],
    optimal: [],
    nodes: 0,
    intractable: false,
    keyDigests: st.keyDigests,
  };

  try {
    const p = s.rep.pack(state, allocState());
    s.root = p.side as Side;
    p.proverMode = PROVER_FULL;

    st.nodes++;
    const t = buildTables(p, s.sc, 0, 2, s.tables[0]);
    recordCensus(st, s, p);
    const n = generateAt(s, p, t, 0);
    if (n === 0) {
      result.scoreCc = evaluateLeaf(s, p, -INF, INF, 0);
      result.nodes = st.nodes;
      return result;
    }

    const turns = s.turns[0];
    const keep = s.keep[0];
    const mover = p.side as Side;
    let best = -INF;

    for (let i = 0; i < n; i++) {
      const turn = turns[i];
      const endKey = keyHex(turn.endHi, turn.endLo);
      p.proverMode = PROVER_FULL;
      const applied = makeTurn(s, p, turn, keep);
      if (applied !== turn.count) {
        unmakeTurn(s, p, applied);
        result.candidates.push({ index: i, endKey, scoreCc: 0, illegal: true });
        continue;
      }
      let score: Centi;
      const childTerminal = terminalScore(p, mover, 1);
      if (childTerminal !== null) score = childTerminal;
      else score = -refNegamax(s, p, opts.depth - 1, 1, st);
      unmakeTurn(s, p, applied);
      result.candidates.push({ index: i, endKey, scoreCc: score, illegal: false });
      if (score > best) best = score;
      if (st.intractable) break;
    }

    result.scoreCc = best;
    result.nodes = st.nodes;
    result.intractable = st.intractable;
    result.optimal = result.candidates.filter(c => !c.illegal && c.scoreCc === best).map(c => c.endKey);
    return result;
  } finally {
    s.useTT = useTTBefore;
  }
}

// ---------------------------------------------------------------------------
// TT identity: a recording table
// ---------------------------------------------------------------------------

export interface TTStoreRecord {
  key: string;
  lo: number;
  hi: number;
  /** As handed to `store`, before `scoreToTT`'s ply re-basing. */
  scoreCc: Centi;
  depth: number;
  bound: number;
  bestEndLo: number;
  ply: number;
  boundProver: boolean;
  /** `SearchContext.truncated` at the moment of the store. DESIGN §5.11.6's rule
   * is that a truncated search never publishes; this is the audit of it. */
  truncated: boolean;
}

export interface TTProbeRecord {
  key: string;
  hit: boolean;
}

/**
 * `TranspositionTable` with a store/probe log. Every method delegates to
 * `super`, so the search underneath is byte-for-byte the shipped search and the
 * log is the only addition. Installed on `engine.ctx.tt` by the audit and by
 * nothing else; no file under `src/ai/hard` changes.
 */
export class RecordingTT extends TranspositionTable {
  readonly stores: TTStoreRecord[] = [];
  readonly probeLog: TTProbeRecord[] = [];
  /** Read at store time for `TTStoreRecord.truncated`; set by the installer. */
  ctx: SearchContext | null = null;

  override store(
    lo: number,
    hi: number,
    scoreCc: Centi,
    depth: number,
    bound: number,
    bestEndLo: number,
    ply: number,
    boundProver = false,
  ): void {
    this.stores.push({
      key: keyHex(hi, lo),
      lo: lo >>> 0,
      hi: hi >>> 0,
      scoreCc,
      depth,
      bound,
      bestEndLo: bestEndLo >>> 0,
      ply,
      boundProver,
      truncated: this.ctx === null ? false : this.ctx.truncated,
    });
    super.store(lo, hi, scoreCc, depth, bound, bestEndLo, ply, boundProver);
  }

  override probe(lo: number, hi: number, out: TTEntry): boolean {
    const hit = super.probe(lo, hi, out);
    this.probeLog.push({ key: keyHex(hi, lo), hit });
    return hit;
  }
}

export type TTFindingKind =
  | 'store-while-truncated'
  | 'exact-disagreement'
  | 'bound-contradiction'
  | 'cross-prover-mode'
  | 'bucket-false-hit';

export interface TTFinding {
  kind: TTFindingKind;
  key: string;
  detail: string;
}

/**
 * Every contradiction a store log can carry.
 *
 *   store-while-truncated — a value published after the search was cut. `pvs`
 *     guards both of its stores with `!s.truncated`, so this must be empty; a
 *     non-empty result is a bug in that guard.
 *   exact-disagreement — two EXACT entries for the same key, depth and prover
 *     mode with different scores at the same ply. One position searched twice to
 *     the same depth under the same adjudication is one number.
 *   bound-contradiction — a LOWER of `l` and an UPPER of `u` at the same key,
 *     depth and prover mode with `l > u`: the value is at once at least `l` and
 *     at most `u`. Mate scores are excluded, because a store is ply-rebased on
 *     the way in and two stores of the same mate at different plies carry
 *     different raw words by design (`scoreToTT`).
 *   cross-prover-mode — the same key and depth stored once under `PROVER_FULL`
 *     and once under the admissible bound, with different scores. NOT a bug by
 *     itself (`tt.ts`'s header says the two are different quantities); it is the
 *     population the `boundProver` refusal in `pvs` has to cover, so it is
 *     counted, not flagged.
 *   bucket-false-hit — two DISTINCT keys that share a bucket AND a `keyHi`, so a
 *     probe of one returns the other's entry. `bucketBase` indexes with
 *     `lo % (2^bits / 4)` and verifies with `hi` alone, which leaves the top
 *     `32 - (bits - 2)` bits of `lo` unverified — 15 of them at `hard@desktop`
 *     (`ttBitsMacro` 19).
 */
export function auditStoreLog(rec: RecordingTT, ttBits: number): TTFinding[] {
  const out: TTFinding[] = [];
  for (const st of rec.stores) {
    if (!st.truncated) continue;
    out.push({
      kind: 'store-while-truncated',
      key: st.key,
      detail: `depth ${st.depth} bound ${st.bound} score ${st.scoreCc} ply ${st.ply} stored with ctx.truncated set`,
    });
  }

  const byKeyDepthMode = new Map<string, TTStoreRecord[]>();
  for (const st of rec.stores) {
    const k = `${st.key}|d${st.depth}|${st.boundProver ? 'bound' : 'full'}`;
    const list = byKeyDepthMode.get(k);
    if (list === undefined) byKeyDepthMode.set(k, [st]);
    else list.push(st);
  }
  for (const [k, list] of byKeyDepthMode) {
    const exact = list.filter(x => x.bound === Bound.EXACT && x.ply === list[0].ply);
    for (let i = 1; i < exact.length; i++) {
      if (exact[i].scoreCc === exact[0].scoreCc) continue;
      out.push({
        kind: 'exact-disagreement',
        key: exact[0].key,
        detail: `${k}: EXACT ${exact[0].scoreCc} vs EXACT ${exact[i].scoreCc} at ply ${exact[0].ply}`,
      });
      break;
    }
    const plain = list.filter(x => Math.abs(x.scoreCc) < MATE_LIKE_CC);
    let lower = -Infinity;
    let upper = Infinity;
    for (const x of plain) {
      if (x.bound !== Bound.UPPER && x.scoreCc > lower) lower = x.scoreCc;
      if (x.bound !== Bound.LOWER && x.scoreCc < upper) upper = x.scoreCc;
    }
    if (lower > upper) {
      out.push({ kind: 'bound-contradiction', key: list[0].key, detail: `${k}: lower ${lower} > upper ${upper}` });
    }
  }

  const byKeyDepth = new Map<string, TTStoreRecord[]>();
  for (const st of rec.stores) {
    const k = `${st.key}|d${st.depth}`;
    const list = byKeyDepth.get(k);
    if (list === undefined) byKeyDepth.set(k, [st]);
    else list.push(st);
  }
  for (const [k, list] of byKeyDepth) {
    const full = list.filter(x => !x.boundProver);
    const bound = list.filter(x => x.boundProver);
    if (full.length === 0 || bound.length === 0) continue;
    if (full[0].scoreCc === bound[0].scoreCc) continue;
    out.push({
      kind: 'cross-prover-mode',
      key: list[0].key,
      detail: `${k}: full-prover ${full[0].scoreCc} vs bound-prover ${bound[0].scoreCc}`,
    });
  }

  const buckets = (1 << ttBits) / 4;
  const seats = new Map<string, TTStoreRecord>();
  for (const st of rec.stores) {
    const seat = `${st.hi >>> 0}|${(st.lo >>> 0) % buckets}`;
    const first = seats.get(seat);
    if (first === undefined) {
      seats.set(seat, st);
      continue;
    }
    if (first.lo === st.lo) continue;
    out.push({
      kind: 'bucket-false-hit',
      key: st.key,
      detail: `shares bucket ${(st.lo >>> 0) % buckets} and keyHi ${st.hi >>> 0} with ${first.key}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Key-field sensitivity
// ---------------------------------------------------------------------------

export interface KposProbeRow {
  mutation: string;
  /** The MACRO table's key moved. */
  kposMoved: boolean;
  /** The within-turn key moved. */
  kturnMoved: boolean;
  /** The position is materially different (`Replica.digest`'s 24 fields). */
  digestMoved: boolean;
  note: string;
}

/**
 * One row per single-field mutation of `state`: did `Kpos` (the MACRO table's
 * key) move, did `Kturn` move, and did the position actually change?
 *
 * A row with `digestMoved` true and `kposMoved` false names a field the macro
 * table cannot distinguish. `core/zobrist.ts` says which those are by
 * construction — phase, actions, atkCount and uflags are `Kturn` extras — and
 * this measures it rather than quoting it.
 */
export function kposSensitivity(engine: HardEngine, state: GameState): KposProbeRow[] {
  const rep = engine.ctx.rep;
  const base = rep.pack(state, allocState());
  const baseKpos = keyHex(base.kposHi, base.kposLo);
  const baseKturn = keyHex(base.kturnHi, base.kturnLo);
  const baseDigest = rep.digest(base);

  const rows: KposProbeRow[] = [];
  const probe = (mutation: string, mutated: GameState, note: string): void => {
    let p: PackedState;
    try {
      p = rep.pack(mutated, allocState());
    } catch (err) {
      rows.push({
        mutation,
        kposMoved: false,
        kturnMoved: false,
        digestMoved: false,
        note: `unpackable: ${(err as Error).message}`,
      });
      return;
    }
    rows.push({
      mutation,
      kposMoved: keyHex(p.kposHi, p.kposLo) !== baseKpos,
      kturnMoved: keyHex(p.kturnHi, p.kturnLo) !== baseKturn,
      digestMoved: rep.digest(p) !== baseDigest,
      note,
    });
  };

  const turn = state.turn;
  probe(
    'turn.phase place<->action',
    { ...state, turn: { ...turn, phase: turn.phase === 'place' ? 'action' : 'place' } },
    'a Kturn extra by construction: the macro table cannot separate a place-phase node from an action-phase one',
  );
  probe(
    'turn.actionsRemaining -1',
    { ...state, turn: { ...turn, actionsRemaining: Math.max(0, turn.actionsRemaining - 1) } },
    'a Kturn extra by construction: a mid-turn root and a start-of-turn node share a macro key',
  );
  probe(
    'turn.currentPlayer swapped',
    { ...state, turn: { ...turn, currentPlayer: turn.currentPlayer === 'white' ? 'black' : 'white' } },
    'side is a Kpos component',
  );
  probe(
    'upkeepPending toggled',
    { ...state, upkeepPending: state.upkeepPending !== true },
    'upkeepPending is a Kpos component',
  );
  probe(
    'inactivityPlies +1',
    { ...state, inactivityPlies: (state.inactivityPlies ?? 0) + 1 },
    'the clock is a Kpos component (SU §8.1 makes it part of the position)',
  );
  probe(
    'inactivityRule toggled',
    { ...state, inactivityRule: state.inactivityRule === 'off' ? 'on' : 'off' },
    'drawRuleOn is a Kpos rule flag',
  );
  probe(
    'progressThisTurn toggled',
    { ...state, progressThisTurn: state.progressThisTurn !== true },
    'progress is packed but is not a Kpos component',
  );
  return rows;
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

export type Classification =
  | 'agree'
  | 'pruning-artifact'
  | 'tt-identity'
  | 'terminal-ordering'
  | 'stand-pat'
  | 'truncation'
  | 'generator-difference'
  | 'must-answer'
  | 'reference-intractable'
  | 'depth-mismatch';

export interface SwitchRow {
  /** Production at the same fixed work with the R5 cap enforcement off. */
  quiesceCapOffEndKey: string | null;
  quiesceCapOffScoreCc: Centi | null;
  quiesceCapOffDepth: number | null;
  /** Production at the same fixed work with the transposition table off. */
  ttOffEndKey: string | null;
  ttOffScoreCc: Centi | null;
  ttOffDepth: number | null;
}

export interface ComparisonRow {
  id: string;
  set: AuditSet;
  source: string;
  /** Side to move, and the canonical turn number and phase of the ROOT. */
  side: string;
  turn: number;
  phase: string;
  upkeepPending: boolean;
  clock: number;
  refDepth: number;
  refStaticCc: Centi | null;
  refQuiesceCc: Centi | null;
  refNodes: number;
  refCandidates: number;
  refOptimal: string[];
  refOptimalCount: number;
  intractable: boolean;
  /** The production run whose `depth` equals `refDepth`, or the deepest. */
  prodWork: number | null;
  prodDepth: number | null;
  prodScoreCc: Centi | null;
  prodEndKey: string | null;
  prodSource: string | null;
  prodStopReason: string | null;
  prodTtHits: number | null;
  /** From `rootTrace` (`opts.expose`): root iterations run, how many completed,
   * and how many ended with `SearchContext.truncated` set. */
  prodIterations: number | null;
  prodCompletedIterations: number | null;
  prodTruncatedIterations: number | null;
  prodCandidateSource: string | null;
  /** One entry per COMPLETED depth of the matched run, from `opts.onProgress`:
   * the score iterative deepening published when that depth finished. It is how
   * a row whose final depth overshot the reference still carries a score AT the
   * reference depth. */
  prodDepthScores: { depth: number; scoreCc: Centi; work: number }[];
  /** `prodDepthScores`' entry at `refDepth`, or null. */
  prodScoreAtRefDepthCc: Centi | null;
  turnAgrees: boolean | null;
  scoreInBounds: boolean | null;
  scoreEqualsQuiesce: boolean | null;
  classification: Classification;
  switches: SwitchRow | null;
  note: string;
}

/**
 * Which of E4.2's causes a row belongs to. The rule is mechanical and written
 * here so the report's counts can be recomputed from the artifact:
 *
 *   the reference hit its node budget               -> reference-intractable
 *   the root never entered the search
 *     (`source` is a must-answer proof or the book;
 *     checked first, because such a root returns at
 *     `depth: 1` without deepening at all)          -> must-answer
 *   no rung of the ladder COMPLETED the reference
 *     depth (too small, or the smallest rung
 *     already overshot it)                          -> depth-mismatch
 *   turn and score both agree                       -> agree
 *   the score is inside the two reference values
 *     but is not the quiescence one                 -> stand-pat
 *   outside both, and the principal turn is one the
 *     reference never generated                     -> generator-difference
 *   outside both, with a mate score in play         -> terminal-ordering
 *   outside both, with a truncated root iteration   -> truncation
 *   outside both, with the table consulted          -> tt-identity
 *   anything else outside both                      -> pruning-artifact
 *
 * `stopReason` is deliberately NOT a truncation test: every fixed-work search
 * ends `work` by construction (the rung runs out), so reading that as truncation
 * would classify the whole corpus. The truncation signal is `rootTrace`'s own
 * `truncated`/`completed` flags, which `opts.expose` publishes, plus the
 * `store-while-truncated` count from the store log.
 */
export function classify(
  row: ComparisonRow,
  ttHits: number,
  mateLike: boolean,
  refGenerated: boolean,
  truncatedIterations: number,
): Classification {
  if (row.intractable) return 'reference-intractable';
  // The must-answer layer is checked BEFORE the depth: a proven terminal returns
  // at `depth: 1` without entering iterative deepening at all, so reading that
  // as a depth mismatch would hide the rows where the two searches agree on a
  // mate (DESIGN §5.10, `search/root.ts mustAnswer`).
  if (row.prodSource !== null && row.prodSource !== 'search') return 'must-answer';
  if (row.prodDepth === null || row.prodDepth !== row.refDepth) return 'depth-mismatch';
  if (row.turnAgrees === true && row.scoreEqualsQuiesce === true) return 'agree';
  if (row.scoreInBounds === true) return 'stand-pat';
  if (!refGenerated) return 'generator-difference';
  if (mateLike) return 'terminal-ordering';
  if (truncatedIterations > 0) return 'truncation';
  if (ttHits > 0) return 'tt-identity';
  return 'pruning-artifact';
}

export interface DepthScore {
  depth: number;
  scoreCc: Centi;
  work: number;
}

function sideName(state: GameState): string {
  return state.turn.currentPlayer;
}

/**
 * The production side at one position: `searchTurn` at each rung of the ladder,
 * smallest first, until one returns `depth === refDepth`, so the two searches
 * are compared at the SAME depth and the production run is the CHEAPEST that
 * reaches it. The sweep stops at the first rung that overshoots, and the row
 * then carries the depth production actually produced, so the mismatch is
 * visible rather than silently compared across depths.
 *
 * The matched run is re-run once with `opts.expose`, which is documented to
 * return the same move, score, depth, work, node count and end key
 * (`tests/ai/hard/root-exposure.test.ts`) and adds `rootTrace` — one row per
 * root iteration, with `completed` and `truncated`. That is the truncation
 * evidence; nothing else in `RootResult` carries it.
 */
async function productionAtDepth(
  engine: HardEngine,
  state: GameState,
  refDepth: number,
  ladder: readonly number[],
): Promise<{ work: number; result: RootResult; matched: boolean; depthScores: DepthScore[] } | null> {
  let deepest: { work: number; result: RootResult; depthScores: DepthScore[] } | null = null;
  for (const work of ladder) {
    const depthScores: DepthScore[] = [];
    const onProgress = (pr: { depth: number; scoreCc: Centi; work: number }): void => {
      depthScores.push({ depth: pr.depth, scoreCc: pr.scoreCc, work: pr.work });
    };
    const result = await engine.searchTurn(state, { work, onProgress });
    if (result.depth === refDepth) {
      const exposed = await engine.searchTurn(state, { work, expose: true });
      return { work, result: exposed, matched: true, depthScores };
    }
    if (deepest === null || result.depth > deepest.result.depth) deepest = { work, result, depthScores };
    if (result.depth > refDepth) break;
  }
  return deepest === null ? null : { ...deepest, matched: false };
}

export interface AuditRunOptions {
  engineLabel: string;
  depth: number;
  sets: readonly AuditSet[];
  limit: number;
  nodeLimit: number;
  ladder: readonly number[];
  checks: { agreement: boolean; tt: boolean; kpos: boolean; switches: boolean };
  outDir: string;
}

export interface AuditArtifact {
  stamp: string;
  engine: string;
  weightsLabel: string;
  weightsVersion: number;
  evalFix: string;
  ttBitsMacro: number;
  refDepth: number;
  nodeLimit: number;
  ladder: readonly number[];
  positions: number;
  rows: ComparisonRow[];
  counts: Record<string, number>;
  /** The agreement counts the report leads with, derived from `rows` so the
   * numbers in `E4.2-SEARCH-AUDIT.md` can be recomputed from the artifact. */
  summary: AuditSummary;
  ttFindings: TTFinding[];
  ttFindingCounts: Record<string, number>;
  ttStores: number;
  ttProbes: number;
  kpos: { positionId: string; rows: KposProbeRow[] }[];
  /** `Kpos` values reached by two materially different positions inside one
   * reference tree. */
  collisions: { positionId: string; key: string; digests: string[] }[];
}

export interface AuditSummary {
  positions: number;
  /** Rows whose production answer came from the node search. */
  searched: number;
  /** Rows the must-answer layer or the book answered before deepening. */
  mustAnswer: number;
  /** Of the must-answer rows, how many chose a turn in the reference's optimal
   * set AND scored what the reference scored. */
  mustAnswerAgree: number;
  /** Rows where production's principal turn is in the reference's optimal set,
   * over the rows where both sides produced one. */
  turnAgree: number;
  turnDisagree: number;
  /** The score production published AT the reference depth, against the two
   * reference values. */
  scoreEqualsQuiesce: number;
  scoreEqualsStatic: number;
  scoreInBounds: number;
  scoreOutOfBounds: number;
  /** Rows with no score at the reference depth at all (the must-answer rows). */
  scoreUnavailable: number;
  /** Root iterations that ended with `SearchContext.truncated` set, summed over
   * every matched production run. */
  truncatedIterations: number;
  /** Values published to the table after a truncation. DESIGN §5.11.6 says this
   * must be 0. */
  storesWhileTruncated: number;
  referenceNodes: number;
  intractable: number;
}

function summarise(rows: readonly ComparisonRow[], storesWhileTruncated: number): AuditSummary {
  const out: AuditSummary = {
    positions: rows.length,
    searched: 0,
    mustAnswer: 0,
    mustAnswerAgree: 0,
    turnAgree: 0,
    turnDisagree: 0,
    scoreEqualsQuiesce: 0,
    scoreEqualsStatic: 0,
    scoreInBounds: 0,
    scoreOutOfBounds: 0,
    scoreUnavailable: 0,
    truncatedIterations: 0,
    storesWhileTruncated,
    referenceNodes: 0,
    intractable: 0,
  };
  for (const r of rows) {
    out.referenceNodes += r.refNodes;
    out.truncatedIterations += r.prodTruncatedIterations ?? 0;
    if (r.intractable) out.intractable++;
    if (r.classification === 'must-answer') {
      out.mustAnswer++;
      if (r.turnAgrees === true && r.scoreEqualsQuiesce === true) out.mustAnswerAgree++;
    } else if (r.prodDepth !== null) {
      out.searched++;
    }
    if (r.turnAgrees === true) out.turnAgree++;
    else if (r.turnAgrees === false) out.turnDisagree++;
    if (r.classification === 'must-answer' || r.prodScoreAtRefDepthCc === null) {
      if (r.classification === 'must-answer') out.scoreUnavailable++;
    }
    const at = r.prodScoreAtRefDepthCc;
    if (at !== null) {
      if (at === r.refQuiesceCc) out.scoreEqualsQuiesce++;
      if (at === r.refStaticCc) out.scoreEqualsStatic++;
      if (r.scoreInBounds === true) out.scoreInBounds++;
      else out.scoreOutOfBounds++;
    }
  }
  return out;
}

export async function runAudit(opts: AuditRunOptions): Promise<AuditArtifact> {
  const patch = hardEnginePatch(opts.engineLabel);
  const weights = patch.weights;
  if (weights === undefined || weights.version === 0) {
    throw new Error(`reference: hard@${opts.engineLabel} resolved to the placeholder weight vector`);
  }
  const positions = loadAuditPositions(opts.sets, opts.limit);
  const rows: ComparisonRow[] = [];
  const ttFindings: TTFinding[] = [];
  const kpos: { positionId: string; rows: KposProbeRow[] }[] = [];
  const collisions: { positionId: string; key: string; digests: string[] }[] = [];
  let ttStores = 0;
  let ttProbes = 0;
  let ttBitsMacro = 0;

  for (const pos of positions) {
    applyRules(pos.rules);
    const engine = new HardEngine(patch);
    assertWeights(engine);
    ttBitsMacro = engine.config.ttBitsMacro;

    const state = pos.state;
    const row: ComparisonRow = {
      id: pos.id,
      set: pos.set,
      source: pos.source,
      side: sideName(state),
      turn: state.turn.turnNumber,
      phase: state.turn.phase,
      upkeepPending: state.upkeepPending === true,
      clock: state.inactivityPlies ?? 0,
      refDepth: opts.depth,
      refStaticCc: null,
      refQuiesceCc: null,
      refNodes: 0,
      refCandidates: 0,
      refOptimal: [],
      refOptimalCount: 0,
      intractable: false,
      prodWork: null,
      prodDepth: null,
      prodScoreCc: null,
      prodEndKey: null,
      prodSource: null,
      prodStopReason: null,
      prodTtHits: null,
      prodIterations: null,
      prodCompletedIterations: null,
      prodTruncatedIterations: null,
      prodCandidateSource: null,
      prodDepthScores: [],
      prodScoreAtRefDepthCc: null,
      turnAgrees: null,
      scoreInBounds: null,
      scoreEqualsQuiesce: null,
      classification: 'agree',
      switches: null,
      note: '',
    };

    if (opts.checks.agreement) {
      const refStatic = referenceSearch(engine, state, {
        depth: opts.depth,
        quiesceLeaves: false,
        nodeLimit: opts.nodeLimit,
        census: true,
      });
      const refQ = referenceSearch(engine, state, {
        depth: opts.depth,
        quiesceLeaves: true,
        nodeLimit: opts.nodeLimit,
        census: false,
      });
      row.refStaticCc = refStatic.scoreCc;
      row.refQuiesceCc = refQ.scoreCc;
      row.refNodes = refStatic.nodes + refQ.nodes;
      row.refCandidates = refStatic.candidates.length;
      row.refOptimal = refQ.optimal.slice(0, 8);
      row.refOptimalCount = refQ.optimal.length;
      row.intractable = refStatic.intractable || refQ.intractable;

      for (const [key, digests] of refStatic.keyDigests) {
        if (digests.size > 1) collisions.push({ positionId: pos.id, key, digests: [...digests] });
      }

      const prod = await productionAtDepth(engine, state, opts.depth, opts.ladder);
      if (prod === null) {
        row.classification = 'depth-mismatch';
        row.note = 'no rung of the ladder produced a completed depth';
      } else {
        row.prodWork = prod.work;
        row.prodDepth = prod.result.depth;
        row.prodScoreCc = prod.result.scoreCc;
        row.prodEndKey = prod.result.endKey;
        row.prodSource = prod.result.source;
        row.prodStopReason = prod.result.stats.stopReason;
        row.prodTtHits = prod.result.stats.ttHits;
        const trace = prod.result.rootTrace ?? [];
        row.prodIterations = trace.length;
        row.prodCompletedIterations = trace.filter(t => t.completed).length;
        row.prodTruncatedIterations = trace.filter(t => t.truncated).length;
        row.prodCandidateSource = prod.result.candidateSource ?? null;
        row.prodDepthScores = prod.depthScores;
        const atRef = prod.depthScores.find(d => d.depth === opts.depth);
        row.prodScoreAtRefDepthCc = atRef === undefined ? null : atRef.scoreCc;
        // The score compared against the reference is the one production
        // published AT the reference depth; on a matched row that is the final
        // score, and on an overshooting row it is the iteration the reference
        // corresponds to.
        const compareCc = row.prodScoreAtRefDepthCc ?? prod.result.scoreCc;
        const lo = Math.min(refStatic.scoreCc, refQ.scoreCc);
        const hi = Math.max(refStatic.scoreCc, refQ.scoreCc);
        row.scoreInBounds = compareCc >= lo && compareCc <= hi;
        row.scoreEqualsQuiesce = compareCc === refQ.scoreCc;
        row.turnAgrees = refQ.optimal.includes(prod.result.endKey);
        const refGenerated = refQ.candidates.some(c => c.endKey === prod.result.endKey);
        const mateLike =
          Math.abs(compareCc) >= MATE_LIKE_CC ||
          Math.abs(refQ.scoreCc) >= MATE_LIKE_CC ||
          Math.abs(refStatic.scoreCc) >= MATE_LIKE_CC;
        if (!prod.matched) row.note = `no rung completed depth ${opts.depth}; deepest completed depth ${prod.result.depth}`;
        row.classification = classify(
          row,
          prod.result.stats.ttHits,
          mateLike,
          refGenerated,
          row.prodTruncatedIterations ?? 0,
        );
      }
    }

    const abWork = row.prodWork ?? opts.ladder[opts.ladder.length - 1];

    if (opts.checks.switches) {
      engine.setQuiesceCap(false);
      const capOff = await engine.searchTurn(state, { work: abWork });
      engine.setQuiesceCap(true);
      engine.setUseTT(false);
      const ttOff = await engine.searchTurn(state, { work: abWork });
      engine.setUseTT(true);
      row.switches = {
        quiesceCapOffEndKey: capOff.endKey,
        quiesceCapOffScoreCc: capOff.scoreCc,
        quiesceCapOffDepth: capOff.depth,
        ttOffEndKey: ttOff.endKey,
        ttOffScoreCc: ttOff.scoreCc,
        ttOffDepth: ttOff.depth,
      };
    }

    if (opts.checks.tt) {
      const rec = new RecordingTT(engine.config.ttBitsMacro);
      rec.ctx = engine.ctx;
      engine.ctx.tt = rec;
      await engine.searchTurn(state, { work: abWork });
      ttStores += rec.stores.length;
      ttProbes += rec.probeLog.length;
      for (const f of auditStoreLog(rec, engine.config.ttBitsMacro)) {
        ttFindings.push({ ...f, detail: `${pos.id} (${row.side} t${row.turn}): ${f.detail}` });
      }
      engine.ctx.tt = new TranspositionTable(engine.config.ttBitsMacro);
    }

    if (opts.checks.kpos && kpos.length < 4) {
      kpos.push({ positionId: pos.id, rows: kposSensitivity(engine, state) });
    }

    rows.push(row);
  }
  applyRules(DEFAULT_RULES);

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.classification] = (counts[r.classification] ?? 0) + 1;
  const ttFindingCounts: Record<string, number> = {};
  for (const f of ttFindings) ttFindingCounts[f.kind] = (ttFindingCounts[f.kind] ?? 0) + 1;

  return {
    stamp: new Date().toISOString(),
    engine: `hard@${opts.engineLabel}`,
    weightsLabel: weights.label,
    weightsVersion: weights.version,
    evalFix: patch.evalFix === undefined ? 'absent' : JSON.stringify(patch.evalFix),
    ttBitsMacro,
    refDepth: opts.depth,
    nodeLimit: opts.nodeLimit,
    ladder: opts.ladder,
    positions: rows.length,
    rows,
    counts,
    summary: summarise(rows, ttFindingCounts['store-while-truncated'] ?? 0),
    ttFindings,
    ttFindingCounts,
    ttStores,
    ttProbes,
    kpos,
    collisions,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv: readonly string[]): AuditRunOptions {
  const opts: AuditRunOptions = {
    engineLabel: 'desktop',
    depth: 2,
    sets: [...AUDIT_SETS],
    limit: 6,
    nodeLimit: DEFAULT_NODE_LIMIT,
    ladder: DEFAULT_WORK_LADDER,
    checks: { agreement: true, tt: true, kpos: true, switches: true },
    outDir: DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i + 1];
    switch (argv[i]) {
      case '--engine': opts.engineLabel = (v ?? '').replace(/^hard@/, ''); i++; break;
      case '--depth': opts.depth = Number(v); i++; break;
      case '--sets': opts.sets = (v ?? '').split(',').filter(x => x.length > 0) as AuditSet[]; i++; break;
      case '--limit': opts.limit = Number(v); i++; break;
      case '--node-limit': opts.nodeLimit = Number(v); i++; break;
      case '--work': opts.ladder = (v ?? '').split(',').map(Number).filter(x => x > 0); i++; break;
      case '--checks': {
        const on = new Set((v ?? '').split(','));
        opts.checks = {
          agreement: on.has('agreement'),
          tt: on.has('tt'),
          kpos: on.has('kpos'),
          switches: on.has('switches'),
        };
        i++;
        break;
      }
      case '--out': opts.outDir = path.resolve(v ?? DEFAULT_OUT); i++; break;
      default: throw new Error(`reference: unknown argument ${argv[i]}`);
    }
  }
  for (const s of opts.sets) {
    if (!AUDIT_SETS.includes(s)) throw new Error(`reference: unknown set "${s}" (known: ${AUDIT_SETS.join(', ')})`);
  }
  if (!Number.isInteger(opts.depth) || opts.depth < 1) throw new RangeError(`reference: bad --depth ${opts.depth}`);
  if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new RangeError(`reference: bad --limit ${opts.limit}`);
  if (opts.ladder.length === 0) throw new RangeError('reference: --work left no rungs');
  return opts;
}

/** `newTTEntry` is re-exported so a test can build a probe target without
 * reaching into `src/ai/hard/search/tt.ts` itself. */
export { newTTEntry };

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const artifact = await runAudit(opts);
  fs.mkdirSync(opts.outDir, { recursive: true });
  const tag = opts.sets.length === AUDIT_SETS.length ? 'all' : opts.sets.join('_');
  const file = path.join(opts.outDir, `reference-d${opts.depth}-${opts.engineLabel}-${tag}.json`);
  fs.writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`);
  const lines = [
    `reference: ${artifact.engine} (${artifact.weightsLabel}, evalFix ${artifact.evalFix}) depth ${artifact.refDepth}, ${artifact.positions} positions`,
    `agreement: ${Object.entries(artifact.counts).map(([k, n]) => `${k} ${n}`).join(', ')}`,
    `turns: ${artifact.summary.turnAgree} agree, ${artifact.summary.turnDisagree} disagree; scores at depth ${artifact.refDepth}: ${artifact.summary.scoreEqualsQuiesce} = refQuiesce, ${artifact.summary.scoreEqualsStatic} = refStatic, ${artifact.summary.scoreOutOfBounds} outside both`,
    `truncation: ${artifact.summary.truncatedIterations} truncated root iterations, ${artifact.summary.storesWhileTruncated} stores while truncated`,
    `tt: ${artifact.ttStores} stores, ${artifact.ttProbes} probes, findings ${JSON.stringify(artifact.ttFindingCounts)}`,
    `kpos collisions inside the reference trees: ${artifact.collisions.length}`,
    `wrote ${path.relative(REPO_ROOT, file)}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(HERE, 'reference.ts');
if (invokedDirectly) {
  await main();
}
