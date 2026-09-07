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

    // Widen at the current node before descending. Previously the root got
    // one child forever; all later expansion happened below that first choice.
    let node = root;
    for (let treeDepth = 0; treeDepth < 4 && !isTerminal(simState); treeDepth++) {
      const plans = planGenerator(simState, simState.turn.currentPlayer);
      const capacity = Math.max(1, Math.floor(Math.pow(node.visits + 1, config.progressiveWideningAlpha)));
      const unexpanded = plans.find(p => !node.children.has(p.id));
      if (unexpanded && node.children.size < capacity) {
        const childNode = createNode();
        node.children.set(unexpanded.id, { plan: unexpanded, node: childNode, priorValue: unexpanded.score });
        simState = applyActions(simState, unexpanded.actions);
        node = childNode;
        path.push(node);
        break;
      }
      // A resampled state can invalidate a branch from an earlier iteration.
      const available = new Set(plans.map(p => p.id));
      const legalNode = { ...node, children: new Map([...node.children].filter(([id]) => available.has(id))) };
      const selected = selectChild(legalNode, 1.4, config.progressiveWideningAlpha,
        simState.turn.currentPlayer === player ? 1 : -1);
      if (!selected) break;
      simState = applyActions(simState, selected.plan.actions);
      node = selected.node;
      path.push(node);
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
