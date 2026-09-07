import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState } from '../game/types';
import type { AIAction, AIDifficulty, AIDebugInfo } from '../ai/types';
import { AIWorkerClient, SearchCancelled } from '../ai/worker/client';
import { TURN_BUDGET_MS } from '../ai/engine-v2';
import { applyAction } from '../ai/simulate';
import { isLegalAction, phaseEndAction } from '../game/legality';
import { homeInvader } from '../ai/tactics/home';

interface UseAIOptions {
  difficulty?: AIDifficulty; thinkingDelay?: number; enabled?: boolean;
  /** Authoritative state getter rejects undo/load/restart races after awaits. */
  getCurrentState?: () => GameState;
  state?: GameState;
}
export function useAI(options: UseAIOptions = {}) {
  const { difficulty: initialDifficulty = 'medium', thinkingDelay = 500, enabled = true, getCurrentState } = options;
  const [difficulty, setDifficulty] = useState<AIDifficulty>(initialDifficulty);
  const [isThinking, setIsThinking] = useState(false);
  const [lastTurnActions, setLastTurnActions] = useState<AIAction[]>([]);
  const [lastDebug, setLastDebug] = useState<AIDebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const pendingCommit = useRef<((state: GameState | null) => void) | null>(null);
  useEffect(() => { if (options.state && pendingCommit.current) { const resolve = pendingCommit.current; pendingCommit.current = null; resolve(options.state); } }, [options.state]);
  const hasAuthoritativeState = options.state !== undefined;
  const client = useRef<AIWorkerClient | null>(null);
  const generation = useRef(0), busy = useRef(false);
  const currentGetter = useRef(getCurrentState); currentGetter.current = getCurrentState;
  const cancel = useCallback(() => { pendingCommit.current?.(null); pendingCommit.current = null; generation.current++; busy.current = false; client.current?.restart(); setIsThinking(false); }, []);
  const clearLastTurnActions = useCallback(() => { setLastTurnActions([]); setLastDebug(null); }, []);
  useEffect(() => { cancel(); }, [difficulty, enabled, cancel]);
  useEffect(() => { setDifficulty(initialDifficulty); }, [initialDifficulty]);
  useEffect(() => () => { pendingCommit.current?.(null); pendingCommit.current = null; generation.current++; client.current?.cancel(); }, []);

  const executeAITurn = useCallback(async (state: GameState, onAction: (action: AIAction) => void, playerId: 'white' | 'black') => {
    if (!enabled || busy.current || state.phase !== 'playing' || state.turn.currentPlayer !== playerId) return;
    client.current ??= new AIWorkerClient();
    const token = ++generation.current;
    busy.current = true; setIsThinking(true); setError(null);
    const turnActions: AIAction[] = [];
    let currentState = state, remainingCPU = TURN_BUDGET_MS[difficulty];
    const valid = () => {
      if (token !== generation.current) return false;
      const real = currentGetter.current?.();
      // Ignore selection/highlight differences; compare actual gameplay fields.
      return !real || (real.board === currentState.board && real.players === currentState.players &&
        real.turn === currentState.turn && real.phase === currentState.phase);
    };
    try {
      while (currentState.phase === 'playing' && currentState.turn.currentPlayer === playerId && token === generation.current) {
        const fraction = homeInvader(currentState, playerId) ? 1 : currentState.turn.phase === 'action' ? 1 / Math.max(1, currentState.turn.actionsRemaining / 2) : 0.25;
        const allowance = Math.max(0, Math.min(remainingCPU, Math.max(80, remainingCPU * fraction)));
        const result = await client.current.findBestAction(currentState, difficulty, allowance, turnActions.length);
        remainingCPU = Math.max(0, remainingCPU - result.timeMs);
        if (!valid()) break;
        if (thinkingDelay > 0) await new Promise(resolve => setTimeout(resolve, thinkingDelay));
        if (!valid()) break;
        setLastDebug(result.debug ?? null); setWarning(client.current.warning ?? null);
        const proposed = result.plan.actions[0];
        // Empty plans explicitly finish the phase. Invalid proposals are an
        // engine error, not a hidden pass/resignation.
        const action = proposed ?? phaseEndAction(currentState);
        if (!isLegalAction(currentState, action)) throw new Error('AI proposed an invalid action. Please retry.');
        const expected = applyAction(currentState, action);
        // React may commit after the next timer tick. Await an explicit state
        // update rather than assuming a zero-delay timeout acknowledges dispatch.
        const committed = hasAuthoritativeState ? new Promise<GameState | null>(resolve => { pendingCommit.current = resolve; }) : null;
        onAction(action); turnActions.push(action);
        currentState = expected;
        if (committed) {
          const actual = await committed;
          if (!actual || token !== generation.current) break;
          const gameplay = (s: GameState) => JSON.stringify({ board: s.board, players: s.players, turn: s.turn, phase: s.phase, winner: s.winner });
          if (gameplay(actual) !== gameplay(expected)) break;
          currentState = actual;
        }

      }
    } catch (e) {
      if (token === generation.current && !(e instanceof SearchCancelled)) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === generation.current) { busy.current = false; setLastTurnActions(turnActions); setIsThinking(false); }
    }
  }, [difficulty, enabled, thinkingDelay, hasAuthoritativeState]);
  return { isThinking, executeAITurn, difficulty, setDifficulty, lastTurnActions, lastDebug, clearLastTurnActions,
    cancel, error, warning, clearError: () => setError(null) };
}
