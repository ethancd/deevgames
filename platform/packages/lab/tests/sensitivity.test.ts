import { describe, expect, it } from 'vitest';
import { runSeries } from '../src/runner.ts';
import { randomBot, greedyBot } from '../src/bots.ts';
import { wilson } from '../src/stats.ts';
import { nim, perfectBot, nimGrundy, DEFAULT_NIM_HEAPS, type NimState } from './fixtures/nim.ts';

describe('sensitivity gate: perfect play vs random on nim', () => {
  it('starts from a position where the mover has a non-zero Grundy value', () => {
    expect(nimGrundy(DEFAULT_NIM_HEAPS)).not.toBe(0);
  });

  it('perfectBot beats randomBot with a Wilson CI lower bound > 0.5 over 200 games', async () => {
    const series = await runSeries({
      game: nim,
      config: { heaps: DEFAULT_NIM_HEAPS },
      bots: [perfectBot, randomBot('Random')],
      games: 200,
      seedStart: 12345,
    });

    const tally = series.byBot['PerfectNim'];
    const trials = tally.wins + tally.losses + tally.draws;
    const ci = wilson(tally.wins, trials);
    expect(ci.lo).toBeGreaterThan(0.5);
    expect(series.illegalActions).toBe(0);
    expect(series.invariantViolations).toBe(0);
  });
});

describe('greedyBot on nim', () => {
  it('rejects a GameDef with observe() defined', () => {
    const withObserve = { ...nim, observe: (state: NimState) => state };
    expect(() => greedyBot(withObserve)).toThrow(/observe/);
  });

  it('rejects a GameDef with neither scoreFn nor def.score', () => {
    const withoutScore = { ...nim, score: undefined };
    expect(() => greedyBot(withoutScore)).toThrow(/score/);
  });

  it('beats randomBot in a short pinned-seed series (one-ply-exact eval = perfect play here)', async () => {
    const series = await runSeries({
      game: nim,
      config: { heaps: DEFAULT_NIM_HEAPS },
      bots: [greedyBot(nim), randomBot('Random')],
      games: 20,
      seedStart: 9,
    });

    const greedyTally = series.byBot['Greedy'];
    const randomTally = series.byBot['Random'];
    expect(greedyTally.wins).toBeGreaterThan(randomTally.wins);
    expect(greedyTally.wins).toBeGreaterThan(0);
  });
});
