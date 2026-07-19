import { describe, expect, it } from 'vitest';
import type { GameDef } from '@deev/core';
import { runSeries } from '../src/runner.ts';
import { randomBot } from '../src/bots.ts';
import type { RawBot } from '../src/bots.ts';
import { nim, DEFAULT_NIM_HEAPS } from './fixtures/nim.ts';

describe('runSeries determinism', () => {
  it('two runs with the same seedStart produce a deep-equal SeriesResult', async () => {
    const config = { heaps: DEFAULT_NIM_HEAPS };
    const run = () =>
      runSeries({
        game: nim,
        config,
        bots: [randomBot('A'), randomBot('B')],
        games: 20,
        seedStart: 777,
      });

    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
  });
});

describe('invariant violations', () => {
  interface CounterState {
    n: number;
  }

  const counterGame: GameDef<CounterState, 'inc', Record<string, never>> = {
    id: 'lab-test-counter',
    version: '1.0.0',
    init: () => ({ n: 0 }),
    seats: () => ['solo'],
    toAct: () => ['solo'],
    legal: () => ['inc'],
    apply: (s) => ({ n: s.n + 1 }),
    terminal: (s) => (s.n >= 10 ? { winner: 'solo', reason: 'cap' } : null),
  };

  it('aborts only the offending game, counts it, and lets the series continue', async () => {
    const series = await runSeries({
      game: counterGame,
      config: {},
      bots: [randomBot('Counter')],
      games: 5,
      seedStart: 1,
      invariants: [
        (s) => {
          if (s.n === 3) throw new Error('n hit 3');
        },
      ],
    });

    expect(series.records).toHaveLength(5);
    expect(series.invariantViolations).toBe(5);
    for (const record of series.records) {
      expect(record.result).toEqual({ winner: null, reason: 'invariant-violation' });
      expect(record.plies).toBe(3); // n: 0 -> 1 -> 2 -> 3, invariant fires on 3
    }
    // Invariant-violation games are excluded from win/loss/draw tallying.
    expect(series.byBot['Counter']).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
});

describe('RawBot legality handling', () => {
  interface TrivialState {
    done: boolean;
  }

  const trivialGame: GameDef<TrivialState, number, Record<string, never>> = {
    id: 'lab-test-trivial',
    version: '1.0.0',
    init: () => ({ done: false }),
    seats: () => ['solo'],
    toAct: () => ['solo'],
    legal: () => [1, 2, 3],
    apply: () => ({ done: true }),
    terminal: (s) => (s.done ? { winner: 'solo', reason: 'done' } : null),
  };

  function alwaysIllegalBot(): RawBot<TrivialState, number> {
    return {
      name: 'AlwaysIllegal',
      async nextAction() {
        return 99; // never in the legal set [1, 2, 3]
      },
    };
  }

  function alwaysNullBot(): RawBot<TrivialState, number> {
    return {
      name: 'AlwaysNull',
      async nextAction() {
        return null;
      },
    };
  }

  it('as-shipped applies the illegal action anyway and counts it once', async () => {
    const series = await runSeries({
      game: trivialGame,
      config: {},
      bots: [alwaysIllegalBot()],
      games: 1,
      seedStart: 1,
      legality: 'as-shipped',
    });
    expect(series.illegalActions).toBe(1);
    expect(series.records[0].result).toEqual({ winner: 'solo', reason: 'done' });
  });

  it('strict re-asks once, then adjudicates illegal-action if still illegal (counting both emissions)', async () => {
    const series = await runSeries({
      game: trivialGame,
      config: {},
      bots: [alwaysIllegalBot()],
      games: 1,
      seedStart: 1,
      legality: 'strict',
    });
    expect(series.illegalActions).toBe(2);
    expect(series.records[0].result).toEqual({ winner: null, reason: 'illegal-action' });
  });

  it('a null return always ends the game as engine-emitted-nothing, in both legality modes', async () => {
    for (const legality of ['as-shipped', 'strict'] as const) {
      const series = await runSeries({
        game: trivialGame,
        config: {},
        bots: [alwaysNullBot()],
        games: 1,
        seedStart: 1,
        legality,
      });
      expect(series.illegalActions).toBe(1);
      expect(series.records[0].result).toEqual({ winner: null, reason: 'engine-emitted-nothing' });
    }
  });
});

describe('single-player sweep mode', () => {
  interface SoloState {
    rolls: number;
    total: number;
  }

  const soloGame: GameDef<SoloState, 'roll', Record<string, never>> = {
    id: 'lab-test-solo-dice',
    version: '1.0.0',
    init: () => ({ rolls: 0, total: 0 }),
    seats: () => ['solo'],
    toAct: () => ['solo'],
    legal: () => ['roll'],
    apply: (s, _action, rng) => ({ rolls: s.rolls + 1, total: s.total + rng.int(6) + 1 }),
    terminal: (s) =>
      s.rolls >= 3
        ? { winner: s.total >= 10 ? 'solo' : null, reason: 'done', scores: { solo: s.total } }
        : null,
  };

  it('produces per-game score records for a single bot', async () => {
    const series = await runSeries({
      game: soloGame,
      config: {},
      bots: [randomBot('Roller')],
      games: 20,
      seedStart: 42,
    });
    expect(series.records).toHaveLength(20);
    expect(Object.keys(series.byBot)).toEqual(['Roller']);
    for (const record of series.records) {
      expect(record.result.scores?.solo).toBeTypeOf('number');
    }
  });
});
