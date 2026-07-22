import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

function draws(seed: number, n: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
}

describe('createRng (mulberry32)', () => {
  it('is deterministic: same seed produces the identical sequence', () => {
    expect(draws(42, 20)).toEqual(draws(42, 20));
  });

  it('different seeds produce different sequences', () => {
    expect(draws(1, 10)).not.toEqual(draws(2, 10));
  });

  it('next() always returns values in [0, 1)', () => {
    const rng = createRng(1234);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) always returns an integer in [0, n)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('int(0) and negative n degrade to 0 rather than throwing', () => {
    const rng = createRng(5);
    expect(rng.int(0)).toBe(0);
    expect(rng.int(-3)).toBe(0);
  });

  it('distribution sanity: mean of many draws is close to 0.5', () => {
    const rng = createRng(7);
    const N = 20000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += rng.next();
    const mean = sum / N;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
  });

  it('fork(label) is deterministic for a given seed + label', () => {
    const a = createRng(1).fork('wolf');
    const b = createRng(1).fork('wolf');
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('fork(label) with different labels diverges from parent and from each other', () => {
    const parent = createRng(1);
    const childA = createRng(1).fork('a');
    const childB = createRng(1).fork('b');

    const parentSeq = Array.from({ length: 10 }, () => parent.next());
    const seqA = Array.from({ length: 10 }, () => childA.next());
    const seqB = Array.from({ length: 10 }, () => childB.next());

    expect(seqA).not.toEqual(parentSeq);
    expect(seqA).not.toEqual(seqB);
  });

  it('fork(label) output does not depend on how many draws the parent made first', () => {
    const freshParent = createRng(123);
    const forkedImmediately = freshParent.fork('sun');

    const usedParent = createRng(123);
    for (let i = 0; i < 500; i++) usedParent.next(); // consume many draws
    const forkedAfterDraws = usedParent.fork('sun');

    const seq1 = Array.from({ length: 10 }, () => forkedImmediately.next());
    const seq2 = Array.from({ length: 10 }, () => forkedAfterDraws.next());
    expect(seq1).toEqual(seq2);
  });

  it('forking is independent of subsequent draws on the parent (no shared state)', () => {
    const parent = createRng(55);
    const child = parent.fork('x');
    const childSeqBefore = Array.from({ length: 5 }, () => child.next());

    const parent2 = createRng(55);
    const child2 = parent2.fork('x');
    // Advance parent2 after forking — must not affect child2's stream.
    for (let i = 0; i < 100; i++) parent2.next();
    const childSeqAfter = Array.from({ length: 5 }, () => child2.next());

    expect(childSeqBefore).toEqual(childSeqAfter);
  });

  it('nested fork labels are stable and distinct from single-level forks', () => {
    const rngA = createRng(9).fork('body').fork('heat');
    const rngB = createRng(9).fork('body').fork('heat');
    const rngC = createRng(9).fork('body').fork('fuel');

    const seqA = Array.from({ length: 8 }, () => rngA.next());
    const seqB = Array.from({ length: 8 }, () => rngB.next());
    const seqC = Array.from({ length: 8 }, () => rngC.next());

    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });
});
