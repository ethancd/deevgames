import { describe, expect, it } from 'vitest';
import { fixtureById } from '../../src/learn/fixtures';
import { makeContext } from '../../src/learn/goals';
import { playLine } from '../../src/learn/notation';
import { PuzzleSearch } from '../../src/learn/solver';
import type { PuzzleSpec } from '../../src/learn/types';

/**
 * A puzzle with its homes hidden comes before the economy arcs: no summon shop
 * and no promote button on screen, so its hints and proofs never summon or
 * promote either.
 */
describe('PuzzleSearch.heroActions in Prepare', () => {
  // Two turns, so Prepare on turn 1 could matter for a purchase; the bank of 1 + 3 mined affords a Hi.
  const base: PuzzleSpec = { ...fixtureById('fx-promote')!, id: 'fx-promote-two', turns: 2 };
  const kinds = (spec: PuzzleSpec) => {
    const ctx = makeContext(spec);
    const { state } = playLine(ctx.start, ['a1-a2', 'a2-b2', 'mine']);
    expect(state.turn.phase).toBe('place');
    expect(state.players.white.resources).toBeGreaterThanOrEqual(3);
    return new Set(new PuzzleSearch(ctx).heroActions(state).map(a => a.type));
  };

  it('never buys or promotes when the homes are hidden', () => {
    const types = kinds({ ...base, homes: false });
    expect(types.has('BUY_UNIT')).toBe(false);
    expect(types.has('PROMOTE_UNIT')).toBe(false);
    expect(types.has('END_PLACE_PHASE')).toBe(true);
  });

  it('buys and promotes when the homes are shown', () => {
    const types = kinds(base);
    expect(types.has('BUY_UNIT')).toBe(true);
    expect(types.has('PROMOTE_UNIT')).toBe(true);
  });
});
