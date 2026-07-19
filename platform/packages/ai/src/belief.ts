// Particle-filter belief machinery, ported from muju's belief/ (particle.ts,
// types.ts, update.ts) and generalized over an opaque hidden-state type `H`.
//
// The house belief-update pattern (muju's real experience, worth stating
// explicitly): when the game exposes deterministic public deltas (a mined
// resource amount, a revealed card), every particle should be updated by
// exactly that delta — it's known, not sampled. When a public event implies
// a *known spend* (a cost paid from hidden resources), particles that can't
// afford it are hard-filtered out (not down-weighted) because they've been
// falsified, not just made less likely. `null` from `observe()` means "this
// particle is now infeasible" (filtered). The default policy when a filter
// empties the particle set is to reinitialize from `sampleWorld` — muju's
// original engine instead keeps the stale (pre-filter) set on empty, which
// this package deliberately diverges from: a stale set is quietly wrong,
// while reinitializing is honestly "we lost track."

import type { Rng } from '@deev/core';

export interface Particle<H> {
  hidden: H;
  weight: number;
}

export interface BeliefState<H> {
  particles: Particle<H>[];
}

export function createBelief<H>(count: number, sample: (rng: Rng) => H, rng: Rng): BeliefState<H> {
  const particles: Particle<H>[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({ hidden: sample(rng.fork(`belief-init:${i}`)), weight: 1 / count });
  }
  return { particles };
}

/** 1 / sum(normalized weight^2). Equals particle count for uniform weights. */
export function effectiveSampleSize<H>(belief: BeliefState<H>): number {
  const total = belief.particles.reduce((sum, p) => sum + p.weight, 0);
  if (total === 0) return 0;
  const sumSquares = belief.particles.reduce((sum, p) => {
    const w = p.weight / total;
    return sum + w * w;
  }, 0);
  return sumSquares === 0 ? 0 : 1 / sumSquares;
}

/** Weight-proportional draw of a single particle's hidden value. */
export function sampleParticle<H>(belief: BeliefState<H>, rng: Rng): H {
  if (belief.particles.length === 0) {
    throw new Error('sampleParticle: belief has no particles');
  }
  const total = belief.particles.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) {
    // Degenerate (all weights collapsed to 0): fall back to uniform choice
    // rather than dividing by zero.
    return rng.pick(belief.particles).hidden;
  }
  const r = rng.next() * total;
  let running = 0;
  for (const p of belief.particles) {
    running += p.weight;
    if (r <= running) return p.hidden;
  }
  return belief.particles[belief.particles.length - 1].hidden;
}

/**
 * Systematic resampling: below `threshold` * N effective samples, redraw N
 * particles proportional to weight and reset weights to uniform. Systematic
 * (not multinomial) resampling uses one random offset and evenly-spaced
 * strides, which never produces a zero-weight-only draw as long as at least
 * one input particle has positive weight.
 */
export function maybeResample<H>(
  belief: BeliefState<H>,
  threshold: number,
  rng: Rng,
): BeliefState<H> {
  const n = belief.particles.length;
  if (n === 0) return belief;
  const ess = effectiveSampleSize(belief);
  if (ess / n >= threshold) return belief;

  const total = belief.particles.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return belief;

  const cumulative: number[] = [];
  let running = 0;
  for (const p of belief.particles) {
    running += p.weight / total;
    cumulative.push(running);
  }
  cumulative[cumulative.length - 1] = 1; // guard float drift

  const start = rng.next() / n;
  const resampled: Particle<H>[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = start + i / n;
    while (j < cumulative.length - 1 && cumulative[j] < target) j++;
    resampled.push({ hidden: belief.particles[j].hidden, weight: 1 / n });
  }
  return { particles: resampled };
}

/**
 * A game's belief model for ISMCTS. `sampleWorld` is the only required
 * member — a trivial `sampleWorld: (view) => view as S` degenerates cleanly
 * to perfect-info search (see tests/perfect-info degeneration).
 *
 * `deriveEvents` + `observe` are optional and only used together: the
 * ismcts bot diffs the previous view against the current one every choose()
 * call, and when both are supplied, feeds each derived event through
 * `observe` to update every particle (returning `null` filters a particle
 * out — see the house pattern above). `reset` clears model state between
 * games (called from AiBot.onGameStart). `diagnostics` is a free-form
 * observability hook (e.g. exposing effectiveSampleSize for callers who want
 * to watch belief health during play).
 */
export interface BeliefModel<O, S, E = unknown, H = S> {
  sampleWorld(view: O, rng: Rng): S;
  deriveEvents?(prevView: O, view: O): E[];
  /** null return = this particle is now infeasible under the observed event
   * (hard-filtered, not down-weighted). */
  observe?(hidden: H, event: E, rng: Rng): H | null;
  reset?(seat: string, seed: number): void;
  diagnostics?(): { effectiveSampleSize?: number };
}
