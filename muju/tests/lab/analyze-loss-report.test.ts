// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLossReport,
  collectAnalyses,
  countLosses,
  loadPairs,
  pairIdOfFileId,
  parseArgs,
  renderLossReportMarkdown,
} from '../../lab/hard-ai/analyze/loss-report';

/**
 * `loss-report.ts` reads an `hard:analyze --run` output directory WHILE the run
 * is writing it, so the cases below are mostly about partial state: no
 * `summary.json`, a file caught mid-write, a pair with only one of its two
 * games analysed. The two fixtures are trimmed copies of the committed
 * analysis artifact (`lab/results/hard-ai-e1/analyze/g3-s1_0_1-B-white.json`)
 * carrying three turns each, renamed onto two real baseline pair ids: one of
 * the ten double-loss pairs and one ordinary pair.
 */

const FIXTURES = path.resolve(__dirname, 'fixtures/analyze-loss-report');
const DOUBLE_LOSS = 'g3-s45:3:11';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'muju-loss-report-'));
}

/** A run directory holding an analysis directory and a `pairs.jsonl` describing the two fixture pairs. */
function stageRun(files: readonly string[], extra: Record<string, string> = {}): { run: string; analysis: string } {
  const run = tempDir();
  const analysis = path.join(run, 'analysis-e2');
  fs.mkdirSync(analysis);
  for (const f of files) fs.copyFileSync(path.join(FIXTURES, f), path.join(analysis, f));
  for (const [name, body] of Object.entries(extra)) fs.writeFileSync(path.join(analysis, name), body);
  // Three games: the hard seat is white and lost two of them, so `--losses-only`
  // will analyse two. The third is a win and is never analysed.
  const game = (winner: string, pairId: string, orientation: string): string =>
    JSON.stringify({
      pairId,
      orientation,
      winner,
      players: { white: { bot: 'hard@desktop' }, black: { bot: 'aiv2-hard' } },
    });
  fs.writeFileSync(
    path.join(run, 'games.jsonl'),
    [
      game('black', DOUBLE_LOSS, 'A-white'),
      game('black', 'e1-g2-s100:0:92', 'B-white'),
      game('white', 'e1-g2-s100:3:93', 'A-white'),
    ].join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(run, 'pairs.jsonl'),
    [
      JSON.stringify({ pairIndex: 11, pairId: DOUBLE_LOSS, opening: 'g3-s45', handicap: 3, scoreA: 0 }),
      JSON.stringify({ pairIndex: 92, pairId: 'e1-g2-s100:0:92', opening: 'e1-g2-s100', handicap: 0, scoreA: 1 }),
      JSON.stringify({ pairIndex: 93, pairId: 'e1-g2-s100:3:93', opening: 'e1-g2-s100', handicap: 3, scoreA: 2 }),
    ].join('\n') + '\n',
  );
  return { run, analysis };
}

const BOTH = ['g3-s45_3_11-A-white.json', 'e1-g2-s100_0_92-B-white.json'] as const;

describe('loss-report: file ids and pair ids', () => {
  it('rebuilds the pair id a replay file id came from', () => {
    expect(pairIdOfFileId('e1-g4-s750_0_18-A-white')).toBe('e1-g4-s750:0:18');
    expect(pairIdOfFileId('g3-s45_3_11-B-white')).toBe('g3-s45:3:11');
    expect(pairIdOfFileId('summary')).toBeNull();
  });
});

describe('loss-report: reading a directory mid-run', () => {
  it('reads the artifacts that exist and reports the rest as pending', () => {
    const { run, analysis } = stageRun(BOTH);
    const report = buildLossReport(analysis, { pairs: loadPairs(run), losses: countLosses(run) });
    expect(report.analysed).toBe(2);
    expect(report.expected).toBe(2);
    expect(report.summaryPresent).toBe(false);
    expect(report.unreadable).toEqual([]);
    expect(renderLossReportMarkdown(report)).toContain('2 game(s) analysed of 2; 0 pending');
  });

  it('survives a file caught mid-write and names it', () => {
    const { run, analysis } = stageRun(BOTH, { 'e1-g4-s750_0_18-A-white.json': '{"fileId": "e1-g4-s7' });
    const report = buildLossReport(analysis, { pairs: loadPairs(run) });
    expect(report.analysed).toBe(2);
    expect(report.unreadable.map(u => u.file)).toEqual(['e1-g4-s750_0_18-A-white.json']);
    expect(renderLossReportMarkdown(report)).toContain('could not be parsed this pass');
  });

  it('ignores summary.json as a game but reports that the run has finished', () => {
    const { run, analysis } = stageRun(BOTH, { 'summary.json': '{"schema":"muju-hard-analyze-summary-v1"}' });
    const report = buildLossReport(analysis, { pairs: loadPairs(run) });
    expect(report.analysed).toBe(2);
    expect(report.summaryPresent).toBe(true);
    expect(renderLossReportMarkdown(report)).toContain('the run has finished');
  });

  it('counts losses from games.jsonl, not from the pair scores', () => {
    const { run } = stageRun(BOTH);
    expect(countLosses(run)).toBe(2);
    // A draw carries scoreA 0.5 and is not a loss; the pair scores cannot say so.
    expect(loadPairs(run).reduce((n, p) => n + (2 - p.scoreA), 0)).toBe(3);
    expect(countLosses(tempDir())).toBeNull();
  });

  it('works with no pairs.jsonl at all', () => {
    const { analysis } = stageRun(BOTH);
    const report = buildLossReport(analysis);
    expect(report.expected).toBeNull();
    expect(report.doubleLossPairsTotal).toBe(0);
    expect(renderLossReportMarkdown(report)).toContain('2 game(s) analysed.');
  });

  it('collects nothing from an empty directory without throwing', () => {
    const dir = tempDir();
    expect(collectAnalyses(dir)).toEqual({ loaded: [], unreadable: [] });
    const report = buildLossReport(dir);
    expect(report.analysed).toBe(0);
    expect(report.firstSwingStats).toBeNull();
    expect(renderLossReportMarkdown(report)).toContain('No game has a first consequential turn yet.');
  });
});

describe('loss-report: the histograms', () => {
  const { run, analysis } = stageRun(BOTH);
  const report = buildLossReport(analysis, { pairs: loadPairs(run), now: new Date('2026-09-17T01:00:00Z') });

  it('counts the first-consequential class of each game', () => {
    expect(report.firstClassHistogram).toEqual([
      { klass: 'reply-outside-beam', games: 1 },
      { klass: 'strong-candidate-misjudged', games: 1 },
    ]);
  });

  it('reports the turn number the first consequential decision fell on, in turn order', () => {
    expect(report.firstTurnHistogram).toEqual([
      { turn: 3, games: 1 },
      { turn: 6, games: 1 },
    ]);
  });

  it('reports the swing at that turn, bucketed and summarised', () => {
    expect(report.firstSwingStats).toEqual({ min: 412, median: 659, max: 905 });
    expect(report.firstSwingBuckets).toEqual([
      { label: '300–499', games: 1 },
      { label: '500–999', games: 1 },
    ]);
  });

  it('counts the first-consequential turns that were deadline-cut', () => {
    expect(report.deadline).toEqual({
      overran: 1,
      emptyPlan: 0,
      atOrPastBudget: 1,
      engineDidNotReproduce: 1,
      measurable: 2,
    });
  });

  it('marks the double-loss pair and sorts it first', () => {
    expect(report.pairs.map(p => p.pairId)).toEqual([DOUBLE_LOSS, 'e1-g2-s100:0:92']);
    expect(report.pairs[0].doubleLoss).toBe(true);
    expect(report.pairs[1].doubleLoss).toBe(false);
    expect(report.doubleLossPairsSeen).toBe(1);
    expect(report.doubleLossPairsTotal).toBe(1);
  });

  it('quotes the class rule out of the artifacts rather than restating it', () => {
    expect(report.classRules['strong-candidate-misjudged']).toContain('RootResult exposes neither');
  });

  it('says in the markdown that turns past --max-turns were never analysed', () => {
    const md = renderLossReportMarkdown(report);
    expect(md).toContain('--max-turns 12');
    expect(md).toContain('not within the game');
    expect(md).toContain('| g3-s45:3:11 | yes | 1 |');
  });
});

describe('loss-report: CLI', () => {
  it('takes the analysis directory positionally or by flag', () => {
    expect(parseArgs(['out/analysis-e2']).dir).toBe('out/analysis-e2');
    expect(parseArgs(['--dir', 'x']).dir).toBe('x');
    expect(parseArgs(['x', '--out', 'r.md', '--expect', '47', '--max-turns', '12'])).toEqual({
      dir: 'x',
      runDir: null,
      out: 'r.md',
      expected: 47,
      maxTurns: 12,
    });
  });

  it('refuses an unknown flag, a second directory and a missing directory', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown flag/);
    expect(() => parseArgs(['a', 'b'])).toThrow(/one analysis directory/);
    expect(() => parseArgs([])).toThrow(/analysis output directory/);
  });

  it('lets --expect override the count derived from games.jsonl', () => {
    const { run, analysis } = stageRun(BOTH);
    expect(buildLossReport(analysis, { losses: countLosses(run), expected: 47 }).expected).toBe(47);
  });
});
