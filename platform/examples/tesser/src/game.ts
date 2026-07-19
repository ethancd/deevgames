// TESSER V1 engine — implements SPEC.md §2 exactly.
//
// Every piece is an axis-aligned box of conserved hypervolume ("measure").
// Combat is projection: a strike footprint is the attacker's footprint
// translated one cell beyond its slid position; damage per overlapped enemy
// is overlapCellCount × min(heights), capped at that enemy's measure. Folds
// reshape a piece to any box whose volume equals its CURRENT measure exactly.
//
// The game is fully deterministic: apply() never draws from rng.

import type { GameDef, Seat } from '@deev/core';

export type TesserSeat = 'south' | 'north';
export type Dir = 'N' | 'S' | 'E' | 'W'; // N = −y, S = +y, E = +x, W = −x

export interface Piece {
  id: string; // stable: 'S-keep', 'N-lance', ...
  seat: TesserSeat;
  x: number;
  y: number; // anchor = minimum corner of footprint
  w: number;
  d: number; // footprint: x..x+w-1 (width), y..y+d-1 (depth)
  h: number; // height
  measure: number; // current hypervolume (HP). 1 ≤ measure ≤ w*d*h
}

export type TesserAction =
  | { type: 'move'; piece: string; dir: Dir; steps: number }
  | { type: 'attack'; piece: string; dir: Dir; steps: number }
  | { type: 'fold'; piece: string; w: number; d: number; h: number; x: number; y: number }
  | { type: 'pass' };

export interface TesserState {
  pieces: Piece[];
  current: TesserSeat;
  ply: number;
  plyCap: number;
}

export interface TesserConfig {
  pieces?: Piece[];
  plyCap?: number;
  firstToAct?: TesserSeat;
}

export const BOARD_W = 6; // x ∈ 0..5
export const BOARD_H = 8; // y ∈ 0..7
export const DEFAULT_PLY_CAP = 100;
export const SEATS: TesserSeat[] = ['south', 'north'];

const DIRS: Dir[] = ['N', 'S', 'E', 'W']; // §2.6 ordering
const DELTA: Record<Dir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

export interface Cell {
  x: number;
  y: number;
}

/** Axis-aligned footprint rectangle in cells. */
interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export function otherSeat(seat: TesserSeat): TesserSeat {
  return seat === 'south' ? 'north' : 'south';
}

/** The w × d cells a piece occupies, row-major (y then x). */
export function footprintCells(piece: Pick<Piece, 'x' | 'y' | 'w' | 'd'>): Cell[] {
  const cells: Cell[] = [];
  for (let y = piece.y; y < piece.y + piece.d; y++) {
    for (let x = piece.x; x < piece.x + piece.w; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

export function volume(piece: Pick<Piece, 'w' | 'd' | 'h'>): number {
  return piece.w * piece.d * piece.h;
}

/** Count of dims strictly greater than 1: 0 point, 1 line, 2 plane, 3 solid. */
export function dimClass(piece: Pick<Piece, 'w' | 'd' | 'h'>): 'point' | 'line' | 'plane' | 'solid' {
  const n = (piece.w > 1 ? 1 : 0) + (piece.d > 1 ? 1 : 0) + (piece.h > 1 ? 1 : 0);
  return (['point', 'line', 'plane', 'solid'] as const)[n];
}

/** Speed by class: point 4, line 3, plane 2, solid 1. */
export function speed(piece: Pick<Piece, 'w' | 'd' | 'h'>): number {
  return { point: 4, line: 3, plane: 2, solid: 1 }[dimClass(piece)];
}

export function totalMeasure(state: TesserState, seat: TesserSeat): number {
  return state.pieces.reduce((acc, p) => (p.seat === seat ? acc + p.measure : acc), 0);
}

/** §2.3 initial position: south's three pieces, then north's exact 180° rotation. */
export function defaultSetup(): Piece[] {
  return [
    { id: 'S-shield', seat: 'south', x: 0, y: 5, w: 3, d: 2, h: 1, measure: 6 },
    { id: 'S-keep', seat: 'south', x: 3, y: 5, w: 2, d: 2, h: 2, measure: 8 },
    { id: 'S-lance', seat: 'south', x: 1, y: 7, w: 4, d: 1, h: 1, measure: 4 },
    { id: 'N-shield', seat: 'north', x: 3, y: 1, w: 3, d: 2, h: 1, measure: 6 },
    { id: 'N-keep', seat: 'north', x: 1, y: 1, w: 2, d: 2, h: 2, measure: 8 },
    { id: 'N-lance', seat: 'north', x: 1, y: 0, w: 4, d: 1, h: 1, measure: 4 },
  ];
}

// ---------------------------------------------------------------------------
// Geometry helpers (rect math — footprints and strike footprints are rects,
// and clipping a translated rect to the board keeps it a rect).

function inBounds(r: Rect): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= BOARD_W && r.y + r.d <= BOARD_H;
}

function overlapCells(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

/** Drop off-board cells; null when nothing remains on board. */
function clipToBoard(r: Rect): Rect | null {
  const x0 = Math.max(r.x, 0);
  const y0 = Math.max(r.y, 0);
  const x1 = Math.min(r.x + r.w, BOARD_W);
  const y1 = Math.min(r.y + r.d, BOARD_H);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, d: y1 - y0 } : null;
}

/** Rect at `piece`'s footprint translated k cells in dir. */
function translated(piece: Piece, dir: Dir, k: number): Rect {
  const { dx, dy } = DELTA[dir];
  return { x: piece.x + dx * k, y: piece.y + dy * k, w: piece.w, d: piece.d };
}

/** Is `r` fully on board and free of every piece except `self`? */
function placeClear(state: TesserState, r: Rect, selfId: string): boolean {
  if (!inBounds(r)) return false;
  return state.pieces.every((p) => p.id === selfId || overlapCells(r, p) === 0);
}

// ---------------------------------------------------------------------------
// The GameDef.

export const tesser: GameDef<TesserState, TesserAction, TesserConfig> = {
  id: 'tesser',
  version: '0.1.0',

  init: (config) => ({
    pieces: (config.pieces ?? defaultSetup()).map((p) => ({ ...p })),
    current: config.firstToAct ?? 'south',
    ply: 0,
    plyCap: config.plyCap ?? DEFAULT_PLY_CAP,
  }),

  seats: () => SEATS,

  toAct: (s) => [s.current],

  // §2.6 ordering: pieces in state.pieces order; action types
  // move < attack < fold < pass; dirs N < S < E < W; steps ascending;
  // folds by (w, d, h) then anchor row-major. Pass closes the list.
  legal: (s, seat) => {
    if (seat !== s.current) return [];
    const actions: TesserAction[] = [];
    for (const piece of s.pieces) {
      if (piece.seat !== seat) continue;
      const spd = speed(piece);

      // Moves: steps ∈ 1..speed, every intermediate + final footprint clear.
      for (const dir of DIRS) {
        for (let steps = 1; steps <= spd; steps++) {
          if (!placeClear(s, translated(piece, dir, steps), piece.id)) break; // no jumping
          actions.push({ type: 'move', piece: piece.id, dir, steps });
        }
      }

      // Attacks: steps ∈ 0..speed−1; slide as a move, then strike one beyond.
      for (const dir of DIRS) {
        for (let steps = 0; steps <= spd - 1; steps++) {
          if (steps > 0 && !placeClear(s, translated(piece, dir, steps), piece.id)) break;
          const strike = clipToBoard(translated(piece, dir, steps + 1));
          if (strike === null) continue;
          let enemyContact = 0;
          let friendlyContact = 0;
          for (const p of s.pieces) {
            if (p.id === piece.id) continue;
            const contact = overlapCells(strike, p);
            if (p.seat === seat) friendlyContact += contact;
            else enemyContact += contact;
          }
          if (enemyContact >= 1 && friendlyContact === 0) {
            actions.push({ type: 'attack', piece: piece.id, dir, steps });
          }
        }
      }

      // Folds: w*d*h === measure exactly, dims within (6, 8, 8), on board,
      // no overlap with other pieces, ≥1 shared cell with current footprint.
      for (let w = 1; w <= BOARD_W; w++) {
        for (let d = 1; d <= BOARD_H; d++) {
          if (piece.measure % (w * d) !== 0) continue;
          const h = piece.measure / (w * d);
          if (h < 1 || h > 8) continue;
          for (let y = 0; y + d <= BOARD_H; y++) {
            for (let x = 0; x + w <= BOARD_W; x++) {
              const r: Rect = { x, y, w, d };
              if (overlapCells(r, piece) === 0) continue; // must share a cell
              if (!placeClear(s, r, piece.id)) continue;
              actions.push({ type: 'fold', piece: piece.id, w, d, h, x, y });
            }
          }
        }
      }
    }
    actions.push({ type: 'pass' });
    return actions;
  },

  // Pure/immutable; never draws from rng. Assumes the action is legal.
  apply: (s, action) => {
    let pieces = s.pieces.map((p) => ({ ...p }));
    if (action.type !== 'pass') {
      const piece = pieces.find((p) => p.id === action.piece);
      if (!piece) throw new Error(`tesser.apply: no piece '${action.piece}'`);
      if (action.type === 'move') {
        const { dx, dy } = DELTA[action.dir];
        piece.x += dx * action.steps;
        piece.y += dy * action.steps;
      } else if (action.type === 'attack') {
        const { dx, dy } = DELTA[action.dir];
        piece.x += dx * action.steps;
        piece.y += dy * action.steps;
        const strike = clipToBoard(translated(piece, action.dir, 1));
        if (strike !== null) {
          for (const enemy of pieces) {
            if (enemy.seat === piece.seat) continue;
            const contact = overlapCells(strike, enemy);
            if (contact === 0) continue;
            const damage = Math.min(contact * Math.min(piece.h, enemy.h), enemy.measure);
            enemy.measure -= damage;
          }
          pieces = pieces.filter((p) => p.measure > 0);
        }
      } else {
        // fold: re-forge compact — measure is conserved and now === volume.
        piece.x = action.x;
        piece.y = action.y;
        piece.w = action.w;
        piece.d = action.d;
        piece.h = action.h;
      }
    }
    return { pieces, current: otherSeat(s.current), ply: s.ply + 1, plyCap: s.plyCap };
  },

  terminal: (s) => {
    const southAlive = s.pieces.some((p) => p.seat === 'south');
    const northAlive = s.pieces.some((p) => p.seat === 'north');
    if (!southAlive) return { winner: 'north', reason: 'elimination' };
    if (!northAlive) return { winner: 'south', reason: 'elimination' };
    if (s.ply >= s.plyCap) {
      const south = totalMeasure(s, 'south');
      const north = totalMeasure(s, 'north');
      return {
        winner: south > north ? 'south' : north > south ? 'north' : null,
        reason: 'adjudication',
        scores: { south, north },
      };
    }
    return null;
  },

  // The adjudication/greedy seam; the real minimax eval lives in eval.ts (Stage B).
  score: (s, seat) => {
    const me = seat as TesserSeat;
    return totalMeasure(s, me) - totalMeasure(s, otherSeat(me));
  },

  isCommitPoint: (_s, action) => action.type === 'attack' || action.type === 'fold',
};

/** Convenience for tests and later stages. */
export function pieceById(state: TesserState, id: string): Piece | undefined {
  return state.pieces.find((p) => p.id === id);
}

// Re-exported so callers can name the seat type without redeclaring it.
export type { Seat };
