import type { TurnPlan } from '../planner/types';

export interface MCTSChild {
  plan: TurnPlan;
  node: MCTSNode;
  priorValue: number;
}

export interface MCTSNode {
  visits: number;
  totalValue: number;
  children: Map<string, MCTSChild>;
}
