import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../../src/learn/fixtures';
import { goalText } from '../../src/learn/goals';
import type { Goal } from '../../src/learn/types';
import { verifyPuzzle } from '../../src/learn/verify';

const leaves = (goal: Goal): Goal[] => goal.kind === 'all' ? goal.goals.flatMap(leaves) : [goal];

/** The screen's test puzzles are held to the same proof as the catalog, and between them cover every goal kind. */
describe('Learn to Play test fixtures', () => {
  it('cover every goal kind, a reply-judged goal and a two-turn puzzle', () => {
    const kinds = new Set(FIXTURES.flatMap(f => leaves(f.goal).map(g => g.kind)));
    for (const kind of ['reach', 'mine', 'capture', 'eliminate', 'home', 'summon', 'promote', 'bank', 'keep', 'survive', 'hold'] as const) expect(kinds.has(kind)).toBe(true);
    expect(FIXTURES.some(f => f.goal.kind === 'all')).toBe(true);
    expect(FIXTURES.some(f => f.goal.kind === 'summon' && f.goal.arrive)).toBe(true);
    expect(FIXTURES.some(f => (f.turns ?? 1) > 1)).toBe(true);
    expect(new Set(FIXTURES.map(f => f.id)).size).toBe(FIXTURES.length);
  });

  for (const spec of FIXTURES) {
    it(`${spec.id}: ${goalText(spec)}`, () => {
      expect(verifyPuzzle(spec, { outcomes: false }).errors).toEqual([]);
    }, 30_000);
  }
});
