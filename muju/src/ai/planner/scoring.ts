import type { GameState, PlayerId } from '../../game/types';
import type { TurnPlan } from './types';
import { evaluatePosition, quickEvaluate } from '../evaluation';
import { applyActions } from '../simulate';
import { getPlayerUnits } from '../../game/board';
import { calculateMiningYield } from '../../game/mining';
import { getUnitDefinition } from '../../game/units';

export function scorePartialPlan(plan: TurnPlan, state: GameState, forPlayer: PlayerId, simulated?: GameState): number {
  if (plan.actions.length === 0) {
    return quickEvaluate(state, forPlayer);
  }

  const simState = simulated ?? applyActions(state, plan.actions);
  const baseUnits = getPlayerUnits(state.board, getOpponent(forPlayer));
  const nextUnits = getPlayerUnits(simState.board, getOpponent(forPlayer));
  const killCount = baseUnits.length - nextUnits.length;

  const damageScore = nextUnits.reduce((sum, unit) => sum + unit.damageTaken, 0);
  // Mining creates value. Buying/promoting transfers cash into another asset;
  // evaluatePosition already accounts for that trade, so do not penalize it twice.
  const incomeDelta = simState.players[forPlayer].resourcesGained - state.players[forPlayer].resourcesGained;

  const staticScore = evaluatePosition(simState, forPlayer);

  return (
    staticScore +
    killCount * 20 +
    damageScore * 0.5 +
    incomeDelta * 1.5 -
    plan.actions.length * 0.1
  );
}

export function tagPlan(plan: TurnPlan, state: GameState, forPlayer: PlayerId, simulated?: GameState): TurnPlan {
  const tags: TurnPlan['tags'] = [];
  const simState = simulated ?? applyActions(state, plan.actions);
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

  for (const action of plan.actions) {
    if (action.type !== 'MOVE') continue;
    const unit = simState.board.units.find(u => u.id === action.unitId);
    const before = state.board.units.find(u => u.id === action.unitId);
    if (!unit || !before) continue;
    const home = state.players[forPlayer].startCorner, enemyHome = state.players[opponent].startCorner;
    const distance = (p: typeof home, q: typeof home) => Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
    if (distance(unit.position, enemyHome) === 0 && !tags.includes('raid')) tags.push('raid');
    if (distance(unit.position, home) < distance(before.position, home) && !tags.includes('defensive')) tags.push('defensive');
    const cell = simState.board.cells[unit.position.y][unit.position.x];
    if (calculateMiningYield(unit, cell) > 0 && !tags.includes('expansion')) tags.push('expansion');
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
