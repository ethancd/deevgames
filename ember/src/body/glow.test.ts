import { describe, expect, it } from 'vitest';
import { GLOW_MAX } from '../core/types';
import { createBody, glowRadius, perceptionRadius } from './index';

describe('glowRadius', () => {
  it('is GLOW_MAX at fuel = 1', () => {
    expect(glowRadius(1)).toBeCloseTo(GLOW_MAX, 5);
  });

  it('is ~0.5 tiles at fuel = 0.05', () => {
    expect(glowRadius(0.05)).toBeCloseTo(0.5, 1);
  });

  it('is 0 at fuel = 0', () => {
    expect(glowRadius(0)).toBe(0);
  });

  it('is smooth and monotone increasing in fuel', () => {
    let prev = -Infinity;
    for (let f = 0; f <= 1; f += 0.05) {
      const g = glowRadius(f);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it('clamps out-of-range fuel', () => {
    expect(glowRadius(-1)).toBe(0);
    expect(glowRadius(2)).toBeCloseTo(GLOW_MAX, 5);
  });
});

describe('perceptionRadius', () => {
  it('is base ~10 in EXPLORE and RECOVER', () => {
    expect(perceptionRadius(createBody({ mode: 'EXPLORE' }))).toBe(10);
    expect(perceptionRadius(createBody({ mode: 'RECOVER' }))).toBe(10);
  });

  it('narrows toward ~5 in DEFEND', () => {
    expect(perceptionRadius(createBody({ mode: 'DEFEND' }))).toBe(5);
  });

  it('narrows toward ~8 in CONSERVE', () => {
    expect(perceptionRadius(createBody({ mode: 'CONSERVE' }))).toBe(8);
  });

  it('DEFEND is narrower than CONSERVE which is narrower than EXPLORE', () => {
    const defend = perceptionRadius(createBody({ mode: 'DEFEND' }));
    const conserve = perceptionRadius(createBody({ mode: 'CONSERVE' }));
    const explore = perceptionRadius(createBody({ mode: 'EXPLORE' }));
    expect(defend).toBeLessThan(conserve);
    expect(conserve).toBeLessThan(explore);
  });
});
