// Stage A engine tests — SPEC.md §2 exactly, including all five worked
// damage examples from §2.7 as explicit positions, fuzzed invariants, and
// replay convergence.

import { describe, expect, it } from 'vitest';
import { mulberry32, runMatch, assertReplayConverges, type Policy } from '@deev/core';
import {
  tesser,
  defaultSetup,
  footprintCells,
  volume,
  dimClass,
  speed,
  totalMeasure,
  pieceById,
  type Piece,
  type TesserState,
  type TesserAction,
  type TesserSeat,
} from '../src/game.ts';

const rng = () => mulberry32(0);

type FoldAction = Extract<TesserAction, { type: 'fold' }>;
type AttackAction = Extract<TesserAction, { type: 'attack' }>;
const foldsOf = (actions: TesserAction[]): FoldAction[] =>
  actions.filter((a): a is FoldAction => a.type === 'fold');

function P(
  id: string,
  seat: TesserSeat,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  measure = w * d * h,
): Piece {
  return { id, seat, x, y, w, d, h, measure };
}

function S(pieces: Piece[], current: TesserSeat = 'south', ply = 0, plyCap = 100): TesserState {
  return { pieces, current, ply, plyCap };
}

function legalFor(s: TesserState): TesserAction[] {
  return tesser.legal(s, s.current);
}

function apply(s: TesserState, a: TesserAction): TesserState {
  return tesser.apply(s, a, rng());
}

function boardMeasure(s: TesserState): number {
  return totalMeasure(s, 'south') + totalMeasure(s, 'north');
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj)) deepFreeze(value);
    Object.freeze(obj);
  }
  return obj;
}

describe('setup and helpers', () => {
  it('default setup matches §2.3: six pieces, 18 measure per seat, disjoint on-board footprints', () => {
    const s = tesser.init({}, rng());
    expect(s.pieces.map((p) => p.id)).toEqual([
      'S-shield',
      'S-keep',
      'S-lance',
      'N-shield',
      'N-keep',
      'N-lance',
    ]);
    expect(s.current).toBe('south'); // south moves first
    expect(s.ply).toBe(0);
    expect(s.plyCap).toBe(100);
    expect(totalMeasure(s, 'south')).toBe(18);
    expect(totalMeasure(s, 'north')).toBe(18);
    const seen = new Set<string>();
    for (const p of s.pieces) {
      expect(p.measure).toBe(volume(p)); // starts unwounded
      for (const c of footprintCells(p)) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(6);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(8);
        const key = `${c.x},${c.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    // North is the exact 180° rotation of south: cell (x,y) ↔ (5−x, 7−y).
    const southCells = defaultSetup()
      .filter((p) => p.seat === 'south')
      .flatMap(footprintCells)
      .map((c) => `${5 - c.x},${7 - c.y}`)
      .sort();
    const northCells = defaultSetup()
      .filter((p) => p.seat === 'north')
      .flatMap(footprintCells)
      .map((c) => `${c.x},${c.y}`)
      .sort();
    expect(northCells).toEqual(southCells);
  });

  it('dimClass and speed follow §2.2', () => {
    expect(dimClass({ w: 1, d: 1, h: 1 })).toBe('point');
    expect(speed({ w: 1, d: 1, h: 1 })).toBe(4);
    expect(dimClass({ w: 4, d: 1, h: 1 })).toBe('line');
    expect(dimClass({ w: 1, d: 1, h: 8 })).toBe('line');
    expect(speed({ w: 1, d: 1, h: 8 })).toBe(3);
    expect(dimClass({ w: 3, d: 2, h: 1 })).toBe('plane');
    expect(speed({ w: 3, d: 2, h: 1 })).toBe(2);
    expect(dimClass({ w: 2, d: 2, h: 2 })).toBe('solid');
    expect(speed({ w: 2, d: 2, h: 2 })).toBe(1);
  });

  it('volume and footprintCells', () => {
    const keep = P('k', 'south', 3, 5, 2, 2, 2);
    expect(volume(keep)).toBe(8);
    expect(footprintCells(keep)).toEqual([
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 6 },
      { x: 4, y: 6 },
    ]);
  });

  it('init honors config overrides and clones pieces', () => {
    const custom = [P('a', 'south', 0, 0, 1, 1, 1)];
    const s = tesser.init({ pieces: custom, plyCap: 40, firstToAct: 'north' }, rng());
    expect(s.plyCap).toBe(40);
    expect(s.current).toBe('north');
    expect(s.pieces).toEqual(custom);
    s.pieces[0].x = 5;
    expect(custom[0].x).toBe(0); // config untouched
  });
});

describe('§2.7 worked damage examples', () => {
  it('example 1: broadside lance slides then strikes a slab for 3', () => {
    // Slab placed so the lance's slide to y6 is clear (see spec's own "if
    // clear" caveat): slab covers x1–3, y4–5; strike footprint = x1–4, y5.
    const s = S([P('S-lance', 'south', 1, 7, 4, 1, 1), P('N-slab', 'north', 1, 4, 3, 2, 1)]);
    const attack: TesserAction = { type: 'attack', piece: 'S-lance', dir: 'N', steps: 1 };
    expect(legalFor(s)).toContainEqual(attack);
    const next = apply(s, attack);
    expect(pieceById(next, 'S-lance')).toMatchObject({ x: 1, y: 6, measure: 4 }); // slid, unharmed
    expect(pieceById(next, 'N-slab')!.measure).toBe(3); // 3 cells × min(1,1)
  });

  it('example 1 (literal placement): a slab at y5–6 blocks the slide, but a steps-0 strike still deals 3', () => {
    const s = S([P('S-lance', 'south', 1, 7, 4, 1, 1), P('N-slab', 'north', 1, 5, 3, 2, 1)]);
    const legal = legalFor(s);
    expect(legal).not.toContainEqual({ type: 'attack', piece: 'S-lance', dir: 'N', steps: 1 });
    const attack: TesserAction = { type: 'attack', piece: 'S-lance', dir: 'N', steps: 0 };
    expect(legal).toContainEqual(attack);
    const next = apply(s, attack);
    expect(pieceById(next, 'S-lance')).toMatchObject({ x: 1, y: 7 });
    expect(pieceById(next, 'N-slab')!.measure).toBe(3);
  });

  it('example 2: point-first folded lance strikes for 1', () => {
    // Lance refolded 1×4×1 covering x1, y4–7; enemy keep covers x0–1, y2–3.
    const s = S([P('S-lance', 'south', 1, 4, 1, 4, 1), P('N-keep', 'north', 0, 2, 2, 2, 2)]);
    const attack: TesserAction = { type: 'attack', piece: 'S-lance', dir: 'N', steps: 0 };
    expect(legalFor(s)).toContainEqual(attack);
    const next = apply(s, attack);
    expect(pieceById(next, 'N-keep')!.measure).toBe(7); // 1 cell × min(1,2)
  });

  it('example 3: keep strikes a shield overlapping 2 cells for 2', () => {
    const s = S([P('S-keep', 'south', 3, 5, 2, 2, 2), P('N-shield', 'north', 3, 3, 3, 2, 1)]);
    const attack: TesserAction = { type: 'attack', piece: 'S-keep', dir: 'N', steps: 0 };
    expect(legalFor(s)).toContainEqual(attack); // self-overlap of the strike rect does not block
    const next = apply(s, attack);
    expect(pieceById(next, 'N-shield')!.measure).toBe(4); // 2 cells × min(2,1)
  });

  it('example 4: a 1×1×8 column strikes a keep, overlap 1 cell, for 2', () => {
    const column = P('S-column', 'south', 2, 4, 1, 1, 8);
    expect(dimClass(column)).toBe('line');
    expect(speed(column)).toBe(3);
    const s = S([column, P('N-keep', 'north', 2, 2, 2, 2, 2)]);
    const attack: TesserAction = { type: 'attack', piece: 'S-column', dir: 'N', steps: 0 };
    expect(legalFor(s)).toContainEqual(attack);
    const next = apply(s, attack);
    expect(pieceById(next, 'N-keep')!.measure).toBe(6); // 1 cell × min(8,2)
  });

  it('example 5: overkill — raw damage 6 against measure 2 removes it, board loses exactly 2', () => {
    const s = S([
      P('S-block', 'south', 0, 5, 3, 2, 2), // covers x0–2, y5–6, h2
      P('N-slab', 'north', 0, 3, 3, 2, 2, 2), // wounded: measure 2 in a 3×2×2 box
    ]);
    const before = boardMeasure(s);
    const attack: TesserAction = { type: 'attack', piece: 'S-block', dir: 'N', steps: 0 };
    expect(legalFor(s)).toContainEqual(attack); // raw = 3 cells × min(2,2) = 6
    const next = apply(s, attack);
    expect(pieceById(next, 'N-slab')).toBeUndefined(); // removed at 0
    expect(boardMeasure(next)).toBe(before - 2); // cap: only its measure leaves the board
    expect(tesser.terminal(next)).toEqual({ winner: 'south', reason: 'elimination' });
  });
});

describe('movement', () => {
  it('no jumping: a blocker truncates the whole ray', () => {
    const s = S([P('S-pt', 'south', 0, 0, 1, 1, 1), P('N-block', 'north', 0, 2, 1, 1, 1)]);
    const moves = legalFor(s).filter((a) => a.type === 'move' && a.dir === 'S');
    expect(moves).toEqual([{ type: 'move', piece: 'S-pt', dir: 'S', steps: 1 }]);
    // steps 2 lands on the blocker; steps 3-4 would pass through it.
  });

  it('moves stay on board and steps run 1..speed', () => {
    const s = S([P('S-pt', 'south', 0, 0, 1, 1, 1)]); // point, speed 4, in the corner
    const moves = legalFor(s).filter((a) => a.type === 'move');
    expect(moves).toEqual([
      { type: 'move', piece: 'S-pt', dir: 'S', steps: 1 },
      { type: 'move', piece: 'S-pt', dir: 'S', steps: 2 },
      { type: 'move', piece: 'S-pt', dir: 'S', steps: 3 },
      { type: 'move', piece: 'S-pt', dir: 'S', steps: 4 },
      { type: 'move', piece: 'S-pt', dir: 'E', steps: 1 },
      { type: 'move', piece: 'S-pt', dir: 'E', steps: 2 },
      { type: 'move', piece: 'S-pt', dir: 'E', steps: 3 },
      { type: 'move', piece: 'S-pt', dir: 'E', steps: 4 },
    ]);
  });

  it('friendly pieces block movement too', () => {
    const s = S([P('S-a', 'south', 0, 0, 1, 1, 1), P('S-b', 'south', 1, 0, 1, 1, 1)]);
    const eastMoves = legalFor(s).filter(
      (a) => a.type === 'move' && a.piece === 'S-a' && a.dir === 'E',
    );
    expect(eastMoves).toEqual([]);
  });
});

describe('attack details', () => {
  it('attack steps range is 0..speed−1: reach equals speed', () => {
    // Point (speed 4) with the enemy 5 cells away: strike would need steps 4.
    const far = S([P('S-pt', 'south', 0, 0, 1, 1, 1), P('N-pt', 'north', 0, 5, 1, 1, 1)]);
    expect(legalFor(far).filter((a) => a.type === 'attack')).toEqual([]);
    // Enemy 4 cells away: slide 3, strike the 4th cell.
    const near = S([P('S-pt', 'south', 0, 0, 1, 1, 1), P('N-pt', 'north', 0, 4, 1, 1, 1)]);
    expect(legalFor(near).filter((a) => a.type === 'attack')).toEqual([
      { type: 'attack', piece: 'S-pt', dir: 'S', steps: 3 },
    ]);
  });

  it('strikes with every cell off board are illegal; adjacent enemies are hit at steps 0', () => {
    const s = S([P('S-pt', 'south', 0, 0, 1, 1, 1), P('N-pt', 'north', 1, 0, 1, 1, 1)]);
    const attacks = legalFor(s).filter((a) => a.type === 'attack');
    expect(attacks).toEqual([{ type: 'attack', piece: 'S-pt', dir: 'E', steps: 0 }]); // N and W clip to nothing
  });

  it('a strike overlapping any friendly piece is illegal', () => {
    const s = S([
      P('S-lance', 'south', 1, 6, 4, 1, 1),
      P('S-pt', 'south', 3, 5, 1, 1, 1),
      P('N-pt', 'north', 1, 5, 1, 1, 1),
    ]);
    expect(legalFor(s)).not.toContainEqual({
      type: 'attack',
      piece: 'S-lance',
      dir: 'N',
      steps: 0,
    });
  });

  it('cleave: one strike damages every overlapped enemy', () => {
    const s = S([
      P('S-lance', 'south', 1, 6, 4, 1, 1),
      P('N-a', 'north', 1, 5, 2, 1, 1, 2),
      P('N-b', 'north', 4, 5, 1, 1, 2, 2),
    ]);
    const next = apply(s, { type: 'attack', piece: 'S-lance', dir: 'N', steps: 0 });
    expect(pieceById(next, 'N-a')).toBeUndefined(); // 2 cells × min(1,1) = 2, removed
    expect(pieceById(next, 'N-b')!.measure).toBe(1); // 1 cell × min(1,2) = 1
    expect(pieceById(next, 'S-lance')!.measure).toBe(4); // attacker takes no damage
  });

  it('wounded attackers hit at full box dims', () => {
    const s = S([
      P('S-keep', 'south', 0, 4, 2, 2, 2, 1), // measure 1, box still 2×2×2
      P('N-shield', 'north', 0, 2, 3, 2, 1),
    ]);
    const next = apply(s, { type: 'attack', piece: 'S-keep', dir: 'N', steps: 0 });
    expect(pieceById(next, 'N-shield')!.measure).toBe(4); // 2 cells × min(2,1) = 2
    expect(pieceById(next, 'S-keep')!.measure).toBe(1);
  });
});

describe('fold', () => {
  it('requires w*d*h === measure exactly', () => {
    const s = S([P('S-keep', 'south', 2, 3, 2, 2, 2)]); // measure 8
    const folds = foldsOf(legalFor(s));
    expect(folds.length).toBeGreaterThan(0);
    for (const f of folds) {
      expect(f.w * f.d * f.h).toBe(8);
      expect(f.w).toBeLessThanOrEqual(6);
      expect(f.d).toBeLessThanOrEqual(8);
      expect(f.h).toBeLessThanOrEqual(8);
    }
    // 8 = 8×1×1 needs w=8 > 6: that shape must be absent entirely.
    expect(folds.some((f) => f.w === 8)).toBe(false);
    // 1×8×1 spans the whole column; sharing a cell with y3–4 makes it legal.
    expect(folds).toContainEqual({ type: 'fold', piece: 'S-keep', w: 1, d: 8, h: 1, x: 2, y: 0 });
  });

  it('wounded piece folds by CURRENT measure and comes out compact', () => {
    const s = S([P('S-keep', 'south', 2, 3, 2, 2, 2, 5)]); // wounded: 5 of 8
    const folds = foldsOf(legalFor(s));
    for (const f of folds) expect(f.w * f.d * f.h).toBe(5);
    // No identity re-fold: 2×2×2 has volume 8 ≠ 5.
    expect(folds.some((f) => f.w === 2 && f.d === 2 && f.h === 2)).toBe(false);
    const f = folds.find((a) => a.w === 1 && a.d === 1 && a.h === 5)!;
    const next = apply(s, f);
    const p = pieceById(next, 'S-keep')!;
    expect(p.measure).toBe(5);
    expect(volume(p)).toBe(5); // measure === volume immediately after a fold
  });

  it('new footprint must share ≥1 cell with the current footprint', () => {
    const s = S([P('S-pt', 'south', 2, 3, 1, 1, 1)]); // measure 1
    const folds = foldsOf(legalFor(s));
    expect(folds).toEqual([{ type: 'fold', piece: 'S-pt', w: 1, d: 1, h: 1, x: 2, y: 3 }]);
  });

  it('identity fold of an unwounded piece is legal and folds cannot land on other pieces', () => {
    const s = S([P('S-keep', 'south', 2, 3, 2, 2, 2), P('N-pt', 'north', 2, 2, 1, 1, 1)]);
    const folds = foldsOf(legalFor(s));
    expect(folds).toContainEqual({ type: 'fold', piece: 'S-keep', w: 2, d: 2, h: 2, x: 2, y: 3 });
    // Any fold whose footprint covers the enemy point at (2,2) is illegal.
    for (const f of folds) {
      const covers =
        f.x <= 2 && 2 < f.x + f.w && f.y <= 2 && 2 < f.y + f.d;
      expect(covers).toBe(false);
    }
  });
});

describe('terminal, score, commit points', () => {
  it('elimination ends the game immediately', () => {
    const s = S([P('S-pt', 'south', 0, 0, 1, 1, 1)], 'north', 7);
    expect(tesser.terminal(s)).toEqual({ winner: 'south', reason: 'elimination' });
  });

  it('elimination takes precedence over the ply cap', () => {
    const s = S([P('S-pt', 'south', 0, 0, 1, 1, 1)], 'north', 100, 100);
    expect(tesser.terminal(s)).toEqual({ winner: 'south', reason: 'elimination' });
  });

  it('ply cap adjudicates by total measure with scores', () => {
    const pieces = [P('S-keep', 'south', 0, 0, 2, 2, 2), P('N-pt', 'north', 5, 7, 1, 1, 1)];
    expect(tesser.terminal(S(pieces, 'south', 99, 100))).toBeNull();
    expect(tesser.terminal(S(pieces, 'south', 100, 100))).toEqual({
      winner: 'south',
      reason: 'adjudication',
      scores: { south: 8, north: 1 },
    });
  });

  it('equal measure at the cap is a draw', () => {
    const pieces = [P('S-pt', 'south', 0, 0, 1, 1, 1), P('N-pt', 'north', 5, 7, 1, 1, 1)];
    expect(tesser.terminal(S(pieces, 'south', 100, 100))).toEqual({
      winner: null,
      reason: 'adjudication',
      scores: { south: 1, north: 1 },
    });
  });

  it('score is the measure differential', () => {
    const s = S([P('S-keep', 'south', 0, 0, 2, 2, 2), P('N-pt', 'north', 5, 7, 1, 1, 1)]);
    expect(tesser.score!(s, 'south')).toBe(7);
    expect(tesser.score!(s, 'north')).toBe(-7);
  });

  it('isCommitPoint: attack and fold true; move and pass false', () => {
    const s = tesser.init({}, rng());
    expect(tesser.isCommitPoint!(s, { type: 'attack', piece: 'S-lance', dir: 'N', steps: 0 })).toBe(true);
    expect(tesser.isCommitPoint!(s, { type: 'fold', piece: 'S-keep', w: 2, d: 2, h: 2, x: 3, y: 5 })).toBe(true);
    expect(tesser.isCommitPoint!(s, { type: 'move', piece: 'S-lance', dir: 'E', steps: 1 })).toBe(false);
    expect(tesser.isCommitPoint!(s, { type: 'pass' })).toBe(false);
  });
});

describe('legal() determinism and §2.6 ordering', () => {
  it('two calls return identical arrays', () => {
    const s0 = tesser.init({}, rng());
    expect(tesser.legal(s0, 'south')).toEqual(tesser.legal(s0, 'south'));
    const s1 = apply(s0, { type: 'move', piece: 'S-lance', dir: 'E', steps: 1 });
    expect(tesser.legal(s1, 'north')).toEqual(tesser.legal(s1, 'north'));
  });

  it('only the seat to act has actions; pass is always present and last', () => {
    const s = tesser.init({}, rng());
    expect(tesser.legal(s, 'north')).toEqual([]);
    const legal = tesser.legal(s, 'south');
    expect(legal[legal.length - 1]).toEqual({ type: 'pass' });
    expect(legal.filter((a) => a.type === 'pass')).toHaveLength(1);
  });

  it('actions are grouped by piece order, then move < attack < fold; dirs N<S<E<W; steps ascending', () => {
    const s = tesser.init({}, rng());
    const legal = tesser.legal(s, 'south');
    const pieceOrder = ['S-shield', 'S-keep', 'S-lance'];
    const typeOrder = ['move', 'attack', 'fold'];
    const dirOrder = ['N', 'S', 'E', 'W'];
    let last = { piece: -1, type: -1, dir: -1, steps: -1 };
    for (const a of legal) {
      if (a.type === 'pass') continue;
      const key = {
        piece: pieceOrder.indexOf(a.piece),
        type: typeOrder.indexOf(a.type),
        dir: a.type === 'fold' ? -1 : dirOrder.indexOf(a.dir),
        steps: a.type === 'fold' ? -1 : a.steps,
      };
      expect(key.piece).toBeGreaterThanOrEqual(0);
      if (key.piece === last.piece) {
        expect(key.type).toBeGreaterThanOrEqual(last.type);
        if (key.type === last.type && key.dir >= 0 && key.dir === last.dir) {
          expect(key.steps).toBeGreaterThan(last.steps); // steps ascending per (piece, type, dir)
        }
      } else {
        expect(key.piece).toBeGreaterThan(last.piece);
      }
      last = key;
    }
    // First actions: S-shield's northward slides.
    expect(legal[0]).toEqual({ type: 'move', piece: 'S-shield', dir: 'N', steps: 1 });
    expect(legal[1]).toEqual({ type: 'move', piece: 'S-shield', dir: 'N', steps: 2 });
  });

  it('folds are ordered by (w,d,h) then anchor row-major', () => {
    const s = S([P('S-keep', 'south', 2, 3, 2, 2, 2)]);
    const folds = foldsOf(legalFor(s));
    for (let i = 1; i < folds.length; i++) {
      const a = folds[i - 1];
      const b = folds[i];
      const shapeA = [a.w, a.d, a.h];
      const shapeB = [b.w, b.d, b.h];
      const cmp = shapeA.join(',') === shapeB.join(',') ? 0 : shapeCompare(shapeA, shapeB);
      if (cmp === 0) {
        // same shape: row-major anchors (y, then x) strictly ascending
        expect(b.y > a.y || (b.y === a.y && b.x > a.x)).toBe(true);
      } else {
        expect(cmp).toBeLessThan(0);
      }
    }
    function shapeCompare(x: number[], y: number[]): number {
      for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
      return 0;
    }
  });
});

// Independent damage oracle for the fuzz test: cell-set based, unlike the
// engine's rect arithmetic.
function expectedAttackLoss(s: TesserState, a: AttackAction): number {
  const attacker = pieceById(s, a.piece)!;
  const delta = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[a.dir];
  const slid = { ...attacker, x: attacker.x + delta[0] * a.steps, y: attacker.y + delta[1] * a.steps };
  const strike = footprintCells(slid)
    .map((c) => ({ x: c.x + delta[0], y: c.y + delta[1] }))
    .filter((c) => c.x >= 0 && c.x < 6 && c.y >= 0 && c.y < 8);
  let loss = 0;
  for (const enemy of s.pieces) {
    if (enemy.seat === attacker.seat) continue;
    const cells = new Set(footprintCells(enemy).map((c) => `${c.x},${c.y}`));
    const contact = strike.filter((c) => cells.has(`${c.x},${c.y}`)).length;
    if (contact > 0) loss += Math.min(contact * Math.min(attacker.h, enemy.h), enemy.measure);
  }
  return loss;
}

describe('fuzz: seeded random playouts', () => {
  it('50 games × ≤120 plies hold every invariant', () => {
    for (let seed = 0; seed < 50; seed++) {
      const pick = mulberry32(seed * 7919 + 1);
      let s = tesser.init({}, mulberry32(seed));
      for (let ply = 0; ply < 120; ply++) {
        if (tesser.terminal(s) !== null) break;
        deepFreeze(s); // apply() must never mutate its input
        const legal = tesser.legal(s, s.current);
        expect(legal.length).toBeGreaterThan(0); // legal-never-empty
        const action = legal[pick.int(legal.length)];
        const before = boardMeasure(s);
        const expectedLoss =
          action.type === 'attack' ? expectedAttackLoss(s, action) : 0;
        const applyRng = mulberry32(999);
        const rngBefore = applyRng.getState();
        const next = tesser.apply(s, action, applyRng);
        expect(applyRng.getState()).toEqual(rngBefore); // apply never draws from rng

        // Conservation: never increases; decreases exactly by capped damage.
        expect(boardMeasure(next)).toBe(before - expectedLoss);
        expect(expectedLoss).toBeGreaterThanOrEqual(0);

        // Piece invariants: in bounds, 1 ≤ measure ≤ volume, disjoint footprints.
        const seen = new Set<string>();
        for (const p of next.pieces) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x + p.w).toBeLessThanOrEqual(6);
          expect(p.y + p.d).toBeLessThanOrEqual(8);
          expect(p.measure).toBeGreaterThanOrEqual(1);
          expect(p.measure).toBeLessThanOrEqual(volume(p));
          for (const c of footprintCells(p)) {
            const key = `${c.x},${c.y}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }
        }
        expect(next.ply).toBe(s.ply + 1);
        expect(next.current).toBe(s.current === 'south' ? 'north' : 'south');
        s = next;
      }
      // Default plyCap 100 guarantees termination within the 120-ply budget.
      expect(tesser.terminal(s)).not.toBeNull();
    }
  });
});

describe('replay convergence', () => {
  const random: Policy<TesserState, TesserAction> = {
    choose: (_view, _seat, legal, rng) => legal[rng.int(legal.length)],
  };

  it('seeded random-vs-random matches terminate, are deterministic, and replay to the same hash', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const t1 = runMatch(tesser, {}, seed, { south: random, north: random });
      const t2 = runMatch(tesser, {}, seed, { south: random, north: random });
      expect(t1.actions).toEqual(t2.actions);
      expect(['elimination', 'adjudication']).toContain(t1.result.reason);
      assertReplayConverges(tesser, t1);
    }
  });

  it('a shortened ply cap adjudicates with scores', () => {
    const t = runMatch(tesser, { plyCap: 20 }, 7, { south: random, north: random });
    expect(t.actions.length).toBeLessThanOrEqual(20);
    if (t.result.reason === 'adjudication') {
      expect(t.result.scores).toBeDefined();
    }
    assertReplayConverges(tesser, t);
  });
});
