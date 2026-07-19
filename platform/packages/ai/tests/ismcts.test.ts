import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@deev/core';
import { randomBot, runSeries, wilson } from '@deev/lab';
import { makeIsmctsBot } from '../src/ismcts.ts';
import type { Plan } from '../src/planner.ts';
import { emptyPosition, mustBlock, ticTacToe, winInOne } from './fixtures/tic-tac-toe.ts';
import {
  exactBelief,
  hiddenDuel,
  standardConfig,
  viewAsStateBelief,
  wrongBelief,
} from './fixtures/hidden-duel.ts';
import type { TicTacToeAction, TicTacToeState } from './fixtures/tic-tac-toe.ts';

const trivialBelief = viewAsStateBelief<TicTacToeState, TicTacToeState>();

describe('makeIsmctsBot construction guard', () => {
  it('throws when ctx.legal is empty', () => {
    const bot = makeIsmctsBot(ticTacToe, { beliefModel: trivialBelief, budget: { iterations: 10 } });
    expect(() =>
      bot.choose({ view: emptyPosition(), seat: 'X', legal: [], rng: mulberry32(1) }),
    ).toThrow(/ctx.legal was empty/);
  });
});

describe('perfect-info degeneration', () => {
  it('finds the immediate winning move on tic-tac-toe with a trivial belief model', () => {
    const bot = makeIsmctsBot(ticTacToe, {
      beliefModel: trivialBelief,
      budget: { iterations: 150, playoutDepth: 9 },
      name: 'Ismcts',
    });
    const state = winInOne();
    const legal = ticTacToe.legal(state, 'X');
    const action = bot.choose({ view: state, seat: 'X', legal, rng: mulberry32(1) });
    expect(action).toBe(2);
  });

  it('finds the blocking move on tic-tac-toe with a trivial belief model', () => {
    const bot = makeIsmctsBot(ticTacToe, {
      beliefModel: trivialBelief,
      budget: { iterations: 150, playoutDepth: 9 },
      name: 'Ismcts',
    });
    const state = mustBlock();
    const legal = ticTacToe.legal(state, 'O');
    const action = bot.choose({ view: state, seat: 'O', legal, rng: mulberry32(2) });
    expect(action).toBe(2);
  });
});

describe('planner injection', () => {
  it('a stub planner\'s winning plan is chosen as the root action', () => {
    const stubPlanner = (): Plan<TicTacToeAction>[] => [
      { id: 'win', actions: [2], score: 10, tags: ['win'] },
      { id: 'junk', actions: [5], score: -10, tags: ['junk'] },
    ];
    const bot = makeIsmctsBot(ticTacToe, {
      beliefModel: trivialBelief,
      planner: stubPlanner,
      budget: { iterations: 60, playoutDepth: 5 },
    });
    const state = winInOne();
    const legal = ticTacToe.legal(state, 'X');
    const action = bot.choose({ view: state, seat: 'X', legal, rng: mulberry32(3) });
    expect(action).toBe(2);
  });

  it('omitting the planner: root arity equals legal count', () => {
    const bot = makeIsmctsBot(ticTacToe, {
      beliefModel: trivialBelief,
      budget: { iterations: 20, playoutDepth: 3 },
    });
    const state = emptyPosition();
    const legal = ticTacToe.legal(state, 'X');
    bot.choose({ view: state, seat: 'X', legal, rng: mulberry32(4) });
    expect(bot.lastSearch?.root.length).toBe(legal.length);
  });
});

describe('budget enforcement', () => {
  it('maxNodes is respected within one search batch', () => {
    const state = emptyPosition();
    const legal = ticTacToe.legal(state, 'X');

    const uncapped = makeIsmctsBot(ticTacToe, {
      beliefModel: trivialBelief,
      budget: { iterations: 500, playoutDepth: 5 },
    });
    uncapped.choose({ view: state, seat: 'X', legal, rng: mulberry32(5) });

    const capped = makeIsmctsBot(ticTacToe, {
      beliefModel: trivialBelief,
      budget: { iterations: 500, playoutDepth: 5, maxNodes: 15 },
    });
    capped.choose({ view: state, seat: 'X', legal, rng: mulberry32(5) });

    expect(capped.lastSearch!.nodes).toBeLessThanOrEqual(15);
    expect(capped.lastSearch!.nodes).toBeLessThan(uncapped.lastSearch!.nodes);
  });
});

describe('ISMCTS determinism', () => {
  it('two same-seed 20-game series produce identical records (iteration budget, no maxMillis)', async () => {
    const makeBots = () => [
      makeIsmctsBot(hiddenDuel, {
        beliefModel: exactBelief,
        budget: { iterations: 80, playoutDepth: 6 },
        name: 'Ismcts',
      }),
      randomBot('Random'),
    ];

    const resultA = await runSeries({
      game: hiddenDuel,
      config: standardConfig(),
      bots: makeBots(),
      games: 20,
      seedStart: 500,
    });
    const resultB = await runSeries({
      game: hiddenDuel,
      config: standardConfig(),
      bots: makeBots(),
      games: 20,
      seedStart: 500,
    });

    expect(resultA.records).toEqual(resultB.records);
    expect(resultA.byBot).toEqual(resultB.byBot);
  });
});

describe('hidden-duel: ISMCTS vs random', () => {
  it('beats random over 200 seeded games (Wilson CI lower bound > 0.5)', async () => {
    const result = await runSeries({
      game: hiddenDuel,
      config: standardConfig(),
      bots: [
        makeIsmctsBot(hiddenDuel, {
          beliefModel: exactBelief,
          budget: { iterations: 120, playoutDepth: 6 },
          name: 'Ismcts',
        }),
        randomBot('Random'),
      ],
      games: 200,
      seedStart: 6000,
    });

    const tally = result.byBot.Ismcts;
    const trials = tally.wins + tally.losses + tally.draws;
    const ci = wilson(tally.wins, trials);
    expect(ci.lo).toBeGreaterThan(0.5);
  });
});

describe('belief sensitivity', () => {
  it(
    'exactBelief beats wrongBelief head-to-head (Wilson CI excludes 0.5)',
    { timeout: 30_000 },
    async () => {
      // We assert the win-rate gap only, as the plan permits: wiring
      // effectiveSampleSize/diagnostics through this fixture wasn't exercised
      // here — belief.ts's own particle-math tests cover ESS/resample
      // behavior directly against ad hoc BeliefState objects.
      //
      // The effect size is genuinely small (each game re-deals fresh cards,
      // and most of a 3-trick hand's plies are forced/near-forced — only a
      // handful of decision points per game are actually belief-sensitive),
      // so this needs a larger game count than the other CI-based tests to
      // clear the 0.5 threshold reliably; 2000 games at a light iteration
      // budget keeps it under ~10s.
      const result = await runSeries({
        game: hiddenDuel,
        config: standardConfig(),
        bots: [
          makeIsmctsBot(hiddenDuel, {
            beliefModel: exactBelief,
            budget: { iterations: 80, playoutDepth: 6 },
            name: 'Exact',
          }),
          makeIsmctsBot(hiddenDuel, {
            beliefModel: wrongBelief,
            budget: { iterations: 80, playoutDepth: 6 },
            name: 'Wrong',
          }),
        ],
        games: 2000,
        seedStart: 7000,
      });

      const tally = result.byBot.Exact;
      const trials = tally.wins + tally.losses + tally.draws;
      const ci = wilson(tally.wins, trials);
      expect(ci.lo).toBeGreaterThan(0.5);
    },
  );
});
