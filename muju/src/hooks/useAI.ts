import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState } from '../game/types';
import type { AIAction, AIDifficulty, AIDebugInfo } from '../ai/types';
import { AIWorkerClient, SearchCancelled } from '../ai/worker/client';
import { TURN_BUDGET_MS } from '../ai/engine-v2';
import { applyAction } from '../ai/simulate';
import { isLegalAction, phaseEndAction } from '../game/legality';

interface UseAIOptions {
  difficulty?: AIDifficulty; thinkingDelay?: number; enabled?: boolean;
  /** Authoritative state getter rejects undo/load/restart races after awaits. */
  getCurrentState?: () => GameState;
  state?: GameState;
}

/** Gameplay-relevant digest, ignoring UI-only selection/highlight fields.
 * Used both to detect a stale commit (pre-existing) and, in the turn path, to
 * confirm the live state still matches what our own cached plan predicted. */
const gameplayDigest = (s: GameState): string => JSON.stringify({
  board: s.board, players: s.players, turn: s.turn, phase: s.phase, winner: s.winner,
  victoryReason: s.victoryReason, upkeepPending: s.upkeepPending,
  inactivityPlies: s.inactivityPlies, progressThisTurn: s.progressThisTurn,
});

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
    // The whole-turn path (DESIGN §6.2, M3) is the default for every
    // difficulty on AIEngineV2. Any illegal proposal drops to the legacy
    // per-action loop for the rest of this turn (§6.4's fallback layer 3,
    // adapted for the v2/JS path: there is no replica to verify against, so
    // "divergence" here means the dispatched prefix stopped matching legality).
    let fellBack = false;
    const valid = () => {
      if (token !== generation.current) return false;
      const real = currentGetter.current?.();
      // Ignore selection/highlight differences; compare actual gameplay fields.
      return !real || (real.board === currentState.board && real.players === currentState.players &&
        real.turn === currentState.turn && real.phase === currentState.phase);
    };
    // Dispatches one action exactly as the pre-M3 per-action loop did:
    // applies it locally, hands it to the caller, and (when an authoritative
    // state getter is wired up) waits for the real commit to agree before
    // continuing. Returns 'illegal' without any side effect when `action`
    // does not replay against `currentState`.
    //
    // `valid()` is a REFERENCE-equality staleness guard against the state
    // we are about to dispatch from (a cancelled/undone/reloaded game gets a
    // brand new `board`/`players`/`turn` object graph) — it must run BEFORE
    // `currentState` is reassigned to our own freshly-computed `expected`,
    // never after, or it would always fail (a pure `applyAction` call never
    // returns a reference `getCurrentState()` could ever equal). Agreement
    // with the real post-dispatch state is instead a CONTENT check
    // (`gameplayDigest`), once the real commit comes back.
    const dispatchOne = async (action: AIAction): Promise<'ok' | 'illegal' | 'abort'> => {
      if (!valid()) return 'abort';
      if (!isLegalAction(currentState, action)) return 'illegal';
      // The cosmetic `thinkingDelay` pauses BEFORE each dispatch, exactly as
      // the pre-M3 per-action loop did (DESIGN §6.2: it "stays per dispatched
      // action, outside the budget"). Pausing after the dispatch instead would
      // make the AI play its first action the instant the search returns and
      // then sit still — a stutter, not thinking. `valid()` runs again after
      // the pause because it is an await: an undo/reload/restart can land in it.
      if (thinkingDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, thinkingDelay));
        if (!valid()) return 'abort';
      }
      const expected = applyAction(currentState, action);
      // React may commit after the next timer tick. Await an explicit state
      // update rather than assuming a zero-delay timeout acknowledges dispatch.
      const committed = hasAuthoritativeState ? new Promise<GameState | null>(resolve => { pendingCommit.current = resolve; }) : null;
      onAction(action); turnActions.push(action);
      currentState = expected;
      if (committed) {
        const actual = await committed;
        if (!actual || token !== generation.current) return 'abort';
        if (gameplayDigest(actual) !== gameplayDigest(expected)) return 'abort';
        currentState = actual;
      } else if (token !== generation.current) {
        return 'abort';
      }
      return 'ok';
    };
    try {
      while (currentState.phase === 'playing' && currentState.turn.currentPlayer === playerId && token === generation.current) {
        if (!fellBack) {
          let turn;
          try {
            turn = await client.current.findBestTurn(currentState, difficulty, TURN_BUDGET_MS[difficulty], turnActions.length);
          } catch (e) {
            if (e instanceof SearchCancelled) throw e;
            fellBack = true;
            setWarning(`Whole-turn search failed (${e instanceof Error ? e.message : String(e)}); falling back to step-by-step search.`);
            continue;
          }
          if (!valid()) break;
          remainingCPU = Math.max(0, remainingCPU - turn.timeMs);
          setLastDebug(turn.debug ?? null);
          setWarning(turn.fallback ? `AI engine fell back (${turn.fallback}).` : client.current.warning ?? null);
          // An empty plan explicitly finishes the phase, exactly like the
          // per-action loop's `proposed ?? phaseEndAction(...)`.
          const plan = turn.actions.length > 0 ? turn.actions : [phaseEndAction(currentState)];
          let outcome: 'ok' | 'illegal' | 'abort' = 'ok';
          for (const action of plan) {
            if (token !== generation.current) return;
            outcome = await dispatchOne(action);
            if (outcome !== 'ok') break;
            if (currentState.phase !== 'playing' || currentState.turn.currentPlayer !== playerId) break;
          }
          if (outcome === 'illegal') { fellBack = true; continue; }
          if (outcome === 'abort') break;
          // outcome === 'ok': either the turn is over (outer while exits) or
          // the plan ran out mid-turn (budget/phase boundary) — re-request a
          // fresh whole-turn search from the now-live state.
          continue;
        }

        // Legacy per-action loop: unchanged fallback for the remainder of the turn.
        const decisionsRemaining = currentState.turn.phase === 'action' ? Math.max(1, currentState.turn.actionsRemaining) : 4;
        const allowance = remainingCPU / decisionsRemaining;
        const result = await client.current.findBestAction(currentState, difficulty, allowance, turnActions.length);
        remainingCPU = Math.max(0, remainingCPU - result.timeMs);
        if (!valid()) break;
        setLastDebug(result.debug ?? null); setWarning(client.current.warning ?? null);
        const proposed = result.plan.actions[0];
        // Empty plans explicitly finish the phase. Invalid proposals are an
        // engine error, not a hidden pass/resignation.
        const action = proposed ?? phaseEndAction(currentState);
        const outcome = await dispatchOne(action);
        if (outcome === 'illegal') throw new Error('AI proposed an invalid action. Please retry.');
        if (outcome === 'abort') break;
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
