import { describe, it, expect } from 'vitest';
import {
  defineVerifier,
  runVerifier,
  formatVerifierReport,
  verifierIssues,
  solvable,
  notPreSolved,
  survivable,
  mulberry32,
} from '../src/verify.ts';

interface Puzzle {
  id: string;
  preSolved: boolean;
  unsolvable: boolean;
}

const puzzles: Puzzle[] = [
  { id: 'good', preSolved: false, unsolvable: false },
  { id: 'presolved', preSolved: true, unsolvable: false },
  { id: 'impossible', preSolved: false, unsolvable: true },
];

const seeds = [1, 2, 3];

const verifier = defineVerifier<Puzzle>({
  name: 'toy-puzzle-verifier',
  checks: [
    notPreSolved({ isSolved: (p) => p.preSolved }),
    solvable({ solver: (p) => !p.unsolvable, seeds }),
  ],
});

describe('verifier flags a pre-solved and an unsolvable toy level', () => {
  const result = runVerifier(verifier, puzzles, { itemName: (p) => p.id });

  it('overall result fails', () => {
    expect(result.pass).toBe(false);
  });

  it('names the pre-solved item via notPreSolved', () => {
    const failure = result.failures.find((f) => f.item === 'presolved' && f.check === 'notPreSolved');
    expect(failure).toBeDefined();
    expect(failure?.detail).toMatch(/already solved/);
  });

  it('names the unsolvable item via solvable, and the detail includes the failing seed', () => {
    const failure = result.failures.find((f) => f.item === 'impossible' && f.check === 'solvable');
    expect(failure).toBeDefined();
    expect(failure?.detail).toMatch(/seed \d+/);
    expect(failure?.detail).toContain(String(seeds[0]));
  });

  it('the good puzzle produces no failures', () => {
    expect(result.failures.filter((f) => f.item === 'good')).toEqual([]);
  });

  it('formatVerifierReport renders a plain-text pass/fail per item', () => {
    const report = formatVerifierReport(result);
    expect(report).toContain('FAIL');
    expect(report).toContain('presolved');
    expect(report).toContain('impossible');
  });

  it('verifierIssues sugar mirrors the failures as strings', () => {
    const issues = verifierIssues(verifier, puzzles, { itemName: (p) => p.id });
    expect(issues.length).toBe(result.failures.length);
    expect(issues.some((i) => i.includes('presolved'))).toBe(true);
  });
});

describe('a healthy puzzle set passes clean', () => {
  it('pass is true and no failures when every item is solvable and not pre-solved', () => {
    const healthy: Puzzle[] = [{ id: 'ok', preSolved: false, unsolvable: false }];
    const result = runVerifier(verifier, healthy, { itemName: (p) => p.id });
    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
    expect(formatVerifierReport(result)).toMatch(/^PASS/);
  });
});

describe('unseeded stochastic checks are a loud configuration error, not a silent pass', () => {
  it('solvable throws immediately (at definition time) when given zero seeds', () => {
    expect(() => solvable({ solver: () => true, seeds: [] })).toThrow(/explicit seed/);
  });

  it('solvable throws when seeds is not provided at all', () => {
    expect(() => solvable({ solver: () => true } as unknown as { solver: () => boolean; seeds: number[] })).toThrow(
      /explicit seed/,
    );
  });

  it('survivable throws immediately when given zero seeds', () => {
    expect(() => survivable({ simulate: () => true, seeds: [] })).toThrow(/explicit seed/);
  });

  it('never reaches runVerifier — the throw happens at combinator construction, before any run', () => {
    let constructed = false;
    expect(() => {
      const check = solvable({ solver: () => true, seeds: [] });
      constructed = true;
      return check;
    }).toThrow();
    expect(constructed).toBe(false);
  });
});

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('int() stays within [0, maxExclusive)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 50; i++) {
      const v = rng.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });
});
