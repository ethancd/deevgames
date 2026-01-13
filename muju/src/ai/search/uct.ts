import type { MCTSNode, MCTSChild } from './types';

export function selectChild(node: MCTSNode, exploration: number, alpha: number): MCTSChild | null {
  if (node.children.size === 0) return null;
  const maxChildren = Math.max(1, Math.floor(Math.pow(node.visits || 1, alpha)));
  const children = [...node.children.values()].slice(0, maxChildren);

  let best: MCTSChild | null = null;
  let bestScore = -Infinity;

  for (const child of children) {
    const exploit = child.node.totalValue / Math.max(1, child.node.visits);
    const explore = exploration * Math.sqrt(Math.log(Math.max(1, node.visits)) / Math.max(1, child.node.visits));
    const prior = child.priorValue * (1 / (1 + child.node.visits));
    const score = exploit + explore + prior;

    if (score > bestScore) {
      bestScore = score;
      best = child;
    }
  }

  return best;
}
