// @vitest-environment node
/**
 * E0.2, "one turn allowance": `lab/hard-ai/bots/hard.ts`'s wall budget funds a
 * TURN, so every re-search inside the same turn must draw on what measured
 * time is LEFT of it. Before E0.2 every stale plan re-armed the full
 * `work.ms`, which let a turn that re-planned three times spend `3 × work.ms`
 * (and, with `config.time.abortFactor` 3 on top, up to nine times a single
 * search's nominal allowance).
 *
 * AMENDED 2026-09-16 (AMENDMENTS-DECIDED A10, A11). The remainder is a budget,
 * not a forfeit: a stale plan is ALWAYS re-searched, funded with
 * `max(1, remaining)` as the `aiv2` arms are, and the overrun it causes is
 * counted rather than avoided by throwing the rest of the turn away.
 * `budgetExhausted` survives as the diagnostic count of searches that started
 * with under `HARD_BOT_MIN_SEARCH_MS` left. Every wall-mode search also passes
 * that same number as A11's `deadlineMs`, so the engine's abort watchdog fires
 * at the end of the allowance instead of at `abortFactor × target`.
 *
 * The engine here is a stub (`HardBotOptions.createEngine`) that records the
 * `targetMs`/`work` it was funded with and advances vitest's fake clock by a
 * scripted amount, so the arithmetic is pinned exactly instead of sampled.
 * The STATES are real: every plan is built out of `lab/harness/legal.ts`'s
 * legal set (or deliberately outside it), applied with the canonical
 * `applyAction`, so the adapter's `isLegalAction` re-validation and its
 * predicted-state digest are exercised for real.
 *
 * `playPlies` below is `lab/harness/runner.ts`'s decision loop in miniature:
 * ask the bot, substitute `phaseEndAction` when it returns `null`, apply.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIAction } from '../../src/ai/types';
import type { GameState, PlayerId } from '../../src/game/types';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction, phaseEndAction } from '../../src/game/legality';
import { legalActions } from '../../lab/harness/legal';
import { newSearchStats } from '../../src/ai/hard/search/pvs';
import { getAllSpawnPositions } from '../../src/game/spawning';
import { buildState } from '../ai/hard/game-fixture';
import {
  HARD_BOT_MIN_SEARCH_MS,
  createHardBot,
  hardBotDivergences,
  hardBotTiming,
  hardConfigFor,
  hardEnginePatch,
  resetHardBotDivergences,
  resetHardBotTiming,
  type HardEngineLike,
} from '../../lab/hard-ai/bots/hard';
import { LAB, type HardConfig, type Weights } from '../../src/ai/hard/config';
import { DEFAULT_WEIGHTS } from '../../src/ai/hard/eval/weights';
import type { EngineBot } from '../../lab/harness/types';

const WALL_MS = 3000;

interface SearchCall {
  targetMs: number | undefined;
  deadlineMs: number | undefined;
  work: number | undefined;
  turnNumber: number;
  phase: 'place' | 'action';
}

/** One scripted search: the plan it returns, the wall time it "spends", and
 * (A16) why the engine says it stopped — the adapter reads `stopReason` off
 * the result to count `abortedSearches`. */
interface ScriptedSearch {
  plan: (state: GameState) => AIAction[];
  elapsedMs: number;
  stopReason?: 'complete' | 'work' | 'abort';
}

/**
 * A `HardEngine` stand-in. The last scripted entry repeats, so a test that
 * cares about the first two searches does not have to script the tail.
 */
function recordingEngine(script: readonly ScriptedSearch[], calls: SearchCall[]): HardEngineLike {
  let index = 0;
  return {
    setSeed(): void {},
    setWeights(): void {},
    async searchTurn(state, opts) {
      const step = script[Math.min(index, script.length - 1)];
      index++;
      calls.push({
        targetMs: opts?.targetMs,
        deadlineMs: opts?.deadlineMs,
        work: opts?.work,
        turnNumber: state.turn.turnNumber,
        phase: state.turn.phase,
      });
      // Fake time only ever moves here, so every counter below is exact.
      vi.advanceTimersByTime(step.elapsedMs);
      const stats = newSearchStats();
      if (step.stopReason !== undefined) stats.stopReason = step.stopReason;
      // E2 lane 1's instrument reads these three off the stats; a real engine
      // writes them in `searchRoot` and `searchTurn`.
      stats.rung = 200_000;
      stats.elapsedMs = step.elapsedMs;
      stats.unitsPerMsBefore = 100;
      stats.unitsPerMsAfter = 110;
      return {
        actions: step.plan(state),
        scoreCc: 0,
        depth: 1,
        work: 123_456,
        stats,
        source: 'search',
        endKey: '',
      };
    },
  };
}

function wallBot(script: readonly ScriptedSearch[], calls: SearchCall[]): EngineBot {
  return createHardBot({ work: { mode: 'wall', ms: WALL_MS }, createEngine: () => recordingEngine(script, calls) });
}

/** `runner.ts`'s loop: ask, fall back to `phaseEndAction` on `null`, apply. */
async function playPlies(bot: EngineBot, start: GameState, player: PlayerId, plies: number): Promise<GameState> {
  let state = start;
  for (let i = 0; i < plies; i++) {
    const action = await bot.nextAction(state, player);
    state = applyAction(state, action ?? phaseEndAction(state));
  }
  return state;
}

function moveFor(state: GameState, unitId: string): AIAction {
  const move = legalActions(state, state.turn.currentPlayer).find(a => a.type === 'MOVE' && a.unitId === unitId);
  if (move === undefined) throw new Error(`no legal move for ${unitId}`);
  return move;
}

/** Two white units with room to move, one black unit so the game is live. */
function twoMovers(turnNumber = 1): GameState {
  return buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 2, y: 2, id: 'w0' },
      { def: 'fire_1', owner: 'white', x: 5, y: 5, id: 'w1' },
      { def: 'fire_1', owner: 'black', x: 9, y: 8, id: 'b0' },
    ],
    current: 'white',
    phase: 'action',
    actions: 4,
    turnNumber,
  });
}

/** Place phase, enough crystal for a tier-1 buy. */
function placePhase(opts: { upkeepPending: boolean }): GameState {
  return buildState({
    units: [
      { def: 'fire_1', owner: 'white', x: 2, y: 2, id: 'w0' },
      { def: 'fire_1', owner: 'black', x: 9, y: 8, id: 'b0' },
    ],
    white: 50,
    whiteGained: 50,
    current: 'white',
    phase: 'place',
    actions: 4,
    turnNumber: 1,
    upkeepPending: opts.upkeepPending,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  resetHardBotTiming();
  resetHardBotDivergences();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hard bot wall allowance', () => {
  it('funds a forced re-search from the turn remainder, not a fresh work.ms', async () => {
    const calls: SearchCall[] = [];
    // Half a plan: the adapter runs out of actions mid-turn and must re-search.
    const bot = wallBot(
      [
        { plan: s => [moveFor(s, 'w0'), moveFor(s, 'w1')], elapsedMs: 1200 },
        { plan: s => [moveFor(s, 'w0')], elapsedMs: 400 },
      ],
      calls,
    );
    bot.onGameStart('white', 1);
    // Four plies: two from the first plan, then one per forced re-search.
    await playPlies(bot, twoMovers(), 'white', 4);

    expect(calls.map(c => c.targetMs)).toEqual([WALL_MS, WALL_MS - 1200, WALL_MS - 1600]);
    // A11: every wall-mode search is deadlined at exactly what funds it.
    expect(calls.map(c => c.deadlineMs)).toEqual([WALL_MS, WALL_MS - 1200, WALL_MS - 1600]);
    expect(calls.every(c => c.work === undefined)).toBe(true);
    expect(calls.every(c => c.turnNumber === 1)).toBe(true);
  });

  it('keeps the remainder across the place/action phase boundary of one turn', async () => {
    const calls: SearchCall[] = [];
    // A whole-turn plan as DESIGN §7.7 describes it: upkeep, a buy, the phase
    // end. The plan stops there, so the action phase forces a re-search — the
    // case the `${turn}:${player}:${phase}` key would have re-funded.
    const bot = wallBot(
      [
        {
          plan: s => [
            { type: 'PAY_UPKEEP', keepUnitIds: s.board.units.filter(u => u.owner === 'white').map(u => u.id) },
            { type: 'BUY_UNIT', definitionId: 'fire_1', position: getAllSpawnPositions('white', s.board)[0] },
            { type: 'END_PLACE_PHASE' },
          ],
          elapsedMs: 900,
        },
        { plan: s => [moveFor(s, 'w0')], elapsedMs: 300 },
      ],
      calls,
    );
    bot.onGameStart('white', 1);
    const after = await playPlies(bot, placePhase({ upkeepPending: true }), 'white', 4);

    expect(after.turn.turnNumber).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ phase: 'place', turnNumber: 1, targetMs: WALL_MS });
    // Same turn, later phase: the remainder, not a second full allowance.
    expect(calls[1]).toMatchObject({ phase: 'action', turnNumber: 1, targetMs: WALL_MS - 900 });
  });

  it('does not refund the allowance when an illegal action drops the plan', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot(
      [
        {
          // Second action is outside the legal set (no such definition), so the
          // adapter counts a divergence, drops the plan and returns null.
          plan: s => [
            { type: 'BUY_UNIT', definitionId: 'fire_1', position: getAllSpawnPositions('white', s.board)[0] },
            { type: 'BUY_UNIT', definitionId: 'not_a_unit', position: getAllSpawnPositions('white', s.board)[1] },
          ],
          elapsedMs: 1500,
        },
        { plan: s => [moveFor(s, 'w0')], elapsedMs: 200 },
      ],
      calls,
    );
    bot.onGameStart('white', 1);
    const after = await playPlies(bot, placePhase({ upkeepPending: false }), 'white', 3);

    expect(hardBotDivergences()).toBe(1);
    // The retry is still the same turn (the null ended the PLACE phase only).
    expect(after.turn.turnNumber).toBe(1);
    expect(calls.map(c => c.targetMs)).toEqual([WALL_MS, WALL_MS - 1500]);
  });

  it('resets the allowance on a new turn key', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot([{ plan: s => [moveFor(s, 'w0')], elapsedMs: 1100 }], calls);
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 2);
    await playPlies(bot, twoMovers(2), 'white', 1);

    expect(calls.map(c => ({ turn: c.turnNumber, targetMs: c.targetMs }))).toEqual([
      { turn: 1, targetMs: WALL_MS },
      { turn: 1, targetMs: WALL_MS - 1100 },
      { turn: 2, targetMs: WALL_MS },
    ]);
  });

  it('searches on an exhausted remainder instead of forfeiting the turn (A10)', async () => {
    const calls: SearchCall[] = [];
    const spent = WALL_MS - (HARD_BOT_MIN_SEARCH_MS - 1);
    const bot = wallBot(
      [
        { plan: s => [moveFor(s, 'w0')], elapsedMs: spent },
        // The overrun A10 accepts: 30 ms of search bought with 24 ms of
        // allowance. It is counted, not avoided.
        { plan: s => [moveFor(s, 'w1')], elapsedMs: 30 },
      ],
      calls,
    );
    bot.onGameStart('white', 1);
    const start = twoMovers();
    const first = await bot.nextAction(start, 'white');
    expect(first).not.toBeNull();
    const afterFirst = applyAction(start, first as AIAction);
    // Plan exhausted, remainder below one work rung: pre-A10 this forfeited
    // the rest of the turn. It now searches with what is left.
    const second = await bot.nextAction(afterFirst, 'white');

    expect(second).not.toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[1].targetMs).toBe(HARD_BOT_MIN_SEARCH_MS - 1);
    expect(calls[1].deadlineMs).toBe(HARD_BOT_MIN_SEARCH_MS - 1);
    // A diagnostic now, not a forfeit: the search happened and was counted.
    expect(hardBotTiming().budgetExhausted).toBe(1);
    expect(hardBotTiming().emptyPlans).toBe(0);
    // ... and the overrun it caused is charged to the turn, as it is for the
    // `aiv2` arms.
    expect(hardBotTiming().maxTurnMs).toBe(spent + 30);
    expect(hardBotTiming().overruns).toBe(1);
  });

  it('floors an entirely spent allowance at 1 ms rather than skipping the search', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot(
      [
        { plan: s => [moveFor(s, 'w0')], elapsedMs: WALL_MS + 500 },
        { plan: s => [moveFor(s, 'w1')], elapsedMs: 10 },
      ],
      calls,
    );
    bot.onGameStart('white', 1);
    const start = twoMovers();
    const first = await bot.nextAction(start, 'white');
    const second = await bot.nextAction(applyAction(start, first as AIAction), 'white');

    expect(second).not.toBeNull();
    // The remainder clamps at 0; `max(1, remaining)` is what `engines.ts` funds
    // the `aiv2` arms with, and A11's deadline keeps the search inside it.
    expect(calls.map(c => c.targetMs)).toEqual([WALL_MS, 1]);
    expect(calls.map(c => c.deadlineMs)).toEqual([WALL_MS, 1]);
    expect(hardBotTiming().budgetExhausted).toBe(1);
  });

  it('ends the phase legally when a search comes back with no plan', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot([{ plan: () => [], elapsedMs: 100 }], calls);
    bot.onGameStart('white', 1);
    const start = twoMovers();
    const action = await bot.nextAction(start, 'white');

    expect(action).toBeNull();
    expect(calls).toHaveLength(1);
    expect(hardBotTiming().emptyPlans).toBe(1);
    // The runner's substitute is legal and ends the phase, as the header says.
    const substitute = phaseEndAction(start);
    expect(isLegalAction(start, substitute)).toBe(true);
    expect(applyAction(start, substitute).turn.currentPlayer).toBe('black');
  });

  it('hands out an already-paid-for plan after the remainder is gone', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot([{ plan: s => [moveFor(s, 'w0'), moveFor(s, 'w1')], elapsedMs: WALL_MS }], calls);
    bot.onGameStart('white', 1);
    const start = twoMovers();
    const first = await bot.nextAction(start, 'white');
    const second = await bot.nextAction(applyAction(start, first as AIAction), 'white');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(hardBotTiming().budgetExhausted).toBe(0);
  });
});

describe('hard bot fixed-work mode', () => {
  it('funds every search of a turn with the same fixed work', async () => {
    const calls: SearchCall[] = [];
    const bot = createHardBot({
      work: { mode: 'fixed', units: 400_000 },
      createEngine: () =>
        recordingEngine(
          [
            { plan: s => [moveFor(s, 'w0')], elapsedMs: 5000 },
            { plan: s => [moveFor(s, 'w1')], elapsedMs: 5000 },
          ],
          calls,
        ),
    });
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(), 'white', 3);

    expect(calls).toHaveLength(3);
    expect(calls.every(c => c.work === 400_000 && c.targetMs === undefined && c.deadlineMs === undefined)).toBe(true);
    // No clock accounting at all in fixed mode, however long a search took.
    expect(hardBotTiming().budgetExhausted).toBe(0);
    expect(hardBotTiming().overruns).toBe(0);
  });
});

describe('per-turn rows (E2 lane 1)', () => {
  it('records one row per search, with the rung, the profile and why it stopped', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot(
      [
        { plan: s => [moveFor(s, 'w0')], elapsedMs: 2000 },
        { plan: s => [moveFor(s, 'w1')], elapsedMs: 2000, stopReason: 'abort' },
      ],
      calls,
    );
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 2);
    await playPlies(bot, twoMovers(2), 'white', 1);

    const rows = bot.timing?.()?.turnRows ?? [];
    expect(rows.length).toBe(calls.length);
    for (const row of rows) {
      expect(row.rung).toBe(200_000);
      expect(row.work).toBe(123_456);
      expect(row.unitsPerMsBefore).toBe(100);
      expect(row.unitsPerMsAfter).toBe(110);
      expect(row.depth).toBe(1);
      expect(row.searchMs).toBeGreaterThanOrEqual(0);
    }
    // Turn 1 is searched twice (the re-search), turn 2 once.
    expect(rows.map(r => r.turn)).toEqual([1, 1, 2]);
    // The first search is funded with the whole allowance, the second with the
    // remainder — the same arithmetic the allowance tests pin.
    expect(rows[0].fundedMs).toBe(WALL_MS);
    expect(rows[1].fundedMs).toBe(WALL_MS - 2000);
    // `deadlineCut` is the engine's own `stopReason`, not the adapter's clock.
    expect(rows.map(r => r.deadlineCut)).toEqual([false, true, true]);
    expect(rows.map(r => r.stopReason)).toEqual(['complete', 'abort', 'abort']);
  });

  it('is per seat and resets with the game', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot([{ plan: s => [moveFor(s, 'w0')], elapsedMs: 100 }], calls);
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 1);
    expect((bot.timing?.()?.turnRows ?? []).length).toBe(1);
    bot.onGameStart('white', 2);
    expect(bot.timing?.()?.turnRows).toEqual([]);
    // The process-wide sum never carries rows.
    expect(hardBotTiming().turnRows).toBeUndefined();
  });

  it('is fixed-work honest: no funded ms, no profile readings', async () => {
    const calls: SearchCall[] = [];
    const bot = createHardBot({
      work: { mode: 'fixed', units: 25_000 },
      createEngine: () => recordingEngine([{ plan: s => [moveFor(s, 'w0')], elapsedMs: 40 }], calls),
    });
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 1);
    const rows = bot.timing?.()?.turnRows ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].fundedMs).toBe(0);
  });
});

describe('hardBotTiming', () => {
  it('adds up searches, re-searches, adapter time and overruns per turn', async () => {
    const calls: SearchCall[] = [];
    // 2000 + 2000 against a 3000 ms allowance: the second search is funded with
    // the 1000 ms remainder and overruns it, which is what `overruns` counts.
    const bot = wallBot(
      [
        { plan: s => [moveFor(s, 'w0')], elapsedMs: 2000 },
        { plan: s => [moveFor(s, 'w1')], elapsedMs: 2000 },
      ],
      calls,
    );
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 2);
    await playPlies(bot, twoMovers(2), 'white', 1);

    const timing = hardBotTiming();
    expect(timing.turns).toBe(2);
    expect(timing.searches).toBe(3);
    expect(timing.reSearches).toBe(1);
    expect(calls.map(c => c.targetMs)).toEqual([WALL_MS, WALL_MS - 2000, WALL_MS]);
    expect(timing.totalSearchMs).toBe(6000);
    // The adapter total is measured around the whole `nextAction`, so it is
    // never less than the search time it contains.
    expect(timing.totalAdapterMs).toBeGreaterThanOrEqual(timing.totalSearchMs);
    expect(timing.maxTurnMs).toBe(4000);
    expect(timing.overruns).toBe(1);
    expect(timing.budgetExhausted).toBe(0);
  });

  /**
   * The ladder's overrun TOLERANCE (`ladder/run.ts --overrun-tolerance`,
   * AMENDMENTS-PENDING A14) is applied where the metric is derived, never here:
   * this counter stays the raw one, so a tolerance can be changed, or refused,
   * without re-running a single game.
   */
  it('counts a turn a few ms past the allowance as an overrun: the adapter applies no tolerance', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot([{ plan: s => [moveFor(s, 'w0')], elapsedMs: WALL_MS + 5 }], calls);
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 1);

    const timing = hardBotTiming();
    expect(timing.maxTurnMs).toBe(WALL_MS + 5);
    expect(timing.overruns).toBe(1);
  });

  it('counts engine startup and in-search packing in the adapter total', async () => {
    const calls: SearchCall[] = [];
    // Startup (transposition tables) and the packing/table build inside a
    // search are both time the turn allowance is really spent on, and neither
    // shows up in `HardEngine`'s own `stats.elapsedMs`. Here the factory costs
    // 50 ms and the search reports 600 ms of which 100 ms is "packing".
    const bot = createHardBot({
      work: { mode: 'wall', ms: WALL_MS },
      createEngine: () => {
        vi.advanceTimersByTime(50);
        return recordingEngine([{ plan: s => [moveFor(s, 'w0')], elapsedMs: 600 }], calls);
      },
    });
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(), 'white', 1);

    const timing = hardBotTiming();
    expect(timing.totalSearchMs).toBe(600);
    expect(timing.totalAdapterMs).toBe(650);
    // Startup belongs to no turn: it cannot make a turn look like an overrun.
    expect(timing.maxTurnMs).toBe(600);
    expect(timing.overruns).toBe(0);
  });

  /**
   * A16. E1.1's artifacts could not say how many searches the DEADLINE cut, so
   * the reviewer had to infer it from turn times ("26 of 32 first turns"). The
   * adapter counts it at the source now, and separates the cold-start case:
   * the first search of a game runs on a device profile that has measured
   * nothing (`INITIAL_UNITS_PER_MS`).
   */
  it('counts deadline-aborted searches and the games whose first search was one', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot(
      [
        // Turn 1: the first search of the game runs out of clock.
        { plan: s => [moveFor(s, 'w0')], elapsedMs: 1000, stopReason: 'abort' },
        // Its re-search stops on the work rung instead.
        { plan: s => [moveFor(s, 'w1')], elapsedMs: 200, stopReason: 'work' },
        // Turn 2 aborts again: counted in `abortedSearches`, but not in
        // `firstSearchAborted` — that is a per-GAME question.
        { plan: s => [moveFor(s, 'w0')], elapsedMs: 900, stopReason: 'abort' },
      ],
      calls,
    );
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 2);
    await playPlies(bot, twoMovers(2), 'white', 1);

    const timing = hardBotTiming();
    expect(timing.searches).toBe(3);
    expect(timing.abortedSearches).toBe(2);
    expect(timing.firstSearchAborted).toBe(1);
  });

  it('counts one firstSearchAborted per game, and none when the first search fits', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot([{ plan: s => [moveFor(s, 'w0')], elapsedMs: 100, stopReason: 'work' }], calls);
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 1);
    // A second game on the same process-wide counters: `onGameStart` re-arms
    // the per-game flag, so its own first search is asked the question again.
    bot.onGameStart('white', 2);
    await playPlies(bot, twoMovers(1), 'white', 1);

    const timing = hardBotTiming();
    expect(timing.searches).toBe(2);
    expect(timing.abortedSearches).toBe(0);
    expect(timing.firstSearchAborted).toBe(0);
  });

  /**
   * E1.5. `hardBotTiming()` is a PROCESS-WIDE sum, which is why
   * `ladder/run.ts` could only attribute A10's and A16's columns to a run with
   * exactly one `hard@` arm — and so could not report `firstSearchAborted` in
   * the very Hard-vs-Hard contest that prices the calibration patch (E1.4 §5,
   * "Two prerequisites"). Each bot instance now owns its counters and hands
   * them out through `EngineBot.timing()`; the process-wide sum is unchanged.
   */
  it('gives two hard bots in one process their own counters', async () => {
    const aCalls: SearchCall[] = [];
    const bCalls: SearchCall[] = [];
    // The "cold" arm: its first search runs out of clock. The "calibrated"
    // arm: its first search stops on the work rung, then aborts on turn 2.
    const cold = wallBot([{ plan: s => [moveFor(s, 'w0')], elapsedMs: 3000, stopReason: 'abort' }], aCalls);
    const warm = wallBot(
      [
        { plan: s => [moveFor(s, 'w0')], elapsedMs: 1500, stopReason: 'work' },
        { plan: s => [moveFor(s, 'w1')], elapsedMs: 1500, stopReason: 'abort' },
      ],
      bCalls,
    );
    cold.onGameStart('white', 1);
    warm.onGameStart('black', 2);
    await playPlies(cold, twoMovers(1), 'white', 1);
    await playPlies(warm, twoMovers(1), 'white', 1);
    await playPlies(warm, twoMovers(2), 'white', 1);

    const coldTiming = cold.timing?.();
    const warmTiming = warm.timing?.();
    expect(coldTiming).toBeDefined();
    expect(warmTiming).toBeDefined();
    // The statistic the contest turns on, per seat and not per process.
    expect(coldTiming?.firstSearchAborted).toBe(1);
    expect(warmTiming?.firstSearchAborted).toBe(0);
    expect(coldTiming?.abortedSearches).toBe(1);
    expect(warmTiming?.abortedSearches).toBe(1);
    expect(coldTiming?.searches).toBe(1);
    expect(warmTiming?.searches).toBe(2);
    expect(coldTiming?.totalSearchMs).toBe(3000);
    expect(warmTiming?.totalSearchMs).toBe(3000);
    // `maxTurnMs` is a true per-game maximum per instance, where the
    // process-wide counter can only offer a high-water mark.
    expect(coldTiming?.maxTurnMs).toBe(3000);
    expect(warmTiming?.maxTurnMs).toBe(1500);

    // Backward compatibility: the process-wide counters are the SUM.
    const total = hardBotTiming();
    expect(total.searches).toBe(3);
    expect(total.abortedSearches).toBe(2);
    expect(total.firstSearchAborted).toBe(1);
    expect(total.totalSearchMs).toBe(6000);
  });

  it('re-arms a bot instance\'s own counters at the start of each game', async () => {
    const calls: SearchCall[] = [];
    const bot = wallBot([{ plan: s => [moveFor(s, 'w0')], elapsedMs: 800, stopReason: 'abort' }], calls);
    bot.onGameStart('white', 1);
    await playPlies(bot, twoMovers(1), 'white', 1);
    expect(bot.timing?.()?.searches).toBe(1);

    bot.onGameStart('white', 2);
    expect(bot.timing?.()?.searches).toBe(0);
    expect(bot.timing?.()?.firstSearchAborted).toBe(0);
    await playPlies(bot, twoMovers(1), 'white', 1);
    expect(bot.timing?.()?.searches).toBe(1);
    // Two games' worth on the process-wide sum, one game's worth per instance.
    expect(hardBotTiming().searches).toBe(2);
    expect(hardBotTiming().firstSearchAborted).toBe(2);
  });

  it('resets to zero', () => {
    resetHardBotTiming();
    expect(hardBotTiming()).toEqual({
      turns: 0,
      searches: 0,
      reSearches: 0,
      totalSearchMs: 0,
      totalAdapterMs: 0,
      overruns: 0,
      maxTurnMs: 0,
      budgetExhausted: 0,
      emptyPlans: 0,
      abortedSearches: 0,
      firstSearchAborted: 0,
    });
  });
});

/**
 * Cross-lane fix (E0.1 §2 recorded the defect): `hard@*` was evaluating with
 * M4's `placeholder-m4` vector — 58 zero weights, i.e. material only.
 * `hardConfigFor` returns a FULL `HardConfig` whose `weights` field is present,
 * and `HardEngine`'s constructor substitutes `DEFAULT_WEIGHTS` only when the
 * caller passes no `weights` field (`src/ai/hard/engine.ts`), so the adapter
 * opted every ladder row out of the trained evaluation without saying so.
 */
describe('hard bot evaluation weights', () => {
  /** Records the patch the adapter hands the engine factory. */
  function patchRecorder(patches: Partial<HardConfig>[]): (p: Partial<HardConfig>) => HardEngineLike {
    return (p: Partial<HardConfig>) => {
      patches.push(p);
      return {
        setSeed(): void {},
        setWeights(): void {},
        async searchTurn() {
          throw new Error('not searched in this test');
        },
      };
    };
  }

  it('hands the engine real weights, not M4’s placeholder, for every profile', () => {
    for (const profile of ['lab', 'lab-dfpn', 'lab-refined', 'desktop', 'midrange', 'phone']) {
      const patches: Partial<HardConfig>[] = [];
      const bot = createHardBot({ work: { mode: 'wall', ms: WALL_MS }, profile, createEngine: patchRecorder(patches) });
      bot.onGameStart('white', 7);
      expect(patches).toHaveLength(1);
      const weights = patches[0].weights;
      expect(weights?.label).not.toBe('placeholder-m4');
      expect(weights?.label).toBe(DEFAULT_WEIGHTS.label);
      expect(weights?.version).toBe(DEFAULT_WEIGHTS.version);
    }
  });

  it('prefers an explicit weights option over the default vector', () => {
    const custom: Weights = { ...DEFAULT_WEIGHTS, w: Int32Array.from(DEFAULT_WEIGHTS.w), material: Int32Array.from(DEFAULT_WEIGHTS.material), version: 42, label: 'tuned-test' };
    const patches: Partial<HardConfig>[] = [];
    const bot = createHardBot({ work: { mode: 'wall', ms: WALL_MS }, profile: 'lab', weights: custom, createEngine: patchRecorder(patches) });
    bot.onGameStart('white', 7);
    expect(patches[0].weights?.label).toBe('tuned-test');
  });

  it('leaves hardConfigFor’s return unchanged for its other callers', () => {
    // The substitution belongs to the adapter: the registry still reports the
    // profile constants exactly as `src/ai/hard/config.ts` defines them.
    expect(hardConfigFor('lab')).toEqual({ ...LAB });
    expect(hardConfigFor('lab').weights?.label).toBe('placeholder-m4');
  });

  it('hardEnginePatch is what the adapter applies, profile fields untouched', () => {
    const patch = hardEnginePatch('phone');
    expect(patch.weights?.label).toBe(DEFAULT_WEIGHTS.label);
    expect({ ...patch, weights: LAB.weights }).toEqual({ ...hardConfigFor('phone'), weights: LAB.weights });
  });
});
