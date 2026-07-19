import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/rng.ts';

describe('mulberry32', () => {
  it('is deterministic from a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('serializes and restores state mid-stream', () => {
    const rng = mulberry32(7);
    rng.next();
    rng.next();
    const state = rng.getState();
    const ahead = [rng.next(), rng.next(), rng.int(100)];

    const resumed = mulberry32(0);
    resumed.setState(state);
    expect([resumed.next(), resumed.next(), resumed.int(100)]).toEqual(ahead);
  });

  it('fork produces independent streams and does not advance the parent', () => {
    const rng = mulberry32(99);
    const before = rng.getState();
    const f1 = rng.fork('policy:a');
    const f2 = rng.fork('policy:b');
    expect(rng.getState()).toEqual(before); // forking is not a draw

    const s1 = Array.from({ length: 5 }, () => f1.next());
    const s2 = Array.from({ length: 5 }, () => f2.next());
    expect(s1).not.toEqual(s2); // different labels → different streams

    // Same label from same state → identical stream (reproducible).
    const f1again = mulberry32(99).fork('policy:a');
    expect(Array.from({ length: 5 }, () => f1again.next())).toEqual(s1);
  });

  it('shuffle is a permutation and deterministic', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const out1 = mulberry32(3).shuffle(items);
    const out2 = mulberry32(3).shuffle(items);
    expect(out1).toEqual(out2);
    expect([...out1].sort()).toEqual([...items].sort());
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7]); // input untouched
  });

  it('int rejects non-positive bounds', () => {
    expect(() => mulberry32(1).int(0)).toThrow();
  });
});
