import { PUZZLES } from './catalog';

/**
 * What the home screen needs to know about the course: how many puzzles, and
 * their ids (to count the solved ones). It reads the arc data only; the
 * solver, the puzzle screens and the test fixtures stay in the lazy Learn chunk.
 */
export const PUZZLE_IDS: readonly string[] = PUZZLES.map(entry => entry.puzzle.id);
export const PUZZLE_COUNT = PUZZLE_IDS.length;
