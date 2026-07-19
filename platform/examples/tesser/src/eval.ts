// TESSER Stage B evaluation — SPEC.md §3 Stage B.
//
// Named factors over the perfect-information state, composed with @deev/ai's
// composeEval. Every factor is a symmetric difference (mine − opponent's), so
// eval(s, south) === -eval(s, north) throughout. All geometry is cheap local
// rect math — no def.legal() calls: fold enumeration dominates legal()'s cost
// and the eval runs at every search leaf.
//
// Weights (tuned so the Stage B lab gates pass; see tests/ai.test.ts):
//   measure-diff  100  dominant — one point of conserved measure is the unit
//   threat         30  best single-strike damage available ≈ 0.3 of realized
//   advance         2  measure pushed toward the enemy back rank
//   mobility        6  normalized move-count advantage, bounded in [-1, 1]

import type { Seat } from '@deev/core';
import { composeEval, normalizeAdvantage, type NamedEval } from '@deev/ai';
import {
  BOARD_H,
  BOARD_W,
  otherSeat,
  speed,
  totalMeasure,
  type Dir,
  type Piece,
  type TesserSeat,
  type TesserState,
} from './game.ts';

interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}

const DIRS: Dir[] = ['N', 'S', 'E', 'W'];
const DELTA: Record<Dir, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};

function overlapCells(a: Rect, b: Rect): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function inBounds(r: Rect): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= BOARD_W && r.y + r.d <= BOARD_H;
}

function clipToBoard(r: Rect): Rect | null {
  const x0 = Math.max(r.x, 0);
  const y0 = Math.max(r.y, 0);
  const x1 = Math.min(r.x + r.w, BOARD_W);
  const y1 = Math.min(r.y + r.d, BOARD_H);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, d: y1 - y0 } : null;
}

function translated(piece: Piece, dir: Dir, k: number): Rect {
  const { dx, dy } = DELTA[dir];
  return { x: piece.x + dx * k, y: piece.y + dy * k, w: piece.w, d: piece.d };
}

function placeClear(state: TesserState, r: Rect, selfId: string): boolean {
  if (!inBounds(r)) return false;
  return state.pieces.every((p) => p.id === selfId || overlapCells(r, p) === 0);
}

/** Count of legal move actions for `seat` (the cheap mobility approximation:
 * moves only — folds are numerous, expensive to enumerate, and mostly noise
 * as a mobility signal). */
export function moveCount(state: TesserState, seat: TesserSeat): number {
  let count = 0;
  for (const piece of state.pieces) {
    if (piece.seat !== seat) continue;
    const spd = speed(piece);
    for (const dir of DIRS) {
      for (let steps = 1; steps <= spd; steps++) {
        if (!placeClear(state, translated(piece, dir, steps), piece.id)) break; // no jumping
        count++;
      }
    }
  }
  return count;
}

/**
 * Best single-strike damage available to `seat` from the current position:
 * the maximum, over all legal attack actions (slide 0..speed-1 then strike
 * one further), of total damage dealt (cleave summed, capped per enemy at its
 * measure). Mirrors the engine's attack rules exactly, computed from
 * geometry without materializing actions.
 */
export function bestStrikeDamage(state: TesserState, seat: TesserSeat): number {
  let best = 0;
  for (const piece of state.pieces) {
    if (piece.seat !== seat) continue;
    const spd = speed(piece);
    for (const dir of DIRS) {
      for (let steps = 0; steps <= spd - 1; steps++) {
        if (steps > 0 && !placeClear(state, translated(piece, dir, steps), piece.id)) break;
        const strike = clipToBoard(translated(piece, dir, steps + 1));
        if (strike === null) continue;
        let damage = 0;
        let friendlyContact = 0;
        for (const p of state.pieces) {
          if (p.id === piece.id) continue;
          const contact = overlapCells(strike, p);
          if (contact === 0) continue;
          if (p.seat === seat) friendlyContact += contact;
          else damage += Math.min(contact * Math.min(piece.h, p.h), p.measure);
        }
        if (friendlyContact === 0 && damage > best) best = damage;
      }
    }
  }
  return best;
}

/** Sum over `seat`'s pieces of measure × progress, where progress ∈ [0, 1]
 * is the footprint center's advance toward the enemy back rank. */
export function advanceScore(state: TesserState, seat: TesserSeat): number {
  let sum = 0;
  for (const p of state.pieces) {
    if (p.seat !== seat) continue;
    const cy = p.y + (p.d - 1) / 2;
    const progress = seat === 'south' ? (BOARD_H - 1 - cy) / (BOARD_H - 1) : cy / (BOARD_H - 1);
    sum += p.measure * progress;
  }
  return sum;
}

export const tesserEval: NamedEval<TesserState> = composeEval<TesserState>([
  {
    name: 'measure-diff',
    weight: 100,
    measure: (s, seat: Seat) => {
      const me = seat as TesserSeat;
      return totalMeasure(s, me) - totalMeasure(s, otherSeat(me));
    },
  },
  {
    name: 'mobility',
    weight: 6,
    measure: (s, seat: Seat) => {
      const me = seat as TesserSeat;
      return normalizeAdvantage(moveCount(s, me), moveCount(s, otherSeat(me)));
    },
  },
  {
    name: 'threat',
    weight: 30,
    measure: (s, seat: Seat) => {
      const me = seat as TesserSeat;
      return bestStrikeDamage(s, me) - bestStrikeDamage(s, otherSeat(me));
    },
  },
  {
    name: 'advance',
    weight: 2,
    measure: (s, seat: Seat) => {
      const me = seat as TesserSeat;
      return advanceScore(s, me) - advanceScore(s, otherSeat(me));
    },
  },
]);
