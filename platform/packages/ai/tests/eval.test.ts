import { describe, expect, it } from 'vitest';
import type { GameDef, Seat } from '@deev/core';
import { composeEval, normalizeAdvantage, optionalityFactor } from '../src/eval.ts';
import type { EvalFactor } from '../src/eval.ts';

interface ToyState {
  legalCounts: Record<Seat, number>;
  mover: Seat;
}

// A minimal 2-seat GameDef whose only purpose is to give optionalityFactor
// something to call legal()/toAct() against.
const toyDef: GameDef<ToyState, string, unknown, ToyState> = {
  id: 'toy-optionality',
  version: '1.0.0',
  init: () => ({ legalCounts: { A: 0, B: 0 }, mover: 'A' }),
  seats: () => ['A', 'B'],
  toAct: (s) => [s.mover],
  legal: (s, seat) => Array.from({ length: s.legalCounts[seat] }, (_, i) => `${seat}-${i}`),
  apply: (s) => s,
  terminal: () => null,
};

describe('composeEval', () => {
  const factors: EvalFactor<{ a: number; b: number }>[] = [
    { name: 'a', weight: 2, measure: (s) => s.a },
    { name: 'b', weight: 3, measure: (s) => s.b },
  ];

  it('is linear in its factors', () => {
    const evalFn = composeEval(factors);
    expect(evalFn({ a: 1, b: 1 }, 'seat')).toBe(2 * 1 + 3 * 1);
    expect(evalFn({ a: 2, b: 5 }, 'seat')).toBe(2 * 2 + 3 * 5);
  });

  it('explain() contributions sum to the eval value', () => {
    const evalFn = composeEval(factors);
    const state = { a: 4, b: -2 };
    const total = evalFn(state, 'seat');
    const entries = evalFn.explain(state, 'seat');
    expect(entries.map((e) => e.name)).toEqual(['a', 'b']);
    expect(entries.reduce((sum, e) => sum + e.weighted, 0)).toBeCloseTo(total, 10);
    expect(entries[0].raw).toBe(4);
    expect(entries[0].weighted).toBe(8);
  });

  it('with() reweights by name; zeroing a factor removes its contribution', () => {
    const evalFn = composeEval(factors);
    const zeroed = evalFn.with({ a: 0 });
    const state = { a: 10, b: 1 };
    expect(zeroed(state, 'seat')).toBe(3 * 1);
    // Original evalFn is untouched.
    expect(evalFn(state, 'seat')).toBe(2 * 10 + 3 * 1);
  });

  it('with() ignores unknown factor names and leaves others alone', () => {
    const evalFn = composeEval(factors);
    const reweighted = evalFn.with({ nonexistent: 99 });
    expect(reweighted.factors.map((f) => f.weight)).toEqual([2, 3]);
  });
});

describe('normalizeAdvantage', () => {
  it('is 0-safe', () => {
    expect(normalizeAdvantage(0, 0)).toBe(0);
  });
  it('computes (a-b)/(a+b)', () => {
    expect(normalizeAdvantage(3, 1)).toBeCloseTo(0.5, 10);
    expect(normalizeAdvantage(1, 3)).toBeCloseTo(-0.5, 10);
  });
});

describe('optionalityFactor', () => {
  it('is antisymmetric once both seats have been observed', () => {
    const factor = optionalityFactor(toyDef, 1);
    const state: ToyState = { legalCounts: { A: 5, B: 1 }, mover: 'A' };
    // Prime the seat registry for both seats (documented cold-start
    // requirement: the factor discovers opponents via toAct()/seat args
    // seen so far, since GameDef exposes no seats-from-state accessor).
    factor.measure(state, 'A');
    factor.measure({ ...state, mover: 'B' }, 'B');

    const forA = factor.measure(state, 'A');
    const forB = factor.measure(state, 'B');
    expect(forA).toBeCloseTo(-forB, 10);
    expect(forA).toBeGreaterThan(0); // A has more legal moves than B
  });

  it('returns 0 (neutral) before any opponent has been observed', () => {
    const factor = optionalityFactor(toyDef, 1);
    const state: ToyState = { legalCounts: { A: 5, B: 1 }, mover: 'A' };
    expect(factor.measure(state, 'A')).toBe(0);
  });
});
