import type { GameState, PlayerId } from '../game/types';
import type {
  AIAction,
  AIResult,
  AITurnPlan,
  AIDifficulty,
  SearchConfig,
  EvaluationWeights,
} from './types';
import { DEFAULT_WEIGHTS, DIFFICULTY_CONFIGS } from './types';
import { generateAllActions, getSortedActions } from './moves';
import { evaluatePosition, quickEvaluate } from './evaluation';
import { applyAction, isTerminal, getOpponent } from './simulate';

/**
 * Main AI engine class
 */
export class AIEngine {
  private config: SearchConfig;
  private weights: EvaluationWeights;
  private nodesSearched: number = 0;
  private startTime: number = 0;

  constructor(
    difficulty: AIDifficulty = 'medium',
    weights: EvaluationWeights = DEFAULT_WEIGHTS
  ) {
    this.config = DIFFICULTY_CONFIGS[difficulty];
    this.weights = weights;
  }

  /**
   * Find the best action for the AI to take
   * All difficulty levels use minimax with different depths
   */
  findBestAction(state: GameState): AIResult {
    this.nodesSearched = 0;
    this.startTime = Date.now();

    const player = state.turn.currentPlayer;
    const bestPlan = this.findMinimaxAction(state, player);

    const timeMs = Date.now() - this.startTime;

    return {
      plan: bestPlan,
      nodesSearched: this.nodesSearched,
      timeMs,
      depth: this.config.maxDepth,
    };
  }

  /**
   * Get the minimum thinking time for the current difficulty
   */
  getMinThinkingTime(): number {
    return this.config.minTime;
  }

  /**
   * Minimax with alpha-beta pruning and iterative deepening
   * Searches progressively deeper until time runs out
   */
  private findMinimaxAction(state: GameState, player: PlayerId): AITurnPlan {
    const actions = getSortedActions(generateAllActions(state, player));

    if (actions.length === 0) {
      return { actions: [], score: evaluatePosition(state, player, this.weights) };
    }

    let bestAction: AIAction = actions[0];
    let bestScore = -Infinity;

    // Iterative deepening: search depth 1, then 2, then 3...
    const startDepth = this.config.useIterativeDeepening ? 1 : this.config.maxDepth;

    for (let depth = startDepth; depth <= this.config.maxDepth; depth++) {
      // Time check before starting new depth
      if (Date.now() - this.startTime > this.config.maxTime) {
        break;
      }

      let currentBestAction: AIAction = actions[0];
      let currentBestScore = -Infinity;
      let alpha = -Infinity;
      const beta = Infinity;

      for (const action of actions) {
        // Time check during search
        if (Date.now() - this.startTime > this.config.maxTime) {
          break;
        }

        const newState = applyAction(state, action);
        const score = this.minimax(
          newState,
          depth - 1,
          alpha,
          beta,
          false, // Opponent's turn next
          player
        );

        if (score > currentBestScore) {
          currentBestScore = score;
          currentBestAction = action;
        }

        alpha = Math.max(alpha, score);
      }

      // Only update best if we completed this depth (not interrupted by time)
      if (Date.now() - this.startTime <= this.config.maxTime) {
        bestAction = currentBestAction;
        bestScore = currentBestScore;
      }
    }

    return {
      actions: [bestAction],
      score: bestScore,
    };
  }

  /**
   * Minimax algorithm with alpha-beta pruning
   */
  private minimax(
    state: GameState,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    forPlayer: PlayerId
  ): number {
    this.nodesSearched++;

    // Terminal conditions
    if (depth === 0 || isTerminal(state)) {
      return evaluatePosition(state, forPlayer, this.weights);
    }

    // Time limit check
    if (Date.now() - this.startTime > this.config.maxTime) {
      return quickEvaluate(state, forPlayer);
    }

    const currentPlayer = isMaximizing ? forPlayer : getOpponent(forPlayer);
    const actions = getSortedActions(generateAllActions(state, currentPlayer));

    if (actions.length === 0) {
      return evaluatePosition(state, forPlayer, this.weights);
    }

    if (isMaximizing) {
      let maxScore = -Infinity;

      for (const action of actions) {
        // Time check in loop
        if (Date.now() - this.startTime > this.config.maxTime) {
          break;
        }

        const newState = applyAction(state, action);

        // Determine if next level should maximize or minimize
        // This depends on whether we're still in the same player's turn
        const nextIsMax = this.isStillSameTurn(state, newState, forPlayer);

        const score = this.minimax(
          newState,
          depth - 1,
          alpha,
          beta,
          nextIsMax,
          forPlayer
        );

        maxScore = Math.max(maxScore, score);
        alpha = Math.max(alpha, score);

        if (this.config.useAlphaBeta && beta <= alpha) {
          break; // Beta cutoff
        }
      }

      return maxScore;
    } else {
      let minScore = Infinity;

      for (const action of actions) {
        // Time check in loop
        if (Date.now() - this.startTime > this.config.maxTime) {
          break;
        }

        const newState = applyAction(state, action);

        // After opponent acts, check if it's back to our player
        const nextIsMax = this.isStillSameTurn(state, newState, getOpponent(forPlayer))
          ? false
          : true;

        const score = this.minimax(
          newState,
          depth - 1,
          alpha,
          beta,
          nextIsMax,
          forPlayer
        );

        minScore = Math.min(minScore, score);
        beta = Math.min(beta, score);

        if (this.config.useAlphaBeta && beta <= alpha) {
          break; // Alpha cutoff
        }
      }

      return minScore;
    }
  }

  /**
   * Check if we're still in the same player's turn after an action
   */
  private isStillSameTurn(
    _prevState: GameState,
    newState: GameState,
    player: PlayerId
  ): boolean {
    return newState.turn.currentPlayer === player;
  }

  /**
   * Set difficulty
   */
  setDifficulty(difficulty: AIDifficulty): void {
    this.config = DIFFICULTY_CONFIGS[difficulty];
  }

  /**
   * Set custom weights
   */
  setWeights(weights: Partial<EvaluationWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }
}

/**
 * Create an AI engine with default settings
 */
export function createAI(difficulty: AIDifficulty = 'medium'): AIEngine {
  return new AIEngine(difficulty);
}

/**
 * Execute a complete AI turn
 * Returns all actions the AI wants to take this turn
 */
export function executeAITurn(
  state: GameState,
  difficulty: AIDifficulty = 'medium'
): AIAction[] {
  const ai = new AIEngine(difficulty);
  const allActions: AIAction[] = [];

  let currentState = state;
  let iterations = 0;
  const maxIterations = 20; // Safety limit

  while (iterations < maxIterations) {
    iterations++;

    // Check if it's still AI's turn
    if (currentState.turn.currentPlayer !== 'ai') {
      break;
    }

    // Check if game is over
    if (currentState.phase === 'victory') {
      break;
    }

    // Find best action
    const result = ai.findBestAction(currentState);

    if (result.plan.actions.length === 0) {
      // No actions available, end turn
      if (currentState.turn.phase === 'action') {
        allActions.push({ type: 'END_ACTION_PHASE' });
        break;
      } else if (currentState.turn.phase === 'queue') {
        allActions.push({ type: 'END_TURN' });
        break;
      }
      break;
    }

    // Apply the action
    const action = result.plan.actions[0];
    allActions.push(action);
    currentState = applyAction(currentState, action);

    // Check for turn-ending actions
    if (action.type === 'END_TURN') {
      break;
    }
  }

  return allActions;
}
