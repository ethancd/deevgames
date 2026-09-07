import type { RNG } from '../runtime';
import type { BeliefState } from './types';
import type { GameEvent } from '../state/events';
import { createParticles, resampleParticles, sampleQueueSpend } from './particle';
import { UNIT_DEFINITIONS } from '../../game/units';

const MAX_HIDDEN_QUEUE_COST = Math.max(...UNIT_DEFINITIONS.map((def) => def.cost)) * 2;

export function createInitialBelief(particleCount: number, minResources: number, maxResources: number, rng: RNG = Math.random): BeliefState {
  return {
    particles: createParticles(particleCount, minResources, maxResources, rng),
    minResources,
    maxResources,
  };
}

export function updateBelief(belief: BeliefState, events: GameEvent[], opponentId: GameEvent['playerId'], rng: RNG = Math.random): BeliefState {
  let nextBelief = { ...belief };

  for (const event of events) {
    if (event.playerId !== opponentId) continue;
    if (event.type === 'MINE') {
      nextBelief = updateBeliefOnMine(nextBelief, event.amount);
    }
    if (event.type === 'PLACE') {
      nextBelief = updateBeliefOnPlacement(nextBelief, event.cost, event.definitionId);
    }
    if (event.type === 'PROMOTE') {
      nextBelief = updateBeliefOnPromotion(nextBelief, event.cost);
    }
    if (event.type === 'TURN_END') {
      nextBelief = updateBeliefOnTurnEnd(nextBelief, opponentId, rng);
    }
  }

  return nextBelief;
}

export function updateBeliefOnMine(belief: BeliefState, amount: number): BeliefState {
  const particles = belief.particles.map((p) => ({
    ...p,
    resources: p.resources + amount,
  }));
  return {
    ...belief,
    particles,
    minResources: belief.minResources + amount,
    maxResources: belief.maxResources + amount,
  };
}

export function updateBeliefOnPlacement(belief: BeliefState, cost: number, definitionId?: string): BeliefState {
  const particles = belief.particles.map(p => {
    const queued = p.buildQueue.findIndex(q => q.turnsRemaining === 0 && q.definitionId === definitionId);
    // A hypothesized purchase was already paid. Revelation consumes its queue
    // entry, never its resources a second time.
    if (queued >= 0) return { ...p, buildQueue: p.buildQueue.filter((_, i) => i !== queued) };
    return { ...p, resources: p.resources - cost };
  }).filter(p => p.resources >= 0);
  return { ...belief, particles, minResources: Math.max(0, belief.minResources - cost), maxResources: Math.max(0, belief.maxResources - cost) };
}

export function updateBeliefOnPromotion(belief: BeliefState, cost: number): BeliefState {
  return updateBeliefOnPlacement(belief, cost);
}

export function updateBeliefOnTurnEnd(belief: BeliefState, opponentId: GameEvent['playerId'], rng: RNG = Math.random): BeliefState {
  const particles = belief.particles
    .map((p) => {
      const { remaining, queued } = sampleQueueSpend(p.resources, opponentId, rng);
      return {
        ...p,
        resources: remaining,
        buildQueue: [...p.buildQueue, ...queued],
      };
    })
    .filter((p) => p.resources >= 0);

  const minResources = Math.max(0, belief.minResources - MAX_HIDDEN_QUEUE_COST);
  const maxResources = belief.maxResources;
  return {
    particles: particles.length > 0 ? particles : belief.particles,
    minResources,
    maxResources,
  };
}

export function maybeResample(belief: BeliefState, threshold: number, rng: RNG = Math.random): BeliefState {
  const effectiveSize = effectiveSampleSize(belief.particles);
  if (belief.particles.length === 0) return belief;
  if (effectiveSize / belief.particles.length >= threshold) {
    return belief;
  }

  return {
    ...belief,
    particles: resampleParticles(belief.particles, rng),
  };
}

function effectiveSampleSize(particles: BeliefState['particles']): number {
  const totalWeight = particles.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return 0;
  const normalized = particles.map((p) => p.weight / totalWeight);
  const sumSquares = normalized.reduce((sum, w) => sum + w * w, 0);
  return sumSquares === 0 ? 0 : 1 / sumSquares;
}
