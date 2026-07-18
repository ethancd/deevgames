import type { Position, Unit } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import type { BotView } from '../types';
import { getUnitDefinition } from '../../../src/game/units';
import { getUnitAt, manhattanDistance, getCell } from '../../../src/game/board';
import { calculateAttackPower, calculateDefense } from '../../../src/game/combat';
import { calculateMiningYield } from '../../../src/game/mining';

export function myUnits(view: BotView): Unit[] {
  return view.board.units.filter((u) => u.owner === view.player);
}

export function enemyUnits(view: BotView): Unit[] {
  return view.board.units.filter((u) => u.owner !== view.player);
}

export function unitById(view: BotView, id: string): Unit | null {
  return view.board.units.find((u) => u.id === id) ?? null;
}

export function enemyCorner(view: BotView): Position {
  return view.enemy.startCorner;
}

export function nearestEnemyDistance(view: BotView, pos: Position): number {
  const enemies = enemyUnits(view);
  if (enemies.length === 0) return Infinity;
  return Math.min(...enemies.map((e) => manhattanDistance(pos, e.position)));
}

/** Effective attack power of `attacker` vs the unit standing at `target` (0 if none). */
export function attackPowerAt(view: BotView, attacker: Unit, target: Position): number {
  const defender = getUnitAt(view.board, target);
  if (!defender) return 0;
  return calculateAttackPower(attacker, defender);
}

/** Would this single attack kill the defender at `target` right now? */
export function attackKills(view: BotView, attacker: Unit, target: Position): boolean {
  const defender = getUnitAt(view.board, target);
  if (!defender) return false;
  return calculateAttackPower(attacker, defender) >= calculateDefense(defender);
}

export function defenderAt(view: BotView, target: Position): Unit | null {
  return getUnitAt(view.board, target);
}

export function unitCost(u: Unit): number {
  return getUnitDefinition(u.definitionId).cost;
}

export function miningYieldAt(view: BotView, unit: Unit): number {
  const cell = getCell(view.board, unit.position);
  if (!cell) return 0;
  return calculateMiningYield(unit, cell);
}

/** Count enemy units matching a predicate within `radius` of `pos`. */
export function enemiesNear(view: BotView, pos: Position, radius: number, pred?: (u: Unit) => boolean): number {
  return enemyUnits(view).filter(
    (e) => manhattanDistance(e.position, pos) <= radius && (!pred || pred(e))
  ).length;
}

/** Count own units within `radius` of `pos`. */
export function alliesNear(view: BotView, pos: Position, radius: number): number {
  return myUnits(view).filter((u) => manhattanDistance(u.position, pos) <= radius).length;
}

/**
 * Rush-pressure signal: enemy cheap fast attackers weighted by proximity to
 * our corner. Used by AntiRush (and later the engine's counter-rush work).
 */
export function rushPressure(view: BotView): number {
  let pressure = 0;
  for (const e of enemyUnits(view)) {
    const def = getUnitDefinition(e.definitionId);
    if (def.cost > 3 || def.attack === 0) continue; // cheap attackers only
    const dist = manhattanDistance(e.position, view.me.startCorner);
    if (dist <= 12) pressure += (13 - dist) / 13;
  }
  return pressure;
}

export type ActionScore = { action: AIAction; score: number };

export function byType<T extends AIAction['type']>(
  legal: AIAction[],
  type: T
): Extract<AIAction, { type: T }>[] {
  return legal.filter((a) => a.type === type) as Extract<AIAction, { type: T }>[];
}
