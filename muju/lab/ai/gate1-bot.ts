/** Fixed-work V2 adapter for Gate 1. No wall-clock decisions or solver fallback. */
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { phaseEndAction, isLegalAction } from '../../src/game/legality';
import { defaultUpkeepAction } from '../../src/game/upkeep';
import type { GameState, PlayerId } from '../../src/game/types';
import type { TacticalSolver } from '../../src/ai/wasm/kernel';
import type { EngineBot } from '../harness/types';

export type GateDifficulty = 'hard' | 'medium';
/**
 * Per-own-turn fixed work, per engine. A3 §3 removed the hard-coded
 * `{ hard: 6000, medium: 3000 }` of A1/A2 — those were asserted, never measured,
 * and an independent diagnosis put them at 3–15% of what the two engines consume
 * at their shipped pace, unequally between the arms. The budgets now come from a
 * calibration manifest (`gate1-calibrate.ts`) and there is no default: a row
 * without a calibration cannot be configured at all.
 */
export type GateBudgets = Record<GateDifficulty, number>;
export type Searcher = Pick<AIEngineV2, 'setConfig' | 'setSeed' | 'setTacticalSolver' | 'findBestAction'>;
export interface DecisionWork {
  turn: number; phase: 'action' | 'place' | 'upkeep';
  requested: number; remaining: number; elapsedMs: number;
  stopReason: string; tacticalNodes: number;
}

/** Reserve upkeep and Prepare slices even while Act still has actions. */
export function workSlice(state: GameState, remaining: number): number {
  const decisions = state.upkeepPending ? 3 : state.turn.phase === 'action'
    ? state.turn.actionsRemaining + 3 : 2;
  return Math.min(remaining, Math.max(1, Math.floor(remaining / decisions)));
}

export function createGateBot(difficulty: GateDifficulty, solver: TacticalSolver,
  workPerTurn: number, factory: () => Searcher = () => new AIEngineV2(difficulty)) {
  if (!Number.isSafeInteger(workPerTurn) || workPerTurn < 1) throw new Error('Positive integer turn work required');
  let engine: Searcher, turnKey = '', remaining = 0;
  let resolved: Record<string, unknown> | undefined;
  const decisions: DecisionWork[] = [];
  const bot: EngineBot = {
    kind: 'engine', name: `aiv2-${difficulty}`,
    onGameStart(_player, seed) {
      engine = factory(); engine.setSeed(seed); engine.setTacticalSolver(solver);
      turnKey = ''; remaining = 0; resolved = undefined; decisions.length = 0;
    },
    async nextAction(state: GameState, player: PlayerId) {
      if (state.ruleset !== 'phasing' || state.phase !== 'playing' || player !== state.turn.currentPlayer) {
        throw new Error('Gate 1 adapter requires the active Phasing seat');
      }
      const key = `${state.turn.turnNumber}:${player}`;
      if (key !== turnKey) { turnKey = key; remaining = workPerTurn; }
      const requested = workSlice(state, remaining);
      remaining -= requested; // Charge the full slice, including early search completion.
      const phase = state.upkeepPending ? 'upkeep' : state.turn.phase;
      if (!requested) {
        // fixedWork=0 means WALL MODE in V2. Never call it when the allowance runs out.
        const action = state.upkeepPending ? defaultUpkeepAction(state) : phaseEndAction(state);
        if (!isLegalAction(state, action)) throw new Error('Illegal allowance completion');
        decisions.push({ turn: state.turn.turnNumber, phase, requested, remaining,
          elapsedMs: 0, stopReason: 'allowance-completion', tacticalNodes: 0 });
        return action;
      }
      engine.setConfig({ fixedWork: requested });
      const result = await engine.findBestAction(state, Infinity);
      if (!result.debug) throw new Error('Missing resolved engine config');
      resolved = { ...result.debug.config, fixedWork: 'allocated per decision' };
      if (result.stats?.stopReason === 'deadline') throw new Error('Wall deadline in fixed-work row');
      const action = result.plan.actions[0]; // Re-search every dispatched action; never replay a suffix.
      if (!action || !isLegalAction(state, action)) throw new Error(`Invalid engine emission: ${JSON.stringify(action)}`);
      decisions.push({ turn: state.turn.turnNumber, phase, requested, remaining,
        elapsedMs: result.timeMs, stopReason: result.stats?.stopReason ?? 'unknown',
        tacticalNodes: result.stats?.tacticalNodes ?? 0 });
      return action;
    },
  };
  return { bot, decisions, resolvedConfig: () => {
    if (!resolved) throw new Error('No resolved V2 config yet');
    return { difficulty, search: resolved, budget: { mode: 'fixed', workPerTurn,
      allocation: 'floor(remaining/(upkeep?3:Act?actionsRemaining+3:2)), min 1 while funded',
      charge: 'full requested slice', exhausted: 'default upkeep or phase end' },
    dispatch: 'first action then re-search', resign: false, solver: 'wasm ABI 7; required' };
  } };
}
