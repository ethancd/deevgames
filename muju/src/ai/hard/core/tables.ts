/**
 * Static board geometry (DESIGN §4.2). Everything here is derived once, at
 * module load, from the canonical engine (`src/game/board.ts`,
 * `src/game/spawning.ts`, `src/game/resourceMap.ts`) so the replica cannot
 * drift from the rules it mirrors — `tests/ai/hard/tables.test.ts` re-derives
 * each table from the same canonical functions and compares element by
 * element.
 *
 * All tables are frozen/read-only by contract: callers must never write into
 * `ADJ`, `RECT`, `MANHATTAN`, `CORRIDOR`, `SQ_X` or `SQ_Y`.
 */
import type { Side, Square } from '../types';
import { getAdjacentPositions, getStartCorner, manhattanDistance } from '../../../game/board';
import { getSpawnRectangle } from '../../../game/spawning';
import { UNEQUAL_ROUTES_MAP } from '../../../game/resourceMap';
import { bbNew, bbSet, bbCount, type BB } from './bits';

export const BOARD = 100;
export const WHITE: Side = 0;
export const BLACK: Side = 1;

const SIDE_PLAYER = ['white', 'black'] as const;

export function sq(x: number, y: number): Square {
  return y * 10 + x;
}

/** 99 - s: the exact 180° map symmetry (ET §6.2). */
export function rot180(s: Square): Square {
  return 99 - s;
}

function buildSqX(): Uint8Array {
  const out = new Uint8Array(BOARD);
  for (let s = 0; s < BOARD; s++) out[s] = s % 10;
  return out;
}

function buildSqY(): Uint8Array {
  const out = new Uint8Array(BOARD);
  for (let s = 0; s < BOARD; s++) out[s] = (s / 10) | 0;
  return out;
}

export const SQ_X: Uint8Array = buildSqX();
export const SQ_Y: Uint8Array = buildSqY();

/** [0, 99] — `getStartCorner('white' | 'black')` (board.ts:175-177). */
export const CORNER: readonly [Square, Square] = (() => {
  const white = getStartCorner('white');
  const black = getStartCorner('black');
  return [sq(white.x, white.y), sq(black.x, black.y)] as const;
})();

/** [[1,10],[89,98]] — the two squares orthogonally adjacent to each corner (homeCheckmate.ts:29-30), ascending. */
export const CORNER_NEIGHBOURS: readonly [readonly [Square, Square], readonly [Square, Square]] = (() => {
  const of = (corner: Square): readonly [Square, Square] => {
    const list = getAdjacentPositions({ x: SQ_X[corner], y: SQ_Y[corner] })
      .map(p => sq(p.x, p.y))
      .sort((a, b) => a - b);
    if (list.length !== 2) throw new Error(`CORNER_NEIGHBOURS: corner ${corner} has ${list.length} neighbours`);
    return [list[0], list[1]] as const;
  };
  return [of(CORNER[WHITE]), of(CORNER[BLACK])] as const;
})();

function buildAdj(): { bb: readonly BB[]; list: Int8Array; count: Uint8Array } {
  const bb: BB[] = new Array<BB>(BOARD);
  const list = new Int8Array(BOARD * 4).fill(-1);
  const count = new Uint8Array(BOARD);
  for (let s = 0; s < BOARD; s++) {
    // getAdjacentPositions emits up, down, left, right and drops off-board entries.
    const neighbours = getAdjacentPositions({ x: SQ_X[s], y: SQ_Y[s] });
    const mask = bbNew();
    for (let i = 0; i < neighbours.length; i++) {
      const n = sq(neighbours[i].x, neighbours[i].y);
      bbSet(mask, n);
      list[s * 4 + i] = n;
    }
    bb[s] = mask;
    count[s] = neighbours.length;
  }
  return { bb, list, count };
}

const ADJ_BUILT = buildAdj();

/** [100] orthogonal neighbours of each square. */
export const ADJ: readonly BB[] = ADJ_BUILT.bb;
/** [100*4], -1 padded, order up, down, left, right (board.ts:313-324). */
export const ADJ_LIST: Int8Array = ADJ_BUILT.list;
/** 2 at a corner, 3 on an edge, 4 in the interior. */
export const ADJ_COUNT: Uint8Array = ADJ_BUILT.count;

function buildRect(): { rect: readonly (readonly BB[])[]; area: readonly Uint8Array[] } {
  const rect: BB[][] = [];
  const area: Uint8Array[] = [];
  for (const side of [WHITE, BLACK] as const) {
    const corner = getStartCorner(SIDE_PLAYER[side]);
    const perSquare: BB[] = new Array<BB>(BOARD);
    const areas = new Uint8Array(BOARD);
    for (let s = 0; s < BOARD; s++) {
      const mask = bbNew();
      for (const p of getSpawnRectangle(corner, { x: SQ_X[s], y: SQ_Y[s] })) bbSet(mask, sq(p.x, p.y));
      perSquare[s] = mask;
      areas[s] = bbCount(mask);
    }
    rect.push(perSquare);
    area.push(areas);
  }
  return { rect, area };
}

const RECT_BUILT = buildRect();

/** `RECT[side][anchorSq]` — the spawn rectangle from that side's corner to the anchor (spawning.ts:8-29). */
export const RECT: readonly (readonly BB[])[] = RECT_BUILT.rect;
/** `RECT_AREA[side][anchorSq]` = popcount of `RECT[side][anchorSq]`. */
export const RECT_AREA: readonly Uint8Array[] = RECT_BUILT.area;

function buildManhattan(): Uint8Array {
  const out = new Uint8Array(BOARD * BOARD);
  for (let a = 0; a < BOARD; a++) {
    for (let b = 0; b < BOARD; b++) {
      out[a * BOARD + b] = manhattanDistance({ x: SQ_X[a], y: SQ_Y[a] }, { x: SQ_X[b], y: SQ_Y[b] });
    }
  }
  return out;
}

/** [100*100] `MANHATTAN[a*100 + b]`. */
export const MANHATTAN: Uint8Array = buildManhattan();

function buildCorridor(): BB {
  const mask = bbNew();
  for (let s = 0; s < BOARD; s++) if (UNEQUAL_ROUTES_MAP[s] === 0) bbSet(mask, s);
  const n = bbCount(mask);
  if (n !== 18) throw new Error(`CORRIDOR: expected 18 zero-ore squares, found ${n}`);
  return mask;
}

/** The 18 zero-ore squares D1-F3 and E8-G10 of the shipped map (resourceMap.ts:6-16). */
export const CORRIDOR: BB = buildCorridor();

/** Manhattan distance from `s` to `CORNER[side]`. */
export function dist2Corner(side: Side, s: Square): number {
  return MANHATTAN[CORNER[side] * BOARD + s];
}
