// Stage 2: the platform composition gates — core + lab + content + llm
// working together on one real (tiny) game. The @deev/ai check lives in
// ai-integration.test.ts.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runSeries, randomBot, matchupReport, wilson } from '@deev/lab';
import { verifierIssues, fixtureDriftTest } from '@deev/content';
import { pebbleDuel } from '../src/game.ts';
import { parsePuzzleCsv, puzzleContent, puzzleVerifier } from '../src/puzzles.ts';
import { perfectBot, cannedMoveClient, llmBot } from '../src/bots.ts';

const here = dirname(fileURLToPath(import.meta.url));
const csvText = readFileSync(join(here, '../data/puzzles.csv'), 'utf8');

describe('lab series: perfect vs random', () => {
  it('perfect play dominates with a CI excluding 0.5, and the report is byte-identical across runs', async () => {
    const run = () =>
      runSeries({
        game: pebbleDuel,
        config: {},
        bots: [perfectBot(), randomBot()],
        games: 200,
        seedStart: 1000,
      });
    const series1 = await run();
    const series2 = await run();

    const tally = series1.byBot['perfect'];
    const ci = wilson(tally.wins, tally.wins + tally.losses + tally.draws);
    expect(ci.lo).toBeGreaterThan(0.5);

    const report1 = matchupReport(series1);
    const report2 = matchupReport(series2);
    expect(report1).toEqual(report2); // byte-identical determinism gate

    // The committed artifact: regenerated on every test run, must never drift.
    writeFileSync(join(here, '../REPORT.md'), report1);
  });
});

describe('content: CSV puzzle pack, verified', () => {
  it('loads the pack from the self-describing CSV with no warnings', () => {
    const { puzzles, warnings } = parsePuzzleCsv(csvText);
    expect(warnings).toEqual([]);
    expect(puzzles.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(puzzles[0].heaps).toEqual([3, 5, 7]);
  });

  it('fixtures pass drift + seam checks', () => {
    const { puzzles } = parsePuzzleCsv(csvText);
    expect(fixtureDriftTest(puzzleContent(puzzles))).toEqual([]);
  });

  it('every shipped position is winnable-for-first and not pre-solved', () => {
    const { puzzles } = parsePuzzleCsv(csvText);
    expect(verifierIssues(puzzleVerifier, puzzles, { itemName: (p) => p.id })).toEqual([]);
  });

  it('the verifier catches a bad position (zero-Grundy start)', () => {
    const issues = verifierIssues(
      puzzleVerifier,
      [{ id: 'bad', name: 'Balanced Trap', heaps: [1, 2, 3] }], // 1^2^3 = 0: second player wins
      { itemName: (p) => p.id },
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatch(/solvable/);
  });
});

describe('llm -> lab -> core composition (mock client, zero network)', () => {
  it('the structured-call bot plays a legal full series', async () => {
    const series = await runSeries({
      game: pebbleDuel,
      config: {},
      bots: [llmBot(cannedMoveClient()), randomBot()],
      games: 10,
      seedStart: 42,
      legality: 'strict',
    });
    expect(series.illegalActions).toBe(0);
    expect(series.records).toHaveLength(10);
    for (const record of series.records) {
      expect(record.result.reason).toBe('last-take');
    }
  });
});
