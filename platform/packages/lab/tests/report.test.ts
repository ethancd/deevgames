import { describe, expect, it } from 'vitest';
import type { SeriesResult } from '../src/runner.ts';
import { matchupReport, sweepReport } from '../src/report.ts';

function fixedMatchupSeries(): SeriesResult {
  return {
    schema: 'deev-lab-series-v1',
    engineHash: 'deadbeef',
    configHash: 'cafef00d',
    seedStart: 1,
    games: 4,
    records: [
      {
        schema: 'deev-lab-game-v1',
        gameIndex: 0,
        seed: 1,
        seatAssignment: { first: 'Alpha', second: 'Beta' },
        result: { winner: 'first', reason: 'win' },
        plies: 3,
        illegalActions: 0,
        engineHash: 'deadbeef',
        configHash: 'cafef00d',
      },
    ],
    byBot: {
      Alpha: { wins: 3, losses: 1, draws: 0 },
      Beta: { wins: 1, losses: 3, draws: 0 },
    },
    illegalActions: 0,
    invariantViolations: 0,
  };
}

function fixedSweepSeries(): SeriesResult {
  return {
    schema: 'deev-lab-series-v1',
    engineHash: 'deadbeef',
    configHash: 'cafef00d',
    seedStart: 5,
    games: 2,
    records: [
      {
        schema: 'deev-lab-game-v1',
        gameIndex: 0,
        seed: 5,
        seatAssignment: { solo: 'Roller' },
        result: { winner: 'solo', reason: 'done', scores: { solo: 12 } },
        plies: 3,
        illegalActions: 0,
        engineHash: 'deadbeef',
        configHash: 'cafef00d',
      },
      {
        schema: 'deev-lab-game-v1',
        gameIndex: 1,
        seed: 6,
        seatAssignment: { solo: 'Roller' },
        result: { winner: null, reason: 'done', scores: { solo: 7 } },
        plies: 3,
        illegalActions: 0,
        engineHash: 'deadbeef',
        configHash: 'cafef00d',
      },
    ],
    byBot: { Roller: { wins: 1, losses: 0, draws: 1 } },
    illegalActions: 0,
    invariantViolations: 0,
  };
}

describe('matchupReport', () => {
  it('renders a fixed series to an exact markdown string', () => {
    expect(matchupReport(fixedMatchupSeries())).toMatchInlineSnapshot(`
      "# Matchup Report

      - engineHash: \`deadbeef\`
      - configHash: \`cafef00d\`
      - seedStart: 1
      - games: 4
      - illegalActions: 0
      - invariantViolations: 0

      | Bot | Wins | Losses | Draws | Win% [95% CI] |
      | --- | --- | --- | --- | --- |
      | Alpha | 3 | 1 | 0 | 75.0% [30.1%–95.4%] |
      | Beta | 1 | 3 | 0 | 25.0% [4.6%–69.9%] |
      "
    `);
  });

  it('is deterministic across repeated calls on the same input', () => {
    const series = fixedMatchupSeries();
    expect(matchupReport(series)).toBe(matchupReport(series));
  });
});

describe('sweepReport', () => {
  it('renders a fixed single-bot series to an exact markdown string', () => {
    expect(sweepReport(fixedSweepSeries())).toMatchInlineSnapshot(`
      "# Sweep Report

      - bot: Roller
      - engineHash: \`deadbeef\`
      - configHash: \`cafef00d\`
      - seedStart: 5
      - games: 2
      - illegalActions: 0
      - invariantViolations: 0

      - success rate (winner === seat): 50.0% [9.5%–90.5%] (1/2)
      - mean score: 9.500 (n=2)
      - score distribution: 12, 7
      "
    `);
  });

  it('rejects a multi-bot series', () => {
    expect(() => sweepReport(fixedMatchupSeries())).toThrow(/exactly one bot/);
  });
});
