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
 *
 * EVALUATION WEIGHTS. The adapter resolves them itself (`hardEnginePatch`):
 * the profile constants carry M4's `placeholder-m4` vector and `HardEngine`
 * substitutes `DEFAULT_WEIGHTS` only for a caller that passes no `weights`
 * field, so passing a profile object straight through made every `hard@*` row
 * a material-only evaluation. Every `hard@*` ladder row recorded before this
 * fix ran the placeholder.
 *
 * ONE WALL ALLOWANCE PER TURN (E0.2). `work.ms` funds a TURN, not a search.
 * The first search under a turn key is funded with the whole allowance; every
 * re-search inside that same turn key — a plan that ran out mid-turn, a digest
 * mismatch, the dropped plan after a divergence — is funded with whatever
 * measured wall time is LEFT of it, and each search debits the remainder by
 * its own measured elapsed. This is the accounting
 * `lab/hard-ai/ladder/engines.ts` already does for the `aiv2` bots. Without it
 * a turn that re-searches three times spends `3 × work.ms` and the ladder's
 * two engines are not playing the same match. Fixed-work mode has no clock and
 * is unchanged: every search gets `work.units`.
 *
 * THE REMAINDER IS A BUDGET, NOT A FORFEIT (AMENDMENTS-DECIDED A10, option
 * (a)). Every stale plan is re-searched, however little of the allowance is
 * left: the search is funded with `max(1, remaining)` and the overrun it
 * causes is COUNTED (`overruns`, `maxTurnMs`), exactly as the `aiv2` arms do
 * (`engines.ts` floors at 1 ms and never forfeits). The pre-A10 rule — under
 * `HARD_BOT_MIN_SEARCH_MS` left, return `null` and let the runner end the
 * phase — bought its timing honesty with STRENGTH, and only for `hard@*`: the
 * seat threw away the rest of its turn, so an asymmetry in the accounting was
 * being charged to one engine's play. `budgetExhausted` survives as the
 * DIAGNOSTIC it should always have been: the number of re-searches that
 * started with less than `HARD_BOT_MIN_SEARCH_MS` of the allowance left. An
 * already-cached plan is still handed out action by action after the remainder
 * is gone — those actions were paid for by the search that produced them.
 *
 * DEADLINE (AMENDMENTS-DECIDED A11). In wall mode the adapter passes the same
 * number as `targetMs` AND `deadlineMs` (`src/ai/hard/engine.ts`): the rung is
 * sized for the remaining allowance and the engine's abort watchdog fires at
 * the end of it, instead of at `abortFactor × target` — three times the
 * allowance, which is what E0.5 measured (turns at 1.15×-1.67× `work.ms`). The
 * engine's clock starts after packing and the table build, and the adapter's
 * own legality checks sit outside it too, so a turn still runs slightly past
 * its allowance; that residue is what `overruns`/`maxTurnMs` report. Fixed-work
 * mode passes neither.
 *
 * EMPTY PLAN. A search can come back with no actions at all — a position the
 * replica cannot pack, a position already decided, or nothing completed before
 * the deadline. The adapter counts it (`timing.emptyPlans`) and returns `null`,
 * so `lab/harness/runner.ts` substitutes `phaseEndAction` and the phase ends
 * legally, the same exit a divergence takes. It never emits an action it did
 * not get.
 *
 * TIMING COUNTERS. Every bot instance owns its counters (`EngineBot.timing`,
 * reset in `onGameStart`), and `lab/harness/runner.ts` writes them into
 * `PlayerGameStats.hardTiming` — which is what lets `ladder/run.ts` attribute
 * A10's and A16's columns PER ARM in a Hard-vs-Hard row, where the
 * process-wide counters cannot be split and used to be reported as `n/a`
 * (E1.4 §5's prerequisite for pricing the calibration patch). `hardBotTiming()`
 * keeps reporting the process-wide SUM over every hard bot in the process, next
 * to `hardBotDivergences()`, for `lab/hard-ai/ladder/worker.ts` to fold into
 * its records. `totalAdapterMs` measures the WHOLE `nextAction` call plus the
 * per-game engine construction in `onGameStart`, which is the number the
 * allowance is about: `HardEngine.searchTurn` starts its own clock only AFTER
 * packing, table building and the book probe (`engine.ts`), so
 * `ctx.stats.elapsedMs` undercounts every search, and engine startup is
 * outside it entirely.
 */
import { isLegalAction } from '../../../src/game/legality';
import { applyAction } from '../../../src/ai/simulate';
import type { GameState, PlayerId } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { HardEngine } from '../../../src/ai/hard/engine';
import { now } from '../../../src/ai/hard/search/time';
import type { RootResult } from '../../../src/ai/hard/search/root';
import { DESKTOP, LAB, MIDRANGE, PHONE, type HardConfig, type Weights } from '../../../src/ai/hard/config';
import { readFileSync } from 'node:fs';
import { DEFAULT_WEIGHTS, loadWeights } from '../../../src/ai/hard/eval/weights';
import type { EngineBot, HardSeatTurnRow } from '../../harness/types';
import { ablationConfigFor } from '../ablate/arms';

export type HardWork = { mode: 'fixed'; units: number } | { mode: 'wall'; ms: number };

/**
 * The slice of `HardEngine` this adapter drives. Declared so a test can hand
 * `createEngine` a recording stub and pin the allowance arithmetic without a
 * real search (`tests/lab/turn-allowance.test.ts`); `HardEngine` satisfies it.
 */
export interface HardEngineLike {
  searchTurn(state: GameState, opts?: { work?: number; targetMs?: number; deadlineMs?: number }): Promise<RootResult>;
  setSeed(seed: number): void;
  setWeights(weights: Weights): void;
}

/**
 * One work rung, `WORK_LADDER[0] / unitsPerMs` on the reference box: the
 * smallest wall budget a search can hope to finish inside, because `chooseWork`
 * (`src/ai/hard/search/time.ts`) clamps every budget up to `WORK_LADDER[0]` =
 * 25e3 units. Since A10 it is a DIAGNOSTIC threshold only — a re-search funded
 * with less still happens and is counted in `timing.budgetExhausted` (see the
 * module header); it is no longer a forfeit.
 */
export const HARD_BOT_MIN_SEARCH_MS = 25;

export interface HardBotOptions {
  work: HardWork;
  /** `hard@<label>`'s label, or an explicit config patch. */
  profile?: string | Partial<HardConfig>;
  weights?: Weights;
  name?: string;
  /** Engine factory; defaults to `new HardEngine(patch)` (tests inject a stub). */
  createEngine?: (patch: Partial<HardConfig>) => HardEngineLike;
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
 * Process-wide adapter timing (see the module header).
 *
 * `turns` counts turn keys this process's hard bots were asked to act on;
 * `searches` counts `searchTurn` calls and `reSearches` the ones that were not
 * the first of their turn. `totalSearchMs` is measured around `searchTurn`,
 * `totalAdapterMs` around the whole `nextAction` (so it also carries packing,
 * table building, engine construction and the adapter's own legality checks).
 * `overruns` counts turns whose total adapter time exceeded `work.ms` (wall
 * mode only) and `maxTurnMs` is the worst such total. `budgetExhausted` counts
 * the SEARCHES that started with less than `HARD_BOT_MIN_SEARCH_MS` of the
 * turn's allowance left (A10: a diagnostic, not a forfeit — the search happens
 * anyway), and `emptyPlans` the searches that came back with no actions, which
 * end the phase through `runner.ts`'s `phaseEndAction`.
 *
 * HOW OFTEN THE DEADLINE BIT (A16). `abortedSearches` counts the searches the
 * engine abandoned on its watchdog (`stats.stopReason === 'abort'`) rather than
 * on the work rung, and `firstSearchAborted` the GAMES whose very first search
 * did (per instance that is 0 or 1: a bot plays one game between
 * `onGameStart` calls) — the cold-start case, where the device profile is still
 * `INITIAL_UNITS_PER_MS` and therefore an unmeasured guess about the box.
 * E1.1's artifacts could not say either number: the reviewer had to infer "26
 * of 32 first turns were deadline-cut" from turn times. Both are carried per
 * game by `ladder/worker.ts` and reported per arm by `ladder/run.ts`
 * (`abortRate = abortedSearches / searches`).
 */
export interface HardBotTiming {
  turns: number;
  searches: number;
  reSearches: number;
  totalSearchMs: number;
  totalAdapterMs: number;
  overruns: number;
  maxTurnMs: number;
  budgetExhausted: number;
  emptyPlans: number;
  abortedSearches: number;
  firstSearchAborted: number;
  /** E2 lane 1's per-search rows. Present on a BOT's own `timing()`, never on
   * the process-wide sum: a row belongs to one seat, and two hard seats in one
   * process would interleave. */
  turnRows?: HardSeatTurnRow[];
}

function emptyTiming(): HardBotTiming {
  return {
    turns: 0, searches: 0, reSearches: 0, totalSearchMs: 0, totalAdapterMs: 0, overruns: 0, maxTurnMs: 0,
    budgetExhausted: 0, emptyPlans: 0, abortedSearches: 0, firstSearchAborted: 0,
  };
}

let timing: HardBotTiming = emptyTiming();

/**
 * The process-wide SUM over every hard bot this process has built. Kept for
 * `ladder/worker.ts`'s per-game snapshot-and-subtract and for anything else
 * that reads it; the per-ARM truth is each bot's own `timing()` (E1.5).
 */
export function hardBotTiming(): HardBotTiming {
  return { ...timing };
}

export function resetHardBotTiming(): void {
  timing = emptyTiming();
}

/**
 * `hard@<label>` -> a `HardConfig` patch (DESIGN §7.7's engine registry).
 *
 * `lab` is the fixed-work lab profile; a `-<n>k`/`-<n>m` suffix on it is
 * documentary (the ladder's own `--work` decides the budget) and is accepted so
 * `hard@lab-400k` names the same engine as `hard@lab`. `lab-dfpn` and
 * `lab-refined` are the M16/M17 arms, which turn on exactly the flags their
 * milestone owns.
 *
 * `ablate:<arm>` (E1.3) is the one label that is not a fixed profile name: it
 * looks the arm up in `lab/hard-ai/ablate/arms.ts` and returns `DESKTOP` under
 * that arm's one-factor patch. It is checked BEFORE the documentary-suffix
 * strip so an arm may be named `k96` without the `-<n>k` rule touching it, and
 * it is purely additive — every label above resolves exactly as it did before,
 * `hard@desktop` included (`tests/lab/baseline-identity.test.ts` pins its hash).
 */
export function hardConfigFor(label: string): Partial<HardConfig> {
  const ablation = ablationConfigFor(label);
  if (ablation !== null) return ablation;
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
        `hard@${label}: unknown label. Known: lab, lab-dfpn, lab-refined, desktop, midrange, phone, ` +
          `ablate:<arm> (an optional -<n>k/-<n>m suffix is documentary)`,
      );
  }
}

/**
 * The patch the adapter actually hands `HardEngine`: a profile from
 * `hardConfigFor` (or an explicit one) with its EVALUATION WEIGHTS resolved.
 *
 * `hardConfigFor` returns a full `HardConfig`, so its `weights` field is always
 * present — M4's `placeholder-m4` vector, 58 zeros, i.e. material-only
 * evaluation. `HardEngine`'s constructor substitutes `DEFAULT_WEIGHTS` only
 * when the caller passes NO `weights` field (`src/ai/hard/engine.ts`), so
 * handing it a profile object silently opted every `hard@*` ladder row out of
 * the trained evaluation. The substitution is done HERE instead, explicitly:
 * an explicit `weights` argument wins, otherwise a placeholder (`version 0`)
 * becomes `DEFAULT_WEIGHTS` and any other vector is kept as given. The profile
 * constants themselves are untouched — `hardConfigFor`'s return is what
 * `src/ai/hard/config.ts` defines, for every other caller.
 */
let envWeightsCache: { path: string; weights: Weights } | null = null;
function envWeights(path: string): Weights {
  if (envWeightsCache === null || envWeightsCache.path !== path) {
    envWeightsCache = { path, weights: loadWeights(JSON.parse(readFileSync(path, 'utf8'))) };
    console.error(`hard bot: MUJU_HARD_WEIGHTS -> ${envWeightsCache.weights.label} (${path})`);
  }
  return envWeightsCache.weights;
}

export function hardEnginePatch(profile: string | Partial<HardConfig> = 'lab', weights?: Weights): Partial<HardConfig> {
  const patch: Partial<HardConfig> = typeof profile === 'string' ? hardConfigFor(profile) : { ...profile };
  // SCRATCH EXPERIMENT HOOK (not for merge as-is): MUJU_HARD_WEIGHTS=<weights json> overrides every hard@* bot in this process.
  if (weights === undefined && process.env.MUJU_HARD_WEIGHTS) weights = envWeights(process.env.MUJU_HARD_WEIGHTS);
  const resolved = weights ?? (patch.weights === undefined || patch.weights.version === 0 ? DEFAULT_WEIGHTS : patch.weights);
  return { ...patch, weights: resolved };
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
  const patch = hardEnginePatch(opts.profile ?? 'lab', opts.weights);
  const name = opts.name ?? `hard@${typeof opts.profile === 'string' ? opts.profile : 'lab'}`;
  const createEngine = opts.createEngine ?? ((p: Partial<HardConfig>): HardEngineLike => new HardEngine(p));
  let engine: HardEngineLike | null = null;
  let plan: AIAction[] = [];
  let planIndex = 0;
  let expectedDigest: string | null = null;
  let planKey = '';
  // The turn's unspent wall allowance (wall mode only) and the key it belongs
  // to, plus this turn's measured adapter total for the overrun counters.
  let remainingMs = 0;
  let turnKey = '';
  let turnAdapterMs = 0;
  let turnOverrunCounted = false;
  let searchedThisTurn = false;
  // A16: the cold-start question — did THIS game's very first search run out
  // of wall clock before it ran out of work rung?
  let searchedThisGame = false;
  // E1.5: this instance's own counters, reset per game in `onGameStart`. Every
  // increment below lands here AND in the process-wide `timing`, so
  // `hardBotTiming()` is unchanged (it is now explicitly the sum) while
  // `lab/harness/runner.ts` can record this seat's share on the game record.
  // `maxTurnMs` is the only non-additive field, and here it is a true per-game
  // maximum, which a process-wide high-water mark cannot be.
  let local: HardBotTiming = emptyTiming();
  // E2 lane 1: one row per SEARCH, in order, for THIS instance's game. The
  // process-wide `timing` deliberately does not carry them — a row belongs to
  // a seat, and two hard seats in one process would interleave. Reset with the
  // rest of the counters in `onGameStart`.
  let turnRows: HardSeatTurnRow[] = [];
  const count = (field: Exclude<keyof HardBotTiming, 'maxTurnMs' | 'turnRows'>, n = 1): void => {
    timing[field] += n;
    local[field] += n;
  };

  const decide = async (state: GameState): Promise<AIAction | null> => {
    engine ??= createEngine(patch);
    const key = `${state.turn.turnNumber}:${state.turn.currentPlayer}`;
    if (key !== turnKey) {
      turnKey = key;
      // A new turn is a new allowance: `work.ms` in full, nothing spent yet.
      remainingMs = opts.work.mode === 'wall' ? opts.work.ms : 0;
      turnAdapterMs = 0;
      turnOverrunCounted = false;
      searchedThisTurn = false;
      count('turns');
    }
    const stale = planIndex >= plan.length || expectedDigest === null || gameplayDigest(state) !== expectedDigest || key !== planKey;
    if (stale) {
      // A10: the remainder funds the search, it never cancels it. `max(1, …)`
      // is `engines.ts`'s floor for the `aiv2` arms, so both engines of a
      // ladder row treat a spent allowance the same way; A11's `deadlineMs`
      // keeps the search inside what it was funded with.
      const fundedMs = Math.max(1, remainingMs);
      if (opts.work.mode === 'wall' && remainingMs < HARD_BOT_MIN_SEARCH_MS) count('budgetExhausted');
      const searchStartedAt = now();
      const result = await engine.searchTurn(
        state,
        opts.work.mode === 'fixed' ? { work: opts.work.units } : { targetMs: fundedMs, deadlineMs: fundedMs },
      );
      const searchMs = now() - searchStartedAt;
      count('searches');
      if (searchedThisTurn) count('reSearches');
      searchedThisTurn = true;
      // A16: `stopReason` is the engine's own verdict on why it stopped —
      // 'abort' is the watchdog (A11: the allowance), 'work' the rung.
      const abortedSearch = result.stats.stopReason === 'abort';
      // E2 lane 1's per-turn instrument. Every field is already computed —
      // `stats.rung` and the two `unitsPerMs` readings are E2 lane 1 additions
      // to `HardSearchStats`, which is not part of any configuration hash — so
      // the row costs one object push per search and nothing in `src/`. The
      // root exposure is NOT turned on here: it allocates per search, and a
      // ladder row has to stay comparable with the E1 rows measured without it,
      // so `rootTrace` is left to the analyser's own re-runs.
      turnRows.push({
        turn: state.turn.turnNumber,
        rung: result.stats.rung,
        work: result.work,
        elapsedMs: result.stats.elapsedMs,
        searchMs,
        fundedMs: opts.work.mode === 'wall' ? fundedMs : 0,
        depth: result.depth,
        stopReason: result.stats.stopReason,
        unitsPerMsBefore: result.stats.unitsPerMsBefore,
        unitsPerMsAfter: result.stats.unitsPerMsAfter,
        deadlineCut: abortedSearch,
      });
      if (abortedSearch) count('abortedSearches');
      if (!searchedThisGame && abortedSearch) count('firstSearchAborted');
      searchedThisGame = true;
      count('totalSearchMs', searchMs);
      if (opts.work.mode === 'wall') remainingMs = Math.max(0, remainingMs - searchMs);
      plan = result.actions;
      planIndex = 0;
      planKey = key;
      if (plan.length === 0) {
        // Nothing to hand out: let the runner end the phase legally rather
        // than emit an action the search never produced (module header).
        count('emptyPlans');
        expectedDigest = null;
        return null;
      }
    }
    while (planIndex < plan.length) {
      const action = plan[planIndex++];
      if (!isLegalAction(state, action)) {
        // The replica proposed something the canonical engine refuses. Drop
        // the rest of the plan and let the runner end the phase. The turn's
        // remainder is NOT restored: the search that produced the illegal
        // plan spent it, and the re-search this forces draws on what is left.
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
  };

  return {
    kind: 'engine',
    name,
    onGameStart(_player: PlayerId, seed: number) {
      // Engine construction (transposition tables included) is startup the
      // ladder pays for per game and `runner.ts`'s per-seat `decisionMs` never
      // sees, so `totalAdapterMs` carries it. It belongs to no turn, so it is
      // deliberately outside `turnAdapterMs` and the overrun counters.
      const startupStartedAt = now();
      engine = createEngine(patch);
      if (opts.weights !== undefined) engine.setWeights(opts.weights);
      engine.setSeed(seed);
      // The reset comes FIRST: this instance's counters are per game, and the
      // startup this call is timing belongs to the game about to start.
      local = emptyTiming();
      count('totalAdapterMs', now() - startupStartedAt);
      plan = [];
      planIndex = 0;
      expectedDigest = null;
      planKey = '';
      remainingMs = 0;
      turnKey = '';
      turnAdapterMs = 0;
      turnOverrunCounted = false;
      searchedThisTurn = false;
      searchedThisGame = false;
      turnRows = [];
    },
    /** This instance's counters for the game it is playing (E1.5). */
    timing(): HardBotTiming {
      return { ...local, turnRows: turnRows.map(r => ({ ...r })) };
    },
    async nextAction(state: GameState, player: PlayerId): Promise<AIAction | null> {
      if (state.turn.currentPlayer !== player || state.phase !== 'playing') return null;
      const adapterStartedAt = now();
      try {
        return await decide(state);
      } finally {
        // Everything the decision cost the harness, search or not: the runner
        // charges the seat for the whole `nextAction` call (`lab/harness/runner.ts`).
        const adapterMs = now() - adapterStartedAt;
        count('totalAdapterMs', adapterMs);
        turnAdapterMs += adapterMs;
        if (turnAdapterMs > timing.maxTurnMs) timing.maxTurnMs = turnAdapterMs;
        if (turnAdapterMs > local.maxTurnMs) local.maxTurnMs = turnAdapterMs;
        if (opts.work.mode === 'wall' && !turnOverrunCounted && turnAdapterMs > opts.work.ms) {
          count('overruns');
          turnOverrunCounted = true;
        }
      }
    },
  };
}
