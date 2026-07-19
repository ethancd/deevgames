import { describe, expect, it } from 'vitest';
import { runMatch, assertReplayConverges, type Policy } from '@deev/core';
import { pebbleDuel, perfectMove, grundyValue, type PebbleState, type PebbleMove } from '../src/game.ts';

const random: Policy<PebbleState, PebbleMove> = {
  choose: (_v, _s, legal, rng) => rng.pick(legal),
};
const perfect: Policy<PebbleState, PebbleMove> = {
  choose: (view, _s, legal) => perfectMove(view, legal),
};

describe('pebble-duel (stage 1 smoke)', () => {
  it('seeded random-vs-random match terminates, is deterministic, and replays', () => {
    const t1 = runMatch(pebbleDuel, {}, 11, { first: random, second: random });
    const t2 = runMatch(pebbleDuel, {}, 11, { first: random, second: random });
    expect(t1.actions).toEqual(t2.actions);
    expect(t1.result.reason).toBe('last-take');
    assertReplayConverges(pebbleDuel, t1);
  });

  it('perfect play wins from a non-zero Grundy start regardless of opponent', () => {
    expect(grundyValue([3, 5, 7])).not.toBe(0);
    for (let seed = 0; seed < 25; seed++) {
      const t = runMatch(pebbleDuel, {}, seed, { first: perfect, second: random });
      expect(t.result.winner).toBe('first');
    }
  });

  it('score() reflects the Grundy rule', () => {
    const winning: PebbleState = { heaps: [1, 0, 0], current: 'first', lastMover: null };
    expect(pebbleDuel.score!(winning, 'first')).toBe(1);
    expect(pebbleDuel.score!(winning, 'second')).toBe(-1);
    const losing: PebbleState = { heaps: [4, 0, 0], current: 'first', lastMover: null };
    expect(pebbleDuel.score!(losing, 'first')).toBe(-1);
  });
});
