/**
 * The `HardEngine` bot adapter (DESIGN §7.7's "Bot adapter").
 *
 * The harness asks for ONE action at a time; the hard engine thinks in whole
 * turns. The adapter therefore searches once per turn and hands the plan out
 * action by action, keyed `${turnNumber}:${currentPlayer}` — re-planning
 * whenever the live state stops matching what continuing the cached plan
 * predicted (a fresh game, an opponent interleaving unexpectedly, or the plan
 * running out mid-turn).
 *
 * DESIGN §7.7 writes the key as `${turnNumber}:${currentPlayer}:${phase}`, but
 * a whole-turn plan SPANS the two phases — it is `PAY_UPKEEP`, the buys,
 * `END_PLACE_PHASE`, the action line, `END_ACTION_PHASE` — so a key carrying
 * the phase would throw the plan away halfway through and re-search the action
 * phase from scratch, at double the budget and against a position the place
 * plan was chosen for. The phase is dropped from the key; the predicted-state
 * digest below is strictly stronger than what it was guarding against. See
 * DEVIATIONS under M14.
 *
 * Every action is re-validated with `isLegalAction` immediately before it is
 * emitted, exactly as `useAI.ts` does on the shipped path. An action the
 * canonical engine will not take is a REPLICA DIVERGENCE: the adapter drops the
 * rest of the plan, counts it, and returns `null` so the runner substitutes
 * `phaseEndAction` (`lab/harness/runner.ts`) rather than pushing an illegal
 * action into the game. `hardBotDivergences()` exposes the process-wide count;
 * `lab/hard-ai/ladder/worker.ts` folds it into each `GameRecord.anomalies` so a
 * sharded ladder can report `replicaDivergences` without any cross-process
 * plumbing.
 *
 * A fresh engine per game (DESIGN §7.7) keeps one game's transposition table
 * and device profile out of the next one's search.
 */
import { isLegalAction } from '../../../src/game/legality';
import { applyAction } from '../../../src/ai/simulate';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { HardEngine } from '../../../src/ai/hard/engine';
import { DESKTOP, LAB, MIDRANGE, PHONE, type HardConfig, type Weights } from '../../../src/ai/hard/config';
import type { EngineBot } from '../../harness/types';

export type HardWork = { mode: 'fixed'; units: number } | { mode: 'wall'; ms: number };

export interface HardBotOptions {
  work: HardWork;
  /** `hard@<label>`'s label, or an explicit config patch. */
  profile?: string | Partial<HardConfig>;
  weights?: Weights;
  name?: string;
}

/**
 * The `GameRecord.anomalies` marker a divergence writes.
 * `lab/hard-ai/ladder/worker.ts` appends it per game and `ladder/run.ts` counts
 * it; it lives HERE rather than in `worker.ts` because importing a VALUE from
 * that module would execute its top-level `main()` in the ladder's parent
 * process.
 */
export const HARD_DIVERGENCE_ANOMALY = 'hard-replica-divergence';

/** Process-wide replica-divergence count (see the module header). */
let divergences = 0;

export function hardBotDivergences(): number {
  return divergences;
}

export function resetHardBotDivergences(): void {
  divergences = 0;
}

/**
 * `hard@<label>` -> a `HardConfig` patch (DESIGN §7.7's engine registry).
 *
 * `lab` is the fixed-work lab profile; a `-<n>k`/`-<n>m` suffix on it is
 * documentary (the ladder's own `--work` decides the budget) and is accepted so
 * `hard@lab-400k` names the same engine as `hard@lab`. `lab-dfpn` and
 * `lab-refined` are the M16/M17 arms, which turn on exactly the flags their
 * milestone owns.
 */
export function hardConfigFor(label: string): Partial<HardConfig> {
  const base = label.replace(/-(?:\d+(?:k|m)|units)$/i, '');
  switch (base) {
    case '':
    case 'lab':
      return { ...LAB };
    case 'lab-dfpn':
      return { ...LAB, useDfpn: true };
    case 'lab-refined':
      return { ...LAB, useLmr: true, useAspiration: true, useFutility: true, useExtensions: true };
    case 'desktop':
      return { ...DESKTOP };
    case 'midrange':
      return { ...MIDRANGE };
    case 'phone':
    case 'mobile':
      return { ...PHONE };
    default:
      throw new Error(
        `hard@${label}: unknown label. Known: lab, lab-dfpn, lab-refined, desktop, midrange, phone (an optional -<n>k/-<n>m suffix is documentary)`,
      );
  }
}

export function hardConfigHash(label: string, work: HardWork): string {
  const workKey = work.mode === 'fixed' ? `fixed:${work.units}` : `wall:${work.ms}`;
  return `hard:${label}:${workKey}`;
}

/** Gameplay-relevant digest (mirrors `useAI.ts`'s and `ladder/engines.ts`'s):
 * used only to detect whether the live state still matches what the cached plan
 * predicted, since `applyAction` returns a fresh object on every call. */
function gameplayDigest(s: GameState): string {
  return JSON.stringify({ board: s.board, players: s.players, turn: s.turn, phase: s.phase, winner: s.winner, upkeepPending: s.upkeepPending });
}

export function createHardBot(opts: HardBotOptions): EngineBot {
  const patch = typeof opts.profile === 'string' || opts.profile === undefined ? hardConfigFor(typeof opts.profile === 'string' ? opts.profile : 'lab') : opts.profile;
  const name = opts.name ?? `hard@${typeof opts.profile === 'string' ? opts.profile : 'lab'}`;
  let engine: HardEngine | null = null;
  let plan: AIAction[] = [];
  let planIndex = 0;
  let expectedDigest: string | null = null;
  let planKey = '';

  return {
    kind: 'engine',
    name,
    onGameStart(_player: PlayerId, seed: number) {
      engine = new HardEngine(patch);
      if (opts.weights !== undefined) engine.setWeights(opts.weights);
      engine.setSeed(seed);
      plan = [];
      planIndex = 0;
      expectedDigest = null;
      planKey = '';
    },
    async nextAction(state: GameState, player: PlayerId): Promise<AIAction | null> {
      if (state.turn.currentPlayer !== player || state.phase !== 'playing') return null;
      engine ??= new HardEngine(patch);
      const key = `${state.turn.turnNumber}:${state.turn.currentPlayer}`;
      const stale = planIndex >= plan.length || expectedDigest === null || gameplayDigest(state) !== expectedDigest || key !== planKey;
      if (stale) {
        const result = await engine.searchTurn(
          state,
          opts.work.mode === 'fixed' ? { work: opts.work.units } : { targetMs: opts.work.ms },
        );
        plan = result.actions;
        planIndex = 0;
        planKey = key;
      }
      while (planIndex < plan.length) {
        const action = plan[planIndex++];
        if (!isLegalAction(state, action)) {
          // The replica proposed something the canonical engine refuses. Drop
          // the rest of the plan and let the runner end the phase.
          divergences++;
          plan = [];
          planIndex = 0;
          expectedDigest = null;
          return null;
        }
        expectedDigest = gameplayDigest(applyAction(state, action));
        return action;
      }
      return null;
    },
  };
}
