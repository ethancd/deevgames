// Lives under utils, not game: the Phasing suite bundle pins every file under
// src/game by hash, and this is a UI-only projection over the engine.
import type { BoardState, Position, Unit } from '../game/types';
import { findAttackApproach } from '../game/movement';
import { canAttack, canBeEliminated } from '../game/combat';

/**
 * Positions of enemy units `attacker` could eliminate with a single attack,
 * reachable within `actions` total actions this turn (movement plus the
 * final attack action). Uses the same move-then-attack reachability as the
 * attack-approach preview (`findAttackApproach`), so a target need not be
 * adjacent today. Returns [] once the unit has no attack left this turn.
 */
function eliminableTargets(attacker: Unit, board: BoardState, actions: number): Position[] {
  if (!canAttack(attacker)) return [];
  return board.units
    .filter((target) => target.owner !== attacker.owner)
    .filter((target) => findAttackApproach(attacker, target, board, actions) !== null
      && canBeEliminated(target, attacker))
    .map((target) => target.position);
}

/**
 * Forward direction: with `unit` selected, every enemy it could eliminate
 * with its next attack this turn, given the actions it actually has left
 * right now. Enemies it could only wound are left out (they keep the plain
 * `.attack-target` ring instead).
 */
export function ownKoTargets(unit: Unit, board: BoardState, actionsRemaining: number): Position[] {
  return eliminableTargets(unit, board, actionsRemaining);
}

/**
 * Reverse direction: with an enemy inspected, every one of the opposing
 * side's units it could eliminate on its own coming turn. The enemy is
 * projected onto a fresh turn — full actions, no attack spent — because its
 * action economy resets and its damage heals at the start of its own turn;
 * only its action state is reset here, never a defender's. Each defender's
 * current (unhealed) remaining defense is used as-is, since it is not that
 * unit's turn. This is a single-attacker projection: it never sums this
 * enemy's attack with another attacker's to call a combined kill (see
 * docs/ANALYSIS_TOOLS_PROMPT-2026-09-12.md on not adding independent attacks
 * together).
 */
export function enemyKoThreats(enemy: Unit, board: BoardState, actionsPerTurn: number): Position[] {
  const freshAttacker: Unit = {
    ...enemy,
    canActThisTurn: true,
    hasAttacked: false,
    attackedThisTurn: [],
    lastAttackKilled: false,
  };
  return eliminableTargets(freshAttacker, board, actionsPerTurn);
}
