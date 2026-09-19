import type { GameState, Position, Unit } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import type { BotView } from '../types';
import { getUnitDefinition } from '../../../src/game/units';
import { getUnitAt, manhattanDistance, getCell } from '../../../src/game/board';
import { calculateAttackPower, calculateDefense } from '../../../src/game/combat';
import { getMovementRange } from '../../../src/game/movement';
import { getActionsPerTurn } from '../../../src/game/rules';
import { getValidAnchors, getSpawnRectangle, isValidSpawnPosition } from '../../../src/game/spawning';
import { unitEndOfTurnTake } from '../../../src/game/mining';

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
  return unitEndOfTurnTake(unit, cell);
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

/** One-turn delay: no purchase can mine, block, or attack in this turn. */
export const ARRIVAL_DISCOUNT = 0.9;

// A Prepare position offers hundreds of buys; compute enemy reach once per state/seat.
const riskCache = new WeakMap<GameState, Map<string, Set<string>>>();
export function safeCommitSquares(view: BotView): Set<string> {
  let seats = riskCache.get(view.state);
  if (!seats) { seats = new Map(); riskCache.set(view.state, seats); }
  const cached = seats.get(view.player);
  if (cached) return cached;
  const threats = new Set<string>();
  // Public enemy arrivals can also move on the intervening turn. Existing
  // pieces alone cannot describe risk when the opponent has commitments.
  const arrivals = view.pendingSummons.filter(s => s.owner === view.opponent &&
    isValidSpawnPosition(s.position, s.owner, view.board));
  const movers = [...enemyUnits(view), ...arrivals.map(s => ({
    id: s.id, owner: s.owner, definitionId: s.definitionId, position: s.position,
  }))];
  for (const enemy of movers) {
    const positions = [enemy.position, ...getMovementRange(enemy.position,
      getUnitDefinition(enemy.definitionId).speed, getActionsPerTurn(view.state), view.board).map(p => p.position)];
    for (const p of positions) threats.add(`${p.x},${p.y}`);
  }
  const safe = new Set<string>();
  for (const anchor of getValidAnchors(view.player, view.board)) {
    const rectangle = getSpawnRectangle(view.me.startCorner, anchor.position);
    if (rectangle.every(p => !threats.has(`${p.x},${p.y}`))) {
      for (const p of rectangle) safe.add(`${p.x},${p.y}`);
    }
  }
  seats.set(view.player, safe);
  return safe;
}

/** Count newly invalid enemy commitments if this unit remains at its destination.
 * Canonical support checks retain alternative anchors and square occupation. */
export function disruptedByMove(view: BotView, action: Extract<AIAction, { type: 'MOVE' }>): number {
  if (!view.pendingSummons.some(s => s.owner === view.opponent)) return 0;
  const board = { ...view.board, units: view.board.units.map(u => u.id === action.unitId ? { ...u, position: action.to } : u) };
  return view.pendingSummons.filter(s => s.owner === view.opponent &&
    isValidSpawnPosition(s.position, s.owner, view.board) && !isValidSpawnPosition(s.position, s.owner, board)).length;
}

/** Preserve the stance's vetoes; add passive income and cheap summon disruption. */
export function withPassiveEconomy(view: BotView, action: AIAction, score: number): number {
  if (action.type === 'MOVE') {
    const u = unitById(view, action.unitId);
    if (!u) return score;
    const delta = unitEndOfTurnTake(u, view.board.cells[action.to.y][action.to.x]) - miningYieldAt(view, u);
    const cheap = delta >= -1 && !enemyUnits(view).some(e =>
      manhattanDistance(e.position, action.to) === 1 && calculateAttackPower(e, u) >= calculateDefense(u));
    const disruption = score >= 0 && cheap ? disruptedByMove(view, action) * 65 : 0;
    return score + delta * 45 + disruption;
  }
  if (action.type === 'BUY_UNIT' && score > 0) {
    const def = getUnitDefinition(action.definitionId);
    const reserve = view.board.cells[action.position.y][action.position.x].resourceLayers;
    const target = def.mining >= 2 ? view.me.startCorner : enemyCorner(view);
    const safe = safeCommitSquares(view).has(`${action.position.x},${action.position.y}`);
    // The full buy preference and future mining value are discounted together.
    // Risk is lost tempo, not lost material: a failed arrival refunds exactly.
    return ARRIVAL_DISCOUNT * (score + Math.min(def.mining, reserve) * 15) -
      manhattanDistance(action.position, target) * 3 - (safe ? 0 : 180);
  }
  return score;
}
