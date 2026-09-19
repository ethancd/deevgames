/**
 * Fixed-work V2 adapter for Gate 1: the SHIPPED whole-turn loop, funded in work
 * units instead of milliseconds. No wall-clock decisions, no solver fallback.
 *
 * WHAT THIS FILE GOT WRONG, AND WHY IT MATTERED MORE THAN THE BUDGET DID.
 *
 * A3 §3 removed the asserted `{ hard: 6000, medium: 3000 }` of A1/A2 and made the
 * budgets come from a calibration (`gate1-calibrate.ts`). The calibration measures
 * the shipped loop: ONE allowance per own turn, one search returning a multi-action
 * plan, that plan replayed action by action, and a fresh search only when the plan
 * runs out or stops replaying legally (`src/hooks/useAI.ts`, and
 * `src/ai/worker/handler.ts`'s `mode: 'turn'` branch, which is the only place the
 * v2 engine is handed a whole-turn allowance with `scaleToBudget` on). It records
 * about two to three searches per turn.
 *
 * The adapter measured something else. It re-searched EVERY action and gave each
 * search `floor(remaining / (actionsRemaining + 3))` — about a seventh of the turn
 * — and then charged the FULL requested slice whether the search used it or not.
 * So even with a perfectly calibrated total, each individual decision was made at
 * roughly 15-35% of the depth the same engine reaches when a player plays it: the
 * row would have measured a baseline nobody ships, and would have measured the two
 * arms unequally, since the two engines' plans are not the same length. A budget
 * that is right in total and wrong per decision is not a fixed-work version of the
 * shipped engine; it is a different engine.
 *
 * WHAT IT DOES NOW, POINT BY POINT AGAINST THE HOOK.
 *
 *  - ONE ALLOWANCE PER OWN TURN. `remaining` is set to `workPerTurn` when the
 *    `turnNumber:player` key changes and is never refilled inside a turn — the
 *    hook's `remainingCPU = turnBudgetMs`, debited and never reset.
 *  - DEBITED BY WHAT THE SEARCH SPENT, not by what it asked for. The hook debits
 *    `result.timeMs`. The fixed-work analogue is the work counter `fixedWork`
 *    caps, read through `gate1-work.ts`'s meter. A search that finishes early
 *    leaves the rest of the turn funded, exactly as a fast search does in the
 *    browser.
 *  - PLAN REPLAY. The whole plan is queued and dispatched action by action. A
 *    fresh search happens only when the queue empties or its head no longer
 *    replays legally (the hook's `dispatchOne` → `'illegal'` → drop the suffix).
 *  - AN ILLEGAL FIRST ACTION IS STILL AN ERROR. The hook's per-action fallback
 *    throws "AI proposed an invalid action"; here the head of a FRESH plan that
 *    does not replay throws, while an invalid SUFFIX is dropped, counted and
 *    re-searched. Dropping the first action too would hide a legality defect,
 *    which is Gate 0's whole subject.
 *
 * A PHASING TURN SPANS ACT AND PREPARE UNDER THE SAME MOVER, so one allowance has
 * to cover both, plus the upkeep decision between them (`src/game/turn.ts`:
 * `END_ACTION_PHASE` → income → `upkeepPending` at phase `place` → Prepare →
 * `END_PLACE_PHASE` → hand-off). Codex's phasing self-play
 * (`lab/ai/phasing-selfplay.ts`) is where the reservation comes from: it sliced
 * the remainder by `actionsRemaining + 3` at Act, 3 at upkeep and 2 at Prepare, so
 * that ending the action phase could never leave Prepare unfunded. It needed one
 * slice per remaining DECISION because it re-searched every action. With plan
 * replay a turn holds at most three searches, so the reservation here is per
 * remaining SEGMENT, and it is a FLOOR rather than an equal split: each segment
 * still to be searched reserves `workPerTurn / PREPARE_RESERVE_DIVISOR`, and the
 * current search gets everything else. Act therefore keeps three quarters of the
 * turn (the hook gives its first search the whole clock), Prepare is guaranteed
 * its eighth however greedy Act's plan was, and the last segment of a turn always
 * requests the entire remainder so nothing is stranded.
 */
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { phaseEndAction, isLegalAction } from '../../src/game/legality';
import { defaultUpkeepAction } from '../../src/game/upkeep';
import type { AIAction } from '../../src/ai/types';
import type { GameState, PlayerId } from '../../src/game/types';
import type { TacticalSolver } from '../../src/ai/wasm/kernel';
import type { EngineBot } from '../harness/types';
import type { WorkMeter } from './gate1-work';

export type GateDifficulty = 'hard' | 'medium';
/**
 * Per-own-turn fixed work, per engine. There is no default: a row without a
 * calibration manifest cannot be configured at all (A3 §3).
 */
export type GateBudgets = Record<GateDifficulty, number>;
export type Searcher = Pick<AIEngineV2, 'setConfig' | 'setSeed' | 'setTacticalSolver' | 'findBestAction'>;

/**
 * Each hand-off segment that still has to be searched after the current one
 * reserves `workPerTurn / this` from the current search. Eight is chosen so the
 * first search of a turn keeps three quarters of the allowance — the shipped loop
 * gives it all of it — while the two later segments keep a floor they cannot be
 * starved below. It is stated here, and printed in the report header, because it
 * is the one place this adapter departs from the hook.
 */
export const PREPARE_RESERVE_DIVISOR = 8;

export interface DecisionWork {
  turn: number; phase: 'action' | 'place' | 'upkeep';
  /** 'search' funded a new plan; 'replay' dispatched one already paid for. */
  kind: 'search' | 'replay' | 'allowance-completion';
  /** The `fixedWork` cap this search was given; 0 for a replay. */
  requested: number;
  /** What the search ACTUALLY consumed, off the work meter; 0 for a replay. */
  spent: number;
  /** The turn's allowance after this decision was charged. */
  remaining: number;
  elapsedMs: number;
  stopReason: string;
  tacticalNodes: number;
  /** Actions the search returned; the queue this replay is being drawn from. */
  planLength: number;
}

/**
 * How many hand-off segments of this own turn still have to be searched AFTER the
 * one the mover is in. Act is followed by the upkeep decision and Prepare; the
 * upkeep decision by Prepare; Prepare by nothing.
 */
export function segmentsAfter(state: GameState): number {
  if (state.upkeepPending) return 1;
  return state.turn.phase === 'action' ? 2 : 0;
}

/** The floor this decision must leave behind for the rest of its own turn. */
export function prepareReserve(state: GameState, workPerTurn: number): number {
  return segmentsAfter(state) * Math.floor(workPerTurn / PREPARE_RESERVE_DIVISOR);
}

/**
 * The `fixedWork` one search is funded with: everything the turn has left, less
 * the floor reserved for the segments that still have to be searched. Never more
 * than the remainder, and never zero while the turn is funded at all.
 */
export function turnWorkRequest(state: GameState, remaining: number, workPerTurn: number): number {
  if (remaining <= 0) return 0;
  return Math.min(remaining, Math.max(1, remaining - prepareReserve(state, workPerTurn)));
}

export interface GateBotOptions {
  /** The row's installed work meter. Debiting the turn needs the real counter. */
  meter: WorkMeter;
  factory?: () => Searcher;
}

export function createGateBot(difficulty: GateDifficulty, solver: TacticalSolver,
  workPerTurn: number, options: GateBotOptions) {
  if (!Number.isSafeInteger(workPerTurn) || workPerTurn < 1) throw new Error('Positive integer turn work required');
  const { meter } = options;
  if (!meter) throw new Error('Gate 1 adapter requires the row work meter (gate1-work.ts)');
  const factory = options.factory ?? (() => new AIEngineV2(difficulty));
  let engine: Searcher, turnKey = '', remaining = 0;
  let queue: AIAction[] = [];
  let resolved: Record<string, unknown> | undefined;
  const decisions: DecisionWork[] = [];
  /** Plans abandoned because their suffix stopped replaying legally, as the hook
   * abandons one. Reported, because a row that does it often is telling us the
   * planner and the canonical rules disagree about something. */
  let invalidSuffixes = 0;
  const bot: EngineBot = {
    kind: 'engine', name: `aiv2-${difficulty}`,
    onGameStart(_player, seed) {
      engine = factory(); engine.setSeed(seed); engine.setTacticalSolver(solver);
      turnKey = ''; remaining = 0; resolved = undefined; decisions.length = 0;
      queue = []; invalidSuffixes = 0;
    },
    async nextAction(state: GameState, player: PlayerId) {
      if (state.ruleset !== 'phasing' || state.phase !== 'playing' || player !== state.turn.currentPlayer) {
        throw new Error('Gate 1 adapter requires the active Phasing seat');
      }
      const key = `${state.turn.turnNumber}:${player}`;
      // ONE ALLOWANCE PER OWN TURN, covering Act, upkeep and Prepare together.
      if (key !== turnKey) { turnKey = key; remaining = workPerTurn; queue = []; }
      const phase = state.upkeepPending ? 'upkeep' : state.turn.phase;
      // The hook drops a plan the moment it stops replaying legally, and keeps
      // the legal prefix it has already dispatched. So does this.
      if (queue.length && !isLegalAction(state, queue[0])) {
        invalidSuffixes++;
        queue = [];
      }
      if (!queue.length) {
        const requested = turnWorkRequest(state, remaining, workPerTurn);
        if (!requested) {
          // fixedWork=0 means WALL MODE in V2. Never call it when the allowance
          // runs out: finish the segment with the canonical default instead.
          const action = state.upkeepPending ? defaultUpkeepAction(state) : phaseEndAction(state);
          if (!isLegalAction(state, action)) throw new Error('Illegal allowance completion');
          decisions.push({ turn: state.turn.turnNumber, phase, kind: 'allowance-completion',
            requested: 0, spent: 0, remaining, elapsedMs: 0, stopReason: 'allowance-completion',
            tacticalNodes: 0, planLength: 0 });
          return action;
        }
        engine.setConfig({ fixedWork: requested });
        meter.reset();
        const result = await engine.findBestAction(state, Infinity);
        // What the search SPENT, not what it asked for. Floored at one unit so a
        // search that somehow spends nothing cannot loop the turn forever.
        const spent = Math.min(requested, Math.max(1, meter.read()));
        remaining = Math.max(0, remaining - spent);
        if (!result.debug) throw new Error('Missing resolved engine config');
        resolved = { ...result.debug.config, fixedWork: 'allocated per search' };
        if (result.stats?.stopReason === 'deadline') throw new Error('Wall deadline in fixed-work row');
        const plan = result.plan.actions;
        if (!plan.length || !isLegalAction(state, plan[0])) {
          throw new Error(`Invalid engine emission: ${JSON.stringify(plan[0] ?? null)}`);
        }
        queue = [...plan];
        decisions.push({ turn: state.turn.turnNumber, phase, kind: 'search', requested, spent, remaining,
          elapsedMs: result.timeMs, stopReason: result.stats?.stopReason ?? 'unknown',
          tacticalNodes: result.stats?.tacticalNodes ?? 0, planLength: plan.length });
      } else {
        decisions.push({ turn: state.turn.turnNumber, phase, kind: 'replay', requested: 0, spent: 0, remaining,
          elapsedMs: 0, stopReason: 'plan-replay', tacticalNodes: 0, planLength: queue.length });
      }
      const action = queue.shift();
      if (!action || !isLegalAction(state, action)) {
        throw new Error(`Invalid engine emission: ${JSON.stringify(action ?? null)}`);
      }
      return action;
    },
  };
  return {
    bot, decisions,
    /** Searches per own turn, the number the calibration reports for the shipped
     * loop. Printed side by side in the report header so the reader can see
     * whether the row's loop is pacing like the one that was measured. */
    searchesPerTurn(): number[] {
      const byTurn = new Map<number, number>();
      for (const d of decisions) {
        if (d.kind !== 'search') continue;
        byTurn.set(d.turn, (byTurn.get(d.turn) ?? 0) + 1);
      }
      return [...byTurn.values()];
    },
    invalidSuffixes: () => invalidSuffixes,
    resolvedConfig: () => {
      if (!resolved) throw new Error('No resolved V2 config yet');
      return { difficulty, search: resolved, budget: { mode: 'fixed', workPerTurn,
        allocation: `remaining - segmentsAfter * floor(workPerTurn / ${PREPARE_RESERVE_DIVISOR}), min 1 while funded`,
        charge: 'work actually spent (SearchBudget#spend, floored at 1)',
        exhausted: 'default upkeep or phase end' },
      dispatch: 'shipped whole-turn loop: one search per hand-off segment, plan replayed, re-searched only when ' +
        'the plan runs out or its head stops replaying legally (src/hooks/useAI.ts)',
      resign: false, solver: 'wasm ABI 7; required' };
    },
  };
}
