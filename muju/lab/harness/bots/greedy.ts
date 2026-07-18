import type { ScriptedBot, BotContext } from '../types';
import type { AIAction } from '../../../src/ai/types';
import { getUnitDefinition, UNIT_DEFINITIONS } from '../../../src/game/units';
import { manhattanDistance } from '../../../src/game/board';
import { pickBest } from '../rng';
import {
  unitById,
  defenderAt,
  attackKills,
  attackPowerAt,
  unitCost,
  miningYieldAt,
  nearestEnemyDistance,
  enemyCorner,
} from './bot-utils';

/**
 * L1 — one-ply greedy. Scores every legal action with cheap heuristics and
 * takes the max (seeded tie-breaks). No lookahead, no memory. The ladder's
 * "competent but blind" rung and the workhorse for mass matrices.
 */
export function createGreedyBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'Greedy',
    chooseAction(ctx: BotContext) {
      const { legal, rng } = ctx;
      const best = pickBest(rng, legal, (a) => scoreAction(ctx, a));
      if (!best) return null;
      // A non-positive best score means "nothing worth doing": end the phase.
      if (scoreAction(ctx, best) <= 0 && (best.type === 'MOVE' || best.type === 'MINE')) {
        const end = legal.find((a) => a.type === 'END_ACTION_PHASE' || a.type === 'END_TURN');
        return end ?? best;
      }
      return best;
    },
  };
}

function scoreAction(ctx: BotContext, a: AIAction): number {
  const { view } = ctx;
  switch (a.type) {
    case 'ATTACK': {
      const attacker = unitById(view, a.unitId);
      const target = defenderAt(view, a.targetPosition);
      if (!attacker || !target) return -1;
      if (attackKills(view, attacker, a.targetPosition)) {
        return 1000 + unitCost(target) * 10;
      }
      // Chip damage is only worth it if it moves the target toward a kill
      // this turn; greedy approximates with raw power.
      return 100 + attackPowerAt(view, attacker, a.targetPosition) * 10;
    }
    case 'MINE': {
      const unit = unitById(view, a.unitId);
      if (!unit) return -1;
      return 150 + miningYieldAt(view, unit) * 40;
    }
    case 'MOVE': {
      const unit = unitById(view, a.unitId);
      if (!unit) return -1;
      const cur = nearestEnemyDistance(view, unit.position);
      const next = nearestEnemyDistance(view, a.to);
      const progress = cur - next;
      // Advancing toward the nearest enemy; small bonus for fighters.
      const def = getUnitDefinition(unit.definitionId);
      const fighter = def.attack >= 2 ? 10 : 0;
      return progress > 0 ? 20 + progress * 10 + fighter : -5;
    }
    case 'PLACE_UNIT': {
      // Place the unit; prefer squares closer to the enemy corner (front).
      const d = manhattanDistance(a.position, enemyCorner(view));
      return 500 - d * 5;
    }
    case 'PROMOTE_UNIT': {
      const unit = unitById(view, a.unitId);
      if (!unit) return -1;
      return 400 + getUnitDefinition(unit.definitionId).tier * 20;
    }
    case 'QUEUE_UNIT': {
      // Most expensive affordable unit — crude "buy power" heuristic.
      const def = UNIT_DEFINITIONS.find((d) => d.id === a.definitionId)!;
      return 300 + def.cost * 10;
    }
    case 'END_ACTION_PHASE':
      return 1;
    case 'END_TURN':
      return 1;
    default:
      return 0;
  }
}
