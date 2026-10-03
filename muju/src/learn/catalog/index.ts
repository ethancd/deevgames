import type { Arc, PartId, PuzzleSpec } from '../types';
import { ARC as MOVE } from './move';
import { ARC as MINE } from './mine';
import { ARC as ATTACK } from './attack';
import { ARC as ELEMENTS } from './elements';
import { ARC as TEAMWORK } from './teamwork';
import { ARC as CLEAVE } from './cleave';
import { ARC as SAFETY } from './safety';
import { ARC as FIRE } from './fire';
import { ARC as LIGHTNING } from './lightning';
import { ARC as WATER } from './water';
import { ARC as SHADOW } from './shadow';
import { ARC as PLANT } from './plant';
import { ARC as METAL } from './metal';
import { ARC as SUMMON } from './summon';
import { ARC as PROMOTE } from './promote';
import { ARC as UPKEEP } from './upkeep';
import { ARC as ELIMINATE } from './eliminate';
import { ARC as INVADE } from './invade';
import { ARC as DEFEND } from './defend';
import { ARC as REVIEW } from './review';
import { ARC as EXAM } from './exam';

/** Parts group arcs on the Learn screen, in teaching order. */
export const PARTS: { id: PartId; title: string }[] = [
  { id: 'basics', title: 'First steps' },
  { id: 'combat', title: 'Fighting' },
  { id: 'elements', title: 'The six elements' },
  { id: 'economy', title: 'Crystals' },
  { id: 'winning', title: 'Winning' },
  { id: 'review', title: 'Review' },
];

/** Every arc, in the recommended order. Nothing is locked; this is only the suggested path. */
export const ARCS: readonly Arc[] = [
  MOVE, MINE, ATTACK, ELEMENTS, TEAMWORK, CLEAVE, SAFETY, FIRE, LIGHTNING, WATER, SHADOW, PLANT, METAL, SUMMON, PROMOTE, UPKEEP, ELIMINATE, INVADE, DEFEND, REVIEW, EXAM,
].filter(arc => arc.puzzles.length > 0);

export { ARC_IDS } from './ids';

export interface CatalogEntry { puzzle: PuzzleSpec; arc: Arc; index: number; number: number }

/** Every puzzle with its arc and its position, numbered from 1 across the whole course. */
export const PUZZLES: readonly CatalogEntry[] = ARCS.flatMap(arc => arc.puzzles.map((puzzle, index) => ({ puzzle, arc, index }))).map((entry, i) => ({ ...entry, number: i + 1 }));
export const PUZZLE_COUNT = PUZZLES.length;
export const puzzleById = (id: string) => PUZZLES.find(entry => entry.puzzle.id === id);
export const nextPuzzle = (id: string) => { const i = PUZZLES.findIndex(e => e.puzzle.id === id); return i >= 0 ? PUZZLES[i + 1] : undefined; };
