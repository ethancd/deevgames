import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState } from '../game/types';
import type { AIAction, AIDifficulty } from '../ai/types';
import { AIEngine } from '../ai/engine';
import { applyAction } from '../ai/simulate';

interface UseAIOptions {
  difficulty?: AIDifficulty;
  thinkingDelay?: number; // ms between actions for animation
  enabled?: boolean;
}

interface UseAIReturn {
  isThinking: boolean;
  executeAITurn: (state: GameState, onAction: (action: AIAction) => void) => Promise<void>;
  difficulty: AIDifficulty;
  setDifficulty: (d: AIDifficulty) => void;
}

export function useAI(options: UseAIOptions = {}): UseAIReturn {
  const {
    difficulty: initialDifficulty = 'medium',
    thinkingDelay = 500,
    enabled = true,
  } = options;

  const [difficulty, setDifficulty] = useState<AIDifficulty>(initialDifficulty);
  const [isThinking, setIsThinking] = useState(false);
  const aiRef = useRef<AIEngine>(new AIEngine(initialDifficulty));

  // Update AI when difficulty changes
  useEffect(() => {
    aiRef.current.setDifficulty(difficulty);
  }, [difficulty]);

  const executeAITurn = useCallback(
    async (state: GameState, onAction: (action: AIAction) => void): Promise<void> => {
      if (!enabled || state.turn.currentPlayer !== 'ai') {
        return;
      }

      setIsThinking(true);

      let currentState = state;
      let iterations = 0;
      const maxIterations = 20;

      try {
        while (iterations < maxIterations) {
          iterations++;

          // Check if still AI's turn
          if (currentState.turn.currentPlayer !== 'ai') {
            break;
          }

          // Check if game over
          if (currentState.phase === 'victory') {
            break;
          }

          // Add thinking delay for visual effect
          await new Promise((resolve) => setTimeout(resolve, thinkingDelay));

          // Find best action
          const result = aiRef.current.findBestAction(currentState);

          if (result.plan.actions.length === 0) {
            // No actions, need to end phase/turn
            if (currentState.turn.phase === 'action') {
              onAction({ type: 'END_ACTION_PHASE' });
              currentState = applyAction(currentState, { type: 'END_ACTION_PHASE' });
              continue;
            } else if (currentState.turn.phase === 'queue') {
              onAction({ type: 'END_TURN' });
              break;
            } else if (currentState.turn.phase === 'place') {
              // Skip to action phase
              currentState = {
                ...currentState,
                turn: { ...currentState.turn, phase: 'action' },
              };
              continue;
            }
            break;
          }

          // Execute the action
          const action = result.plan.actions[0];
          onAction(action);
          currentState = applyAction(currentState, action);

          // If ended turn, we're done
          if (action.type === 'END_TURN') {
            break;
          }
        }
      } finally {
        setIsThinking(false);
      }
    },
    [enabled, thinkingDelay]
  );

  return {
    isThinking,
    executeAITurn,
    difficulty,
    setDifficulty,
  };
}
