import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@deev/core';
import { createBelief, effectiveSampleSize, maybeResample, sampleParticle } from '../src/belief.ts';

describe('particle math', () => {
  it('effectiveSampleSize of uniform weights equals N', () => {
    const rng = mulberry32(1);
    const belief = createBelief(20, (r) => r.int(1000), rng);
    expect(effectiveSampleSize(belief)).toBeCloseTo(20, 8);
  });

  it('createBelief is deterministic per seed', () => {
    const beliefA = createBelief(10, (r) => r.int(1_000_000), mulberry32(42));
    const beliefB = createBelief(10, (r) => r.int(1_000_000), mulberry32(42));
    expect(beliefA.particles.map((p) => p.hidden)).toEqual(beliefB.particles.map((p) => p.hidden));
  });

  it('maybeResample triggers below threshold and never returns zero-weight particles', () => {
    const rng = mulberry32(7);
    const particles = [
      { hidden: 'a', weight: 0.97 },
      { hidden: 'b', weight: 0.01 },
      { hidden: 'c', weight: 0.01 },
      { hidden: 'd', weight: 0.01 },
    ];
    const belief = { particles };
    const essBefore = effectiveSampleSize(belief);
    expect(essBefore / particles.length).toBeLessThan(0.5); // well below a 0.5 threshold

    const resampled = maybeResample(belief, 0.5, rng);
    expect(resampled.particles).toHaveLength(particles.length);
    for (const p of resampled.particles) {
      expect(p.weight).toBeGreaterThan(0);
    }
    // Post-resample weights are uniform.
    expect(resampled.particles.every((p) => p.weight === 1 / particles.length)).toBe(true);
  });

  it('maybeResample is a no-op above threshold', () => {
    const rng = mulberry32(3);
    const belief = createBelief(10, (r) => r.int(10), rng);
    const result = maybeResample(belief, 0.1, rng);
    expect(result).toBe(belief);
  });

  it('sampleParticle draws are weight-proportional (heavily-weighted particle dominates)', () => {
    const belief = {
      particles: [
        { hidden: 'rare', weight: 0.01 },
        { hidden: 'common', weight: 0.99 },
      ],
    };
    const rng = mulberry32(99);
    const counts = { rare: 0, common: 0 };
    for (let i = 0; i < 500; i++) {
      const h = sampleParticle(belief, rng) as 'rare' | 'common';
      counts[h]++;
    }
    expect(counts.common).toBeGreaterThan(counts.rare * 10);
  });
});
