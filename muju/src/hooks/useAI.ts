import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState } from '../game/types';
import type { AIAction, AIDifficulty, AIDebugInfo } from '../ai/types';
import { AIEngine } from '../ai/engine';
import { applyAction } from '../ai/simulate';
import { shouldResign } from '../ai/evaluation';
import { isLegalAction, phaseEndAction } from '../game/legality';

interface UseAIOptions {
  difficulty?: AIDifficulty;
  thinkingDelay?: number; // ms between actions for animation
  enabled?: boolean;
}

interface UseAIReturn {
  isThinking: boolean;
  executeAITurn: (state: GameState, onAction: (action: AIAction) => void, playerId: 'white' | 'black') => Promise<void>;
  difficulty: AIDifficulty;
  setDifficulty: (d: AIDifficulty) => void;
  lastTurnActions: AIAction[];
  lastDebug: AIDebugInfo | null;
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
  const [lastDebug, setLastDebug] = useState<AIDebugInfo | null>(null);
  const aiRef = useRef<AIEngine>(new AIEngine(initialDifficulty));

  const clearLastTurnActions = useCallback(() => {
    setLastTurnActions([]);
    setLastDebug(null);
  }, []);

  // Update AI when difficulty changes
  useEffect(() => {
    aiRef.current.setDifficulty(difficulty);
  }, [difficulty]);

  const executeAITurn = useCallback(
    async (state: GameState, onAction: (action: AIAction) => void, playerId: 'white' | 'black'): Promise<void> => {
      if (!enabled || state.phase !== 'playing' || state.turn.currentPlayer !== playerId) {
        return;
      }

      setIsThinking(true);
      const turnActions: AIAction[] = [];
      const turnStartTime = Date.now();
      const minThinkingTime = aiRef.current.getMinThinkingTime();

      // Check if AI should resign (all difficulties resign when position is hopeless)
      if (shouldResign(state, playerId)) {
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
      // Every legal action consumes resources/actions, a ready queue entry, a
      // promotion opportunity, or ends a phase. No arbitrary 20-dispatch cutoff.
      let firstActionTaken = false;

      try {
        while (true) {

          // Check if still AI's turn
          if (currentState.turn.currentPlayer !== playerId) {
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

          setLastDebug(result.debug ?? null);

          // Execute the action
          const proposed = result.plan.actions[0];
          const action = proposed && isLegalAction(currentState, proposed)
            ? proposed : phaseEndAction(currentState);
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
    lastDebug,
    clearLastTurnActions,
  };
}
