---
name: minimax-ai
description: Implements alpha-beta pruning minimax AI with optionality-based position evaluation. Use when building AI opponents for turn-based strategy games, board games, or any game requiring lookahead search.
---

# Minimax AI with Alpha-Beta Pruning

## Core Concept

Minimax is a decision-making algorithm for two-player zero-sum games. It assumes both players play optimally:
- **Maximizing player** picks moves that maximize their score
- **Minimizing player** picks moves that minimize the maximizer's score

Alpha-beta pruning eliminates branches that cannot affect the final decision, dramatically improving search depth.

---

## Optionality-Based Evaluation

**Optionality** measures a player's freedom to act. More options = more flexibility = stronger position.

### The Optionality Principle

> A position where you have 10 possible moves is generally better than one where you have 3, even if the best move in each position scores the same.

Why:
1. **Resilience:** More options means more ways to respond to opponent threats
2. **Flexibility:** You can adapt strategy mid-game
3. **Psychological pressure:** Opponent must consider more of your possible responses
4. **Error tolerance:** Sub-optimal moves are less punishing when alternatives exist

### Evaluation Components

```typescript
interface PositionEvaluation {
  // Primary: Optionality
  moveCount: number;          // Legal moves available
  buildOptions: number;       // Units/cards that can be built
  targetOptions: number;      // Valid attack/action targets

  // Secondary: Material and positional
  materialValue: number;      // Sum of piece values
  territoryControl: number;   // Board control percentage
  resourceAdvantage: number;  // Economic lead

  // Tertiary: Strategic factors
  threatCount: number;        // Pieces threatening enemy
  safetyScore: number;        // Pieces safe from attack
  tempoAdvantage: number;     // Initiative/momentum
}
```

---

## Implementation

### Type Definitions

```typescript
// src/ai/types.ts

export interface GamePosition<TState, TMove> {
  state: TState;
  currentPlayer: 'max' | 'min';
}

export interface AIConfig {
  maxDepth: number;           // Search depth limit
  timeLimit?: number;         // Time limit in ms (optional)
  optionalityWeight: number;  // How much to weight move count (0.0-1.0)
  evaluationWeights: EvaluationWeights;
}

export interface EvaluationWeights {
  moveCount: number;          // Optionality: available moves
  buildOptions: number;       // Optionality: buildable units
  materialValue: number;      // Piece values on board
  territoryControl: number;   // Board position
  resourceAdvantage: number;  // Economy
  threatPressure: number;     // Attacking potential
}

export interface SearchResult<TMove> {
  bestMove: TMove | null;
  score: number;
  depth: number;
  nodesSearched: number;
  pruned: number;
}
```

### Core Algorithm

```typescript
// src/ai/minimax.ts

export function alphaBetaSearch<TState, TMove>(
  position: GamePosition<TState, TMove>,
  config: AIConfig,
  gameRules: GameRules<TState, TMove>
): SearchResult<TMove> {
  let nodesSearched = 0;
  let pruned = 0;

  function minimax(
    state: TState,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean
  ): number {
    nodesSearched++;

    // Terminal conditions
    if (depth === 0 || gameRules.isTerminal(state)) {
      return evaluate(state, gameRules, config);
    }

    const moves = gameRules.getLegalMoves(state);

    // No moves = loss for current player (or draw depending on game)
    if (moves.length === 0) {
      return isMaximizing ? -Infinity : Infinity;
    }

    // Order moves for better pruning (captures/threats first)
    const orderedMoves = orderMoves(moves, state, gameRules);

    if (isMaximizing) {
      let maxEval = -Infinity;

      for (const move of orderedMoves) {
        const newState = gameRules.applyMove(state, move);
        const eval_ = minimax(newState, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, eval_);
        alpha = Math.max(alpha, eval_);

        if (beta <= alpha) {
          pruned++;
          break; // Beta cutoff
        }
      }

      return maxEval;
    } else {
      let minEval = Infinity;

      for (const move of orderedMoves) {
        const newState = gameRules.applyMove(state, move);
        const eval_ = minimax(newState, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, eval_);
        beta = Math.min(beta, eval_);

        if (beta <= alpha) {
          pruned++;
          break; // Alpha cutoff
        }
      }

      return minEval;
    }
  }

  // Find best move at root
  const moves = gameRules.getLegalMoves(position.state);
  let bestMove: TMove | null = null;
  let bestScore = position.currentPlayer === 'max' ? -Infinity : Infinity;

  for (const move of orderMoves(moves, position.state, gameRules)) {
    const newState = gameRules.applyMove(position.state, move);
    const score = minimax(
      newState,
      config.maxDepth - 1,
      -Infinity,
      Infinity,
      position.currentPlayer === 'min' // Next player after move
    );

    if (position.currentPlayer === 'max' && score > bestScore) {
      bestScore = score;
      bestMove = move;
    } else if (position.currentPlayer === 'min' && score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return {
    bestMove,
    score: bestScore,
    depth: config.maxDepth,
    nodesSearched,
    pruned,
  };
}
```

### Game Rules Interface

```typescript
// src/ai/types.ts

export interface GameRules<TState, TMove> {
  // Move generation
  getLegalMoves(state: TState): TMove[];

  // State transitions
  applyMove(state: TState, move: TMove): TState;

  // Terminal detection
  isTerminal(state: TState): boolean;
  getWinner(state: TState): 'max' | 'min' | 'draw' | null;

  // For evaluation
  getMaterialValue(state: TState, player: 'max' | 'min'): number;
  getTerritory(state: TState, player: 'max' | 'min'): number;
  getResources(state: TState, player: 'max' | 'min'): number;
  getBuildOptions(state: TState, player: 'max' | 'min'): number;
  getThreats(state: TState, player: 'max' | 'min'): number;
}
```

### Optionality-Based Evaluation Function

```typescript
// src/ai/evaluation.ts

export function evaluate<TState, TMove>(
  state: TState,
  rules: GameRules<TState, TMove>,
  config: AIConfig
): number {
  // Check for terminal states first
  const winner = rules.getWinner(state);
  if (winner === 'max') return Infinity;
  if (winner === 'min') return -Infinity;
  if (winner === 'draw') return 0;

  const w = config.evaluationWeights;

  // === OPTIONALITY (Primary) ===
  // Move count: How many legal moves does each player have?
  const maxMoves = rules.getLegalMoves(state).length; // Assuming max's turn
  const minMoves = countOpponentMoves(state, rules);  // Need to simulate

  // Build options: What can each player construct?
  const maxBuilds = rules.getBuildOptions(state, 'max');
  const minBuilds = rules.getBuildOptions(state, 'min');

  // Optionality score (normalized)
  const moveOptionalityScore = normalizeAdvantage(maxMoves, minMoves);
  const buildOptionalityScore = normalizeAdvantage(maxBuilds, minBuilds);

  // === MATERIAL ===
  const maxMaterial = rules.getMaterialValue(state, 'max');
  const minMaterial = rules.getMaterialValue(state, 'min');
  const materialScore = normalizeAdvantage(maxMaterial, minMaterial);

  // === TERRITORY ===
  const maxTerritory = rules.getTerritory(state, 'max');
  const minTerritory = rules.getTerritory(state, 'min');
  const territoryScore = normalizeAdvantage(maxTerritory, minTerritory);

  // === RESOURCES ===
  const maxResources = rules.getResources(state, 'max');
  const minResources = rules.getResources(state, 'min');
  const resourceScore = normalizeAdvantage(maxResources, minResources);

  // === THREATS ===
  const maxThreats = rules.getThreats(state, 'max');
  const minThreats = rules.getThreats(state, 'min');
  const threatScore = normalizeAdvantage(maxThreats, minThreats);

  // Weighted sum
  return (
    w.moveCount * moveOptionalityScore +
    w.buildOptions * buildOptionalityScore +
    w.materialValue * materialScore +
    w.territoryControl * territoryScore +
    w.resourceAdvantage * resourceScore +
    w.threatPressure * threatScore
  );
}

/**
 * Normalize advantage to [-1, 1] range
 * Positive = max advantage, Negative = min advantage
 */
function normalizeAdvantage(maxValue: number, minValue: number): number {
  const total = maxValue + minValue;
  if (total === 0) return 0;
  return (maxValue - minValue) / total;
}

/**
 * Count opponent's moves (requires simulating their turn)
 */
function countOpponentMoves<TState, TMove>(
  state: TState,
  rules: GameRules<TState, TMove>
): number {
  // This depends on game structure. Options:
  // 1. If state tracks current player, swap and count
  // 2. If symmetric, apply same rules to opponent pieces
  // 3. Store both counts in state

  // Placeholder - implement per game
  return rules.getLegalMoves(state).length; // Simplified
}
```

### Move Ordering for Better Pruning

```typescript
// src/ai/moveOrdering.ts

/**
 * Order moves to maximize alpha-beta pruning efficiency.
 * Best moves first = more cutoffs = faster search.
 */
export function orderMoves<TState, TMove>(
  moves: TMove[],
  state: TState,
  rules: GameRules<TState, TMove>
): TMove[] {
  // Score each move with cheap heuristics
  const scored = moves.map(move => ({
    move,
    score: quickMoveScore(move, state, rules),
  }));

  // Sort descending (best first)
  scored.sort((a, b) => b.score - a.score);

  return scored.map(s => s.move);
}

function quickMoveScore<TState, TMove>(
  move: TMove,
  state: TState,
  rules: GameRules<TState, TMove>
): number {
  let score = 0;

  // Heuristics (implement per game):
  // +100: Captures high-value piece
  // +50:  Captures any piece
  // +30:  Creates threat
  // +20:  Improves position
  // +10:  Develops piece
  // -10:  Moves to threatened square

  return score;
}
```

### Iterative Deepening (Optional Enhancement)

```typescript
// src/ai/iterativeDeepening.ts

/**
 * Search progressively deeper until time runs out.
 * Returns best result found within time limit.
 */
export function iterativeDeepeningSearch<TState, TMove>(
  position: GamePosition<TState, TMove>,
  config: AIConfig,
  rules: GameRules<TState, TMove>
): SearchResult<TMove> {
  const startTime = Date.now();
  let bestResult: SearchResult<TMove> | null = null;

  for (let depth = 1; depth <= config.maxDepth; depth++) {
    // Check time
    if (config.timeLimit && Date.now() - startTime > config.timeLimit) {
      break;
    }

    const result = alphaBetaSearch(
      position,
      { ...config, maxDepth: depth },
      rules
    );

    bestResult = result;

    // If we found a winning move, stop early
    if (result.score === Infinity || result.score === -Infinity) {
      break;
    }
  }

  return bestResult ?? {
    bestMove: null,
    score: 0,
    depth: 0,
    nodesSearched: 0,
    pruned: 0,
  };
}
```

---

## Recommended Evaluation Weights

### Balanced Strategy Game (e.g., Elemental Tactics)

```typescript
const balancedWeights: EvaluationWeights = {
  moveCount: 25,          // Optionality matters a lot
  buildOptions: 15,       // Economic flexibility
  materialValue: 30,      // Piece advantage is important
  territoryControl: 15,   // Board control
  resourceAdvantage: 10,  // Economy
  threatPressure: 5,      // Aggression
};
```

### Aggressive/Rush Strategy

```typescript
const aggressiveWeights: EvaluationWeights = {
  moveCount: 15,
  buildOptions: 5,
  materialValue: 25,
  territoryControl: 10,
  resourceAdvantage: 5,
  threatPressure: 40,     // Heavy threat focus
};
```

### Economic/Control Strategy

```typescript
const economicWeights: EvaluationWeights = {
  moveCount: 30,          // Maximum flexibility
  buildOptions: 25,       // Build everything
  materialValue: 15,
  territoryControl: 20,
  resourceAdvantage: 10,
  threatPressure: 0,
};
```

---

## Difficulty Levels

```typescript
// src/ai/difficulty.ts

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export function getDifficultyConfig(difficulty: Difficulty): AIConfig {
  switch (difficulty) {
    case 'easy':
      return {
        maxDepth: 1,                    // No lookahead
        optionalityWeight: 0.1,
        evaluationWeights: randomizedWeights(), // Imperfect evaluation
      };

    case 'medium':
      return {
        maxDepth: 2,                    // 1-ply lookahead
        optionalityWeight: 0.5,
        evaluationWeights: balancedWeights,
      };

    case 'hard':
      return {
        maxDepth: 4,                    // 2-ply lookahead
        optionalityWeight: 0.8,
        evaluationWeights: balancedWeights,
      };

    case 'expert':
      return {
        maxDepth: 6,                    // Deep search
        timeLimit: 5000,                // 5 second limit
        optionalityWeight: 1.0,
        evaluationWeights: optimizedWeights,
      };
  }
}

/**
 * Add randomness to weights for weaker AI
 */
function randomizedWeights(): EvaluationWeights {
  const jitter = () => 0.5 + Math.random(); // 0.5 to 1.5 multiplier

  return {
    moveCount: 25 * jitter(),
    buildOptions: 15 * jitter(),
    materialValue: 30 * jitter(),
    territoryControl: 15 * jitter(),
    resourceAdvantage: 10 * jitter(),
    threatPressure: 5 * jitter(),
  };
}
```

---

## Game-Specific Implementation Example

### For Elemental Tactics

```typescript
// src/ai/elementalRules.ts

import { GameState, GameAction, Unit, Position } from '../game/types';

export const elementalRules: GameRules<GameState, GameAction> = {
  getLegalMoves(state: GameState): GameAction[] {
    const moves: GameAction[] = [];

    // Get current player's units
    const playerUnits = state.board.units.filter(
      u => u.owner === state.turn.currentPlayer
    );

    for (const unit of playerUnits) {
      // Movement actions
      if (!unit.hasMoved) {
        const validMoves = getValidMoves(unit, state.board);
        for (const pos of validMoves) {
          moves.push({ type: 'MOVE', unitId: unit.id, to: pos });
        }
      }

      // Attack actions
      if (!unit.hasAttacked) {
        const validAttacks = getValidAttacks(unit, state.board);
        for (const pos of validAttacks) {
          moves.push({ type: 'ATTACK', unitId: unit.id, targetPosition: pos });
        }
      }

      // Mine actions
      if (!unit.hasMined && canMine(unit, state.board)) {
        moves.push({ type: 'MINE', unitId: unit.id });
      }
    }

    // Build actions (during queue phase)
    if (state.turn.phase === 'queue') {
      const affordable = getAffordableUnits(state);
      for (const defId of affordable) {
        moves.push({ type: 'QUEUE_UNIT', definitionId: defId });
      }
    }

    // Always can end turn/phase
    moves.push({ type: 'END_TURN' });

    return moves;
  },

  applyMove(state: GameState, move: GameAction): GameState {
    // Apply move and return new state (implement with reducer)
    return gameReducer(state, move);
  },

  isTerminal(state: GameState): boolean {
    return state.phase === 'victory';
  },

  getWinner(state: GameState): 'max' | 'min' | 'draw' | null {
    if (state.winner === 'player') return 'max';
    if (state.winner === 'ai') return 'min';
    return null;
  },

  getMaterialValue(state: GameState, player: 'max' | 'min'): number {
    const playerId = player === 'max' ? 'player' : 'ai';
    return state.board.units
      .filter(u => u.owner === playerId)
      .reduce((sum, u) => sum + getUnitDefinition(u.definitionId).cost, 0);
  },

  getTerritory(state: GameState, player: 'max' | 'min'): number {
    const playerId = player === 'max' ? 'player' : 'ai';
    // Count squares in valid spawn zones
    return calculateSpawnZoneSize(state, playerId);
  },

  getResources(state: GameState, player: 'max' | 'min'): number {
    const playerId = player === 'max' ? 'player' : 'ai';
    return state.players[playerId].resources;
  },

  getBuildOptions(state: GameState, player: 'max' | 'min'): number {
    const playerId = player === 'max' ? 'player' : 'ai';
    const resources = state.players[playerId].resources;
    // Count units that could be built with current resources
    return UNIT_DEFINITIONS.filter(u => u.cost <= resources).length;
  },

  getThreats(state: GameState, player: 'max' | 'min'): number {
    const playerId = player === 'max' ? 'player' : 'ai';
    const enemyId = player === 'max' ? 'ai' : 'player';

    // Count enemy units that our units can attack
    let threats = 0;
    const ourUnits = state.board.units.filter(u => u.owner === playerId);
    const enemyUnits = state.board.units.filter(u => u.owner === enemyId);

    for (const ourUnit of ourUnits) {
      for (const enemy of enemyUnits) {
        if (isAdjacent(ourUnit.position, enemy.position)) {
          threats++;
        }
      }
    }

    return threats;
  },
};
```

---

## Testing the AI

```typescript
// tests/ai/minimax.test.ts

import { describe, it, expect } from 'vitest';
import { alphaBetaSearch } from '../src/ai/minimax';

describe('Alpha-Beta Minimax', () => {
  it('finds winning move when available', () => {
    const state = createStateWithWinningMove();
    const result = alphaBetaSearch(
      { state, currentPlayer: 'max' },
      { maxDepth: 3, ...defaultConfig },
      testRules
    );

    expect(result.bestMove).toEqual(expectedWinningMove);
    expect(result.score).toBe(Infinity);
  });

  it('blocks opponent winning move', () => {
    const state = createStateWhereOpponentCanWin();
    const result = alphaBetaSearch(
      { state, currentPlayer: 'max' },
      { maxDepth: 3, ...defaultConfig },
      testRules
    );

    expect(result.bestMove).toEqual(expectedBlockingMove);
  });

  it('prefers positions with more optionality', () => {
    const state = createNeutralPosition();
    const result = alphaBetaSearch(
      { state, currentPlayer: 'max' },
      { maxDepth: 2, ...highOptionalityConfig },
      testRules
    );

    // The chosen move should lead to more options
    const resultingState = testRules.applyMove(state, result.bestMove!);
    const moveCount = testRules.getLegalMoves(resultingState).length;
    expect(moveCount).toBeGreaterThan(5);
  });

  it('prunes effectively', () => {
    const state = createComplexPosition();
    const result = alphaBetaSearch(
      { state, currentPlayer: 'max' },
      { maxDepth: 4, ...defaultConfig },
      testRules
    );

    // Pruning should eliminate significant portion of nodes
    expect(result.pruned).toBeGreaterThan(result.nodesSearched * 0.3);
  });
});
```

---

## Performance Considerations

### Optimizations

1. **Transposition Table:** Cache evaluated positions to avoid recomputation
2. **Killer Move Heuristic:** Remember moves that caused cutoffs
3. **History Heuristic:** Track moves that are frequently best
4. **Null Move Pruning:** Skip opponent's move to get quick bound
5. **Late Move Reduction:** Search later moves at reduced depth

### Memory-Efficient State Representation

```typescript
// Use immutable updates with structural sharing
import { produce } from 'immer';

function applyMove(state: GameState, move: GameAction): GameState {
  return produce(state, draft => {
    // Modify draft in place
    // Immer handles immutability
  });
}
```

### Web Worker for AI Computation

```typescript
// src/ai/worker.ts
self.onmessage = (e: MessageEvent<AIRequest>) => {
  const { position, config } = e.data;
  const result = alphaBetaSearch(position, config, gameRules);
  self.postMessage(result);
};

// src/hooks/useAI.ts
export function useAI() {
  const workerRef = useRef<Worker>();

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../ai/worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => workerRef.current?.terminate();
  }, []);

  const findBestMove = useCallback((state: GameState) => {
    return new Promise<SearchResult>((resolve) => {
      workerRef.current!.onmessage = (e) => resolve(e.data);
      workerRef.current!.postMessage({ position: state, config });
    });
  }, [config]);

  return { findBestMove };
}
```

---

## Quick Reference

### Algorithm Complexity

- **Without pruning:** O(b^d) where b=branching factor, d=depth
- **With perfect pruning:** O(b^(d/2)) — effectively doubles search depth
- **Typical pruning:** O(b^(3d/4)) — 25-50% of nodes pruned

### When to Use Minimax

- Two-player games
- Perfect information (both players see everything)
- Zero-sum (one player's gain = other's loss)
- Deterministic (no randomness)

### When NOT to Use Minimax

- Single-player games → Use expectimax or MCTS
- Hidden information → Use MCTS with information sets
- Stochastic elements → Use expectimax
- Very high branching factor → Use MCTS
