// @vitest-environment node
/**
 * `core/tables.ts` against the canonical geometry it replicates (DESIGN §4.2;
 * M4 gate: "`RECT[side][sq]` equals `getSpawnRectangle` for all 200 (side, sq);
 * `ADJ` equals `getAdjacentPositions` for all 100"). Also carries the
 * `CORNER`/`CORNER_NEIGHBOURS` half of the R13 constants-agreement test
 * (DESIGN §7.8) that M1 deferred to this milestone.
 */
import { describe, expect, it } from 'vitest';
import {
  ADJ,
  ADJ_COUNT,
  ADJ_LIST,
  BLACK,
  BOARD,
  CORNER,
  CORNER_NEIGHBOURS,
  CORRIDOR,
  MANHATTAN,
  RECT,
  RECT_AREA,
  SQ_X,
  SQ_Y,
  WHITE,
  dist2Corner,
  rot180,
  sq,
} from '../../../src/ai/hard/core/tables';
import { bbCount, bbHas } from '../../../src/ai/hard/core/bits';
import { getAdjacentPositions, getStartCorner, manhattanDistance } from '../../../src/game/board';
import { getSpawnRectangle } from '../../../src/game/spawning';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';

const PLAYERS = ['white', 'black'] as const;

function squares(bb: { length: number } & Uint32Array): number[] {
  const out: number[] = [];
  for (let s = 0; s < BOARD; s++) if (bbHas(bb, s)) out.push(s);
  return out;
}

describe('core/tables: square arithmetic', () => {
  it('sq / SQ_X / SQ_Y / rot180 agree with sq = y*10 + x', () => {
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const s = sq(x, y);
        expect(s).toBe(y * 10 + x);
        expect(SQ_X[s]).toBe(x);
        expect(SQ_Y[s]).toBe(y);
        expect(rot180(s)).toBe(99 - s);
        expect(rot180(rot180(s))).toBe(s);
      }
    }
  });

  it('MANHATTAN equals manhattanDistance for all 10,000 pairs', () => {
    for (let a = 0; a < BOARD; a++) {
      for (let b = 0; b < BOARD; b++) {
        const expected = manhattanDistance({ x: SQ_X[a], y: SQ_Y[a] }, { x: SQ_X[b], y: SQ_Y[b] });
        expect(MANHATTAN[a * BOARD + b]).toBe(expected);
      }
    }
  });

  it('dist2Corner is the Manhattan distance to that side’s start corner', () => {
    for (const side of [WHITE, BLACK] as const) {
      const corner = getStartCorner(PLAYERS[side]);
      for (let s = 0; s < BOARD; s++) {
        expect(dist2Corner(side, s)).toBe(manhattanDistance(corner, { x: SQ_X[s], y: SQ_Y[s] }));
      }
    }
  });
});

describe('core/tables: adjacency', () => {
  it('ADJ equals getAdjacentPositions for all 100 squares', () => {
    for (let s = 0; s < BOARD; s++) {
      const expected = getAdjacentPositions({ x: SQ_X[s], y: SQ_Y[s] }).map(p => sq(p.x, p.y));
      expect(squares(ADJ[s] as Uint32Array)).toEqual([...expected].sort((a, b) => a - b));
    }
  });

  it('ADJ_LIST keeps the canonical up/down/left/right order and is -1 padded', () => {
    for (let s = 0; s < BOARD; s++) {
      const expected = getAdjacentPositions({ x: SQ_X[s], y: SQ_Y[s] }).map(p => sq(p.x, p.y));
      expect(ADJ_COUNT[s]).toBe(expected.length);
      for (let i = 0; i < 4; i++) {
        expect(ADJ_LIST[s * 4 + i]).toBe(i < expected.length ? expected[i] : -1);
      }
    }
  });

  it('ADJ_COUNT is 2 at the four corners, 3 on the edges, 4 in the interior', () => {
    let corners = 0, edges = 0, interior = 0;
    for (let s = 0; s < BOARD; s++) {
      if (ADJ_COUNT[s] === 2) corners++;
      else if (ADJ_COUNT[s] === 3) edges++;
      else if (ADJ_COUNT[s] === 4) interior++;
      else throw new Error(`square ${s} has ${ADJ_COUNT[s]} neighbours`);
    }
    expect([corners, edges, interior]).toEqual([4, 32, 64]);
  });
});

describe('core/tables: spawn rectangles', () => {
  it('RECT[side][sq] equals getSpawnRectangle for all 200 (side, sq) pairs', () => {
    for (const side of [WHITE, BLACK] as const) {
      const corner = getStartCorner(PLAYERS[side]);
      for (let s = 0; s < BOARD; s++) {
        const expected = getSpawnRectangle(corner, { x: SQ_X[s], y: SQ_Y[s] })
          .map(p => sq(p.x, p.y))
          .sort((a, b) => a - b);
        expect(squares(RECT[side][s] as Uint32Array)).toEqual(expected);
        expect(RECT_AREA[side][s]).toBe(expected.length);
      }
    }
  });

  it('a rectangle always contains its own corner and anchor, and rot180 maps one side onto the other', () => {
    for (let s = 0; s < BOARD; s++) {
      expect(bbHas(RECT[WHITE][s], CORNER[WHITE])).toBe(true);
      expect(bbHas(RECT[WHITE][s], s)).toBe(true);
      expect(bbHas(RECT[BLACK][s], CORNER[BLACK])).toBe(true);
      expect(RECT_AREA[BLACK][rot180(s)]).toBe(RECT_AREA[WHITE][s]);
      expect(squares(RECT[BLACK][rot180(s)] as Uint32Array)).toEqual(
        squares(RECT[WHITE][s] as Uint32Array).map(rot180).sort((a, b) => a - b),
      );
    }
  });
});

describe('core/tables: R13 constants (DESIGN §7.8, deferred from M1)', () => {
  it('CORNER === [0, 99]', () => {
    expect([...CORNER]).toEqual([0, 99]);
    expect(CORNER[WHITE]).toBe(sq(getStartCorner('white').x, getStartCorner('white').y));
    expect(CORNER[BLACK]).toBe(sq(getStartCorner('black').x, getStartCorner('black').y));
  });

  it('CORNER_NEIGHBOURS === [[1, 10], [89, 98]]', () => {
    expect([[...CORNER_NEIGHBOURS[WHITE]], [...CORNER_NEIGHBOURS[BLACK]]]).toEqual([[1, 10], [89, 98]]);
  });
});

describe('core/tables: corridor', () => {
  it('CORRIDOR is exactly the 18 zero-ore squares D1-F3 and E8-G10', () => {
    const expected = [3, 4, 5, 13, 14, 15, 23, 24, 25, 74, 75, 76, 84, 85, 86, 94, 95, 96];
    expect(bbCount(CORRIDOR)).toBe(18);
    expect(squares(CORRIDOR)).toEqual(expected);
    for (const s of expected) expect(UNEQUAL_ROUTES_MAP[s]).toBe(0);
    for (let s = 0; s < BOARD; s++) expect(bbHas(CORRIDOR, s)).toBe(UNEQUAL_ROUTES_MAP[s] === 0);
  });

  it('the corridor is 180-degree symmetric, like the map', () => {
    for (let s = 0; s < BOARD; s++) expect(bbHas(CORRIDOR, rot180(s))).toBe(bbHas(CORRIDOR, s));
  });
});
