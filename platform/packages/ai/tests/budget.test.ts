import { describe, expect, it } from 'vitest';
import { ISMCTS_BUDGETS, MINIMAX_BUDGETS, resolveBudget } from '../src/budget.ts';

describe('budget presets', () => {
  // Snapshot test: preset values are pure numbers and any change here is a
  // conscious diff, not an accidental drift.
  it('MINIMAX_BUDGETS snapshot', () => {
    expect(MINIMAX_BUDGETS).toEqual({
      easy: { depth: 2 },
      medium: { depth: 4 },
      hard: { depth: 6 },
      max: { depth: 9 },
    });
  });

  it('ISMCTS_BUDGETS snapshot', () => {
    expect(ISMCTS_BUDGETS).toEqual({
      easy: { iterations: 80, playoutDepth: 4 },
      medium: { iterations: 300, playoutDepth: 8 },
      hard: { iterations: 800, playoutDepth: 12 },
      max: { iterations: 2000, playoutDepth: 16 },
    });
  });
});

describe('resolveBudget', () => {
  it('resolves a preset name to the matching table entry', () => {
    expect(resolveBudget('minimax', 'hard')).toEqual(MINIMAX_BUDGETS.hard);
    expect(resolveBudget('ismcts', 'easy')).toEqual(ISMCTS_BUDGETS.easy);
  });

  it('defaults to medium when no budget is given', () => {
    expect(resolveBudget('minimax', undefined)).toEqual(MINIMAX_BUDGETS.medium);
    expect(resolveBudget('ismcts', undefined)).toEqual(ISMCTS_BUDGETS.medium);
  });

  it('passes an explicit SearchBudget through unchanged', () => {
    const custom = { depth: 3, maxNodes: 1000 };
    expect(resolveBudget('minimax', custom)).toBe(custom);
  });
});
