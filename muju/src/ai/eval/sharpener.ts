import type { SearchBudget } from '../runtime';
import type { GameState, PlayerId } from '../../game/types';
import type { EvaluationWeights } from '../types';
import { evaluatePosition } from '../evaluation';
import { applyAction, isTerminal } from '../simulate';
import { generateAttackActions } from '../moves';
import { getValidAttacks } from '../../game/combat';
import { isLegalAction } from '../../game/legality';

export function tacticalSharpen(
  state: GameState,
  forPlayer: PlayerId,
  depth: number,
  weights?: EvaluationWeights,
  budget?: SearchBudget
): number {
  if (budget) budget.stats.evaluations++;
  if (budget?.exhausted() || depth === 0 || isTerminal(state) || !isHotPosition(state)) {
    return evaluatePosition(state, forPlayer, weights);
  }

  const currentPlayer = state.turn.currentPlayer;
  const tacticalPlans = generateTacticalPlans(state, currentPlayer);

  if (tacticalPlans.length === 0) {
    return evaluatePosition(state, forPlayer, weights);
  }

  // Actions do not alternate players: four actions belong to the same turn.
  const maximize = currentPlayer === forPlayer;
  let bestValue = evaluatePosition(state, forPlayer, weights);
  for (const action of tacticalPlans) {
    if (budget && !budget.spend()) break;
    const nextState = applyAction(state, action);
    const value = tacticalSharpen(nextState, forPlayer, depth - 1, weights, budget);
    bestValue = maximize ? Math.max(bestValue, value) : Math.min(bestValue, value);
  }

  return bestValue;
}

export function isHotPosition(state: GameState): boolean {
  for (const unit of state.board.units) {
    if (getValidAttacks(unit, state.board).length > 0) {
      return true;
    }
  }

  return false;
}

export function generateTacticalPlans(state: GameState, player: PlayerId) {
  return generateAttackActions(state, player).filter(a => isLegalAction(state, a, player));
}
