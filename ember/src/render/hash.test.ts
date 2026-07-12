import { describe, expect, it } from 'vitest';
import { hash2, hash3, hashFloat, hashInt } from './hash';

describe('hash2', () => {
  it('is deterministic', () => {
    expect(hash2(3, 7, 1)).toBe(hash2(3, 7, 1));
  });

  it('is sensitive to each argument', () => {
    const base = hash2(3, 7, 1);
    expect(hash2(4, 7, 1)).not.toBe(base);
    expect(hash2(3, 8, 1)).not.toBe(base);
    expect(hash2(3, 7, 2)).not.toBe(base);
  });

  it('always returns a non-negative 32-bit integer', () => {
    for (let i = 0; i < 50; i++) {
      const h = hash2(i, i * 13, i * 7);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('hash3', () => {
  it('is deterministic and differs from hash2 on the same first two args', () => {
    expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3));
  });
});

describe('hashInt', () => {
  it('stays within [0, n)', () => {
    for (let i = 0; i < 100; i++) {
      const v = hashInt(6, i, i * 3, 9);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('n<=1 always yields 0', () => {
    expect(hashInt(1, 5, 5)).toBe(0);
    expect(hashInt(0, 5, 5)).toBe(0);
  });
});

describe('hashFloat', () => {
  it('stays within [0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const v = hashFloat(i, i * 2);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
