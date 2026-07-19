import { describe, expect, it } from 'vitest';
import { stableStringify, stableHash, engineHash } from '../src/hash.ts';

describe('stableStringify', () => {
  it('is invariant under object key order', () => {
    expect(stableStringify({ a: 1, b: [2, 3], c: { d: 4, e: 5 } })).toEqual(
      stableStringify({ c: { e: 5, d: 4 }, b: [2, 3], a: 1 }),
    );
  });

  it('distinguishes arrays from objects and preserves array order', () => {
    expect(stableStringify([1, 2])).not.toEqual(stableStringify([2, 1]));
    expect(stableStringify({ 0: 1, 1: 2 })).not.toEqual(stableStringify([1, 2]));
  });

  it('handles Maps and Sets stably', () => {
    const m1 = new Map([
      ['x', 1],
      ['y', 2],
    ]);
    const m2 = new Map([
      ['y', 2],
      ['x', 1],
    ]);
    expect(stableStringify(m1)).toEqual(stableStringify(m2));
    expect(stableStringify(new Set([3, 1, 2]))).toEqual(stableStringify(new Set([1, 2, 3])));
  });

  it('throws on functions and circular references', () => {
    expect(() => stableStringify({ f: () => 1 })).toThrow();
    const o: Record<string, unknown> = {};
    o.self = o;
    expect(() => stableStringify(o)).toThrow(/circular/);
  });
});

describe('engineHash', () => {
  it('is declaration-based: id + version only', () => {
    const a = engineHash({ id: 'g', version: '1.0.0' });
    expect(a).toEqual(engineHash({ id: 'g', version: '1.0.0' }));
    expect(a).not.toEqual(engineHash({ id: 'g', version: '1.0.1' }));
  });
});

describe('stableHash', () => {
  it('differs for different states', () => {
    expect(stableHash({ hp: 10 })).not.toEqual(stableHash({ hp: 11 }));
  });
});
