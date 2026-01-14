import type { GameState, PlayerId } from '../../game/types';
import type { TurnPlan } from './types';
import { evaluatePosition, quickEvaluate } from '../evaluation';
import { applyActions } from '../simulate';
import { getPlayerUnits } from '../../game/board';
import { getUnitDefinition } from '../../game/units';

export function scorePartialPlan(plan: TurnPlan, state: GameState, forPlayer: PlayerId): number {
  if (plan.actions.length === 0) {
    return quickEvaluate(state, forPlayer);
  }

  const simState = applyActions(state, plan.actions);
  const baseUnits = getPlayerUnits(state.board, getOpponent(forPlayer));
  const nextUnits = getPlayerUnits(simState.board, getOpponent(forPlayer));
  const killCount = baseUnits.length - nextUnits.length;

  const damageScore = nextUnits.reduce((sum, unit) => sum + unit.damageTaken, 0);
  const resourcesDelta = simState.players[forPlayer].resources - state.players[forPlayer].resources;

  const staticScore = evaluatePosition(simState, forPlayer);

  return (
    staticScore +
    killCount * 20 +
    damageScore * 0.5 +
    resourcesDelta * 1.5 -
    plan.actions.length * 0.1
  );
}

export function tagPlan(plan: TurnPlan, state: GameState, forPlayer: PlayerId): TurnPlan {
  const tags: TurnPlan['tags'] = [];
  const simState = applyActions(state, plan.actions);
  const opponent = getOpponent(forPlayer);

  const baseUnits = getPlayerUnits(state.board, opponent);
  const nextUnits = getPlayerUnits(simState.board, opponent);

  if (baseUnits.length > nextUnits.length) {
    tags.push('kill');
  }

  if (plan.actions.some((action) => action.type === 'MINE')) {
    tags.push('mining');
  }

  if (plan.actions.some((action) => action.type === 'PROMOTE_UNIT')) {
    tags.push('promotion_play');
  }

  if (tags.length === 0) {
    tags.push('passive');
  }

  return { ...plan, tags };
}

function getOpponent(player: PlayerId): PlayerId {
  return player === 'white' ? 'black' : 'white';
}

export function estimateUnitValue(unitId: string): number {
  const def = getUnitDefinition(unitId);
  return def.cost;
}
