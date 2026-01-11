import type { GameState, PlayerId, Unit, Position } from '../game/types';
import type { EvaluationWeights } from './types';
import { DEFAULT_WEIGHTS } from './types';
import { getPlayerUnits } from '../game/board';
import { getUnitDefinition } from '../game/units';
import { getValidMoves } from '../game/movement';
import { getValidAttacks, canBeEliminated } from '../game/combat';
import { canMine } from '../game/mining';
import { getAllSpawnPositions } from '../game/spawning';
import { checkVictory } from '../game/victory';

/**
 * Large value for winning positions
 */
const VICTORY_SCORE = 100000;

/**
 * Evaluate board position from a player's perspective
 * Positive = good for player, negative = bad for player
 */
export function evaluatePosition(
  state: GameState,
  forPlayer: PlayerId,
  weights: EvaluationWeights = DEFAULT_WEIGHTS
): number {
  // Check for victory conditions first
  const victory = checkVictory(state.board);
  if (victory.status === 'victory') {
    return victory.winner === forPlayer ? VICTORY_SCORE : -VICTORY_SCORE;
  }

  const opponent: PlayerId = forPlayer === 'player' ? 'ai' : 'player';

  let score = 0;

  // Unit value (based on cost/tier)
  score += weights.unitValue * (
    calculateUnitValue(state, forPlayer) -
    calculateUnitValue(state, opponent)
  );

  // Resource advantage
  score += weights.resourceAdvantage * (
    state.players[forPlayer].resources -
    state.players[opponent].resources
  );

  // Territory control (spawn zones)
  score += weights.territoryControl * (
    calculateTerritoryControl(state, forPlayer) -
    calculateTerritoryControl(state, opponent)
  );

  // Mining potential
  score += weights.miningPotential * (
    calculateMiningPotential(state, forPlayer) -
    calculateMiningPotential(state, opponent)
  );

  // Threat level (units threatening enemy)
  score += weights.threatLevel * (
    calculateThreatLevel(state, forPlayer) -
    calculateThreatLevel(state, opponent)
  );

  // Mobility (optionality - number of possible actions)
  score += weights.mobility * (
    calculateMobility(state, forPlayer) -
    calculateMobility(state, opponent)
  );

  // Center control
  score += weights.centerControl * (
    calculateCenterControl(state, forPlayer) -
    calculateCenterControl(state, opponent)
  );

  // Unit health (defense-weighted)
  score += weights.unitHealth * (
    calculateUnitHealth(state, forPlayer) -
    calculateUnitHealth(state, opponent)
  );

  return score;
}

/**
 * Calculate total unit value based on cost
 */
function calculateUnitValue(state: GameState, player: PlayerId): number {
  const units = getPlayerUnits(state.board, player);
  return units.reduce((total, unit) => {
    const def = getUnitDefinition(unit.definitionId);
    return total + def.cost;
  }, 0);
}

/**
 * Calculate territory control (number of spawn positions available)
 */
function calculateTerritoryControl(state: GameState, player: PlayerId): number {
  const spawnPositions = getAllSpawnPositions(player, state.board);
  return spawnPositions.length;
}

/**
 * Calculate mining potential (units that can mine * available resources)
 */
function calculateMiningPotential(state: GameState, player: PlayerId): number {
  const units = getPlayerUnits(state.board, player);
  let potential = 0;

  for (const unit of units) {
    if (canMine(unit, state.board)) {
      const def = getUnitDefinition(unit.definitionId);
      potential += def.mining; // Mining power as potential
    }
  }

  return potential;
}

/**
 * Calculate threat level (units adjacent to enemies that can kill)
 */
function calculateThreatLevel(state: GameState, player: PlayerId): number {
  const units = getPlayerUnits(state.board, player);
  let threats = 0;

  for (const unit of units) {
    const attacks = getValidAttacks(unit, state.board);
    for (const targetPos of attacks) {
      const target = state.board.units.find(
        (u) => u.position.x === targetPos.x && u.position.y === targetPos.y
      );
      if (target && canBeEliminated(target, unit)) {
        threats += getUnitDefinition(target.definitionId).cost; // Value of killable target
      }
    }
  }

  return threats;
}

/**
 * Calculate mobility (optionality - total number of valid moves)
 * This is a key metric for strategic AI - more options = better position
 */
function calculateMobility(state: GameState, player: PlayerId): number {
  const units = getPlayerUnits(state.board, player);
  let mobility = 0;

  for (const unit of units) {
    // Count valid moves
    const moves = getValidMoves(unit, state.board);
    mobility += moves.length;

    // Count valid attacks (weighted higher)
    const attacks = getValidAttacks(unit, state.board);
    mobility += attacks.length * 1.5;

    // Mining capability
    if (canMine(unit, state.board)) {
      mobility += 1;
    }
  }

  return mobility;
}

/**
 * Calculate center control (units near center of board)
 * Center positions are strategically valuable
 */
function calculateCenterControl(state: GameState, player: PlayerId): number {
  const units = getPlayerUnits(state.board, player);
  const center = { x: 4.5, y: 4.5 };
  let control = 0;

  for (const unit of units) {
    // Distance from center (max ~6.4, min 0)
    const distance = Math.sqrt(
      Math.pow(unit.position.x - center.x, 2) +
      Math.pow(unit.position.y - center.y, 2)
    );
    // Convert to score (closer = better)
    control += Math.max(0, 7 - distance);
  }

  return control;
}

/**
 * Calculate unit health (sum of defense values)
 */
function calculateUnitHealth(state: GameState, player: PlayerId): number {
  const units = getPlayerUnits(state.board, player);
  return units.reduce((total, unit) => {
    const def = getUnitDefinition(unit.definitionId);
    return total + def.defense;
  }, 0);
}

/**
 * Quick evaluation for leaf nodes (faster, less accurate)
 */
export function quickEvaluate(state: GameState, forPlayer: PlayerId): number {
  const victory = checkVictory(state.board);
  if (victory.status === 'victory') {
    return victory.winner === forPlayer ? VICTORY_SCORE : -VICTORY_SCORE;
  }

  const opponent: PlayerId = forPlayer === 'player' ? 'ai' : 'player';

  // Just unit value difference
  return calculateUnitValue(state, forPlayer) - calculateUnitValue(state, opponent);
}

/**
 * Evaluate a single unit's position value
 */
export function evaluateUnitPosition(unit: Unit, state: GameState): number {
  const def = getUnitDefinition(unit.definitionId);
  let value = def.cost;

  // Bonus for mobility
  const moves = getValidMoves(unit, state.board);
  value += moves.length * 0.1;

  // Bonus for threat
  const attacks = getValidAttacks(unit, state.board);
  value += attacks.length * 0.2;

  // Bonus for center position
  const center = { x: 4.5, y: 4.5 };
  const distance = Math.sqrt(
    Math.pow(unit.position.x - center.x, 2) +
    Math.pow(unit.position.y - center.y, 2)
  );
  value += Math.max(0, (7 - distance) * 0.1);

  return value;
}

/**
 * Get a heuristic score for an action (for move ordering)
 */
export function scoreAction(
  action: { type: string; unitId?: string; targetPosition?: Position },
  state: GameState
): number {
  switch (action.type) {
    case 'ATTACK':
      // Score attacks by target value
      if (action.targetPosition) {
        const target = state.board.units.find(
          (u) =>
            u.position.x === action.targetPosition!.x &&
            u.position.y === action.targetPosition!.y
        );
        if (target) {
          const targetDef = getUnitDefinition(target.definitionId);
          return 100 + targetDef.cost; // High priority for kills
        }
      }
      return 100;

    case 'MINE':
      return 50; // Medium priority

    case 'MOVE':
      return 25; // Lower priority

    default:
      return 0;
  }
}
