import type { AIAction } from '../types';

export type PlanTag =
  | 'raid'
  | 'expansion'
  | 'kill'
  | 'setup_kill'
  | 'combined_attack'
  | 'spawn_denial'
  | 'mining'
  | 'defensive'
  | 'promotion_play'
  | 'passive';

export interface TurnPlan {
  id: string;
  actions: AIAction[];
  score: number;
  tags: PlanTag[];
}
