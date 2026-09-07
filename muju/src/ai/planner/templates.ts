import type { SearchBudget } from '../runtime';
import type { GameState, PlayerId } from '../../game/types';
import type { TurnPlan } from './types';
import { generateAttackActions, generateMoveActions } from '../moves';
import { applyAction } from '../simulate';
import { canBeEliminated } from '../../game/combat';

interface TacticalTemplate {
  name: string;
  detect: (state: GameState, player: PlayerId) => boolean;
  generate: (state: GameState, player: PlayerId, budget?: SearchBudget) => TurnPlan[];
}

function planId(actions: TurnPlan['actions']): string {
  return actions.map(a => JSON.stringify(a)).join('|');
}

const immediateKill: TacticalTemplate = {
  name: 'immediate_kill',
  detect: (state, player) => {
    if (state.turn.phase !== 'action') return false;
    const attacks = generateAttackActions(state, player);
    return attacks.some((action) => {
      if (action.type !== 'ATTACK') return false;
      const attacker = state.board.units.find((u) => u.id === action.unitId);
      const target = state.board.units.find(
        (u) => u.position.x === action.targetPosition.x && u.position.y === action.targetPosition.y
      );
      return attacker && target && canBeEliminated(target, attacker);
    });
  },
  generate: (state, player, budget) => {
    if (budget?.exhausted() || state.turn.phase !== 'action' || state.turn.actionsRemaining < 1) return [];
    const attacks = generateAttackActions(state, player);
    return attacks
      .filter((action): action is { type: 'ATTACK'; unitId: string; targetPosition: { x: number; y: number } } => {
        if (action.type !== 'ATTACK') return false;
        const attacker = state.board.units.find((u) => u.id === action.unitId);
        const target = state.board.units.find(
          (u) => u.position.x === action.targetPosition.x && u.position.y === action.targetPosition.y
        );
        return !!(attacker && target && canBeEliminated(target, attacker));
      })
      .map((action) => ({ id: planId([action]), actions: [action], score: 0, tags: ['kill'] }));
  },
};

const moveThenKill: TacticalTemplate = {
  name: 'move_then_kill',
  detect: (state, player) =>
    state.turn.phase === 'action' && generateMoveActions(state, player).length > 0,
  generate: (state, player, budget) => {
    if (state.turn.phase !== 'action' || state.turn.actionsRemaining < 2) return [];
    const plans: TurnPlan[] = [];
    const moves = generateMoveActions(state, player);
    for (const move of moves) {
      if (budget && !budget.spend()) break;
      const movedState = applyAction(state, move);
      const attacks = generateAttackActions(movedState, player);
      for (const attack of attacks) {
        if (attack.type !== 'ATTACK') continue;
        const attacker = movedState.board.units.find((u) => u.id === attack.unitId);
        const target = movedState.board.units.find(
          (u) => u.position.x === attack.targetPosition.x && u.position.y === attack.targetPosition.y
        );
        if (attacker && target && canBeEliminated(target, attacker)) {
          plans.push({
            id: planId([move, attack]),
            actions: [move, attack],
            score: 0,
            tags: ['setup_kill'],
          });
        }
      }
    }
    return plans;
  },
};

export const TEMPLATES: TacticalTemplate[] = [immediateKill, moveThenKill];

export function generateTemplatePlans(state: GameState, player: PlayerId, budget?: SearchBudget): TurnPlan[] {
  const plans: TurnPlan[] = [];
  for (const template of TEMPLATES) {
    if (budget?.exhausted()) break;
    if (template.detect(state, player)) {
      plans.push(...template.generate(state, player, budget));
    }
  }
  return plans;
}
