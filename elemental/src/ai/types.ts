import type { Position } from '../game/types';

/**
 * AI difficulty levels
 * - easy: Random legal moves, no lookahead
 * - medium: 1-ply evaluation, simple heuristics
 * - hard: 2-3 ply minimax with full heuristics
 */
export type AIDifficulty = 'easy' | 'medium' | 'hard';

/**
 * A single action the AI can take
 */
export type AIAction =
  | { type: 'MOVE'; unitId: string; to: Position }
  | { type: 'ATTACK'; unitId: string; targetPosition: Position }
  | { type: 'MINE'; unitId: string }
  | { type: 'END_ACTION_PHASE' }
  | { type: 'END_TURN' }
  | { type: 'QUEUE_UNIT'; definitionId: string }
  | { type: 'PLACE_UNIT'; queuedUnitId: string; position: Position }
  | { type: 'PROMOTE_UNIT'; unitId: string };

/**
 * A complete turn plan (sequence of actions)
 */
export interface AITurnPlan {
  actions: AIAction[];
  score: number;
}

/**
 * Evaluation weights for position scoring
 */
export interface EvaluationWeights {
  unitValue: number;           // Value of units on board (based on cost)
  resourceAdvantage: number;   // Resource differential
  territoryControl: number;    // Squares in unblocked spawn zones
  miningPotential: number;     // Accessible unmined squares
  threatLevel: number;         // Units threatening enemy pieces
  mobility: number;            // Number of valid moves (optionality)
  centerControl: number;       // Control of central squares
  unitHealth: number;          // Defense-weighted unit evaluation
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
};

/**
 * Search configuration
 */
export interface SearchConfig {
  maxDepth: number;
  maxTime: number; // milliseconds
  useAlphaBeta: boolean;
  useIterativeDeepening: boolean;
}

/**
 * Default search configs by difficulty
 */
export const DIFFICULTY_CONFIGS: Record<AIDifficulty, SearchConfig> = {
  easy: {
    maxDepth: 0,
    maxTime: 100,
    useAlphaBeta: false,
    useIterativeDeepening: false,
  },
  medium: {
    maxDepth: 1,
    maxTime: 1000,
    useAlphaBeta: true,
    useIterativeDeepening: false,
  },
  hard: {
    maxDepth: 3,
    maxTime: 3000,
    useAlphaBeta: true,
    useIterativeDeepening: true,
  },
};

/**
 * Result of AI computation
 */
export interface AIResult {
  plan: AITurnPlan;
  nodesSearched: number;
  timeMs: number;
  depth: number;
}
