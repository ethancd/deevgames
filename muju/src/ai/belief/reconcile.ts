import type { PublicState } from '../state/types';
import type { BeliefState } from './types';
import type { PlayerId } from '../../game/types';
import type { RNG } from '../runtime';
import { sampleQueueSpend } from './particle';
import { getUnitDefinition, UNIT_DEFINITIONS } from '../../game/units';
import { meetsTechRequirement } from '../../game/building';

/** Reconcile every observed snapshot to public economic conservation. Sparse
 * snapshots cannot establish exact purchase dates: retain saving and feasible
 * pending-investment hypotheses, without inventing precise observation history.
 */
export function reconcileBelief(observation: PublicState, opponent: PlayerId, count: number, rng: RNG): BeliefState {
  const p = observation.players[opponent];
  const maximum = Math.max(0, p.resourcesGained - p.resourcesSpent);
  const allowed = new Set(UNIT_DEFINITIONS.filter(d => meetsTechRequirement(d.id, opponent, observation.board)).map(d => d.id));
  // Earliest possible paid order was at the end of the opponent's first
  // turn. Never invent a ready T3 queue in round one, even on sparse history.
  const elapsedStarts = Math.max(0, observation.turn.turnNumber - 1 -
    (opponent === 'black' && observation.turn.currentPlayer === 'white' ? 1 : 0));
  const particles = Array.from({ length: count }, (_, i) => {
    let resources = maximum;
    const buildQueue = [] as BeliefState['particles'][number]['buildQueue'];
    // Include a saving hypothesis explicitly; others sample affordable legal
    // investment. The total stockpile + unpaid-to-public queue always equals
    // gained - manifested spending. Fresh bounded queues cannot age forever.
    if (i !== 0) for (let j = 0; j < 3; j++) {
      const spent = sampleQueueSpend(resources, opponent, rng, allowed);
      resources = spent.remaining;
      for (const q of spent.queued) buildQueue.push({ ...q,
        turnsRemaining: Math.max(0, getUnitDefinition(q.definitionId).buildTime - Math.floor(rng() * (Math.min(elapsedStarts, getUnitDefinition(q.definitionId).buildTime) + 1))) });
    }
    return { id: `posterior-${i}`, resources, buildQueue, weight: 1 / count };
  });
  return { particles, minResources: 0, maxResources: maximum };
}
