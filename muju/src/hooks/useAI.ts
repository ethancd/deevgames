import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState } from '../game/types';
import type { AIAction, AIDifficulty, AIDebugInfo } from '../ai/types';
import { AIWorkerClient, SearchCancelled } from '../ai/worker/client';
import { aiTurnBudgetMs, DEFAULT_AI_PACE, type AIPace } from '../ai/turnTime';
import { applyAction } from '../ai/simulate';
import { isLegalAction, phaseEndAction } from '../game/legality';
import { fallbackKindFor, noteHardBudgetExhausted, noteHardPlanReplayed, noteHardRequest, noteHardTurn, readHardTurnBudgetMs, recordHardFallback, resolveHardAiRoute } from '../ai/hardOptIn';

interface UseAIOptions {
  difficulty?: AIDifficulty; thinkingDelay?: number; enabled?: boolean;
  /** This seat's whole-turn allowance within its difficulty; see `ai/turnTime`. */
  pace?: AIPace;
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

/** Floor for a search once the turn's budget is spent: the whole-turn
 * re-request has always used it, and E5.1 gives the per-action fallback the
 * same floor on the hard path (an unfloored zero share comes back with an
 * empty plan and silently passes the phase). Exported so the tests can name
 * the constant rather than restate its value. */
export const MIN_TURN_SEARCH_MS = 1;

export function useAI(options: UseAIOptions = {}) {
  const { difficulty: initialDifficulty = 'medium', pace = DEFAULT_AI_PACE, thinkingDelay = 500, enabled = true, getCurrentState } = options;
  const [difficulty, setDifficulty] = useState<AIDifficulty>(initialDifficulty);
  const [isThinking, setIsThinking] = useState(false);
  /**
   * The turn in flight, for the stopwatch — and it counts SEARCH time, because
   * that is what the allowance buys. `budgetMs` is what this turn was funded
   * with, `spentMs` what its finished searches have already been debited (read
   * off the same `remainingCPU` the engines are funded from, never a second
   * ledger), and `searchingSince` is `performance.now()` at the start of the
   * request now in flight, or `null` when none is.
   *
   * WHY NOT WALL TIME SINCE THE TURN STARTED, which is what this used to be.
   * The 400 ms per-action `thinkingDelay`, the worker round trips and React's
   * own commits all happen OUTSIDE the budget (`dispatchOne` below says so, and
   * `useAI` debits only `turn.timeMs`/`result.timeMs`), so a wall-clock dial on
   * a 10 s allowance emptied while the seat was still dispatching a perfectly
   * funded turn. With `searchingSince` null between searches the dial pauses
   * instead, which is what is actually happening.
   */
  const [turnClock, setTurnClock] = useState<{ budgetMs: number; spentMs: number; searchingSince: number | null } | null>(null);
  const [lastTurnActions, setLastTurnActions] = useState<AIAction[]>([]);
  const [lastDebug, setLastDebug] = useState<AIDebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const pendingCommit = useRef<((state: GameState | null) => void) | null>(null);
  useEffect(() => { if (options.state && pendingCommit.current) { const resolve = pendingCommit.current; pendingCommit.current = null; resolve(options.state); } }, [options.state]);
  const hasAuthoritativeState = options.state !== undefined;
  const client = useRef<AIWorkerClient | null>(null);
  const generation = useRef(0), busy = useRef(false);
  /** Whether this game's Hard seat runs the real `HardEngine`, resolved ONCE
   * PER GAME START: `null` means "not read yet", and `cancel` — which every
   * new game, restart, load, undo and difficulty change already runs through —
   * puts it back. A flag flipped mid-turn therefore cannot split one turn
   * across two engines. */
  const hardOptIn = useRef<boolean | null>(null);
  /** `?hardMs`'s override of the Hard seat's whole-turn budget, read once per
   * game the same way. `undefined` is "not read yet"; `null` is "no override",
   * which is the ordinary case and must not trigger a re-read (and a second
   * log line) every turn. */
  const hardBudgetMs = useRef<number | null | undefined>(undefined);
  const currentGetter = useRef(getCurrentState); currentGetter.current = getCurrentState;
  const cancel = useCallback(() => { pendingCommit.current?.(null); pendingCommit.current = null; generation.current++; busy.current = false; hardOptIn.current = null; hardBudgetMs.current = undefined; client.current?.restart(); setIsThinking(false); setTurnClock(null); }, []);
  const clearLastTurnActions = useCallback(() => { setLastTurnActions([]); setLastDebug(null); }, []);
  useEffect(() => { cancel(); }, [difficulty, enabled, cancel]);
  useEffect(() => { setDifficulty(initialDifficulty); }, [initialDifficulty]);
  useEffect(() => () => { pendingCommit.current?.(null); pendingCommit.current = null; generation.current++; client.current?.cancel(); }, []);

  const executeAITurn = useCallback(async (state: GameState, onAction: (action: AIAction) => void, playerId: 'white' | 'black') => {
    if (!enabled || busy.current || state.phase !== 'playing' || state.turn.currentPlayer !== playerId) return;
    client.current ??= new AIWorkerClient();
    hardOptIn.current ??= resolveHardAiRoute();
    if (hardBudgetMs.current === undefined) hardBudgetMs.current = readHardTurnBudgetMs();
    // THE ONLY GATE ON THE REAL ENGINE. DESIGN §6.4's release flag has landed
    // (`hardEnabled`, true since the E6 release decision of 2026-09-18), so
    // `resolveHardAiRoute()` resolves `optOut ? false : hardEnabled ||
    // readHardAiOptIn()`: Hard runs the real engine by default, and a player
    // who opts out (`?hardAi=0`, `localStorage['muju.hardAi']='0'`) gets
    // byte-for-byte the request this hook sent before E5.1 — `engine` absent,
    // the v2 whole-turn path, no `HardEngine` module loaded in the worker.
    // Easy and medium are untouched either way.
    const useHard = hardOptIn.current && difficulty === 'hard';
    const token = ++generation.current;
    // `?hardMs` funds the HARD SEAT only; easy and medium keep the pace's
    // allowance whatever the URL says. The player's own choice is
    // `aiTurnBudgetMs(difficulty, pace)` (`ai/turnTime.ts`) — difficulty picks
    // the engine, pace picks how much of the clock it is given.
    const turnBudgetMs = difficulty === 'hard' && hardBudgetMs.current !== null && hardBudgetMs.current !== undefined
      ? hardBudgetMs.current : aiTurnBudgetMs(difficulty, pace);
    busy.current = true; setIsThinking(true); setError(null);
    // The stopwatch is funded exactly like the search. Nothing is spent yet and
    // nothing is searching yet, so it starts full and still.
    setTurnClock({ budgetMs: turnBudgetMs, spentMs: 0, searchingSince: null });
    const turnActions: AIAction[] = [];
    let currentState = state, remainingCPU = turnBudgetMs;
    // The two ends of one search, for the dial only — they read the allowance
    // ledger, they never write it. `searchStarted` hands the dial the timestamp
    // it runs from; `searchEnded` freezes it at whatever `remainingCPU` now
    // says the turn has left. A stale turn (undo, restart, difficulty change)
    // owns no clock: `cancel` has already cleared it.
    const searchStarted = () => {
      if (token !== generation.current) return;
      const at = performance.now();
      setTurnClock(clock => clock === null ? clock : { ...clock, searchingSince: at });
    };
    const searchEnded = () => {
      if (token !== generation.current) return;
      const spentMs = Math.min(turnBudgetMs, Math.max(0, turnBudgetMs - remainingCPU));
      setTurnClock(clock => clock === null ? clock : { ...clock, spentMs, searchingSince: null });
    };
    // The whole-turn path (DESIGN §6.2, M3) is the default for every
    // difficulty on AIEngineV2. Any illegal proposal drops to the legacy
    // per-action loop for the rest of this turn (§6.4's fallback layer 3,
    // adapted for the v2/JS path: there is no replica to verify against, so
    // "divergence" here means the dispatched prefix stopped matching legality).
    let fellBack = false;
    // Wall clock of the in-flight whole-turn request, so a REJECTED one can
    // still be charged to the turn (see the `catch` below).
    let requestStartedAt = 0;
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
            // ONE ALLOWANCE PER TURN. The pace's budget funds a TURN, not a
            // search: a plan that runs out mid-turn (or an illegal proposal
            // that drops to the per-action loop below) re-requests from
            // `remainingCPU`, what measured search time has left of the turn,
            // never the full budget again. Floored at `MIN_TURN_SEARCH_MS` so
            // a spent budget still asks for a legal plan rather than a
            // zero-budget search.
            if (useHard) noteHardRequest();
            requestStartedAt = performance.now();
            searchStarted();
            // THE SINGLE CALL SITE THAT FUNDS AN ENGINE, and `decisionMs` is
            // the whole allowance contract for BOTH of them — no per-engine
            // field, no config patch (`worker/handler.ts`):
            //   hard: `searchTurn(state, { targetMs: decisionMs, deadlineMs:
            //     decisionMs })`. An explicit `targetMs` is used verbatim, so
            //     it sizes the work rung ABOVE the device profile's own
            //     `time.maxMs` (6000 desktop / 2500 phone) and the ladder now
            //     reaches far enough for 60 s to buy a longer search rather
            //     than the same one (`hard/search/time.ts WORK_LADDER`).
            //   v2: `findBestAction(state, decisionMs)` with the worker's own
            //     `scaleToBudget` on, which raises the search's work limits to
            //     fit the allowance (`engine-v2.ts scaleConfigForBudget`).
            // Both return as soon as they are ready and neither waits the
            // clock out, so a move landing with the wedge half full is the
            // engines working as designed, not a budget that failed to arrive.
            // Nowhere else in this hook decides what an engine may spend.
            turn = await client.current.findBestTurn(currentState, difficulty, Math.max(MIN_TURN_SEARCH_MS, remainingCPU), turnActions.length,
              useHard ? { engine: 'hard' } : undefined);
          } catch (e) {
            if (e instanceof SearchCancelled) throw e;
            // (c) worker failure or watchdog timeout. A THROW REPORTS NO
            // `timeMs`, so the success-path debit below never runs and the
            // turn would be re-funded IN FULL for the v2 loop — worst of all
            // for the client watchdog, which by construction waits longer
            // than the whole allowance before it rejects. Charge the measured
            // wall time of the failed request here instead, so the per-action
            // loop continues on what the turn has LEFT. Hard only: the v2
            // default path keeps its pre-E5.1 behaviour exactly.
            if (useHard) {
              remainingCPU = Math.max(0, remainingCPU - (performance.now() - requestStartedAt));
              recordHardFallback('workerError', e instanceof Error ? e.message : String(e));
            }
            // Whatever the failure cost the turn, the dial stops counting here.
            searchEnded();
            fellBack = true;
            setWarning(`Whole-turn search failed (${e instanceof Error ? e.message : String(e)}); falling back to step-by-step search.`);
            continue;
          }
          if (!valid()) break;
          remainingCPU = Math.max(0, remainingCPU - turn.timeMs);
          searchEnded();
          setLastDebug(turn.debug ?? null);
          setWarning(turn.fallback ? `AI engine fell back (${turn.fallback}).` : client.current.warning ?? null);
          if (useHard) {
            noteHardTurn(turn.engineUsed);
            // (a) the engine reported its own failure — `PackError`, a throw
            // inside `searchTurn`, or a replica divergence. It returns no plan
            // in every one of those cases, so there is nothing to replay.
            if (turn.fallback) { recordHardFallback(fallbackKindFor(turn.fallback), `engine reported ${turn.fallback}`); fellBack = true; continue; }
            // (b)-like: Hard proposing nothing at all is a failure, not a
            // considered pass. The v2 path decides what this turn should be
            // (and will end the phase itself if that is the right answer).
            if (turn.actions.length === 0) { recordHardFallback('emptyPlan'); fellBack = true; continue; }
          }
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
          // (b) invalid suffix: an action inside the plan that the CANONICAL
          // rules refuse. `dispatchOne` has already replayed every action
          // before it through `isLegalAction`/`applyAction`, so the legal
          // prefix stands and only the rest of the plan is dropped — the same
          // policy `lab/hard-ai/bots/hard.ts` applies in the lab.
          if (outcome === 'illegal') { if (useHard) recordHardFallback('invalidSuffix'); fellBack = true; continue; }
          if (outcome === 'abort') break;
          if (useHard) noteHardPlanReplayed();
          // outcome === 'ok': either the turn is over (outer while exits) or
          // the plan ran out mid-turn (budget/phase boundary) — re-request a
          // fresh whole-turn search from the now-live state.
          continue;
        }

        // Legacy per-action loop: unchanged fallback for the remainder of the turn.
        const decisionsRemaining = currentState.turn.phase === 'action' ? Math.max(1, currentState.turn.actionsRemaining) : 4;
        // A spent turn must still ASK for a legal action. An unfloored share
        // of an exhausted remainder is a zero-budget search, which comes back
        // with an empty plan and silently passes the phase; the whole-turn
        // path above has floored at `MIN_TURN_SEARCH_MS` for exactly this
        // reason since M3. The floor binding means the turn overran its
        // allowance, which is a fact worth counting rather than hiding. Hard
        // only, so the v2 default path keeps its arithmetic byte for byte.
        const share = remainingCPU / decisionsRemaining;
        let allowance = share;
        if (useHard && share < MIN_TURN_SEARCH_MS) { allowance = MIN_TURN_SEARCH_MS; noteHardBudgetExhausted(); }
        searchStarted();
        const result = await client.current.findBestAction(currentState, difficulty, allowance, turnActions.length);
        remainingCPU = Math.max(0, remainingCPU - result.timeMs);
        searchEnded();
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
      if (token === generation.current) { busy.current = false; setLastTurnActions(turnActions); setIsThinking(false); setTurnClock(null); }
    }
  }, [difficulty, pace, enabled, thinkingDelay, hasAuthoritativeState]);
  return { isThinking, executeAITurn, difficulty, setDifficulty, lastTurnActions, lastDebug, clearLastTurnActions,
    cancel, error, warning, clearError: () => setError(null),
    // The turn in flight, for `AIThinkingTimer`: the allowance, the search time
    // already debited from it, and — only while a search is actually running —
    // when that search started. The AI moves as soon as it is ready, so all
    // three go back to null the moment the turn ends.
    turnBudgetMs: turnClock?.budgetMs ?? null, turnSpentMs: turnClock?.spentMs ?? null,
    turnSearchingSince: turnClock?.searchingSince ?? null };
}
