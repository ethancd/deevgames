import type { BoardState, Position, Unit, PlayerId } from './types';
import { isAdjacent, getAdjacentPositions, getUnitAt, removeUnit } from './board';
import { getUnitDefinition } from './units';
import { getAttackModifier } from './elements';

/**
 * Check if a unit can attack (hasn't attacked this turn and can act)
 */
export function canAttack(unit: Unit): boolean {
  return !unit.hasAttacked && unit.canActThisTurn;
}

/**
 * Get all valid attack targets for a unit (adjacent enemy positions)
 */
export function getValidAttacks(unit: Unit, board: BoardState): Position[] {
  if (!canAttack(unit)) return [];

  const adjacentPositions = getAdjacentPositions(unit.position);
  const validTargets: Position[] = [];

  for (const pos of adjacentPositions) {
    const targetUnit = getUnitAt(board, pos);
    if (targetUnit && targetUnit.owner !== unit.owner) {
      validTargets.push(pos);
    }
  }

  return validTargets;
}

/**
 * Check if a specific attack is valid
 */
export function isValidAttack(
  unit: Unit,
  targetPosition: Position,
  board: BoardState
): boolean {
  const validAttacks = getValidAttacks(unit, board);
  return validAttacks.some(
    (t) => t.x === targetPosition.x && t.y === targetPosition.y
  );
}

/**
 * Calculate the attack power of a unit against a specific defender
 * Includes elemental modifier:
 * - Advantage: +1 attack
 * - Disadvantage: -1 attack
 * - Neutral: no modifier
 */
export function calculateAttackPower(
  attacker: Unit,
  defender: Unit
): number {
  const attackerDef = getUnitDefinition(attacker.definitionId);
  const defenderDef = getUnitDefinition(defender.definitionId);

  const modifier = getAttackModifier(attackerDef.element, defenderDef.element);

  // Attack power cannot go below 0
  return Math.max(0, attackerDef.attack + modifier);
}

/**
 * Calculate the effective defense of a unit
 * Defense is not modified by elemental matchups.
 */
export function calculateDefense(defender: Unit): number {
  const defenderDef = getUnitDefinition(defender.definitionId);
  return defenderDef.defense;
}

/**
 * Resolve a single attack (Phase 1: no combined attacks)
 * Returns the updated board state and whether the defender was eliminated
 */
export function resolveCombat(
  board: BoardState,
  attackerId: string,
  defenderPosition: Position
): { board: BoardState; eliminated: boolean } {
  const attacker = board.units.find((u) => u.id === attackerId);
  const defender = getUnitAt(board, defenderPosition);

  if (!attacker || !defender) {
    return { board, eliminated: false };
  }

  const attackPower = calculateAttackPower(attacker, defender);
  const defenseValue = calculateDefense(defender);

  // Mark attacker as having attacked
  let newBoard: BoardState = {
    ...board,
    units: board.units.map((u) =>
      u.id === attackerId ? { ...u, hasAttacked: true } : u
    ),
  };

  // If attack >= defense, defender is eliminated
  if (attackPower >= defenseValue) {
    newBoard = removeUnit(newBoard, defender.id);
    return { board: newBoard, eliminated: true };
  }

  return { board: newBoard, eliminated: false };
}

/**
 * Execute an attack action (returns new board state)
 */
export function executeAttack(
  board: BoardState,
  attackerId: string,
  targetPosition: Position
): { board: BoardState; eliminated: boolean } {
  return resolveCombat(board, attackerId, targetPosition);
}

/**
 * Get all enemy units that are threatening a specific unit (can attack it next)
 */
export function getThreatsTo(unit: Unit, board: BoardState): Unit[] {
  const threats: Unit[] = [];

  for (const other of board.units) {
    if (other.owner === unit.owner) continue;

    if (isAdjacent(other.position, unit.position)) {
      threats.push(other);
    }
  }

  return threats;
}

/**
 * Get all friendly units that can attack a specific enemy position
 */
export function getAttackersFor(
  targetPosition: Position,
  board: BoardState,
  attackerOwner: PlayerId
): Unit[] {
  const attackers: Unit[] = [];

  for (const unit of board.units) {
    if (unit.owner !== attackerOwner) continue;
    if (!canAttack(unit)) continue;

    if (isAdjacent(unit.position, targetPosition)) {
      attackers.push(unit);
    }
  }

  return attackers;
}

/**
 * Check if a unit can be eliminated by a single attacker
 */
export function canBeEliminated(
  target: Unit,
  attacker: Unit
): boolean {
  const attackPower = calculateAttackPower(attacker, target);
  const defenseValue = calculateDefense(target);
  return attackPower >= defenseValue;
}
