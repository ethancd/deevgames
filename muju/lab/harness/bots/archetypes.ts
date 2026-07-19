import type { ScriptedBot, BotContext } from '../types';
import type { AIAction } from '../../../src/ai/types';
import { getUnitDefinition } from '../../../src/game/units';
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
 * L2 archetype bots. Each encodes one strategic stance with simple rules:
 *
 * - Rush: mass fire_1 (the canonical zerg rush, design ruling E-2), flood
 *   forward, focus damaged targets, keep the starting miners on economy.
 * - Expand: pure economy — plant mining line, avoid combat, out-mine.
 *   This is the "greedy pure-economy play" that rush SHOULD beat per E-2.
 * - Balanced: water/shadow mix, fight when favorable, mine otherwise.
 */

// ---------- shared scoring helpers ----------

function scoreAttack(ctx: BotContext, a: Extract<AIAction, { type: 'ATTACK' }>): number {
  const { view } = ctx;
  const attacker = unitById(view, a.unitId);
  const target = defenderAt(view, a.targetPosition);
  if (!attacker || !target) return -1;
  if (attackKills(view, attacker, a.targetPosition)) return 1000 + unitCost(target) * 10;
  // prefer finishing what's already damaged (emergent focus fire)
  return 100 + attackPowerAt(view, attacker, a.targetPosition) * 10 + target.damageTaken * 30;
}

function chooseFrom(ctx: BotContext, scorer: (a: AIAction) => number): AIAction | null {
  const best = pickBest(ctx.rng, ctx.legal, scorer);
  if (!best) return null;
  if (scorer(best) <= 0) {
    return ctx.legal.find((a) => a.type === 'END_ACTION_PHASE' || a.type === 'END_TURN') ?? null;
  }
  return best;
}

// ---------- Rush ----------

export function createRushBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'Rush',
    chooseAction(ctx: BotContext) {
      const { view } = ctx;
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK':
            return scoreAttack(ctx, a as Extract<AIAction, { type: 'ATTACK' }>);
          case 'MINE': {
            const unit = unitById(view, (a as Extract<AIAction, { type: 'MINE' }>).unitId);
            if (!unit) return -1;
            const def = getUnitDefinition(unit.definitionId);
            // Only the economy tail (mining >= 2: Sjor, Muju) stays home to fund the flood.
            if (def.mining < 2) return -1;
            return 150 + miningYieldAt(view, unit) * 40;
          }
          case 'MOVE': {
            const m = a as Extract<AIAction, { type: 'MOVE' }>;
            const unit = unitById(view, m.unitId);
            if (!unit) return -1;
            const def = getUnitDefinition(unit.definitionId);
            if (def.attack === 0) return -1; // miners hold
            const cur = nearestEnemyDistance(view, unit.position);
            const next = nearestEnemyDistance(view, m.to);
            if (next < cur) return 30 + (cur - next) * 10;
            // no enemy reachable: push toward the enemy corner
            const curC = manhattanDistance(unit.position, enemyCorner(view));
            const nextC = manhattanDistance(m.to, enemyCorner(view));
            return nextC < curC ? 10 + (curC - nextC) : -1;
          }
          case 'PLACE_UNIT': {
            const p = a as Extract<AIAction, { type: 'PLACE_UNIT' }>;
            return 500 - manhattanDistance(p.position, enemyCorner(view)) * 5;
          }
          case 'PROMOTE_UNIT':
            return -1; // every crystal goes to more fire_1
          case 'QUEUE_UNIT': {
            const q = a as Extract<AIAction, { type: 'QUEUE_UNIT' }>;
            return q.definitionId === 'fire_1' ? 500 : -1; // mass fire_1, nothing else
          }
          default:
            return 0;
        }
      });
    },
  };
}

// ---------- Expand ----------

export function createExpandBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'Expand',
    chooseAction(ctx: BotContext) {
      const { view } = ctx;
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK': {
            // Only free kills; never trade into chip damage.
            const at = a as Extract<AIAction, { type: 'ATTACK' }>;
            const attacker = unitById(view, at.unitId);
            if (!attacker) return -1;
            return attackKills(view, attacker, at.targetPosition) ? 800 : -1;
          }
          case 'MINE': {
            const unit = unitById(view, (a as Extract<AIAction, { type: 'MINE' }>).unitId);
            if (!unit) return -1;
            return 200 + miningYieldAt(view, unit) * 50;
          }
          case 'MOVE': {
            const m = a as Extract<AIAction, { type: 'MOVE' }>;
            const unit = unitById(view, m.unitId);
            if (!unit) return -1;
            // Relocate dry miners to the nearest minable cell; stay home-ish.
            if (miningYieldAt(view, unit) > 0) return -1; // already on a paying cell
            const yieldAt = wouldYieldAt(ctx, unit.definitionId, m.to);
            if (yieldAt <= 0) return -1;
            const homeDist = manhattanDistance(m.to, view.me.startCorner);
            return 50 + yieldAt * 10 - homeDist; // prefer close, rich cells
          }
          case 'PLACE_UNIT': {
            const p = a as Extract<AIAction, { type: 'PLACE_UNIT' }>;
            // Place in the back, on fresh cells.
            const d = manhattanDistance(p.position, view.me.startCorner);
            return 400 - d * 5;
          }
          case 'PROMOTE_UNIT': {
            // Deeper rope: promoting the plant line unlocks deeper layers.
            const unit = unitById(view, (a as Extract<AIAction, { type: 'PROMOTE_UNIT' }>).unitId);
            if (!unit) return -1;
            const def = getUnitDefinition(unit.definitionId);
            return def.element === 'plant' ? 450 : -1;
          }
          case 'QUEUE_UNIT': {
            const q = a as Extract<AIAction, { type: 'QUEUE_UNIT' }>;
            const def = getUnitDefinition(q.definitionId);
            if (def.element !== 'plant') return -1;
            return 300 + def.mining * 20; // pure economy: plant miners only
          }
          default:
            return 0;
        }
      });
    },
  };
}

function wouldYieldAt(ctx: BotContext, definitionId: string, pos: { x: number; y: number }): number {
  const def = getUnitDefinition(definitionId);
  const cell = ctx.view.board.cells[pos.y]?.[pos.x];
  if (!cell || cell.resourceLayers === 0) return 0;
  const topDepth = cell.minedDepth + 1;
  if (topDepth > def.mining) return 0;
  return Math.min(def.mining - cell.minedDepth, cell.resourceLayers);
}

// ---------- Balanced ----------

export function createBalancedBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'Balanced',
    chooseAction(ctx: BotContext) {
      const { view } = ctx;
      const fighters = view.board.units.filter(
        (u) => u.owner === view.player && getUnitDefinition(u.definitionId).attack >= 2
      ).length;
      const miners = view.board.units.filter(
        (u) => u.owner === view.player && getUnitDefinition(u.definitionId).mining >= 2
      ).length;
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK':
            return scoreAttack(ctx, a as Extract<AIAction, { type: 'ATTACK' }>);
          case 'MINE': {
            const unit = unitById(view, (a as Extract<AIAction, { type: 'MINE' }>).unitId);
            if (!unit) return -1;
            return 150 + miningYieldAt(view, unit) * 40;
          }
          case 'MOVE': {
            const m = a as Extract<AIAction, { type: 'MOVE' }>;
            const unit = unitById(view, m.unitId);
            if (!unit) return -1;
            const def = getUnitDefinition(unit.definitionId);
            if (def.attack < 2) {
              // miners reposition to paying cells only
              if (miningYieldAt(view, unit) > 0) return -1;
              const y = wouldYieldAt(ctx, unit.definitionId, m.to);
              return y > 0 ? 40 + y * 10 : -1;
            }
            const cur = nearestEnemyDistance(view, unit.position);
            const next = nearestEnemyDistance(view, m.to);
            // fighters advance only with company (avoid feeding units 1 by 1)
            return next < cur && fighters >= 3 ? 20 + (cur - next) * 8 : -1;
          }
          case 'PLACE_UNIT': {
            const p = a as Extract<AIAction, { type: 'PLACE_UNIT' }>;
            const d = manhattanDistance(p.position, view.me.startCorner);
            return 400 - d * 3;
          }
          case 'PROMOTE_UNIT':
            return 350;
          case 'QUEUE_UNIT': {
            const q = a as Extract<AIAction, { type: 'QUEUE_UNIT' }>;
            const def = getUnitDefinition(q.definitionId);
            if (def.element !== 'water' && def.element !== 'shadow' && def.element !== 'plant') return -1;
            // keep a rough 1:1 fighter/miner split
            const wantMiner = miners <= fighters;
            const isMiner = def.mining >= 2;
            return (wantMiner === isMiner ? 320 : 250) + def.cost * 5;
          }
          default:
            return 0;
        }
      });
    },
  };
}
