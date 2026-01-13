import type { GameState, PlayerId } from '../../game/types';
import type { TurnPlan } from './types';
import { applyAction } from '../simulate';
import { generateAllActions } from '../moves';
import { scorePartialPlan, tagPlan } from './scoring';
import { generateTemplatePlans } from './templates';

interface BeamSearchOptions {
  beamWidth: number;
  outputPlans: number;
  maxSteps?: number;
}

function planId(actions: TurnPlan['actions']): string {
  return actions
    .map((action) => {
      if ('unitId' in action && action.unitId) return `${action.type}:${action.unitId}`;
      if ('queuedUnitId' in action && action.queuedUnitId) return `${action.type}:${action.queuedUnitId}`;
      if ('definitionId' in action && action.definitionId) return `${action.type}:${action.definitionId}`;
      return action.type;
    })
    .join('>');
}

export function beamSearchPlans(
  state: GameState,
  player: PlayerId,
  options: BeamSearchOptions
): TurnPlan[] {
  const maxSteps =
    options.maxSteps ??
    (state.turn.phase === 'action'
      ? Math.min(4, state.turn.actionsRemaining || 4)
      : 1);
  let beam: TurnPlan[] = [{ id: 'root', actions: [], score: 0, tags: [] }];

  const forcedPlans = generateTemplatePlans(state, player);

  for (let step = 0; step < maxSteps; step++) {
    const candidates: TurnPlan[] = [];

    for (const plan of beam) {
      let simState = state;
      for (const action of plan.actions) {
        simState = applyAction(simState, action);
      }

      if (simState.turn.currentPlayer !== player) {
        candidates.push(plan);
        continue;
      }

      const actions = generateAllActions(simState, player);
      if (actions.length === 0) {
        candidates.push(plan);
        continue;
      }

      for (const action of actions) {
        const nextActions = [...plan.actions, action];
        const candidate: TurnPlan = {
          id: planId(nextActions),
          actions: nextActions,
          score: 0,
          tags: [],
        };
        candidate.score = scorePartialPlan(candidate, state, player);
        candidates.push(tagPlan(candidate, state, player));
      }
    }

    const sorted = candidates.sort((a, b) => b.score - a.score);
    beam = sorted.slice(0, options.beamWidth);
  }

  const combined = [...forcedPlans, ...beam];
  const unique = new Map<string, TurnPlan>();
  for (const plan of combined) {
    if (!unique.has(plan.id)) {
      unique.set(plan.id, plan);
    }
  }

  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, options.outputPlans);
}
