import type { GameState, PlayerId } from '../../game/types';
import type { TurnPlan } from './types';
import { generateAttackActions, generateMoveActions } from '../moves';
import { applyAction } from '../simulate';
import { canBeEliminated } from '../../game/combat';

interface TacticalTemplate {
  name: string;
  detect: (state: GameState, player: PlayerId) => boolean;
  generate: (state: GameState, player: PlayerId) => TurnPlan[];
}

function planId(actions: TurnPlan['actions']): string {
  return actions.map((action) => `${action.type}:${'unitId' in action ? action.unitId : ''}`)
    .join('|');
}

const immediateKill: TacticalTemplate = {
  name: 'immediate_kill',
  detect: (state, player) => {
    if (state.turn.phase !== 'action') return false;
    const attacks = generateAttackActions(state, player);
    return attacks.some((action) => {
      const attacker = state.board.units.find((u) => u.id === action.unitId);
      const target = state.board.units.find(
        (u) => u.position.x === action.targetPosition.x && u.position.y === action.targetPosition.y
      );
      return attacker && target && canBeEliminated(target, attacker);
    });
  },
  generate: (state, player) => {
    if (state.turn.phase !== 'action') return [];
    const attacks = generateAttackActions(state, player);
    return attacks
      .filter((action) => {
        const attacker = state.board.units.find((u) => u.id === action.unitId);
        const target = state.board.units.find(
          (u) => u.position.x === action.targetPosition.x && u.position.y === action.targetPosition.y
        );
        return attacker && target && canBeEliminated(target, attacker);
      })
      .map((action) => ({ id: planId([action]), actions: [action], score: 0, tags: ['kill'] }));
  },
};

const moveThenKill: TacticalTemplate = {
  name: 'move_then_kill',
  detect: (state, player) =>
    state.turn.phase === 'action' && generateMoveActions(state, player).length > 0,
  generate: (state, player) => {
    if (state.turn.phase !== 'action') return [];
    const plans: TurnPlan[] = [];
    const moves = generateMoveActions(state, player);
    for (const move of moves) {
      const movedState = applyAction(state, move);
      const attacks = generateAttackActions(movedState, player);
      for (const attack of attacks) {
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

export function generateTemplatePlans(state: GameState, player: PlayerId): TurnPlan[] {
  const plans: TurnPlan[] = [];
  for (const template of TEMPLATES) {
    if (template.detect(state, player)) {
      plans.push(...template.generate(state, player));
    }
  }
  return plans;
}
