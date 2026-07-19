import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@deev/core';
import { runSeries, wilson } from '@deev/lab';
import { makeMinimaxBot } from '../src/minimax.ts';
import { nim, nimValue } from './fixtures/nim.ts';

const zeroEval = () => 0;

function heapConfigs(count: number, seed: number): number[][] {
  // Kept deliberately small: full-depth search of unbounded Nim is a raw
  // (unmemoized) game tree, so total objects must stay small enough that
  // the whole suite stays fast. 2 heaps, 1..4 each (<=8 objects total) keeps
  // every case well under a second even unpruned.
  const rng = mulberry32(seed);
  const configs: number[][] = [];
  for (let i = 0; i < count; i++) {
    const heaps = [1 + rng.int(4), 1 + rng.int(4)];
    configs.push(heaps);
  }
  return configs;
}

describe('nim root-score sign matches nimValue', () => {
  it('agrees with the XOR ground truth over ~30 heap configs at full depth', () => {
    const configs = heapConfigs(30, 777);
    for (const heaps of configs) {
      const totalObjects = heaps.reduce((a, b) => a + b, 0);
      const bot = makeMinimaxBot(nim, zeroEval, {
        budget: { depth: totalObjects },
        transposition: {},
      });
      const rng = mulberry32(1);
      const state = nim.init({ heaps }, rng);
      const legal = nim.legal(state, 'A');
      bot.choose({ view: state, seat: 'A', legal, rng });

      const rootScore = bot.lastSearch!.root[0].score;
      const value = nimValue(heaps);

      if (value === 0) {
        // P-position: the mover to act is losing under perfect play.
        expect(rootScore).toBeLessThan(0);
      } else {
        // N-position: the mover to act can force a win.
        expect(rootScore).toBeGreaterThan(0);
      }
    }
  });
});

describe('budget monotonicity', () => {
  it('depth-4 minimax beats depth-1 minimax over 200 seeded games (Wilson CI excludes 0.5)', async () => {
    // heaps: [1,1,2] (nimValue = 2, an N-position). With zeroEval supplying
    // no positional signal at all, depth-4 fully solves this tiny game
    // (total objects = 4) while depth-1 only sees immediate terminal moves
    // (none exist from the start) and falls back to its fixed move-
    // enumeration order — which is provably not the XOR-optimal move here.
    // depth-4 therefore wins regardless of which seat it's rotated into.
    const result = await runSeries({
      game: nim,
      config: { heaps: [1, 1, 2] },
      bots: [
        makeMinimaxBot(nim, zeroEval, { budget: { depth: 4 }, name: 'Depth4' }),
        makeMinimaxBot(nim, zeroEval, { budget: { depth: 1 }, name: 'Depth1' }),
      ],
      games: 200,
      seedStart: 31_000,
    });

    const d4 = result.byBot.Depth4;
    const trials = d4.wins + d4.losses + d4.draws;
    const ci = wilson(d4.wins, trials);
    expect(ci.lo).toBeGreaterThan(0.5);
  });
});
