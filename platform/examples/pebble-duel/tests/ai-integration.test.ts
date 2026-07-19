// Stage 2, AI leg: @deev/ai's minimax on the real example GameDef,
// benchmarked through @deev/lab with zero adapters.

import { describe, expect, it } from 'vitest';
import { runSeries, randomBot, wilson } from '@deev/lab';
import { makeMinimaxBot, composeEval } from '@deev/ai';
import { pebbleDuel, type PebbleState } from '../src/game.ts';

const grundyEval = composeEval<PebbleState>([
  {
    name: 'grundy',
    weight: 1,
    measure: (state, seat) => pebbleDuel.score!(state, seat),
  },
]);

describe('@deev/ai on pebble-duel', () => {
  it('minimax (real consumer, not a fixture) never loses to random', async () => {
    const bot = makeMinimaxBot(pebbleDuel, grundyEval, {
      budget: { depth: 6 },
      name: 'minimax-d6',
    });
    const series = await runSeries({
      game: pebbleDuel,
      config: { heaps: [3, 5, 4] },
      bots: [bot, randomBot()],
      games: 60,
      seedStart: 2100,
    });
    const tally = series.byBot['minimax-d6'];
    // From heaps [3,5,4] (Grundy 3^1^0 = 2 ≠ 0) a depth-6 searcher with the
    // exact Grundy eval should dominate a random mover overwhelmingly.
    expect(tally.losses).toBe(0);
    const ci = wilson(tally.wins, tally.wins + tally.losses + tally.draws);
    expect(ci.lo).toBeGreaterThan(0.5);
    expect(bot.lastSearch?.algorithm).toBe('minimax');
  });
});
