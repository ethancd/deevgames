import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState } from '../game/types';
import type { AIAction, AIDifficulty } from '../ai/types';
import { AIEngine } from '../ai/engine';
import { applyAction } from '../ai/simulate';
import { shouldResign } from '../ai/evaluation';

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
  lastTurnActions: AIAction[];
  clearLastTurnActions: () => void;
}

export function useAI(options: UseAIOptions = {}): UseAIReturn {
  const {
    difficulty: initialDifficulty = 'medium',
    thinkingDelay = 500,
    enabled = true,
  } = options;

  const [difficulty, setDifficulty] = useState<AIDifficulty>(initialDifficulty);
  const [isThinking, setIsThinking] = useState(false);
  const [lastTurnActions, setLastTurnActions] = useState<AIAction[]>([]);
  const aiRef = useRef<AIEngine>(new AIEngine(initialDifficulty));

  const clearLastTurnActions = useCallback(() => {
    setLastTurnActions([]);
  }, []);

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
      const turnActions: AIAction[] = [];
      const turnStartTime = Date.now();
      const minThinkingTime = aiRef.current.getMinThinkingTime();

      // Check if AI should resign (all difficulties resign when position is hopeless)
      if (shouldResign(state, 'ai')) {
        // Wait minimum thinking time before resigning
        const elapsed = Date.now() - turnStartTime;
        if (elapsed < minThinkingTime) {
          await new Promise((resolve) => setTimeout(resolve, minThinkingTime - elapsed));
        }
        const resignAction: AIAction = { type: 'RESIGN' };
        onAction(resignAction);
        turnActions.push(resignAction);
        setLastTurnActions(turnActions);
        setIsThinking(false);
        return;
      }

      let currentState = state;
      let iterations = 0;
      const maxIterations = 20;
      let firstActionTaken = false;

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

          // Find best action (async to keep UI responsive)
          const result = await aiRef.current.findBestAction(currentState);

          // Before first action, ensure minimum thinking time has passed
          if (!firstActionTaken) {
            const elapsed = Date.now() - turnStartTime;
            if (elapsed < minThinkingTime) {
              await new Promise((resolve) => setTimeout(resolve, minThinkingTime - elapsed));
            }
            firstActionTaken = true;
          } else {
            // Add small delay between subsequent actions for visual effect
            await new Promise((resolve) => setTimeout(resolve, thinkingDelay));
          }

          if (result.plan.actions.length === 0) {
            // No actions, need to end phase/turn
            if (currentState.turn.phase === 'action') {
              const endAction: AIAction = { type: 'END_ACTION_PHASE' };
              onAction(endAction);
              turnActions.push(endAction);
              currentState = applyAction(currentState, endAction);
              continue;
            } else if (currentState.turn.phase === 'queue') {
              const endAction: AIAction = { type: 'END_TURN' };
              onAction(endAction);
              turnActions.push(endAction);
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
          turnActions.push(action);
          currentState = applyAction(currentState, action);

          // If ended turn, we're done
          if (action.type === 'END_TURN') {
            break;
          }
        }
      } finally {
        setLastTurnActions(turnActions);
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
    lastTurnActions,
    clearLastTurnActions,
  };
}
