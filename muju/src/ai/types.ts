import type { Position } from '../game/types';

/**
 * AI difficulty levels
 * Shared rules and evaluation; presets scale tactical search, beam width,
 * turn CPU allowance. No intentional random blunders.
 */
export type AIDifficulty = 'easy' | 'medium' | 'hard';

/**
 * A single action the AI can take
 */
export type AIAction =
  | { type: 'MOVE'; unitId: string; to: Position }
  | { type: 'ATTACK'; unitId: string; targetPosition: Position }
  | { type: 'END_PLACE_PHASE' }
  | { type: 'END_ACTION_PHASE' }
  | { type: 'BUY_UNIT'; definitionId: string; position: Position }
  | { type: 'PROMOTE_UNIT'; unitId: string }
  | { type: 'PAY_UPKEEP'; keepUnitIds: string[] }
  | { type: 'RESIGN' };

/**
 * A complete turn plan (sequence of actions)
 */
export interface AITurnPlan {
  actions: AIAction[];
  score: number;
}

export interface AIDebugPlan {
  id: string;
  score: number;
  tags: string[];
  actions: AIAction[];
}

export interface AIDebugInfo {
  planCount: number;
  topPlans: AIDebugPlan[];
  config: {
    mctsIterations: number;
    mctsTimeLimit: number;
    beamWidth: number;
    outputPlans: number;
    tacticalDepth: number;
  };
}

/**
 * Evaluation weights for position scoring
 */
export interface EvaluationWeights {
  unitValue: number;           // Value of units on board (based on cost)
  resourceAdvantage: number;   // Resource differential
  territoryControl: number;    // Squares in unblocked spawn zones
  miningPotential: number;     // Projected end-of-turn income
  threatLevel: number;         // Units threatening enemy pieces
  mobility: number;            // Number of valid moves (optionality)
  centerControl: number;       // Control of central squares
  unitHealth: number;          // Defense-weighted unit evaluation
  killThreatsReceived: number;
  combinedAttackPotential: number;
  spawnDenialPressure: number;
  spawnInfiltration: number;
  stepEfficiency: number;
  techTreeProgress: number;
}

/**
 * Default evaluation weights
 */
export const DEFAULT_WEIGHTS: EvaluationWeights = {
  unitValue: 1.0,
  resourceAdvantage: 0.5,
  territoryControl: 0.3,
  miningPotential: 0.2,
  threatLevel: 0.4,
  mobility: 0.3,
  centerControl: 0.2,
  unitHealth: 0.1,
  killThreatsReceived: -2.0,
  combinedAttackPotential: 0.8,
  spawnDenialPressure: -1.5,
  spawnInfiltration: 1.0,
  stepEfficiency: 0.2,
  techTreeProgress: 0.4,
};

/**
 * Result of AI computation
 */
export interface AIResult {
  plan: AITurnPlan;
  /** Compatibility field: actual completed MCTS iterations, not configured work. */
  nodesSearched: number;
  timeMs: number;
  depth: number;
  debug?: AIDebugInfo;
  stats?: import('./runtime').SearchStats;
}
