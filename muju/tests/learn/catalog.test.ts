import { describe, expect, it } from 'vitest';
import { ARCS, PUZZLES, PUZZLE_COUNT } from '../../src/learn/catalog';
import { goalText } from '../../src/learn/goals';
import { verifyPuzzle } from '../../src/learn/verify';

/**
 * Every Learn to Play puzzle is proved against the live rules: it builds, the
 * goal is not already met, idling does not solve it (unless it is a declared
 * freebie), the author's line wins, every try is a dead end the live reply can
 * refute, the solver agrees, and a multi-turn puzzle cannot be done faster.
 * A stat or rules change that breaks a puzzle fails here.
 */
describe('Learn to Play catalog', () => {
  it('has unique ids and a goal line for every puzzle', () => {
    const ids = PUZZLES.map(e => e.puzzle.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PUZZLE_COUNT).toBe(ids.length);
    for (const { puzzle } of PUZZLES) expect(goalText(puzzle).length).toBeLessThanOrEqual(64);
    expect(new Set(ARCS.map(a => a.id)).size).toBe(ARCS.length);
  });

  for (const arc of ARCS) {
    describe(arc.title, () => {
      for (const spec of arc.puzzles) {
        it(`${spec.id}: ${goalText(spec)}`, () => {
          const report = verifyPuzzle(spec, { outcomes: false });
          expect(report.errors).toEqual([]);
        }, 60_000);
      }
    });
  }
});
