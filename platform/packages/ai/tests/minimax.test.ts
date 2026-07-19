import { describe, expect, it, vi } from 'vitest';
import { mulberry32, type GameDef } from '@deev/core';
import { randomBot, runSeries } from '@deev/lab';
import { makeMinimaxBot, searchRoot, VICTORY } from '../src/minimax.ts';
import {
  emptyPosition,
  forkInTwo,
  mustBlock,
  ticTacToe,
  winInOne,
  type TicTacToeState,
} from './fixtures/tic-tac-toe.ts';
import { hiddenDuel, type HiddenDuelAction, type HiddenDuelState } from './fixtures/hidden-duel.ts';

const zeroEval = () => 0;

describe('makeMinimaxBot exactness', () => {
  it('finds the immediate winning move (winInOne)', () => {
    const bot = makeMinimaxBot(ticTacToe, zeroEval, { budget: { depth: 9 } });
    const state = winInOne();
    const legal = ticTacToe.legal(state, 'X');
    const action = bot.choose({ view: state, seat: 'X', legal, rng: mulberry32(1) });
    expect(action).toBe(2);
    expect(bot.lastSearch?.root[0].score).toBe(VICTORY);
  });

  it('blocks the opponent\'s immediate win (mustBlock)', () => {
    const bot = makeMinimaxBot(ticTacToe, zeroEval, { budget: { depth: 9 } });
    const state = mustBlock();
    const legal = ticTacToe.legal(state, 'O');
    const action = bot.choose({ view: state, seat: 'O', legal, rng: mulberry32(2) });
    expect(action).toBe(2);
  });

  it('finds the forced-win fork at depth >= 3 (forkInTwo)', () => {
    const bot = makeMinimaxBot(ticTacToe, zeroEval, { budget: { depth: 9 } });
    const state = forkInTwo();
    const legal = ticTacToe.legal(state, 'X');
    const action = bot.choose({ view: state, seat: 'X', legal, rng: mulberry32(3) });
    expect(action).toBe(8);
    expect(bot.lastSearch?.root[0].score).toBe(VICTORY);
  });
});

describe('makeMinimaxBot full-depth self-play', () => {
  it('two full-depth minimax bots draw all 50 seeded games', async () => {
    const result = await runSeries({
      game: ticTacToe,
      config: {},
      bots: [
        makeMinimaxBot(ticTacToe, zeroEval, { budget: 'max', name: 'M1' }),
        makeMinimaxBot(ticTacToe, zeroEval, { budget: 'max', name: 'M2' }),
      ],
      games: 50,
      seedStart: 5000,
    });
    for (const record of result.records) {
      expect(record.result.winner).toBeNull();
    }
  });

  it('full-depth minimax never loses to random over 200 seeded games', async () => {
    const result = await runSeries({
      game: ticTacToe,
      config: {},
      bots: [makeMinimaxBot(ticTacToe, zeroEval, { budget: 'max', name: 'Minimax' }), randomBot('Random')],
      games: 200,
      seedStart: 9000,
    });
    expect(result.byBot.Minimax.losses).toBe(0);
  });
});

describe('alpha-beta pruning equivalence', () => {
  function randomMidgamePositions(count: number, seed: number): TicTacToeState[] {
    const rng = mulberry32(seed);
    const positions: TicTacToeState[] = [];
    while (positions.length < count) {
      let state = emptyPosition();
      const plies = 1 + rng.int(4); // 1..4 plies in
      let ok = true;
      for (let i = 0; i < plies; i++) {
        if (ticTacToe.terminal(state)) {
          ok = false;
          break;
        }
        const legal = ticTacToe.legal(state, state.toMove);
        const action = rng.pick(legal);
        state = ticTacToe.apply(state, action, rng);
      }
      const emptyCells = ticTacToe.legal(state, state.toMove).length;
      if (ok && !ticTacToe.terminal(state) && emptyCells >= 4) positions.push(state);
    }
    return positions;
  }

  it('matches plain-minimax move/root-score over 100 random positions with fewer total nodes', () => {
    const positions = randomMidgamePositions(100, 123);
    let prunedNodes = 0;
    let plainNodes = 0;

    for (const state of positions) {
      const seat = state.toMove;
      const opponent = seat === 'X' ? 'O' : 'X';
      const depth = 4;

      const pruned = searchRoot(ticTacToe, zeroEval, state, seat, opponent, {
        depth,
        pruning: true,
        rng: mulberry32(1),
        nodeCounter: { count: 0 },
      });
      const plain = searchRoot(ticTacToe, zeroEval, state, seat, opponent, {
        depth,
        pruning: false,
        rng: mulberry32(1),
        nodeCounter: { count: 0 },
      });

      expect(pruned.root[0].action).toEqual(plain.root[0].action);
      expect(pruned.root[0].score).toBeCloseTo(plain.root[0].score, 8);
      expect(pruned.nodes).toBeLessThanOrEqual(plain.nodes);

      prunedNodes += pruned.nodes;
      plainNodes += plain.nodes;
    }

    // Aggregate strictly-fewer-nodes assertion (robust against occasional
    // low-branching positions where a single case can't show any pruning).
    expect(prunedNodes).toBeLessThan(plainNodes);
  });
});

describe('makeMinimaxBot construction guards', () => {
  it('throws when def.observe is defined (imperfect information)', () => {
    // Deliberately bypass the type system here: the whole point of this test
    // is to exercise the *runtime* guard, so we force a perfect-info-shaped
    // GameDef<S, A, C, S> call site around a def that actually has observe().
    const asPerfectInfo = hiddenDuel as unknown as GameDef<
      HiddenDuelState,
      HiddenDuelAction,
      unknown,
      HiddenDuelState
    >;
    expect(() => makeMinimaxBot(asPerfectInfo, zeroEval)).toThrow(/perfect-information only/);
  });

  it('throws when ctx.legal is empty', () => {
    const bot = makeMinimaxBot(ticTacToe, zeroEval);
    expect(() => bot.choose({ view: emptyPosition(), seat: 'X', legal: [], rng: mulberry32(1) })).toThrow(
      /ctx.legal was empty/,
    );
  });

  it('throws when a third seat appears', () => {
    interface ThreeSeatState {
      turn: number;
    }
    const threeSeatDef: GameDef<ThreeSeatState, string, unknown, ThreeSeatState> = {
      id: 'fixture-three-seat',
      version: '1.0.0',
      init: () => ({ turn: 0 }),
      seats: () => ['P1', 'P2', 'P3'],
      toAct: (s) => [['P1', 'P2', 'P3'][s.turn % 3]],
      legal: () => ['pass'],
      apply: (s) => ({ turn: s.turn + 1 }),
      terminal: () => null,
    };

    const bot = makeMinimaxBot(threeSeatDef, zeroEval, { budget: { depth: 1 } });
    const rng = mulberry32(1);
    bot.choose({ view: { turn: 0 }, seat: 'P1', legal: ['pass'], rng });
    bot.choose({ view: { turn: 1 }, seat: 'P2', legal: ['pass'], rng });
    expect(() => bot.choose({ view: { turn: 2 }, seat: 'P3', legal: ['pass'], rng })).toThrow(
      /produced a third seat/,
    );
  });
});

describe('budget enforcement', () => {
  it('maxNodes is respected within one choose() call', () => {
    const state = emptyPosition();
    const legal = ticTacToe.legal(state, 'X');

    const uncapped = makeMinimaxBot(ticTacToe, zeroEval, { budget: { depth: 6 } });
    uncapped.choose({ view: state, seat: 'X', legal, rng: mulberry32(1) });

    const capped = makeMinimaxBot(ticTacToe, zeroEval, { budget: { depth: 6, maxNodes: 50 } });
    capped.choose({ view: state, seat: 'X', legal, rng: mulberry32(1) });

    expect(capped.lastSearch!.nodes).toBeLessThanOrEqual(50);
    expect(capped.lastSearch!.nodes).toBeLessThan(uncapped.lastSearch!.nodes);
  });
});

describe('lab interop', () => {
  it('AiBot is accepted by runSeries with zero casts and onGameStart fires per game', async () => {
    const bot = makeMinimaxBot(ticTacToe, zeroEval, { budget: 'easy', name: 'Minimax' });
    const spy = vi.spyOn(bot, 'onGameStart');
    const games = 20;

    const result = await runSeries({
      game: ticTacToe,
      config: {},
      bots: [bot, randomBot('Random')],
      games,
      seedStart: 42,
    });

    expect(result.games).toBe(games);
    expect(spy).toHaveBeenCalledTimes(games);
  });
});
