import type { QueuedUnit } from '../../game/types';

export interface OpponentParticle {
  id: string;
  resources: number;
  buildQueue: QueuedUnit[];
  weight: number;
}

export interface BeliefState {
  particles: OpponentParticle[];
  minResources: number;
  maxResources: number;
}
