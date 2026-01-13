import type { GameState, PlayerId } from '../../game/types';
import type { EvaluationWeights } from '../types';
import { evaluatePosition } from '../evaluation';
import { applyAction, isTerminal, getOpponent } from '../simulate';
import { generateAttackActions } from '../moves';
import { getValidAttacks } from '../../game/combat';

export function tacticalSharpen(
  state: GameState,
  forPlayer: PlayerId,
  depth: number,
  weights?: EvaluationWeights
): number {
  if (depth === 0 || isTerminal(state) || !isHotPosition(state)) {
    return evaluatePosition(state, forPlayer, weights);
  }

  const currentPlayer = state.turn.currentPlayer;
  const tacticalPlans = generateTacticalPlans(state, currentPlayer);

  if (tacticalPlans.length === 0) {
    return evaluatePosition(state, forPlayer, weights);
  }

  let bestValue = -Infinity;
  for (const action of tacticalPlans) {
    const nextState = applyAction(state, action);
    const value = -tacticalSharpen(nextState, getOpponent(currentPlayer), depth - 1, weights);
    if (value > bestValue) {
      bestValue = value;
    }
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
  return generateAttackActions(state, player);
}
