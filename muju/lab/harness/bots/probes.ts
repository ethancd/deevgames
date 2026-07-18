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
  rushPressure,
  alliesNear,
} from './bot-utils';

/**
 * Degenerate probe bots — each pushes one strategy to its extreme to expose
 * balance failure modes (plan §P2). AntiRush is the scripted best-known
 * defense used to measure the rush acceptance band (design ruling E-2).
 */

function chooseFrom(ctx: BotContext, scorer: (a: AIAction) => number): AIAction | null {
  const best = pickBest(ctx.rng, ctx.legal, scorer);
  if (!best) return null;
  if (scorer(best) <= 0) {
    return ctx.legal.find((a) => a.type === 'END_ACTION_PHASE' || a.type === 'END_TURN') ?? null;
  }
  return best;
}

function scoreKillFirstAttack(ctx: BotContext, a: Extract<AIAction, { type: 'ATTACK' }>): number {
  const { view } = ctx;
  const attacker = unitById(view, a.unitId);
  const target = defenderAt(view, a.targetPosition);
  if (!attacker || !target) return -1;
  if (attackKills(view, attacker, a.targetPosition)) return 1000 + unitCost(target) * 10;
  return 100 + attackPowerAt(view, attacker, a.targetPosition) * 10 + target.damageTaken * 30;
}

// ---------- Turtle ----------

/** Never leaves home; mines and stacks defense. Tests whether passivity is punished. */
export function createTurtleBot(): ScriptedBot {
  const HOME_RADIUS = 6;
  return {
    kind: 'scripted',
    name: 'Turtle',
    chooseAction(ctx: BotContext) {
      const { view } = ctx;
      const home = view.me.startCorner;
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK':
            // strictly defensive: only swing at adjacent intruders
            return scoreKillFirstAttack(ctx, a as Extract<AIAction, { type: 'ATTACK' }>);
          case 'MINE': {
            const unit = unitById(view, (a as Extract<AIAction, { type: 'MINE' }>).unitId);
            if (!unit) return -1;
            return 200 + miningYieldAt(view, unit) * 50;
          }
          case 'MOVE': {
            const m = a as Extract<AIAction, { type: 'MOVE' }>;
            const unit = unitById(view, m.unitId);
            if (!unit) return -1;
            if (manhattanDistance(m.to, home) > HOME_RADIUS) return -1; // never leave home
            if (miningYieldAt(view, unit) > 0) return -1; // don't abandon a paying cell
            const def = getUnitDefinition(unit.definitionId);
            const cell = view.board.cells[m.to.y]?.[m.to.x];
            if (!cell || cell.resourceLayers === 0) return -1;
            const top = cell.minedDepth + 1;
            if (top > def.mining) return -1;
            return 50 + Math.min(def.mining - cell.minedDepth, cell.resourceLayers) * 10;
          }
          case 'PLACE_UNIT': {
            const p = a as Extract<AIAction, { type: 'PLACE_UNIT' }>;
            const d = manhattanDistance(p.position, home);
            return d <= HOME_RADIUS ? 400 - d * 10 : -1;
          }
          case 'PROMOTE_UNIT':
            return 350; // tall, not wide
          case 'QUEUE_UNIT': {
            const q = a as Extract<AIAction, { type: 'QUEUE_UNIT' }>;
            const def = getUnitDefinition(q.definitionId);
            // defense + economy only
            if (def.element === 'metal') return 320 + def.defense * 10;
            if (def.element === 'plant') return 310 + def.mining * 10;
            if (def.element === 'water') return 300;
            return -1;
          }
          default:
            return 0;
        }
      });
    },
  };
}

// ---------- Tier1Spam ----------

/** Queues nothing but the cheapest tier-1 units; mindless flood. Acceptance probe for the hard AI. */
export function createTier1SpamBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'Tier1Spam',
    chooseAction(ctx: BotContext) {
      const { view } = ctx;
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK':
            return scoreKillFirstAttack(ctx, a as Extract<AIAction, { type: 'ATTACK' }>);
          case 'MINE': {
            const unit = unitById(view, (a as Extract<AIAction, { type: 'MINE' }>).unitId);
            if (!unit) return -1;
            return 120 + miningYieldAt(view, unit) * 30;
          }
          case 'MOVE': {
            const m = a as Extract<AIAction, { type: 'MOVE' }>;
            const unit = unitById(view, m.unitId);
            if (!unit) return -1;
            const cur = nearestEnemyDistance(view, unit.position);
            const next = nearestEnemyDistance(view, m.to);
            return next < cur ? 20 + (cur - next) * 8 : -1;
          }
          case 'PLACE_UNIT': {
            const p = a as Extract<AIAction, { type: 'PLACE_UNIT' }>;
            return 400 - manhattanDistance(p.position, enemyCorner(view)) * 5;
          }
          case 'PROMOTE_UNIT':
            return -1;
          case 'QUEUE_UNIT': {
            const q = a as Extract<AIAction, { type: 'QUEUE_UNIT' }>;
            const def = getUnitDefinition(q.definitionId);
            return def.tier === 1 ? 300 + (5 - def.cost) * 20 : -1; // any T1, cheapest first
          }
          default:
            return 0;
        }
      });
    },
  };
}

// ---------- MiningDenial ----------

/**
 * Sends fast units deep into enemy territory to squat rich cells and
 * infiltrate spawn rectangles (any enemy inside a rectangle blocks it).
 * Tests how exploitable spawn-blocking and the finite economy are.
 */
export function createMiningDenialBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'MiningDenial',
    chooseAction(ctx: BotContext) {
      const { view } = ctx;
      const target = enemyCorner(view);
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK': {
            // opportunistic only — the job is denial, not combat
            const at = a as Extract<AIAction, { type: 'ATTACK' }>;
            const attacker = unitById(view, at.unitId);
            if (!attacker) return -1;
            return attackKills(view, attacker, at.targetPosition) ? 800 : -1;
          }
          case 'MINE': {
            const unit = unitById(view, (a as Extract<AIAction, { type: 'MINE' }>).unitId);
            if (!unit) return -1;
            // mine enemy-side cells for value AND denial; home mining funds the runners
            return 100 + miningYieldAt(view, unit) * 40;
          }
          case 'MOVE': {
            const m = a as Extract<AIAction, { type: 'MOVE' }>;
            const unit = unitById(view, m.unitId);
            if (!unit) return -1;
            const def = getUnitDefinition(unit.definitionId);
            if (def.mining >= 3) return -1; // dedicated home miners hold
            const cur = manhattanDistance(unit.position, target);
            const next = manhattanDistance(m.to, target);
            if (next >= cur) return -1;
            // deeper = better; bonus for ending on a rich cell (deny it)
            const cell = view.board.cells[m.to.y]?.[m.to.x];
            const rich = cell ? cell.resourceLayers : 0;
            return 30 + (cur - next) * 8 + rich * 5 + (next <= 4 ? 20 : 0);
          }
          case 'PLACE_UNIT': {
            const p = a as Extract<AIAction, { type: 'PLACE_UNIT' }>;
            return 400 - manhattanDistance(p.position, target) * 5; // spawn as far forward as allowed
          }
          case 'PROMOTE_UNIT':
            return -1;
          case 'QUEUE_UNIT': {
            const q = a as Extract<AIAction, { type: 'QUEUE_UNIT' }>;
            const def = getUnitDefinition(q.definitionId);
            // fast runners (lightning) + one source of income (plant)
            if (def.element === 'lightning' && def.tier <= 2) return 320 + def.speed * 10;
            if (def.id === 'plant_1') return 300;
            return -1;
          }
          default:
            return 0;
        }
      });
    },
  };
}

// ---------- AntiRush ----------

/**
 * Scripted best-known defense against mass cheap attackers (rush band probe,
 * ruling E-2): wall up near the corner, focus-fire intruders down, keep the
 * economy behind the wall, counter-build defenders scaled to rush pressure.
 */
export function createAntiRushBot(): ScriptedBot {
  return {
    kind: 'scripted',
    name: 'AntiRush',
    chooseAction(ctx: BotContext) {
      const { view } = ctx;
      const home = view.me.startCorner;
      const pressure = rushPressure(view);
      return chooseFrom(ctx, (a) => {
        switch (a.type) {
          case 'ATTACK': {
            const at = a as Extract<AIAction, { type: 'ATTACK' }>;
            const attacker = unitById(view, at.unitId);
            const target = defenderAt(view, at.targetPosition);
            if (!attacker || !target) return -1;
            const tDef = getUnitDefinition(target.definitionId);
            // kill attackers first, cheapest threats prioritized (clear the wave)
            if (attackKills(view, attacker, at.targetPosition)) {
              return 1000 + (tDef.attack >= 2 ? 100 : 0) + (5 - Math.min(5, tDef.cost)) * 10;
            }
            // chip only when allies adjacent can plausibly finish (focus fire)
            const allies = alliesNear(view, target.position, 1);
            return allies >= 2 ? 200 + target.damageTaken * 40 : 60;
          }
          case 'MINE': {
            const unit = unitById(view, (a as Extract<AIAction, { type: 'MINE' }>).unitId);
            if (!unit) return -1;
            // under heavy pressure, fighters stop mining; miners keep going
            const def = getUnitDefinition(unit.definitionId);
            if (pressure > 2 && def.attack >= 2) return 20;
            return 150 + miningYieldAt(view, unit) * 40;
          }
          case 'MOVE': {
            const m = a as Extract<AIAction, { type: 'MOVE' }>;
            const unit = unitById(view, m.unitId);
            if (!unit) return -1;
            const def = getUnitDefinition(unit.definitionId);
            const nearestNow = nearestEnemyDistance(view, unit.position);
            const nearestNext = nearestEnemyDistance(view, m.to);
            if (def.attack >= 2) {
              // defenders form up between home and the nearest intruder
              if (nearestNext < nearestNow && manhattanDistance(m.to, home) <= 8) {
                return 40 + (nearestNow - nearestNext) * 10;
              }
              return -1;
            }
            // miners flee adjacency, stay home
            if (nearestNow <= 1 && nearestNext > 1 && manhattanDistance(m.to, home) <= 5) return 80;
            return -1;
          }
          case 'PLACE_UNIT': {
            const p = a as Extract<AIAction, { type: 'PLACE_UNIT' }>;
            // body-block: fill squares between home and the intruders
            const d = manhattanDistance(p.position, home);
            const frontline = nearestEnemyDistance(view, p.position);
            return 400 - d * 5 - frontline * 2;
          }
          case 'PROMOTE_UNIT': {
            const unit = unitById(view, (a as Extract<AIAction, { type: 'PROMOTE_UNIT' }>).unitId);
            if (!unit) return -1;
            const def = getUnitDefinition(unit.definitionId);
            // under pressure, promote defenders (more DEF per square); else economy
            return def.element === 'metal' || def.element === 'water' ? 360 : 200;
          }
          case 'QUEUE_UNIT': {
            const q = a as Extract<AIAction, { type: 'QUEUE_UNIT' }>;
            const def = getUnitDefinition(q.definitionId);
            if (pressure > 1) {
              // counter-build: water kills fire_1 through the element edge
              // (water has advantage vs fire: +1 ATK -> Sjor one-shots Hi)
              if (def.id === 'water_1') return 400;
              if (def.id === 'metal_1') return 380;
              if (def.id === 'water_2') return 360;
              return -1;
            }
            // calm: economy + a standing guard
            if (def.id === 'plant_1') return 320;
            if (def.id === 'water_1') return 310;
            if (def.id === 'metal_1') return 300;
            return -1;
          }
          default:
            return 0;
        }
      });
    },
  };
}
