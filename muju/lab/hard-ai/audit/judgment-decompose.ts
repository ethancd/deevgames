/**
 * E3.1 lane 7 — the authored-judgment decomposer
 * (`docs/hard-ai/e3/E3.1-JUDGMENT-CASES.md`, `docs/hard-ai/e3/E3-PLAN.md` lane 7).
 *
 * Usage (no package.json line is owned by this lane; see
 * `docs/hard-ai/e3/amendments/lane7.md` for the proposed one):
 *
 *   node --import tsx lab/hard-ai/audit/judgment-decompose.ts \
 *     --exam lab/results/hard-ai-e3/judgment/exam-desktop.json \
 *     --suite lab/results/hard-ai-e3/judgment/suite-desktop.json \
 *     --work 25000 --out lab/results/hard-ai-e3/judgment
 *
 * WHAT IT DOES, and what each number is decided by.
 *
 *   EXAM JUDGMENT CASES. For every `kind: 'judgment'` case of a stratum it
 *   re-runs the champion with `expose: true` (E2 lane 1's root instrument,
 *   `docs/hard-ai/e2/E2-LANE1-ROOT-EXPOSURE.md`), enumerates EVERY legal turn
 *   from the root with `exam/witness.ts enumerateTurnEnds` — the canonical
 *   rules, not the engine — and reconstructs two end states: the one the case
 *   prefers and the one the champion chose. Both are decomposed per feature and
 *   per `eval-groups.ts` group with lane 4's `eval-audit.ts measure`.
 *
 *   INVARIANT PAIRS. `suites/invariants.suite.json`'s twenty pairs are two
 *   authored post-turn positions with no common root (`suites/run.ts`'s header
 *   says so at length), so there is nothing to search from and nothing to
 *   enumerate: the comparison is static by construction. Each member is
 *   decomposed the same way and the per-feature delta names the term that
 *   decides the pair.
 *
 *   ECONOMY ROWS. `suites/economy.suite.json`'s thirty rows are re-examined
 *   canonically: `checkVictory` on the root, the number of legal turn ends, how
 *   many of those ends are `phase: 'victory'`, and whether the row's `best` key
 *   is among them. That reproduces E1.2-EXAM-SET.md §1.2(a) from the rules
 *   rather than from that document.
 *
 * POINT OF VIEW. Every contribution printed here is in the MOVER's view — the
 * side whose turn produced the end position, or `side` on an invariant row.
 * `Evaluator.full(p, side)` and `extract` write `f(me) − f(them)`, so the
 * mover's vector is the negation of the vector from the side to move in the end
 * position. That negation is only sound if the features really are
 * antisymmetric under a side swap, so this tool does not assume it: it reads
 * lane 4's `sideSwapBad` on every position it measures and refuses to report a
 * position that violates it (lane 4 measured 0 violations over 2,151
 * positions, `lab/results/hard-ai-e3/eval-audit/<corpus>/violations.json`).
 *
 * WEIGHTS. No engine is constructed except through `hardEnginePatch`
 * (`lab/hard-ai/bots/hard.ts`), and the static half asserts
 * `DEFAULT_WEIGHTS.version !== 0` through lane 4's `newCtx()`. This is E0's I2
 * lesson in the form E3-PLAN.md states it. The same check is why this tool
 * re-scores the invariant pairs' SEARCHED reading itself: `suites/run.ts:412`
 * builds its engine from `hardConfigFor`, whose `weights` field is present and
 * version 0, so `HardEngine`'s substitution at `engine.ts:221` does not fire
 * (it requires `cfg.weights === undefined`). See lane 7's amendments file.
 *
 * NOTHING IS REPAIRED. No case, suite or position file is written. A
 * disagreement between a fixture and the canonical rules is recorded with both
 * sources, per E3-PLAN.md's rules section.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameState, PlayerId } from '../../../src/game/types';
import { checkVictory } from '../../../src/game/victory';
import { isLegalAction } from '../../../src/game/legality';
import { generateAllActions } from '../../../src/ai/moves';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { Replica, allocState } from '../../../src/ai/hard/core/state';
import { kposHex } from '../../../src/ai/hard/verify/perft';
import { setCombatHandicap, resetCombatHandicap } from '../../../src/game/combat';
import { setElementGraph } from '../../../src/game/elements';
import { setUpkeepVariant } from '../../../src/game/upkeep';
import { HardEngine } from '../../../src/ai/hard/engine';
import type { HardConfig } from '../../../src/ai/hard/config';
import type { RootResult, RootCandidate } from '../../../src/ai/hard/search/root';
import { FEATURE_NAMES, FEATURE_COUNT } from '../../../src/ai/hard/eval/features';
import { INVARIANT_COUNT, invariantBits } from '../../../src/ai/hard/eval/invariants';
import { Scratch } from '../../../src/ai/hard/core/bits';
import { TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, allocTables, buildTables } from '../../../src/ai/hard/tables/context';
import { DEFAULT_WEIGHTS, weightsHash } from '../../../src/ai/hard/eval/weights';
import { hardConfigFor, hardEnginePatch } from '../bots/hard';
import { resolvedConfigHash } from '../ladder/identity';
import { acquireHeavySlot } from '../ladder/heavy';
import {
  CASES_DIR,
  installExamRules,
  loadCaseState,
  loadStratum,
  normalizeKey,
  restoreShippedRules,
  type ExamCase,
  type ExamStratum,
} from '../exam/format';
import { deadPosition, enumerateTurnEnds } from '../exam/witness';
import { readSuite, resolvePositionRef, normalizeKey as normalizeSuiteKey } from '../suites/format';
import { readPositions, findPosition, type RulesBlock } from '../positions/corpus';
import { withOpeningRules } from '../ladder/openings';
import { newCtx, measure, type Ctx, type PositionRecord } from './eval-audit';
import { EVAL_GROUP_NAMES, GROUP_OF, type EvalGroup } from './eval-groups';
import type { AuditItem } from './eval-corpus';

const HERE = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(HERE, '../../..');
const SUITES_DIR = path.resolve(HERE, '../suites');
const POSITIONS_DIR = path.resolve(HERE, '../positions');

/** `exam/run.ts`'s default; the reading E2's "Verification state" quotes. */
export const DEFAULT_WORK = 25_000;
/** `witness.ts DEFAULT_ENUM_BUDGET`; an exhausted budget is reported, never hidden. */
export const ENUM_BUDGET = 3_000_000;
/** `suites/run.ts DEAD_CALL_BUDGET`'s order of magnitude; the proof is quadratic. */
export const DEAD_BUDGET = 3_000_000;
/** Past this many end positions the quadratic dead-position proof is skipped. */
export const DEAD_MAX_ENDS = 400;

// ---------------------------------------------------------------------------
// Shared decomposition
// ---------------------------------------------------------------------------

/** One end position decomposed from the MOVER's point of view. */
export interface Decomposed {
  /** `Kpos` hex, or `null` for an invariant member (authored, not reached). */
  key: string | null;
  /** Total cc from the mover's view. */
  scoreCc: number;
  /** `w[i]·f[i]` from the mover's view, 58 entries. */
  c: number[];
  /** The raw feature from the mover's view, 58 entries. */
  f: number[];
  groupSums: Record<EvalGroup, number>;
  /** `full(p, mover) + full(p, other)`; 0 when the evaluation is antisymmetric. */
  antisymmetryResidualCc: number;
  phase: string;
  winner: string | null;
}

function flipRecord(rec: PositionRecord, moverIsSideToMove: boolean): Decomposed {
  if (rec.sideSwapBad.length > 0) {
    throw new Error(
      `judgment-decompose: ${rec.id} breaks side-swap antisymmetry on features ` +
        `${rec.sideSwapBad.map(i => FEATURE_NAMES[i]).join(', ')}; the mover's view cannot be taken by negation`,
    );
  }
  const s = moverIsSideToMove ? 1 : -1;
  const c = new Array<number>(FEATURE_COUNT);
  const f = new Array<number>(FEATURE_COUNT);
  for (let i = 0; i < FEATURE_COUNT; i++) {
    c[i] = s * rec.c[i];
    f[i] = s * rec.f[i];
  }
  const groupSums = {} as Record<EvalGroup, number>;
  for (const g of EVAL_GROUP_NAMES) groupSums[g] = s * rec.groupSums[g];
  return {
    key: null,
    scoreCc: moverIsSideToMove ? rec.score : rec.scoreOther,
    c,
    f,
    groupSums,
    antisymmetryResidualCc: rec.score + rec.scoreOther,
    phase: '',
    winner: null,
  };
}

function itemFor(id: string, source: string, rules: RulesBlock, state: GameState): AuditItem {
  return { id, source, kind: 'position', bucket: 'corpus', rules, state, tags: [] };
}

/**
 * Decomposes `state` from `mover`'s point of view. `state` is an END position,
 * so the side to move in it is normally the OPPONENT; a turn that ended the
 * game leaves `phase: 'victory'` and the packed side is whatever the game left.
 * The packed side is read back from lane 4's record rather than assumed.
 */
function decompose(ctx: Ctx, id: string, source: string, rules: RulesBlock, state: GameState, mover: PlayerId): Decomposed {
  const rec = measure(ctx, itemFor(id, source, rules, state));
  const moverSide = mover === 'white' ? 0 : 1;
  const out = flipRecord(rec, rec.side === moverSide);
  out.phase = state.phase;
  out.winner = state.winner ?? null;
  return out;
}

export interface TermDelta {
  index: number;
  name: string;
  group: EvalGroup;
  /** `c_expected[i] − c_chosen[i]` in cc, mover's view; > 0 favours the expected turn. */
  deltaCc: number;
  expectedCc: number;
  chosenCc: number;
  expectedF: number;
  chosenF: number;
}

export function termDeltas(expected: Decomposed, chosen: Decomposed): TermDelta[] {
  const out: TermDelta[] = [];
  for (let i = 0; i < FEATURE_COUNT; i++) {
    const d = expected.c[i] - chosen.c[i];
    if (d === 0 && expected.f[i] === 0 && chosen.f[i] === 0) continue;
    out.push({
      index: i,
      name: FEATURE_NAMES[i],
      group: GROUP_OF[i],
      deltaCc: d,
      expectedCc: expected.c[i],
      chosenCc: chosen.c[i],
      expectedF: expected.f[i],
      chosenF: chosen.f[i],
    });
  }
  out.sort((a, b) => Math.abs(b.deltaCc) - Math.abs(a.deltaCc));
  return out;
}

// ---------------------------------------------------------------------------
// Exam judgment cases
// ---------------------------------------------------------------------------

export type Label =
  | 'contradictory-preference'
  | 'weight-scale'
  | 'engine-bug'
  | 'search-not-eval'
  /** Lane 7 extension, proposed in `docs/hard-ai/e3/amendments/lane7.md`: the
   * two end positions have IDENTICAL 58-feature vectors, so no weight vector
   * separates them and the champion's answer is a move-ordering tie-break.
   * That is neither a scale question nor a search question. */
  | 'eval-blind'
  /** Lane 7 extension: the canonical enumeration could not reach one of the two
   * end positions inside its budget, so nothing is claimed about this row. */
  | 'unresolved'
  | 'matched';

export interface ExamJudgmentRow {
  id: string;
  demand: string;
  by: 'adviser' | 'author';
  sideToMove: PlayerId;
  classification: string | null;
  swingCc: number | null;
  adviserWork: number | null;
  reason: string;
  /** From the fresh `expose` run, which must reproduce the exam artifact. */
  chosenKey: string | null;
  expectedKeys: string[];
  avoidKeys: string[];
  /**
   * The preferred key this row decomposes. When the case names more than one
   * (the authored `home-mate` rows name 16 to 85), it is the reachable
   * preferred key with the HIGHEST static score from the mover's view — the
   * best turn the author's preference allows, which is the comparison most
   * favourable to the fixture.
   */
  expectedKeyUsed: string | null;
  /** How many of the case's preferred keys the enumeration reached. */
  expectedKeysReached: number;
  matched: boolean;
  /** Canonical: the champion's own turn, replayed, ends the game in its favour. */
  chosenWinsOutright: boolean;
  /** Canonical: at least one reached preferred key wins for the mover. */
  expectedWinsOutright: boolean | null;
  /** Canonical: the champion's chosen end key is listed in `avoidKeys`. */
  chosenInAvoid: boolean;
  /**
   * Canonical (`witness.ts deadPosition`): every legal turn from the root hands
   * the opponent a win on the spot. `null` when the proof was not attempted or
   * ran out of calls.
   */
  deadPosition: boolean | null;
  enumComplete: boolean;
  enumEnds: number;
  /** Static (stage-2 `full`) score of each end position, mover's view. */
  staticExpectedCc: number | null;
  staticChosenCc: number | null;
  /** `staticExpectedCc − staticChosenCc`; > 0 means the STATIC eval prefers the expected turn. */
  staticGapCc: number | null;
  /** Every one of the 58 per-feature deltas is 0. */
  identicalFeatureVector: boolean | null;
  /** The root's searched score for each candidate, when the root searched it. */
  searchedExpectedCc: number | null;
  searchedChosenCc: number | null;
  expectedSearched: boolean | null;
  expectedInCandidateList: boolean | null;
  candidateSource: string | null;
  candidates: number;
  depth: number;
  work: number;
  label: Label;
  labelWhy: string;
  /** The named term: the largest |delta| that opposes the expected turn, or the largest overall. */
  namedTerm: string | null;
  topTerms: TermDelta[];
  groupDeltaCc: Record<EvalGroup, number> | null;
}

/**
 * `witness.ts enumerateTurnEnds` with an early exit. A copy, not an import,
 * because `witness.ts` is not this lane's file and its function has no way to
 * stop once the keys a caller wants have been reached; everything else here —
 * the `Kturn` transposition set, the `done` test, the budget meter — is the
 * same code, so the key set it returns is the same key set for the same budget.
 * Stopping early is sound for the two keys this tool looks up and says nothing
 * about the keys it never visited, which is what `complete` records.
 */
export interface TargetedEnds {
  ends: Map<string, GameState>;
  complete: boolean;
  calls: number;
  /** Every wanted key was reached, so the two look-ups below are answered. */
  foundAll: boolean;
}

export function enumerateUntil(root: GameState, wanted: ReadonlySet<string>, budget: number): TargetedEnds {
  const out = new Map<string, GameState>();
  const seen = new Set<string>();
  const rootPlayer = root.turn.currentPlayer;
  const rootTurnNumber = root.turn.turnNumber;
  let left = budget;
  let calls = 0;
  let overflow = false;
  let hits = 0;
  const rep = new Replica();
  const scratch = allocState();

  const visit = (state: GameState): void => {
    if (overflow || hits >= wanted.size) return;
    if (left <= 0) {
      overflow = true;
      return;
    }
    left--;
    calls++;
    const p = rep.pack(state, scratch);
    const turnKey = `${(p.kturnHi >>> 0).toString(16)}:${(p.kturnLo >>> 0).toString(16)}`;
    if (seen.has(turnKey)) return;
    seen.add(turnKey);
    for (const action of generateAllActions(state, state.turn.currentPlayer)) {
      if (overflow || hits >= wanted.size) return;
      const next = applyAction(state, action);
      if (next === state) continue;
      const done = next.phase !== 'playing' || next.turn.currentPlayer !== rootPlayer || next.turn.turnNumber !== rootTurnNumber;
      if (!done) {
        visit(next);
        continue;
      }
      const key = kposHex(rep.pack(next, scratch));
      if (!out.has(key)) {
        out.set(key, next);
        if (wanted.has(key)) hits++;
      }
    }
  };

  visit(root);
  return { ends: out, complete: !overflow, calls, foundAll: hits >= wanted.size };
}

/** The end position the engine's own actions reach, replayed canonically. */
function replayChosen(root: GameState, actions: readonly AIAction[]): GameState | null {
  let cur = root;
  for (const a of actions) {
    if (!isLegalAction(cur, a, cur.turn.currentPlayer)) return null;
    const next = applyAction(cur, a);
    if (next === cur) return null;
    cur = next;
  }
  return cur;
}

async function examRow(ctx: Ctx, c: ExamCase, work: number, topN: number, enumBudget: number, deadMaxEnds: number): Promise<ExamJudgmentRow> {
  if (c.witness.label !== 'judgment') throw new Error(`${c.id}: not a judgment case`);
  const w = c.witness;
  const state = loadCaseState(c);
  const mover = c.sideToMove;

  installExamRules(c);
  let result: RootResult;
  let enumerated: TargetedEnds;
  let chosenEnd: GameState | null = null;
  let dead: boolean | null = null;
  try {
    result = await new HardEngine(hardEnginePatch(PROFILE)).searchTurn(state, { work, expose: true });
    chosenEnd = result.actions.length === 0 ? null : replayChosen(state, result.actions);
    const wanted = new Set<string>(w.preferredKeys);
    enumerated = enumerateUntil(state, wanted, enumBudget);
    if (enumerated.complete && enumerated.ends.size <= deadMaxEnds) dead = deadPosition(state, DEAD_BUDGET);
  } finally {
    restoreShippedRules();
  }

  const ends = enumerated.ends;
  const chosenKey = result.endKey === '' ? null : normalizeKey(result.endKey, `${c.id}: engine end key`);
  const candidates: RootCandidate[] = result.candidates ?? [];
  const byKey = new Map(candidates.map(k => [k.endKey, k]));
  const chosenCand = chosenKey === null ? undefined : byKey.get(chosenKey);

  const chosen = chosenEnd === null ? null : decompose(ctx, `${c.id}#chosen`, c.id, c.rules, chosenEnd, mover);

  // The best turn the fixture's preference allows, by the champion's own static
  // score. Comparing against an arbitrary member of an 85-key set would make
  // the fixture look worse than it is.
  const reached = w.preferredKeys.filter(k => ends.has(k));
  let expectedKeyUsed: string | null = null;
  let expected: Decomposed | null = null;
  for (const k of reached) {
    const d = decompose(ctx, `${c.id}#preferred:${k}`, c.id, c.rules, ends.get(k) as GameState, mover);
    if (expected === null || d.scoreCc > expected.scoreCc) {
      expected = d;
      expectedKeyUsed = k;
    }
  }
  const expectedCand = expectedKeyUsed === null ? undefined : byKey.get(expectedKeyUsed);

  const matched = chosenKey !== null && w.preferredKeys.includes(chosenKey) && !w.avoidKeys.includes(chosenKey);
  const chosenWins = chosenEnd !== null && chosenEnd.phase === 'victory' && chosenEnd.winner === mover;
  const expectedWins = reached.length === 0 ? null : reached.some(k => {
    const e = ends.get(k) as GameState;
    return e.phase === 'victory' && e.winner === mover;
  });

  const deltas = expected !== null && chosen !== null ? termDeltas(expected, chosen) : [];
  const groupDelta =
    expected !== null && chosen !== null
      ? (Object.fromEntries(EVAL_GROUP_NAMES.map(g => [g, expected.groupSums[g] - chosen.groupSums[g]])) as Record<EvalGroup, number>)
      : null;
  const staticGap = expected !== null && chosen !== null ? expected.scoreCc - chosen.scoreCc : null;
  const identical = expected !== null && chosen !== null ? deltas.every(d => d.deltaCc === 0) : null;
  const searchedExpected = expectedCand?.scoreCc ?? null;
  const searchedChosen = chosenCand?.scoreCc ?? null;

  // The label ladder. Each arm names the judge it used; the canonical judges
  // (4) come first, because a rules fact outranks any score comparison.
  let label: Label;
  let why: string;
  if (matched) {
    label = 'matched';
    why = 'the champion chose a preferred key';
  } else if (chosenWins) {
    label = 'contradictory-preference';
    why =
      "judge 4 (canonical fact): the champion's own turn, replayed through `src/game`, ends the game with " +
      `${mover} as winner, and the case ` +
      (chosenKey !== null && w.avoidKeys.includes(chosenKey) ? 'lists that end key in `avoidKeys`' : 'does not list it among `preferredKeys`') +
      '. A case cannot ask an engine to decline winning; `exam/run.ts` applies exactly this adjudication to EXACT cases (`run.ts` `row.passed = (inWitness && !inAvoid) || won`) and not to judgment ones (`row.matched = preferred && !avoided`).';
  } else if (dead === true) {
    label = 'contradictory-preference';
    why =
      'judge 4 (canonical fact): `witness.ts deadPosition` proves every legal turn from this root hands the opponent a win on the spot, ' +
      'so no turn is better than another and the preference is scoring noise. `suites/run.ts` demotes such a suite row to a coverage row and ' +
      '`exam/seed.ts` drops such an EXACT candidate; neither rule reaches a judgment carry (`seed.ts:226`, before the dead check at `seed.ts:288`).';
  } else if (expected === null || chosen === null) {
    label = 'unresolved';
    why = `the canonical enumeration reached ${reached.length}/${w.preferredKeys.length} preferred keys in ${enumerated.calls} calls (complete: ${enumerated.complete}); nothing is claimed about this row`;
  } else if (identical === true) {
    label = 'eval-blind';
    why =
      'all 58 features take the same value in both end positions, so the static evaluation is identical ' +
      `(${expected.scoreCc} cc) and no weight vector separates them; the champion's answer here is a move-ordering tie-break`;
  } else if (staticGap !== null && staticGap > 0) {
    label = 'search-not-eval';
    why = `the static stage-2 evaluation prefers the expected end position by ${staticGap} cc and the search still returned the other turn`;
  } else {
    const top = deltas.filter(d => d.deltaCc < 0)[0] ?? deltas[0];
    label = 'weight-scale';
    why =
      `the static evaluation prefers the champion's end position by ${-(staticGap ?? 0)} cc; the largest term opposing the expected turn is ` +
      (top === undefined ? 'none' : `\`${top.name}\` (${top.group}) at ${top.deltaCc} cc`);
  }
  const opposing = deltas.filter(d => d.deltaCc < 0);
  const namedTerm = opposing.length > 0 ? opposing[0].name : deltas.length > 0 ? deltas[0].name : null;

  return {
    id: c.id,
    demand: c.demand,
    by: w.by,
    sideToMove: mover,
    classification: w.classification ?? null,
    swingCc: w.swingCc ?? null,
    adviserWork: w.adviserWork ?? null,
    reason: w.reason,
    chosenKey,
    expectedKeys: [...w.preferredKeys],
    avoidKeys: [...w.avoidKeys],
    expectedKeyUsed,
    expectedKeysReached: reached.length,
    matched,
    chosenWinsOutright: chosenWins,
    expectedWinsOutright: expectedWins,
    chosenInAvoid: chosenKey !== null && w.avoidKeys.includes(chosenKey),
    deadPosition: dead,
    enumComplete: enumerated.complete,
    enumEnds: ends.size,
    staticExpectedCc: expected?.scoreCc ?? null,
    staticChosenCc: chosen?.scoreCc ?? null,
    staticGapCc: staticGap,
    identicalFeatureVector: identical,
    searchedExpectedCc: searchedExpected,
    searchedChosenCc: searchedChosen,
    expectedSearched: expectedCand?.searched ?? null,
    expectedInCandidateList: expectedKeyUsed === null ? null : byKey.has(expectedKeyUsed),
    candidateSource: result.candidateSource ?? null,
    candidates: candidates.length,
    depth: result.depth,
    work: result.work,
    label,
    labelWhy: why,
    namedTerm,
    topTerms: deltas.slice(0, topN),
    groupDeltaCc: groupDelta,
  };
}

// ---------------------------------------------------------------------------
// Invariant pairs
// ---------------------------------------------------------------------------

export interface InvariantRow {
  id: string;
  invariant: number;
  side: PlayerId;
  rationale: string;
  /** The invariant's own penalty feature, by name and weight. */
  penaltyFeature: string | null;
  penaltyWeight: number | null;
  /** The budget each member was searched at: the suite case's own `budget.work`. */
  searchWork: number;
  /** `full(correct) − full(violating)` from the moving side; > 0 passes the EVAL reading. */
  evalGapCc: number;
  evalPass: boolean;
  /** Same comparison, searched, with DEFAULT_WEIGHTS (see the header's WEIGHTS note). */
  searchGapCcDefaultWeights: number;
  searchPassDefaultWeights: boolean;
  /** Same comparison, searched, the way `hard:suite` builds its engine today. */
  searchGapCcPlaceholderWeights: number;
  searchPassPlaceholderWeights: boolean;
  /** Did the invariant's own penalty feature fire at all, and on which member? */
  penaltyFiredViolating: number | null;
  penaltyFiredCorrect: number | null;
  penaltyDeltaCc: number | null;
  /** The invariant's own penalty feature reads 0 on BOTH members: the pair
   * cannot be decided by the feature it exists to exercise. */
  penaltyNeverFires: boolean | null;
  /**
   * `invariantBits` per side on each member, as SU §7 invariant NUMBERS.
   * `build-invariants.ts`'s contract constrains only the MOVER's bits
   * ("`invariantBits(violating, side)` must set EXACTLY the fixture's own bit"),
   * while `Evaluator.full` scores the me−them DIFFERENCE, so an opponent bit on
   * the same invariant cancels the penalty outright.
   */
  bits: { violatingMover: number[]; violatingOpponent: number[]; correctMover: number[]; correctOpponent: number[] };
  /** The fixture's own invariant is set for the OPPONENT too on the violating member. */
  ownBitCancelled: boolean;
  label: Label;
  labelWhy: string;
  namedTerm: string | null;
  topTerms: TermDelta[];
  groupDeltaCc: Record<EvalGroup, number>;
}

const BITS_REP = new Replica();
const BITS_SCRATCH = new Scratch(4, TABLE_SCRATCH_BB, TABLE_SCRATCH_I8, 2);

function bitList(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < INVARIANT_COUNT; i++) if (((mask >>> i) & 1) === 1) out.push(i + 1);
  return out;
}

/**
 * `invariantBits` per side on both members of a pair, with the fixture's rules
 * installed. `build-invariants.ts:476` calls it exactly this way.
 */
function invariantBitsFor(
  violating: { state: GameState; rules: RulesBlock },
  correct: { state: GameState; rules: RulesBlock },
  side: PlayerId,
): { violatingMover: number[]; violatingOpponent: number[]; correctMover: number[]; correctOpponent: number[] } {
  const mover = side === 'white' ? 0 : 1;
  const read = (st: GameState, rules: RulesBlock): [number[], number[]] =>
    withOpeningRules(
      { blackCrystalHandicap: rules.handicap, elementGraph: rules.elementGraph, upkeep: rules.upkeep, handicap: rules.combatHandicap },
      () => {
        const p = BITS_REP.pack(st);
        const t = allocTables();
        buildTables(p, BITS_SCRATCH, 0, 2, t);
        return [bitList(invariantBits(p, t, mover as 0 | 1, BITS_SCRATCH, 0)), bitList(invariantBits(p, t, (1 - mover) as 0 | 1, BITS_SCRATCH, 0))];
      },
    );
  const [vm, vo] = read(violating.state, violating.rules);
  const [cm, co] = read(correct.state, correct.rules);
  return { violatingMover: vm, violatingOpponent: vo, correctMover: cm, correctOpponent: co };
}

const INV_FEATURE_BY_NUMBER: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (let i = 0; i < FEATURE_COUNT; i++) {
    const m = /^Inv(\d+)/.exec(FEATURE_NAMES[i]);
    if (m !== null) out[Number(m[1])] = FEATURE_NAMES[i];
  }
  return out;
})();

async function invariantRows(ctx: Ctx, topN: number): Promise<InvariantRow[]> {
  const suite = readSuite(path.join(SUITES_DIR, 'invariants.suite.json'));
  const out: InvariantRow[] = [];
  const cache = new Map<string, ReturnType<typeof readPositions>>();
  for (const sc of suite.cases as (typeof suite.cases[number] & { violating?: string; correct?: string })[]) {
    if (sc.violating === undefined || sc.correct === undefined) continue;
    const refOf = (spec: string) => {
      const ref = resolvePositionRef(spec, REPO_ROOT, SUITES_DIR, POSITIONS_DIR);
      let rows = cache.get(ref.file);
      if (rows === undefined) {
        rows = readPositions(ref.file);
        cache.set(ref.file, rows);
      }
      return findPosition(rows, ref.id);
    };
    const violating = refOf(sc.violating);
    const correct = refOf(sc.correct);
    const side: PlayerId = sc.side === 'black' ? 'black' : 'white';

    const dv = decompose(ctx, `${sc.id}-violating`, 'invariants.positions.jsonl', violating.rules, violating.state, side);
    const dc = decompose(ctx, `${sc.id}-correct`, 'invariants.positions.jsonl', correct.rules, correct.state, side);
    const evalGap = dc.scoreCc - dv.scoreCc;

    // Both members have the OPPONENT to move; `searchTurn` scores from the side
    // to move, so the mover prefers `correct` exactly when the opponent scores
    // `violating` higher (`suites/run.ts`'s searched reading, verbatim).
    // `suites/run.ts:416` searches each member at the CASE's own budget; the
    // invariant reading is only comparable with `hard:suite` at that number.
    const caseWork = sc.budget.work;
    const searched = async (patch: Partial<HardConfig>): Promise<number> => {
      const v = (await new HardEngine(patch).searchTurn(violating.state, { work: caseWork })).scoreCc;
      const cc = (await new HardEngine(patch).searchTurn(correct.state, { work: caseWork })).scoreCc;
      return v - cc;
    };
    const gaps = await withRulesAsync(violating.rules, async () => ({
      def: await searched(hardEnginePatch(PROFILE)),
      ph: await searched(placeholderPatch(PROFILE)),
    }));
    const gapDefault = gaps.def;
    const gapPlaceholder = gaps.ph;

    const bits = invariantBitsFor(violating, correct, side);
    const inv = sc.invariant ?? 0;
    const ownBitCancelled = bits.violatingMover.includes(inv) && bits.violatingOpponent.includes(inv);

    const deltas = termDeltas(dc, dv);
    const featName = INV_FEATURE_BY_NUMBER[sc.invariant ?? -1] ?? null;
    const featIndex = featName === null ? -1 : FEATURE_NAMES.indexOf(featName);
    const groupDelta = Object.fromEntries(EVAL_GROUP_NAMES.map(g => [g, dc.groupSums[g] - dv.groupSums[g]])) as Record<EvalGroup, number>;

    let label: Label;
    let why: string;
    const penaltyWeight = featIndex >= 0 ? DEFAULT_WEIGHTS.w[featIndex] : null;
    if (evalGap > 0) {
      label = 'matched';
      why = 'the moving side prefers the correct member';
    } else if (penaltyWeight === 0) {
      label = 'contradictory-preference';
      why =
        `DESIGN gives \`${featName}\` weight 0, so the two members cannot differ by this feature at any scale; ` +
        'the pair asks the weight vector for a preference the vector is authored not to have';
    } else if (evalGap === 0) {
      label = 'engine-bug';
      why = `the two members evaluate identically although \`${featName}\` carries weight ${penaltyWeight}`;
    } else if (ownBitCancelled) {
      label = 'engine-bug';
      why =
        `judge 4 (canonical fact): \`invariantBits\` sets invariant ${sc.invariant} for the OPPONENT as well as for the mover on the violating ` +
        `member (mover ${JSON.stringify(bits.violatingMover)}, opponent ${JSON.stringify(bits.violatingOpponent)}), and \`extract\` writes the ` +
        `me−them difference, so \`${featName}\` contributes 0 cc and the pair cannot be decided by the invariant it exists to exercise. ` +
        "`build-invariants.ts`'s contract constrains only the mover's bits.";
    } else {
      const opposing = deltas.filter(d => d.deltaCc < 0);
      const top = opposing.length > 0 ? opposing[0] : deltas[0];
      label = 'weight-scale';
      why =
        `the penalty is ${penaltyWeight} cc and the violating member wins the comparison by ${-evalGap} cc; ` +
        `the largest opposing term is \`${top.name}\` (${top.group}) at ${top.deltaCc} cc`;
    }
    const opposing = deltas.filter(d => d.deltaCc < 0);

    out.push({
      id: sc.id,
      invariant: sc.invariant ?? 0,
      side,
      rationale: sc.rationale ?? '',
      penaltyFeature: featName,
      penaltyWeight,
      searchWork: caseWork,
      evalGapCc: evalGap,
      evalPass: evalGap > 0,
      searchGapCcDefaultWeights: gapDefault,
      searchPassDefaultWeights: gapDefault > 0,
      searchGapCcPlaceholderWeights: gapPlaceholder,
      searchPassPlaceholderWeights: gapPlaceholder > 0,
      penaltyFiredViolating: featIndex >= 0 ? dv.f[featIndex] : null,
      penaltyFiredCorrect: featIndex >= 0 ? dc.f[featIndex] : null,
      penaltyDeltaCc: featIndex >= 0 ? dc.c[featIndex] - dv.c[featIndex] : null,
      penaltyNeverFires: featIndex >= 0 ? dv.f[featIndex] === 0 && dc.f[featIndex] === 0 : null,
      bits,
      ownBitCancelled,
      label,
      labelWhy: why,
      namedTerm: opposing.length > 0 ? opposing[0].name : deltas.length > 0 ? deltas[0].name : null,
      topTerms: deltas.slice(0, topN),
      groupDeltaCc: groupDelta,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Economy rows
// ---------------------------------------------------------------------------

export interface EconomyRow {
  id: string;
  rationale: string;
  /** `checkVictory` on the ROOT, before any action. */
  rootVictory: string;
  rootWinner: string | null;
  whiteUnits: number;
  blackUnits: number;
  /** Every legal turn end, canonically enumerated. */
  ends: number;
  endsComplete: boolean;
  endsInVictory: number;
  /** Is the row's stored `best` key an end position of any legal turn? */
  bestReachable: boolean;
  avoidReachable: boolean;
  label: Label;
  labelWhy: string;
}

function economyRows(): EconomyRow[] {
  const suite = readSuite(path.join(SUITES_DIR, 'economy.suite.json'));
  const cache = new Map<string, ReturnType<typeof readPositions>>();
  const out: EconomyRow[] = [];
  for (const sc of suite.cases) {
    const ref = resolvePositionRef(sc.position, REPO_ROOT, SUITES_DIR, POSITIONS_DIR);
    let rows = cache.get(ref.file);
    if (rows === undefined) {
      rows = readPositions(ref.file);
      cache.set(ref.file, rows);
    }
    const sp = findPosition(rows, ref.id);
    const r = withOpeningRules(
      { blackCrystalHandicap: sp.rules.handicap, elementGraph: sp.rules.elementGraph, upkeep: sp.rules.upkeep, handicap: sp.rules.combatHandicap },
      () => {
        const v = checkVictory(sp.state.board);
        const victory = { status: v.status, winner: 'winner' in v ? (v.winner ?? null) : null };
        const e = enumerateTurnEnds(sp.state, ENUM_BUDGET);
        let inVictory = 0;
        for (const end of e.ends.values()) if (end.phase === 'victory') inVictory++;
        return { victory, e, inVictory };
      },
    );
    const best = sc.best.map(k => normalizeSuiteKey(k));
    const avoid = sc.avoid.map(k => normalizeSuiteKey(k));
    const bestReachable = best.some(k => r.e.ends.has(k));
    const avoidReachable = avoid.some(k => r.e.ends.has(k));
    // The label follows the measurement, not the expectation: a row is a
    // contradictory preference only when the canonical rules actually say the
    // stored key set cannot be chosen.
    const label: Label =
      r.victory.status === 'victory' && !bestReachable ? 'contradictory-preference' : bestReachable ? 'matched' : 'unresolved';
    out.push({
      id: sc.id,
      rationale: sc.rationale ?? '',
      rootVictory: r.victory.status,
      rootWinner: r.victory.winner ?? null,
      whiteUnits: sp.state.board.units.filter(u => u.owner === 'white').length,
      blackUnits: sp.state.board.units.filter(u => u.owner === 'black').length,
      ends: r.e.ends.size,
      endsComplete: r.e.complete,
      endsInVictory: r.inVictory,
      bestReachable,
      avoidReachable,
      label,
      labelWhy:
        `judge 4 (canonical fact): \`checkVictory\` calls the ROOT ${r.victory.status}` +
        (r.victory.winner === null ? '' : ` for ${r.victory.winner}`) +
        `, ${r.inVictory} of ${r.e.ends.size} legal turn ends are \`phase: 'victory'\`, and the row's \`best\` key is ` +
        `${bestReachable ? 'reachable' : 'NOT an end position of any legal turn'}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

let PROFILE = 'desktop';

/**
 * Reproduces `suites/run.ts:412` exactly: `hardConfigFor` returns a patch whose
 * `weights` field is PRESENT and carries the version-0 `placeholder-m4` vector
 * (all 58 feature weights zero, the 18 material priors intact), so
 * `engine.ts:221`'s substitution — which requires `cfg.weights === undefined` —
 * does not fire. Built here ONLY to measure the size of that gap against the
 * `hardEnginePatch` engine on the same pair. Nothing else in this lane uses it.
 */
function placeholderPatch(profile: string): Partial<HardConfig> {
  return hardConfigFor(profile);
}

/**
 * `withOpeningRules`' `finally` fires at the first suspension of an async body
 * and hands the rest of the search the shipped defaults, so an awaited body
 * installs and restores the rules explicitly — the ordering `exam/run.ts` and
 * `suites/run.ts` both use.
 */
async function withRulesAsync<T>(rules: RulesBlock, fn: () => Promise<T>): Promise<T> {
  setUpkeepVariant(rules.upkeep);
  setElementGraph(rules.elementGraph);
  setCombatHandicap('white', rules.combatHandicap.white);
  setCombatHandicap('black', rules.combatHandicap.black);
  try {
    return await fn();
  } finally {
    setUpkeepVariant('shipped');
    setElementGraph('double-thick');
    resetCombatHandicap();
  }
}

export interface Args {
  stratum: ExamStratum;
  casesDir: string;
  profile: string;
  work: number;
  ids: string[] | null;
  topN: number;
  out: string;
  enumBudget: number;
  heavy: boolean;
  skipExam: boolean;
  skipInvariants: boolean;
  skipEconomy: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    stratum: 'dev',
    casesDir: CASES_DIR,
    profile: 'desktop',
    work: DEFAULT_WORK,
    ids: null,
    topN: 12,
    out: path.resolve(REPO_ROOT, 'lab/results/hard-ai-e3/judgment'),
    enumBudget: ENUM_BUDGET,
    heavy: false,
    skipExam: false,
    skipInvariants: false,
    skipEconomy: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = (): string => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`judgment-decompose: ${k} needs a value`);
      return x;
    };
    switch (k) {
      case '--stratum': a.stratum = v() as ExamStratum; break;
      case '--cases-dir': a.casesDir = path.resolve(v()); break;
      case '--engine': { const e = v(); a.profile = e.startsWith('hard@') ? e.slice(5) : e; break; }
      case '--work': a.work = Number(v()); break;
      case '--ids': a.ids = v().split(',').map(s => s.trim()).filter(s => s.length > 0); break;
      case '--top': a.topN = Number(v()); break;
      case '--out': a.out = path.resolve(v()); break;
      case '--enum-budget': a.enumBudget = Number(v()); break;
      case '--heavy': a.heavy = true; break;
      case '--no-heavy': a.heavy = false; break;
      case '--no-exam': a.skipExam = true; break;
      case '--no-invariants': a.skipInvariants = true; break;
      case '--no-economy': a.skipEconomy = true; break;
      default: throw new Error(`judgment-decompose: unknown argument ${k}`);
    }
  }
  return a;
}

export interface JudgmentResult {
  schema: 'muju-judgment-decompose-v1';
  at: string;
  engine: string;
  work: number;
  configHash: string;
  weightsHash: string;
  exam: ExamJudgmentRow[];
  invariants: InvariantRow[];
  economy: EconomyRow[];
  counts: Record<string, number>;
}

export async function run(args: Args): Promise<JudgmentResult> {
  PROFILE = args.profile;
  const ctx = newCtx();
  const exam: ExamJudgmentRow[] = [];
  if (!args.skipExam) {
    let cases = loadStratum(args.stratum, args.casesDir).filter(c => c.kind === 'judgment');
    if (args.ids !== null) {
      const want = new Set(args.ids);
      cases = cases.filter(c => want.has(c.id));
    }
    for (const c of cases) exam.push(await examRow(ctx, c, args.work, args.topN, args.enumBudget, DEAD_MAX_ENDS));
  }
  const invariants = args.skipInvariants ? [] : await invariantRows(ctx, args.topN);
  const economy = args.skipEconomy ? [] : economyRows();

  // The two tallies are NOT added: an exam judgment case and an invariant pair
  // are different questions (`exam/run.ts`'s header on never summing tallies).
  const counts: Record<string, number> = {};
  for (const x of exam) counts[`exam:${x.label}`] = (counts[`exam:${x.label}`] ?? 0) + 1;
  for (const x of invariants) counts[`invariants:${x.label}`] = (counts[`invariants:${x.label}`] ?? 0) + 1;
  counts['economy:contradictory-preference'] = economy.filter(e => e.label === 'contradictory-preference').length;

  return {
    schema: 'muju-judgment-decompose-v1',
    at: new Date().toISOString(),
    engine: `hard@${args.profile}`,
    work: args.work,
    configHash: resolvedConfigHash(`hard@${args.profile}`, { mode: 'fixed', units: args.work }),
    weightsHash: weightsHash(DEFAULT_WEIGHTS),
    exam,
    invariants,
    economy,
    counts,
  };
}

function cc(n: number | null): string {
  return n === null ? '—' : String(n);
}

export function renderMarkdown(r: JudgmentResult): string {
  const L: string[] = [];
  L.push(`# E3.1 judgment decomposition — ${r.engine}, fixed ${r.work} units`);
  L.push('');
  L.push(`- run at ${r.at}; weights \`${r.weightsHash}\`; resolved config \`${r.configHash}\``);
  L.push('');
  L.push('## Exam judgment cases');
  L.push('');
  L.push('| case | label | matched | chosen wins outright | static gap cc (expected − chosen) | searched expected cc | searched chosen cc | named term |');
  L.push('| --- | --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const x of r.exam) {
    L.push(
      `| \`${x.id}\` | ${x.label} | ${x.matched ? 'yes' : 'no'} | ${x.chosenWinsOutright ? 'YES' : 'no'} | ${cc(x.staticGapCc)} | ${cc(x.searchedExpectedCc)} | ${cc(x.searchedChosenCc)} | ${x.namedTerm ?? '—'} |`,
    );
  }
  L.push('');
  L.push('## Invariant pairs');
  L.push('');
  L.push('| pair | inv | penalty feature | weight | eval gap cc | label | named term |');
  L.push('| --- | ---: | --- | ---: | ---: | --- | --- |');
  for (const x of r.invariants) {
    L.push(`| \`${x.id}\` | ${x.invariant} | ${x.penaltyFeature ?? '—'} | ${cc(x.penaltyWeight)} | ${x.evalGapCc} | ${x.label} | ${x.namedTerm ?? '—'} |`);
  }
  L.push('');
  L.push('## Economy rows');
  L.push('');
  L.push('| row | root victory | white units | black units | ends | enumeration closed | ends in victory | best reachable | avoid reachable |');
  L.push('| --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |');
  for (const x of r.economy) {
    L.push(
      `| \`${x.id}\` | ${x.rootVictory}${x.rootWinner === null ? '' : ' ' + x.rootWinner} | ${x.whiteUnits} | ${x.blackUnits} | ${x.ends} | ${x.endsComplete ? 'yes' : 'no'} | ${x.endsInVictory} | ${x.bestReachable ? 'yes' : 'NO'} | ${x.avoidReachable ? 'yes' : 'NO'} |`,
    );
  }
  L.push('');
  L.push('## Label counts');
  L.push('');
  for (const [k, v] of Object.entries(r.counts)) L.push(`- ${k}: ${v}`);
  L.push('');
  return L.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // E3-PLAN.md's heavy rule: slot 0 is E2's chain, so a pass that runs longer
  // than five minutes queues for a slot; a short probe passes `--no-heavy`.
  const release = args.heavy ? await acquireHeavySlot(`judgment-decompose ${args.stratum} hard@${args.profile}`, { timeoutMs: 60 * 60_000 }) : null;
  let r: JudgmentResult;
  try {
    r = await run(args);
  } finally {
    release?.();
  }
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'decompose.json'), JSON.stringify(r, null, 1) + '\n');
  fs.writeFileSync(path.join(args.out, 'decompose.md'), renderMarkdown(r) + '\n');
  console.log(`judgment-decompose: ${r.exam.length} exam judgment cases, ${r.invariants.length} invariant pairs, ${r.economy.length} economy rows`);
  console.log(`  labels: ${JSON.stringify(r.counts)}`);
  console.log(`  ${path.relative(REPO_ROOT, args.out)}`);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(HERE, 'judgment-decompose.ts');
if (invokedDirectly) {
  main().catch(err => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
}
