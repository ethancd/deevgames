/**
 * Incremental report over an `hard:analyze --run` output directory.
 *
 * WHY THIS EXISTS. `run.ts` writes `summary.json` only when the whole run
 * finishes. The E2 baseline loss analysis is 47 games at roughly five to six
 * hours (`docs/hard-ai/e2/E2-PLAN.md`, "Running now"), and E2's first candidate
 * row is chosen from what those losses say, so the histogram has to be readable
 * while the run is still going. This tool reads whatever per-game
 * `<fileId>.json` artifacts exist so far, tolerates a missing `summary.json`
 * and tolerates a file caught mid-write, and prints the same kind of histogram
 * `summary.md` would print plus the four things E1 could not report:
 *
 * - the turn number the first consequential decision fell on, not just its class;
 * - the swing distribution, so "consequential" can be read as a size;
 * - how many first-consequential turns were DEADLINE-CUT, which decides whether
 *   a class is about search quality or about the clock (E1-CLOSE-CRITIQUE C6
 *   and the P6 fix);
 * - a per-pair view marking the double-loss pairs, because a pair whose two
 *   games both lost is the strongest single-position evidence in the run.
 *
 * WHAT IT DOES NOT KNOW. The run it reads was launched with `--max-turns 12`,
 * so a turn past 12 was never analysed and cannot appear here. The
 * largest-swing figures are therefore the largest swing IN THE FIRST TWELVE
 * TURNS, not in the game. Every rendering says so; do not quote a largest-swing
 * number from this report without that sentence.
 *
 * It never writes into the directory it reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnalysisResult, LossClass } from './analyze';
import { hardSeat } from './replay';
import type { GameRecord } from '../../harness/types';

/** One pair row of a ladder run's `pairs.jsonl`; only the fields this tool uses. */
interface PairRow {
  pairId: string;
  handicap: number;
  opening: string;
  scoreA: number;
}

/** A per-game artifact plus the pair it belongs to. */
export interface LoadedAnalysis {
  file: string;
  fileId: string;
  /** `<opening>:<handicap>:<pairIndex>`, rebuilt from the file id so it matches `pairs.jsonl`. */
  pairId: string | null;
  result: AnalysisResult;
}

export interface Bucket {
  label: string;
  games: number;
}

export interface PairView {
  pairId: string;
  doubleLoss: boolean;
  /** Analysed games of this pair, in file order. */
  games: Array<{ fileId: string; klass: LossClass; turn: number | null; swingCc: number | null }>;
}

export interface LossReport {
  dir: string;
  /** Games with a per-game artifact on disk. */
  analysed: number;
  /** Expected total, when a source for it was found; null when it was not. */
  expected: number | null;
  /** Files that exist but could not be parsed (usually caught mid-write). */
  unreadable: Array<{ file: string; error: string }>;
  summaryPresent: boolean;
  maxTurnsAnalysed: number;
  adviserWork: number | null;
  swingCc: number | null;
  firstClassHistogram: Array<{ klass: string; games: number }>;
  largestClassHistogram: Array<{ klass: string; games: number }>;
  firstTurnHistogram: Array<{ turn: number | null; games: number }>;
  firstSwingBuckets: Bucket[];
  largestSwingBuckets: Bucket[];
  firstSwingStats: { min: number; median: number; max: number } | null;
  deadline: {
    /** First-consequential turns whose own wall time broke the allowance. */
    overran: number;
    /** First-consequential turns that dispatched nothing but phase ends. */
    emptyPlan: number;
    /** First-consequential turns at or past the allowance, tolerance aside. */
    atOrPastBudget: number;
    /** First-consequential turns where the fixed-work re-run did not reproduce the played turn. */
    engineDidNotReproduce: number;
    /** First-consequential turns with a wall time and an allowance to compare. */
    measurable: number;
  };
  /** Root exposure (E2 lane 1) at each game's first consequential turn. */
  exposure: {
    /** First-consequential turns that carry exposure at all. */
    present: number;
    /** `RootResult.candidateSource` of those turns. */
    bySource: Array<{ source: string; turns: number }>;
    /** The adviser's best turn, looked up in the root's candidate list. */
    adviserBestSearched: number;
    /** Of the searched ones: scored at the incumbent's fail-low bound, so the margin is unmeasurable. */
    adviserBestAtBound: number;
    /** Of the searched ones: scored strictly ABOVE the played candidate — the re-run preferred it. */
    adviserBestAbovePlayed: number;
    /** Of those: the re-run also failed to reproduce the played turn (`fixed-work-divergence`). */
    adviserBestAboveAndDiverged: number;
    adviserBestUnsearched: number;
    adviserBestAbsent: number;
    /** Where the adviser's best turn sat in the root's list, when it was in it. */
    adviserBestRank: { min: number; median: number; max: number } | null;
    /** Candidates in the published list, and how many the root searched. */
    listSize: { min: number; median: number; max: number } | null;
    searchedOfList: { min: number; median: number; max: number } | null;
  };
  pairs: PairView[];
  doubleLossPairsSeen: number;
  doubleLossPairsTotal: number;
  classRules: Partial<Record<LossClass, string>>;
  at: string;
}

/** `e1-g4-s750_0_18-A-white` -> `e1-g4-s750:0:18`. Returns null when the id does not carry a pair. */
export function pairIdOfFileId(fileId: string): string | null {
  const m = /^(.+)_(\d+)_(\d+)-[A-Z]-(?:white|black)$/.exec(fileId);
  return m === null ? null : `${m[1]}:${m[2]}:${m[3]}`;
}

/**
 * Counts the games the `hard@*` seat lost, from the run's own `games.jsonl`.
 * That is exactly what `--losses-only` will analyse, so it is the pending
 * count's denominator. `pairs.jsonl` cannot supply it: a pair's `scoreA` of
 * 0.5 is a draw plus a loss or two draws, and a draw is not a loss.
 * Returns null when the file is absent.
 */
export function countLosses(runDir: string): number | null {
  const file = path.join(runDir, 'games.jsonl');
  if (!fs.existsSync(file)) return null;
  let losses = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    let game: GameRecord;
    try {
      game = JSON.parse(line) as GameRecord;
    } catch {
      continue;
    }
    // The same rule `run.ts#isLossForHardSeat` applies: a draw is not a loss.
    const seat = hardSeat(game);
    if (seat === null) continue;
    if (game.winner !== null && game.winner !== seat) losses += 1;
  }
  return losses;
}

/** Reads `pairs.jsonl` from the run directory, when there is one to read. */
export function loadPairs(runDir: string): PairRow[] {
  const file = path.join(runDir, 'pairs.jsonl');
  if (!fs.existsSync(file)) return [];
  const out: PairRow[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const row = JSON.parse(line) as PairRow;
      if (typeof row.pairId === 'string') out.push(row);
    } catch {
      // A partially written pairs file is not this tool's problem; skip the line.
    }
  }
  return out;
}

/**
 * Reads every per-game artifact in `dir`. A file that fails to parse is
 * reported rather than thrown: the analyser writes while this runs, so a
 * half-written JSON is expected, not exceptional.
 */
export function collectAnalyses(dir: string): { loaded: LoadedAnalysis[]; unreadable: LossReport['unreadable'] } {
  const loaded: LoadedAnalysis[] = [];
  const unreadable: LossReport['unreadable'] = [];
  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== 'summary.json')
    .sort();
  for (const file of files) {
    try {
      const result = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as AnalysisResult;
      if (typeof result.fileId !== 'string' || !Array.isArray(result.turns)) throw new Error('not an analysis artifact');
      loaded.push({ file, fileId: result.fileId, pairId: pairIdOfFileId(result.fileId), result });
    } catch (err) {
      unreadable.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { loaded, unreadable };
}

function tally<T extends string | number | null>(values: readonly T[]): Array<{ key: T; games: number }> {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, games]) => ({ key, games }))
    .sort((a, b) => (b.games - a.games) || String(a.key).localeCompare(String(b.key)));
}

/** Swing buckets. The lowest edge is the analyser's own swing threshold, so the first bucket is "counted but small". */
const SWING_EDGES: readonly number[] = [300, 500, 1000, 2000, 5000];

function bucketSwings(values: readonly number[]): Bucket[] {
  const labels = [
    `< ${SWING_EDGES[0]}`,
    ...SWING_EDGES.slice(0, -1).map((e, i) => `${e}–${SWING_EDGES[i + 1] - 1}`),
    `>= ${SWING_EDGES[SWING_EDGES.length - 1]}`,
  ];
  const counts = new Array<number>(labels.length).fill(0);
  for (const v of values) {
    let i = 0;
    while (i < SWING_EDGES.length && v >= SWING_EDGES[i]) i++;
    counts[i] += 1;
  }
  return labels.map((label, i) => ({ label, games: counts[i] })).filter(b => b.games > 0);
}

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function turnRow(result: AnalysisResult, turn: number | null): AnalysisResult['turns'][number] | null {
  if (turn === null) return null;
  return result.turns.find(r => r.turnNumber === turn) ?? null;
}

export interface BuildOptions {
  /** Total games the run will analyse, when known from outside the artifacts. */
  expected?: number | null;
  /** Pair rows of the run under analysis, for the double-loss marking. */
  pairs?: readonly PairRow[];
  /** Games the seat lost, from `countLosses`; the pending count's denominator. */
  losses?: number | null;
  /** `--max-turns` the run was launched with. Recorded so the caveat carries a number. */
  maxTurns?: number;
  now?: Date;
}

export function buildLossReport(dir: string, opts: BuildOptions = {}): LossReport {
  const { loaded, unreadable } = collectAnalyses(dir);
  const pairs = opts.pairs ?? [];
  const doubleLoss = new Set(pairs.filter(p => p.scoreA === 0).map(p => p.pairId));
  const expected = opts.expected ?? opts.losses ?? null;

  const firstClasses = loaded.map(l => l.result.firstConsequential.klass);
  const largestClasses = loaded.map(l => l.result.largestSwing.klass);
  const firstTurns = loaded.map(l => l.result.firstConsequential.turn);

  const firstSwings: number[] = [];
  const largestSwings: number[] = [];
  const deadline = { overran: 0, emptyPlan: 0, atOrPastBudget: 0, engineDidNotReproduce: 0, measurable: 0 };
  for (const l of loaded) {
    const first = turnRow(l.result, l.result.firstConsequential.turn);
    if (first !== null) {
      firstSwings.push(first.swingCc);
      if (first.timing.overran) deadline.overran += 1;
      if (first.timing.emptyPlan) deadline.emptyPlan += 1;
      if (first.engine.reproducedPlayed === false) deadline.engineDidNotReproduce += 1;
      if (first.timing.turnMs !== null && first.timing.budgetMs !== null) {
        deadline.measurable += 1;
        if (first.timing.turnMs >= first.timing.budgetMs) deadline.atOrPastBudget += 1;
      }
    }
    const largest = turnRow(l.result, l.result.largestSwing.turn);
    if (largest !== null) largestSwings.push(largest.swingCc);
  }
  const sortedFirst = [...firstSwings].sort((a, b) => a - b);

  // Root exposure at each game's first consequential turn.
  const sources: string[] = [];
  const ranks: number[] = [];
  const listSizes: number[] = [];
  const searchedCounts: number[] = [];
  let adviserBestSearched = 0;
  let adviserBestAtBound = 0;
  let adviserBestAbovePlayed = 0;
  let adviserBestAboveAndDiverged = 0;
  let adviserBestUnsearched = 0;
  let adviserBestAbsent = 0;
  let exposurePresent = 0;
  for (const l of loaded) {
    const first = turnRow(l.result, l.result.firstConsequential.turn);
    const e = first?.exposure ?? null;
    if (first === null || e === null || e === undefined) continue;
    exposurePresent += 1;
    sources.push(e.source);
    listSizes.push(e.count);
    searchedCounts.push(e.searchedCount);
    if (e.adviserBest === null) adviserBestAbsent += 1;
    else {
      ranks.push(e.adviserBest.index);
      if (e.adviserBest.searched) {
        adviserBestSearched += 1;
        if (e.played !== null && e.adviserBest.scoreCc !== null && e.played.scoreCc !== null) {
          if (e.adviserBest.scoreCc === e.played.scoreCc) adviserBestAtBound += 1;
          if (e.adviserBest.scoreCc > e.played.scoreCc) {
            adviserBestAbovePlayed += 1;
            if (!first.engine.reproducedPlayed) adviserBestAboveAndDiverged += 1;
          }
        }
      } else adviserBestUnsearched += 1;
    }
  }
  const stats = (v: readonly number[]): { min: number; median: number; max: number } | null => {
    if (v.length === 0) return null;
    const sorted = [...v].sort((a, b) => a - b);
    return { min: sorted[0], median: median(sorted), max: sorted[sorted.length - 1] };
  };

  const byPair = new Map<string, PairView>();
  for (const l of loaded) {
    const key = l.pairId ?? l.fileId;
    let view = byPair.get(key);
    if (view === undefined) {
      view = { pairId: key, doubleLoss: doubleLoss.has(key), games: [] };
      byPair.set(key, view);
    }
    const first = turnRow(l.result, l.result.firstConsequential.turn);
    view.games.push({
      fileId: l.fileId,
      klass: l.result.firstConsequential.klass,
      turn: l.result.firstConsequential.turn,
      swingCc: first?.swingCc ?? null,
    });
  }
  const pairViews = [...byPair.values()].sort((a, b) =>
    a.doubleLoss === b.doubleLoss ? a.pairId.localeCompare(b.pairId) : a.doubleLoss ? -1 : 1,
  );

  const rules: Partial<Record<LossClass, string>> = {};
  for (const l of loaded) {
    if (l.result.classRules === undefined) continue;
    for (const klass of new Set(firstClasses)) {
      if (rules[klass] === undefined && l.result.classRules[klass] !== undefined) rules[klass] = l.result.classRules[klass];
    }
  }

  return {
    dir: path.resolve(dir),
    analysed: loaded.length,
    expected,
    unreadable,
    summaryPresent: fs.existsSync(path.join(dir, 'summary.json')),
    maxTurnsAnalysed: opts.maxTurns ?? 12,
    adviserWork: loaded[0]?.result.config.adviserWork ?? null,
    swingCc: loaded[0]?.result.config.swingCc ?? null,
    firstClassHistogram: tally(firstClasses).map(t => ({ klass: t.key, games: t.games })),
    largestClassHistogram: tally(largestClasses).map(t => ({ klass: t.key, games: t.games })),
    firstTurnHistogram: tally(firstTurns)
      .map(t => ({ turn: t.key, games: t.games }))
      .sort((a, b) => (a.turn ?? Infinity) - (b.turn ?? Infinity)),
    firstSwingBuckets: bucketSwings(firstSwings),
    largestSwingBuckets: bucketSwings(largestSwings),
    firstSwingStats:
      sortedFirst.length === 0 ? null : { min: sortedFirst[0], median: median(sortedFirst), max: sortedFirst[sortedFirst.length - 1] },
    deadline,
    exposure: {
      present: exposurePresent,
      bySource: tally(sources).map(t => ({ source: t.key, turns: t.games })),
      adviserBestSearched,
      adviserBestAtBound,
      adviserBestAbovePlayed,
      adviserBestAboveAndDiverged,
      adviserBestUnsearched,
      adviserBestAbsent,
      adviserBestRank: stats(ranks),
      listSize: stats(listSizes),
      searchedOfList: stats(searchedCounts),
    },
    pairs: pairViews,
    doubleLossPairsSeen: pairViews.filter(p => p.doubleLoss).length,
    doubleLossPairsTotal: doubleLoss.size,
    classRules: rules,
    at: (opts.now ?? new Date()).toISOString(),
  };
}

function pct(n: number, of: number): string {
  return of === 0 ? '—' : `${((100 * n) / of).toFixed(0)}%`;
}

export function renderLossReportMarkdown(r: LossReport): string {
  const lines: string[] = [];
  const pending = r.expected === null ? null : Math.max(0, r.expected - r.analysed);
  lines.push('# Baseline loss analysis — incremental cut');
  lines.push('');
  lines.push(
    `${r.analysed} game(s) analysed` +
      (r.expected === null ? '' : ` of ${r.expected}; ${pending} pending`) +
      `. Source \`${r.dir}\`. Cut taken ${r.at}.`,
  );
  lines.push('');
  lines.push(
    r.summaryPresent
      ? '`summary.json` is present, so the run has finished and these numbers are final for this directory.'
      : '`summary.json` is not present: the run is still going and every number below moves.',
  );
  lines.push('');
  lines.push(
    `**The run was launched with \`--max-turns ${r.maxTurnsAnalysed}\`.** No turn past ${r.maxTurnsAnalysed} was analysed, ` +
      'so a largest-swing turn later than that is invisible here and the largest-swing figures are ' +
      `the largest swing WITHIN the first ${r.maxTurnsAnalysed} turns, not within the game.`,
  );
  if (r.adviserWork !== null && r.swingCc !== null) {
    lines.push('');
    lines.push(`Adviser work ${r.adviserWork.toLocaleString('en-US')} units; swing threshold ${r.swingCc.toLocaleString('en-US')} cc.`);
  }
  if (r.unreadable.length > 0) {
    lines.push('');
    lines.push(`${r.unreadable.length} file(s) could not be parsed this pass (a file caught mid-write reads this way):`);
    for (const u of r.unreadable) lines.push(`- \`${u.file}\`: ${u.error}`);
  }

  lines.push('');
  lines.push('## First consequential decision — class');
  lines.push('');
  lines.push('| class | games | share |');
  lines.push('| --- | ---: | ---: |');
  for (const row of r.firstClassHistogram) lines.push(`| ${row.klass} | ${row.games} | ${pct(row.games, r.analysed)} |`);

  lines.push('');
  lines.push(`## Largest-swing turn — class (within the first ${r.maxTurnsAnalysed} turns)`);
  lines.push('');
  lines.push('| class | games | share |');
  lines.push('| --- | ---: | ---: |');
  for (const row of r.largestClassHistogram) lines.push(`| ${row.klass} | ${row.games} | ${pct(row.games, r.analysed)} |`);

  lines.push('');
  lines.push('## First consequential decision — turn number');
  lines.push('');
  lines.push('| turn | games | share |');
  lines.push('| ---: | ---: | ---: |');
  for (const row of r.firstTurnHistogram) {
    lines.push(`| ${row.turn ?? '(none)'} | ${row.games} | ${pct(row.games, r.analysed)} |`);
  }

  lines.push('');
  lines.push('## Swing at the first consequential turn');
  lines.push('');
  if (r.firstSwingStats === null) {
    lines.push('No game has a first consequential turn yet.');
  } else {
    lines.push(
      `min ${r.firstSwingStats.min} cc, median ${r.firstSwingStats.median} cc, max ${r.firstSwingStats.max} cc.`,
    );
    lines.push('');
    lines.push('| swing cc | games |');
    lines.push('| --- | ---: |');
    for (const b of r.firstSwingBuckets) lines.push(`| ${b.label} | ${b.games} |`);
  }
  lines.push('');
  lines.push(`Swing at the largest-swing turn (first ${r.maxTurnsAnalysed} turns only):`);
  lines.push('');
  lines.push('| swing cc | games |');
  lines.push('| --- | ---: |');
  for (const b of r.largestSwingBuckets) lines.push(`| ${b.label} | ${b.games} |`);

  lines.push('');
  lines.push('## Was the first consequential turn deadline-cut?');
  lines.push('');
  lines.push('| measure | games | of analysed |');
  lines.push('| --- | ---: | ---: |');
  lines.push(`| turn broke its wall allowance (\`timing.overran\`) | ${r.deadline.overran} | ${pct(r.deadline.overran, r.analysed)} |`);
  lines.push(`| turn at or past the allowance, tolerance aside | ${r.deadline.atOrPastBudget} | ${pct(r.deadline.atOrPastBudget, r.analysed)} |`);
  lines.push(`| turn dispatched nothing but phase ends (\`timing.emptyPlan\`) | ${r.deadline.emptyPlan} | ${pct(r.deadline.emptyPlan, r.analysed)} |`);
  lines.push(
    `| fixed-work re-run did not reproduce the played turn | ${r.deadline.engineDidNotReproduce} | ${pct(r.deadline.engineDidNotReproduce, r.analysed)} |`,
  );
  lines.push('');
  lines.push(
    `${r.deadline.measurable} of ${r.analysed} first-consequential turns carry both a wall time and an allowance. ` +
      'The seat played under `wall:3000`; the analyser re-runs the production engine at FIXED work, so a turn that ' +
      'was deadline-cut in the game was not deadline-cut in the re-run, and a class assigned to such a turn is a ' +
      'statement about the fixed-work engine, not about what the seat had time to do.',
  );

  lines.push('');
  lines.push('## Root exposure at the first consequential turn');
  lines.push('');
  if (r.exposure.present === 0) {
    lines.push(
      'No analysed game carries root exposure. Artifacts written before E2 lane 1 have none; ' +
        '`hard:analyze --reclassify <dir> --rerun-root` retrofits them by re-running the production engine at the flagged turns.',
    );
  } else {
    lines.push(`${r.exposure.present} of ${r.analysed} first-consequential turns carry \`RootResult.candidates\`.`);
    lines.push('');
    lines.push('| candidateSource | turns |');
    lines.push('| --- | ---: |');
    for (const row of r.exposure.bySource) lines.push(`| ${row.source} | ${row.turns} |`);
    lines.push('');
    lines.push('| the adviser\'s best turn, in the root\'s own candidate list | turns |');
    lines.push('| --- | ---: |');
    lines.push(`| in the list and SEARCHED (misjudged) | ${r.exposure.adviserBestSearched} |`);
    lines.push(`| of those, scored at the incumbent's fail-low bound | ${r.exposure.adviserBestAtBound} |`);
    lines.push(`| of those, scored ABOVE the played turn | ${r.exposure.adviserBestAbovePlayed} |`);
    lines.push(`| of those, the re-run also did not reproduce the played turn (fixed-work-divergence) | ${r.exposure.adviserBestAboveAndDiverged} |`);
    lines.push(`| in the list and NOT searched (discarded) | ${r.exposure.adviserBestUnsearched} |`);
    lines.push(`| not in the published list (inconsistent) | ${r.exposure.adviserBestAbsent} |`);
    const range = (s: { min: number; median: number; max: number } | null): string =>
      s === null ? '—' : `${s.min} / ${s.median} / ${s.max}`;
    lines.push('');
    lines.push(`Adviser-best rank in the list (min / median / max): ${range(r.exposure.adviserBestRank)}.`);
    lines.push(`Candidates published: ${range(r.exposure.listSize)}. Of those, searched: ${range(r.exposure.searchedOfList)}.`);
    lines.push('');
    lines.push(
      'A `generator-list` source means the root published its pre-deepening list (the must-answer scan, the book probe, ' +
        '`pickUnsearched` or a fallback answered), where every candidate is unsearched by construction and the split says nothing. ' +
        'The re-run is FIXED work while the seat played under a wall clock, so `searched` is what the re-run searched.',
    );
  }
  lines.push('');
  lines.push('## Pairs');
  lines.push('');
  lines.push(`${r.doubleLossPairsSeen} of ${r.doubleLossPairsTotal} double-loss pairs have at least one analysed game.`);
  lines.push('');
  lines.push('| pair | double loss | games analysed | first-consequential classes |');
  lines.push('| --- | :-: | ---: | --- |');
  for (const p of r.pairs) {
    const detail = p.games.map(g => `${g.klass}@${g.turn ?? '—'}${g.swingCc === null ? '' : ` (${g.swingCc} cc)`}`).join('; ');
    lines.push(`| ${p.pairId} | ${p.doubleLoss ? 'yes' : ''} | ${p.games.length} | ${detail} |`);
  }

  const ruleKeys = Object.keys(r.classRules);
  if (ruleKeys.length > 0) {
    lines.push('');
    lines.push('## What each class means');
    lines.push('');
    lines.push('Quoted from the artifacts, which carry the rule they were labelled by.');
    lines.push('');
    for (const k of ruleKeys) lines.push(`- **${k}**: ${r.classRules[k as LossClass]}`);
  }
  lines.push('');
  return lines.join('\n');
}

interface Cli {
  dir: string;
  runDir: string | null;
  out: string | null;
  expected: number | null;
  maxTurns: number;
}

export function parseArgs(argv: readonly string[]): Cli {
  let dir: string | null = null;
  let runDir: string | null = null;
  let out: string | null = null;
  let expected: number | null = null;
  let maxTurns = 12;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const need = (): string => {
      if (value === undefined) throw new Error(`loss-report: ${flag} needs a value`);
      i++;
      return value;
    };
    switch (flag) {
      case '--dir': dir = need(); break;
      case '--run-dir': runDir = need(); break;
      case '--out': out = need(); break;
      case '--expect': expected = Number(need()); break;
      case '--max-turns': maxTurns = Number(need()); break;
      default:
        if (flag.startsWith('--')) throw new Error(`loss-report: unknown flag ${flag}`);
        if (dir !== null) throw new Error('loss-report: pass one analysis directory');
        dir = flag;
    }
  }
  if (dir === null) throw new Error('loss-report: pass the analysis output directory (positionally or with --dir)');
  if (expected !== null && !Number.isFinite(expected)) throw new Error('loss-report: --expect must be a number');
  if (!Number.isFinite(maxTurns)) throw new Error('loss-report: --max-turns must be a number');
  return { dir, runDir, out, expected, maxTurns };
}

function main(argv: readonly string[]): void {
  const cli = parseArgs(argv);
  const dir = path.resolve(cli.dir);
  if (!fs.existsSync(dir)) throw new Error(`loss-report: ${dir} does not exist`);
  // The run directory holds `pairs.jsonl`; the analysis directory is normally
  // written inside it (`--out <run>/analysis-e2`), so its parent is the default.
  const runDir = path.resolve(cli.runDir ?? path.dirname(dir));
  const report = buildLossReport(dir, {
    expected: cli.expected,
    pairs: loadPairs(runDir),
    losses: countLosses(runDir),
    maxTurns: cli.maxTurns,
  });
  const md = renderLossReportMarkdown(report);
  process.stdout.write(md);
  if (cli.out !== null) {
    const outPath = path.resolve(cli.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, md);
    process.stderr.write(`loss-report: wrote ${outPath}\n`);
  }
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main(process.argv.slice(2));
