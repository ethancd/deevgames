import { describe, expect, it } from 'vitest';
import { fixtureById } from '../../src/learn/fixtures';
import { makeContext } from '../../src/learn/goals';
import { playLine } from '../../src/learn/notation';
import { PuzzleSearch } from '../../src/learn/solver';
import type { PuzzleSpec } from '../../src/learn/types';

/**
 * A puzzle with its homes hidden has no summon shop on screen (summoning is
 * taught with the homes), so its hints and proofs must never summon either.
 * Promotion stays.
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

  it('never buys when the homes are hidden, but still promotes', () => {
    const types = kinds(base);
    expect(types.has('BUY_UNIT')).toBe(false);
    expect(types.has('PROMOTE_UNIT')).toBe(true);
    expect(types.has('END_PLACE_PHASE')).toBe(true);
  });

  it('buys when the homes are shown', () => {
    expect(kinds({ ...base, homes: true }).has('BUY_UNIT')).toBe(true);
  });
});
