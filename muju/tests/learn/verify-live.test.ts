import { describe, expect, it, vi } from 'vitest';

// The app's live reply budget, shrunk until it cannot find any refutation.
vi.mock('../../src/learn/worker/client', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/learn/worker/client')>();
  return { ...actual, LIVE_BUDGET: { ...actual.LIVE_BUDGET, reply: 1 } };
});

const { fixtureById } = await import('../../src/learn/fixtures');
const { verifyPuzzle } = await import('../../src/learn/verify');

describe('verifyPuzzle', () => {
  it('holds a tempting try to the refutation the app itself plays, at the app’s reply budget', () => {
    const report = verifyPuzzle(fixtureById('fx-survive')!, { outcomes: false });
    expect(report.errors).toContain('try 1: the live reply does not find the refutation');
  });
});
