/**
 * `npm run hard:exam -- [--stratum dev] [--engine hard@desktop] [--work <units>]
 *   [--out <path>] [--md <path>] [--ids a,b] [--tag t] [--demand d] [--limit n]
 *   [--cases-dir <dir>] [--heavy]`
 *
 * Runs one engine at FIXED WORK over one stratum of the examination set and
 * reports what it did (EPIC-PLAN §4 E1.2, deliverable 4).
 *
 * TWO TALLIES THAT ARE NEVER ADDED UP. The artifact carries `exact` and
 * `judgment` as separate objects and there is no field anywhere that sums them.
 * An exact case is decided by a canonical witness, so a miss is a statement
 * about the engine. A judgment case is decided by somebody's preference — the
 * adviser's or an author's — so a "match" says the engine agrees with that
 * opinion and a "miss" says it disagrees; neither is a fact about strength.
 * `matchRate` is reported because a moving agreement rate is interesting;
 * summing it with a pass rate would launder an opinion into a score, which is
 * exactly what E1.2's "strategic preferences are labeled judgments" forbids and
 * what E3 means by not turning a preference into an invariant.
 *
 * A WIN IS NEVER A MISS. `suites/run.ts`'s first canonical adjudication is kept:
 * if the turn the engine chose, replayed through the canonical rules, ends the
 * game in its favour, the case passes whatever the witness lists. A case cannot
 * legitimately ask an engine to decline winning. It is counted and named in the
 * artifact, never silently applied.
 *
 * ON A JUDGMENT CASE THE SAME WIN IS ITS OWN OUTCOME (E3 lane 7's A7-2, applied
 * 2026-09-17). Until A7-2 the adjudication reached only the exact arm, and two
 * judgment rows whose turn ends the game were scored as disagreements with a
 * preference — one of them because the winning end key sits in the case's own
 * `avoidKeys`. Folding the win into `matched` instead would be worse: a match is
 * an OPINION agreed with, and crediting a win as agreement would launder the
 * same opinion this file refuses to launder. So a judgment row has THREE
 * outcomes — `matched`, `unmatched` and `won` — counted apart and named
 * case by case in `judgment.wonCases`. `matched` is null on a `won` row: the
 * question the case asked was never answered.
 *
 * A DEAD POSITION IS NOT A PREFERENCE EITHER (E3 lane 7's A7-3, applied
 * 2026-09-17). `suites/run.ts`'s SECOND canonical adjudication demotes a suite
 * row whose every legal turn hands the opponent a win on the spot to a coverage
 * row, and `exam/seed.ts` refuses to author an EXACT case on such a root. The
 * judgment carry path reached neither check, so four `home-mate` judgment rows
 * — two scored as matches and two as misses — were asking the engine to prefer
 * one way of losing over another. A judgment row whose root the canonical rules
 * prove dead is now its own outcome, `dead`, reported and counted apart. The
 * proof is `witness.ts deadPosition` and it is run with the case's rules
 * installed; it is quadratic in the number of end positions, so it runs only
 * where `seed.ts`'s own guard allows (a complete enumeration inside
 * `DEAD_PROBE_BUDGET` calls and at most `DEAD_CHECK_MAX_ENDS` end positions),
 * and every row records which of those happened in `deadProof`. NO CASE FILE IS
 * EDITED: `dev.jsonl` still carries the four rows, and the runner says what they
 * are worth. `--no-dead-check` turns the proof off and reports `not-checked`.
 *
 * THIS IS NOT A GATE. Nothing here has a pass bar, and no MILESTONES.md row
 * reads it. It is a development instrument: `--stratum val` and
 * `--stratum sealed` exist so the strata rule can be honoured mechanically, not
 * because either is scheduled here.
 *
 * COST, MEASURED. The default work is 25,000 units, well below the ladder's own
 * 400,000 rung. On an Apple M2 Max the whole `dev` stratum — 131 cases — takes
 * **3.7 s of one core** at that budget and **40.8 s** at 400,000, and returns
 * the SAME 118/124 exact passes at both. The misses are therefore not a budget
 * problem, which is precisely the kind of thing a set this cheap to run is for.
 * The run holds no heavy slot by default because it is not heavy at that
 * budget; `--heavy` takes one for a deliberately large `--work`, and
 * `ladder/heavy.ts`'s two-slot cap then applies as it does to every other job.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GameState, PlayerId } from '../../../src/game/types';
import { isLegalAction } from '../../../src/game/legality';
import { applyAction } from '../../../src/ai/simulate';
import type { AIAction } from '../../../src/ai/types';
import { HardEngine } from '../../../src/ai/hard/engine';
import type { RootResult } from '../../../src/ai/hard/search/root';
import { hardConfigHash, hardEnginePatch } from '../bots/hard';
import { deadPosition, enumerateTurnEnds } from './witness';
import { resolvedConfigHash } from '../ladder/identity';
import { acquireHeavySlot } from '../ladder/heavy';
import {
  CASES_DIR,
  DEMAND_ROWS,
  EXAM_STRATA,
  STRATUM_RULES,
  installExamRules,
  loadCaseState,
  loadStratum,
  normalizeKey,
  restoreShippedRules,
  type ExamCase,
  type ExamStratum,
} from './format';

const HERE = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(HERE, '../../..');

/**
 * The default budget. Small on purpose: this set is run while iterating, and a
 * run nobody can afford to repeat is a run nobody repeats.
 */
export const DEFAULT_WORK = 25_000;

/**
 * The dead-position proof's three budgets, the same shape `exam/seed.ts` uses.
 * `DEAD_PROBE_BUDGET` pays for ONE enumeration of the root's turn ends: it is
 * what tells the proof apart from the positions it cannot afford (measured over
 * the dev stratum's 22 judgment roots: the six authored `home-mate` roots finish
 * in 65-1,949 calls, the loss roots reach 796-14,995 end positions and mostly do
 * not finish at all). A root past `DEAD_CHECK_MAX_ENDS` is skipped because the
 * proof enumerates a whole opponent turn from EVERY end position.
 */
export const DEAD_PROBE_BUDGET = 50_000;
export const DEAD_CHECK_MAX_ENDS = 400;
export const DEAD_CHECK_BUDGET = 2_000_000;

export interface ExamArgs {
  stratum: ExamStratum;
  engine: string;
  work: number;
  casesDir: string;
  out: string | null;
  md: string | null;
  ids: string[] | null;
  tag: string | null;
  demand: string | null;
  limit: number | null;
  heavy: boolean;
  /** Run the dead-position proof on judgment roots (A7-3). Default on. */
  deadCheck: boolean;
}

export function parseArgs(argv: readonly string[]): ExamArgs {
  const args: ExamArgs = {
    stratum: 'dev',
    engine: 'hard@desktop',
    work: DEFAULT_WORK,
    casesDir: CASES_DIR,
    out: null,
    md: null,
    ids: null,
    tag: null,
    demand: null,
    limit: null,
    heavy: false,
    deadCheck: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`hard:exam: ${a} needs a value`);
      return v;
    };
    switch (a) {
      case '--stratum': {
        const v = next() as ExamStratum;
        if (!EXAM_STRATA.includes(v)) throw new Error(`hard:exam: --stratum must be one of ${EXAM_STRATA.join(', ')}`);
        args.stratum = v;
        break;
      }
      case '--engine':
        args.engine = next();
        break;
      case '--work': {
        const v = Number(next());
        if (!Number.isFinite(v) || v <= 0) throw new Error('hard:exam: --work must be a positive number of units');
        args.work = v;
        break;
      }
      case '--cases-dir':
        args.casesDir = path.resolve(next());
        break;
      case '--out':
        args.out = path.resolve(next());
        break;
      case '--md':
        args.md = path.resolve(next());
        break;
      case '--ids':
        args.ids = next().split(',').map(s => s.trim()).filter(s => s.length > 0);
        break;
      case '--tag':
        args.tag = next();
        break;
      case '--demand':
        args.demand = next();
        break;
      case '--limit':
        args.limit = Number(next());
        break;
      case '--heavy':
        args.heavy = true;
        break;
      case '--no-heavy':
        args.heavy = false;
        break;
      case '--dead-check':
        args.deadCheck = true;
        break;
      case '--no-dead-check':
        args.deadCheck = false;
        break;
      default:
        throw new Error(`hard:exam: unknown argument ${a}`);
    }
  }
  return args;
}

/** The slice of `HardEngine` this runner uses; a test injects a stub. */
export interface ExamEngine {
  searchTurn(state: GameState, opts?: { work?: number }): Promise<RootResult>;
}

export type ExamEngineFactory = (profile: string) => ExamEngine;

export const defaultExamEngineFactory: ExamEngineFactory = profile => new HardEngine(hardEnginePatch(profile));

/**
 * `suites/run.ts wonOutright`: replays the engine's own actions through the
 * canonical rules and asks whether the game ended in the mover's favour.
 * Must run with the case's rules globals installed.
 */
function wonOutright(state: GameState, actions: readonly AIAction[], mover: PlayerId): boolean {
  let current = state;
  for (const action of actions) {
    if (!isLegalAction(current, action, current.turn.currentPlayer)) return false;
    const next = applyAction(current, action);
    if (next === current) return false;
    current = next;
  }
  return current.phase === 'victory' && current.winner === mover;
}

/**
 * What a JUDGMENT row did. `matched`/`unmatched` are the two readings of a
 * stated preference; `won` is the canonical adjudication above, which answers a
 * different question and is therefore never added to either.
 */
export type JudgmentOutcome = 'matched' | 'unmatched' | 'won' | 'dead';

/**
 * What the canonical dead-position proof said about a judgment root. `dead`
 * means every legal turn from it hands the opponent a win on the spot; the
 * three `skipped`/`unknown` values are all "not proved alive", never "alive".
 */
export type DeadProof =
  | 'dead'
  | 'alive'
  | 'unknown-proof-budget'
  | 'skipped-enumeration-budget'
  | 'skipped-too-many-ends'
  | 'not-checked';

export interface ExamCaseResult {
  id: string;
  kind: 'exact' | 'judgment';
  demand: string;
  claim: string | null;
  /** Exact cases only: did the engine land inside the canonical witness? */
  passed: boolean | null;
  /** Judgment cases only: did the engine agree with the preference? `null` when
   * the row was adjudicated instead of compared (see `outcome`). */
  matched: boolean | null;
  /** Judgment cases only: which of the four outcomes this row is. */
  outcome: JudgmentOutcome | null;
  /** Judgment cases only: what the canonical dead-position proof said (A7-3). */
  deadProof: DeadProof | null;
  endKey: string | null;
  source: RootResult['source'];
  fallback: RootResult['fallback'] | null;
  depth: number;
  work: number;
  /** The end key was outside the witness but the turn won the game outright. */
  wonOutright: boolean;
  /** The witness is a closed key set (`complete`); false weakens a miss. */
  witnessComplete: boolean | null;
  ms: number;
  note: string | null;
}

export interface ExamRunResult {
  schema: 'muju-exam-run-v1';
  at: string;
  engine: string;
  work: number;
  configHash: string;
  stratum: ExamStratum;
  stratumRule: string;
  casesDir: string;
  /** The two tallies. There is deliberately no field that adds them. */
  exact: { cases: number; passed: number; failed: number; passRate: number | null; wonOutrightAdjudications: number; incompleteWitnesses: number };
  /**
   * `matched + unmatched + won + dead === cases`. `matchRate` keeps its old formula,
   * `matched / cases`, so a number quoted from an older artifact stays
   * comparable; `comparable` is the denominator a reader who wants the rate over
   * the rows a preference could actually be compared on should use.
   */
  judgment: {
    cases: number;
    matched: number;
    unmatched: number;
    won: number;
    dead: number;
    comparable: number;
    matchRate: number | null;
    wonCases: string[];
    deadCases: string[];
  };
  byDemand: Record<
    string,
    { exactCases: number; exactPassed: number; judgmentCases: number; judgmentMatched: number; judgmentWon: number; judgmentDead: number }
  >;
  results: ExamCaseResult[];
  errors: { id: string; message: string }[];
  wallMs: number;
  host: string;
  node: string;
}

export interface RunOptions {
  engineFactory?: ExamEngineFactory;
  onCase?: (r: ExamCaseResult) => void;
}

function profileOf(engine: string): string {
  return engine.startsWith('hard@') ? engine.slice('hard@'.length) : engine;
}

/** Filters a loaded stratum by the CLI's selectors. */
export function selectCases(cases: readonly ExamCase[], args: ExamArgs): ExamCase[] {
  let out = cases.slice();
  if (args.ids !== null) {
    const want = new Set(args.ids);
    out = out.filter(c => want.has(c.id));
  }
  if (args.tag !== null) out = out.filter(c => c.tags.includes(args.tag as string));
  if (args.demand !== null) out = out.filter(c => c.demand === args.demand);
  if (args.limit !== null) out = out.slice(0, args.limit);
  return out;
}

/**
 * A7-3's proof, under `seed.ts`'s own guards. One cheap enumeration decides
 * whether the quadratic proof is affordable at all; everything that is not a
 * proof of death is reported as such and never as "alive".
 *
 * Must be called with the case's rules globals installed.
 */
export function proveDead(state: GameState): DeadProof {
  const probe = enumerateTurnEnds(state, DEAD_PROBE_BUDGET);
  if (!probe.complete) return 'skipped-enumeration-budget';
  if (probe.ends.size > DEAD_CHECK_MAX_ENDS) return 'skipped-too-many-ends';
  const dead = deadPosition(state, DEAD_CHECK_BUDGET);
  if (dead === null) return 'unknown-proof-budget';
  return dead ? 'dead' : 'alive';
}

export async function runExam(cases: readonly ExamCase[], args: ExamArgs, opts: RunOptions = {}): Promise<ExamRunResult> {
  const factory = opts.engineFactory ?? defaultExamEngineFactory;
  const profile = profileOf(args.engine);
  const started = Date.now();
  const results: ExamCaseResult[] = [];
  const errors: { id: string; message: string }[] = [];

  for (const c of cases) {
    const t0 = Date.now();
    let state: GameState;
    try {
      // Installs and restores the rules globals itself; must not be nested
      // inside `withExamRules` (see `format.ts`'s header).
      state = loadCaseState(c);
    } catch (err) {
      errors.push({ id: c.id, message: err instanceof Error ? err.message : String(err) });
      continue;
    }

    // The rules globals stay installed ACROSS the await: `withExamRules`'
    // `finally` would fire at the search's first suspension and hand the rest
    // of it the shipped defaults (see `format.ts`). `suites/run.ts` installs
    // them the same way, for the same reason.
    let result: RootResult;
    let won = false;
    let endKey: string | null;
    // A7-3's proof is decided by the canonical rules alone, but it reads the
    // same process-global rules block the search does, so it runs INSIDE the
    // install (see `format.ts`'s header) and its verdict is carried out.
    let deadProof: DeadProof = 'not-checked';
    installExamRules(c);
    try {
      result = await factory(profile).searchTurn(state, { work: args.work });
      endKey = result.endKey === '' ? null : normalizeKey(result.endKey, `${c.id}: engine end key`);
      if (result.actions.length > 0) won = wonOutright(state, result.actions, c.sideToMove);
      if (c.kind === 'judgment' && !won && args.deadCheck) deadProof = proveDead(state);
    } catch (err) {
      errors.push({ id: c.id, message: `search failed: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    } finally {
      restoreShippedRules();
    }

    const row: ExamCaseResult = {
      id: c.id,
      kind: c.kind,
      demand: c.demand,
      claim: c.witness.label === 'exact' ? c.witness.claim : null,
      passed: null,
      matched: null,
      outcome: null,
      deadProof: null,
      endKey,
      source: result.source,
      fallback: result.fallback ?? null,
      depth: result.depth,
      work: result.work,
      wonOutright: won,
      witnessComplete: c.witness.label === 'exact' ? c.witness.complete : null,
      ms: Date.now() - t0,
      note: null,
    };

    if (c.witness.label === 'exact') {
      const inWitness = endKey !== null && c.witness.endKeys.includes(endKey);
      const inAvoid = endKey !== null && c.witness.avoidKeys.includes(endKey);
      row.passed = (inWitness && !inAvoid) || won;
      if (!inWitness && won) row.note = 'outside the witness but the turn wins the game outright (canonical adjudication)';
      else if (result.actions.length === 0) row.note = 'the engine returned no actions';
      else if (!row.passed && !c.witness.complete) row.note = 'miss against an INCOMPLETE witness: a turn outside the key set may satisfy the claim too';
    } else if (won) {
      // A7-2: the turn ended the game in the mover's favour. Neither a match nor
      // a miss — the preference was never put to the test. A won root is also
      // not a dead one (`deadPosition` returns false as soon as the mover has a
      // winning end), so the proof below is not run for it.
      row.matched = null;
      row.outcome = 'won';
      row.deadProof = 'alive';
      row.note = 'judgment: the chosen turn WINS the game outright (canonical adjudication); not counted as matched or unmatched';
    } else {
      // A7-3: the canonical dead-position proof, before the preference is read.
      row.deadProof = deadProof;
      if (row.deadProof === 'dead') {
        row.matched = null;
        row.outcome = 'dead';
        row.note =
          'judgment: the canonical rules prove every legal turn from this root hands the opponent a win on the spot, so no turn is better than another; not counted as matched or unmatched (A7-3)';
      } else {
        const preferred = endKey !== null && c.witness.preferredKeys.includes(endKey);
        const avoided = endKey !== null && c.witness.avoidKeys.includes(endKey);
        row.matched = preferred && !avoided;
        row.outcome = row.matched ? 'matched' : 'unmatched';
        row.note = 'judgment: agreement with a stated preference, never a pass';
      }
    }

    results.push(row);
    opts.onCase?.(row);
  }

  const exactRows = results.filter(r => r.kind === 'exact');
  const judgmentRows = results.filter(r => r.kind === 'judgment');
  const exactPassed = exactRows.filter(r => r.passed === true).length;
  const judgmentMatched = judgmentRows.filter(r => r.outcome === 'matched').length;
  const judgmentWonRows = judgmentRows.filter(r => r.outcome === 'won');
  const judgmentDeadRows = judgmentRows.filter(r => r.outcome === 'dead');

  const byDemand: ExamRunResult['byDemand'] = {};
  for (const r of results) {
    const e = (byDemand[r.demand] ??= { exactCases: 0, exactPassed: 0, judgmentCases: 0, judgmentMatched: 0, judgmentWon: 0, judgmentDead: 0 });
    if (r.kind === 'exact') {
      e.exactCases++;
      if (r.passed === true) e.exactPassed++;
    } else {
      e.judgmentCases++;
      if (r.outcome === 'matched') e.judgmentMatched++;
      if (r.outcome === 'won') e.judgmentWon++;
      if (r.outcome === 'dead') e.judgmentDead++;
    }
  }

  return {
    schema: 'muju-exam-run-v1',
    at: new Date().toISOString(),
    engine: args.engine,
    work: args.work,
    configHash: `${hardConfigHash(profile, { mode: 'fixed', units: args.work })}#${resolvedConfigHash(`hard@${profile}`, { mode: 'fixed', units: args.work })}`,
    stratum: args.stratum,
    stratumRule: STRATUM_RULES[args.stratum],
    casesDir: path.relative(REPO_ROOT, args.casesDir) || '.',
    exact: {
      cases: exactRows.length,
      passed: exactPassed,
      failed: exactRows.length - exactPassed,
      passRate: exactRows.length === 0 ? null : exactPassed / exactRows.length,
      wonOutrightAdjudications: exactRows.filter(r => r.wonOutright && r.note !== null && r.note.startsWith('outside the witness')).length,
      incompleteWitnesses: exactRows.filter(r => r.witnessComplete === false).length,
    },
    judgment: {
      cases: judgmentRows.length,
      matched: judgmentMatched,
      unmatched: judgmentRows.filter(r => r.outcome === 'unmatched').length,
      won: judgmentWonRows.length,
      dead: judgmentDeadRows.length,
      comparable: judgmentRows.filter(r => r.outcome === 'matched' || r.outcome === 'unmatched').length,
      matchRate: judgmentRows.length === 0 ? null : judgmentMatched / judgmentRows.length,
      wonCases: judgmentWonRows.map(r => r.id).sort(),
      deadCases: judgmentDeadRows.map(r => r.id).sort(),
    },
    byDemand,
    results,
    errors,
    wallMs: Date.now() - started,
    host: os.hostname(),
    node: process.version,
  };
}

export function renderMarkdown(run: ExamRunResult): string {
  const pct = (n: number | null): string => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
  const lines: string[] = [];
  lines.push(`# Muju examination set — ${run.stratum} stratum, ${run.engine}`);
  lines.push('');
  lines.push(`- run at ${run.at} on ${run.host} (node ${run.node})`);
  lines.push(`- work: fixed ${run.work} units; config \`${run.configHash}\``);
  lines.push(`- cases from \`${run.casesDir}\`; stratum rule: ${run.stratumRule}`);
  lines.push(`- wall ${(run.wallMs / 1000).toFixed(1)} s for ${run.results.length} cases`);
  lines.push('');
  lines.push('## Exact cases (canonical witness)');
  lines.push('');
  lines.push(`${run.exact.passed}/${run.exact.cases} passed (${pct(run.exact.passRate)}).`);
  lines.push(`${run.exact.wonOutrightAdjudications} passed by the "a win is never a miss" adjudication; ${run.exact.incompleteWitnesses} rest on an incomplete witness.`);
  lines.push('');
  lines.push('## Judgment cases (stated preference)');
  lines.push('');
  lines.push(`${run.judgment.matched}/${run.judgment.cases} matched (${pct(run.judgment.matchRate)}).`);
  lines.push('');
  lines.push(
    `Outcomes: matched ${run.judgment.matched}, unmatched ${run.judgment.unmatched}, won ${run.judgment.won}, dead ${run.judgment.dead}`,
  );
  lines.push(`(${run.judgment.comparable} of ${run.judgment.cases} rows put a preference to the test at all).`);
  if (run.judgment.wonCases.length > 0) {
    lines.push('');
    lines.push('Won outright, so neither matched nor missed (A7-2):');
    for (const id of run.judgment.wonCases) lines.push(`- \`${id}\``);
  }
  if (run.judgment.deadCases.length > 0) {
    lines.push('');
    lines.push('Dead positions by canonical proof, so neither matched nor missed (A7-3):');
    for (const id of run.judgment.deadCases) lines.push(`- \`${id}\``);
  }
  lines.push('');
  lines.push('**A judgment match is not a pass and is never added to the exact tally.** It records');
  lines.push('agreement with an adviser\'s or an author\'s preference; disagreement is a disagreement,');
  lines.push('not a defect.');
  lines.push('');
  lines.push('## By Muju demand (EPIC-PLAN §1)');
  lines.push('');
  lines.push('| demand | exact passed/cases | judgment matched/cases | §1 row |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const [demand, e] of Object.entries(run.byDemand)) {
    const parts: string[] = [];
    if (e.judgmentWon > 0) parts.push(`${e.judgmentWon} won`);
    if (e.judgmentDead > 0) parts.push(`${e.judgmentDead} dead`);
    const adjudicated = parts.length > 0 ? ` (+${parts.join(', ')})` : '';
    lines.push(`| \`${demand}\` | ${e.exactPassed}/${e.exactCases} | ${e.judgmentMatched}/${e.judgmentCases}${adjudicated} | ${DEMAND_ROWS[demand as keyof typeof DEMAND_ROWS] ?? ''} |`);
  }
  lines.push('');
  const misses = run.results.filter(r => r.kind === 'exact' && r.passed === false);
  lines.push(`## Exact misses (${misses.length})`);
  lines.push('');
  if (misses.length === 0) lines.push('None.');
  else {
    lines.push('| case | claim | engine end key | source | depth | note |');
    lines.push('| --- | --- | --- | --- | ---: | --- |');
    for (const m of misses.slice(0, 200)) {
      lines.push(`| \`${m.id}\` | ${m.claim ?? ''} | \`${m.endKey ?? '-'}\` | ${m.source} | ${m.depth} | ${m.note ?? ''} |`);
    }
  }
  lines.push('');
  if (run.errors.length > 0) {
    lines.push(`## Errors (${run.errors.length})`);
    lines.push('');
    for (const e of run.errors) lines.push(`- \`${e.id}\`: ${e.message}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cases = selectCases(loadStratum(args.stratum, args.casesDir), args);
  if (cases.length === 0) {
    console.error(`hard:exam: no cases selected from ${args.casesDir} (stratum ${args.stratum})`);
    process.exitCode = 1;
    return;
  }
  const release = args.heavy ? await acquireHeavySlot(`hard:exam ${args.stratum} ${args.engine}`, { timeoutMs: 30 * 60_000 }) : null;
  let run: ExamRunResult;
  try {
    run = await runExam(cases, args);
  } finally {
    release?.();
  }
  const out = args.out ?? path.resolve(REPO_ROOT, `lab/results/hard-ai-e1/exam/${args.stratum}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(run, null, 1) + '\n');
  const md = args.md ?? out.replace(/\.json$/i, '.md');
  fs.writeFileSync(md, renderMarkdown(run) + '\n');

  console.log(`hard:exam ${args.stratum} @ ${args.engine} fixed:${args.work}`);
  console.log(`  exact    ${run.exact.passed}/${run.exact.cases} passed`);
  console.log(
    `  judgment ${run.judgment.matched}/${run.judgment.cases} matched, ${run.judgment.unmatched} unmatched, ` +
      `${run.judgment.won} won outright, ${run.judgment.dead} dead (NOT a pass; never summed with the line above)`,
  );
  if (run.errors.length > 0) console.log(`  errors   ${run.errors.length}`);
  console.log(`  ${(run.wallMs / 1000).toFixed(1)} s; ${path.relative(REPO_ROOT, out)}`);
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(HERE, 'run.ts');
if (invokedDirectly) {
  main().catch(err => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exitCode = 1;
  });
}
