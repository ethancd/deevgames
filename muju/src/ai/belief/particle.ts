import type { OpponentParticle } from './types';
import type { QueuedUnit } from '../../game/types';
import { UNIT_DEFINITIONS } from '../../game/units';

function randomId(): string {
  return `particle_${Math.random().toString(36).slice(2, 10)}`;
}

export function createParticles(count: number, minResources: number, maxResources: number): OpponentParticle[] {
  const particles: OpponentParticle[] = [];
  for (let i = 0; i < count; i++) {
    const resources = sampleRange(minResources, maxResources);
    particles.push({
      id: randomId(),
      resources,
      buildQueue: [],
      weight: 1 / count,
    });
  }
  return particles;
}

export function resampleParticles(particles: OpponentParticle[]): OpponentParticle[] {
  if (particles.length === 0) return [];
  const totalWeight = particles.reduce((sum, p) => sum + p.weight, 0);
  const normalized = particles.map((p) => ({ ...p, weight: p.weight / totalWeight }));
  const cumulative: number[] = [];
  let running = 0;
  for (const p of normalized) {
    running += p.weight;
    cumulative.push(running);
  }

  const resampled: OpponentParticle[] = [];
  for (let i = 0; i < particles.length; i++) {
    const r = Math.random();
    const idx = cumulative.findIndex((c) => r <= c);
    const source = normalized[Math.max(0, idx)];
    resampled.push({
      ...source,
      id: randomId(),
      weight: 1 / particles.length,
    });
  }
  return resampled;
}

export function sampleQueueSpend(
  resources: number,
  owner: QueuedUnit['owner']
): { remaining: number; queued: QueuedUnit[] } {
  let remaining = resources;
  const queued: QueuedUnit[] = [];
  const affordable = UNIT_DEFINITIONS.filter((def) => def.cost <= remaining);
  if (affordable.length === 0) {
    return { remaining, queued };
  }

  // Queue at most one unit per turn to keep branching manageable.
  if (Math.random() < 0.6) {
    const def = affordable[Math.floor(Math.random() * affordable.length)];
    queued.push({
      id: `belief_${def.id}_${Math.random().toString(36).slice(2, 7)}`,
      definitionId: def.id,
      turnsRemaining: def.buildTime,
      owner,
    });
    remaining -= def.cost;
  }

  return { remaining, queued };
}

function sampleRange(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}
