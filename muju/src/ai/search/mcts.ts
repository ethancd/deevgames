import type { GameState, PlayerId } from '../../game/types';
import type { FullKnowledge } from '../state/types';
import type { TurnPlan } from '../planner/types';
import type { MCTSNode, MCTSChild } from './types';
import { selectChild } from './uct';
import { redeterminize } from './redeterminize';
import { isTerminal, applyActions } from '../simulate';

interface MCTSConfig {
  iterations: number;
  timeLimitMs: number;
  progressiveWideningAlpha: number;
}

interface PlanGenerator {
  (state: GameState, player: PlayerId): TurnPlan[];
}

interface Evaluator {
  (state: GameState, player: PlayerId): number;
}

export function runMCTS(
  knowledge: FullKnowledge,
  player: PlayerId,
  config: MCTSConfig,
  planGenerator: PlanGenerator,
  evaluator: Evaluator
): TurnPlan {
  const root: MCTSNode = createNode();
  const startTime = Date.now();

  for (let i = 0; i < config.iterations; i++) {
    if (Date.now() - startTime > config.timeLimitMs) break;

    let simState = redeterminize(knowledge, player);
    const path: MCTSNode[] = [root];

    // Selection
    let node = root;
    while (node.children.size > 0) {
      const selected = selectChild(node, 1.4, config.progressiveWideningAlpha);
      if (!selected) break;
      simState = applyActions(simState, selected.plan.actions);
      node = selected.node;
      path.push(node);

      if (isTerminal(simState)) {
        break;
      }
    }

    // Expansion
    if (!isTerminal(simState)) {
      const plans = planGenerator(simState, simState.turn.currentPlayer);
      for (const plan of plans) {
        if (!node.children.has(plan.id)) {
          const childNode = createNode();
          const child: MCTSChild = { plan, node: childNode, priorValue: plan.score };
          node.children.set(plan.id, child);
          simState = applyActions(simState, plan.actions);
          node = childNode;
          path.push(node);
          break;
        }
      }
    }

    // Simulation
    let rolloutDepth = 0;
    while (!isTerminal(simState) && rolloutDepth < 4) {
      const currentPlayer = simState.turn.currentPlayer;
      const plans = planGenerator(simState, currentPlayer);
      if (plans.length === 0) break;
      const bestPlan = plans[0];
      simState = applyActions(simState, bestPlan.actions);
      rolloutDepth++;
    }

    const value = evaluator(simState, player);

    // Backpropagation
    for (const visited of path) {
      visited.visits += 1;
      visited.totalValue += value;
    }
  }

  return bestPlanFromRoot(root, knowledge, player, planGenerator);
}

function createNode(): MCTSNode {
  return { visits: 0, totalValue: 0, children: new Map() };
}

function bestPlanFromRoot(
  root: MCTSNode,
  knowledge: FullKnowledge,
  player: PlayerId,
  planGenerator: PlanGenerator
): TurnPlan {
  if (root.children.size === 0) {
    const simState = redeterminize(knowledge, player);
    const plans = planGenerator(simState, player);
    return plans[0] ?? { id: 'pass', actions: [], score: 0, tags: ['passive'] };
  }

  let best: MCTSChild | null = null;
  for (const child of root.children.values()) {
    if (!best || child.node.visits > best.node.visits) {
      best = child;
    }
  }

  return best?.plan ?? { id: 'pass', actions: [], score: 0, tags: ['passive'] };
}
