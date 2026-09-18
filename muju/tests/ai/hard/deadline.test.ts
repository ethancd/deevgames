// @vitest-environment node
/**
 * `searchTurn`'s explicit deadline (AMENDMENTS-DECIDED A11, option (b)).
 *
 * Before A11 the only wall-clock limit on a measured search was the abort
 * watchdog at `abortFactor × targetMs` — three times the budget the caller
 * thought it was funding, which is why E0.5 measured `hard@desktop` turns at
 * 1.15×-1.67× their `--work wall:<ms>` allowance. `deadlineMs` moves the
 * watchdog and ONLY the watchdog: the work rung stays `chooseWork(profile,
 * targetMs)`, so the search still spends what the position is worth and simply
 * stops being allowed to run past the wall time its caller owns.
 *
 * What this file pins:
 *   - the deadline is honoured (a 40 ms deadline under a 3,000 ms target
 *     returns in ~40 ms, not in 9,000);
 *   - an aborted search still hands back a COMPLETE, LEGAL plan — the last
 *     completed iteration's, or the partial iteration's best-so-far, or at
 *     worst `phaseEndAction`, never nothing (`search/root.ts`,
 *     `search/pvs.ts#iterativeDeepening`);
 *   - without `deadlineMs` the watchdog is still `abortFactor × targetMs`;
 *   - a non-finite or non-positive deadline throws;
 *   - A11's profile decision: an ABORTED measured search updates the device
 *     profile, a fixed-`work` search never touches it;
 *   - A16's tiny-sample guard: a search too short or too cheap to be a
 *     throughput measurement updates nothing.
 *
 * Wall-clock assertions are one-sided and generously padded: this box runs two
 * vitest workers next to a two-slot heavy queue, so a search can be descheduled
 * for tens of ms. The numbers that matter are ORDERS apart (40 vs 9,000,
 * 1× vs 3×), not tight.
 */
import { describe, expect, it, vi } from 'vitest';
import { HardEngine, MIN_PROFILE_SAMPLE_MS, MIN_PROFILE_SAMPLE_WORK } from '../../../src/ai/hard/engine';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import { WORK_LADDER, chooseWork } from '../../../src/ai/hard/search/time';
import { DESKTOP } from '../../../src/ai/hard/config';
import type { GameState } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: nothing here searches for more than ~1 s by
// construction; 60 s is this file's explicit ceiling, as in the sibling files.
vi.setConfig({ testTimeout: 60_000 });

/** A mid-game action phase: six bodies, both banks funded, nothing forced —
 * so the root has a real candidate list and no must-answer short-circuit. */
const MIDGAME: GameState = buildState({
  current: 'white',
  phase: 'action',
  actions: 4,
  turnNumber: 6,
  white: 20,
  black: 18,
  units: [
    { def: 'fire_1', owner: 'white', x: 2, y: 2 },
    { def: 'water_1', owner: 'white', x: 4, y: 3 },
    { def: 'plant_1', owner: 'white', x: 5, y: 5 },
    { def: 'metal_1', owner: 'black', x: 7, y: 6 },
    { def: 'fire_1', owner: 'black', x: 6, y: 8 },
    { def: 'water_1', owner: 'black', x: 8, y: 7 },
  ],
});

/** The canonical replay every caller does: each action legal at the moment it
 * is dispatched (`useAI.ts`, `lab/hard-ai/bots/hard.ts`). */
function replaysLegally(state: GameState, actions: readonly AIAction[]): boolean {
  let current = state;
  for (const action of actions) {
    if (!isLegalAction(current, action)) return false;
    current = applyAction(current, action);
  }
  return true;
}

/** Takes the JIT and the lazy table allocation out of the measured search;
 * `work` mode reads no clock, so it also leaves the device profile alone. */
async function warm(engine: HardEngine): Promise<void> {
  await engine.searchTurn(MIDGAME, { work: WORK_LADDER[0] });
}

describe('searchTurn deadlineMs', () => {
  it('abandons the search at the deadline, not at abortFactor × target', async () => {
    const engine = new HardEngine();
    await warm(engine);
    const startedAt = Date.now();
    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 40 });
    const elapsedMs = Date.now() - startedAt;

    // The default watchdog would have been 3 × 3,000 = 9,000 ms, and the work
    // rung alone (600,000 units) is seconds of search on any box. The padding
    // is for this box's two heavy slots and two vitest workers: what is being
    // asserted is 40 ms against 9,000, not a tight bound.
    expect(elapsedMs).toBeLessThan(40 + 400);
    expect(result.stats.stopReason).toBe('abort');
  });

  it('still returns a complete, legal plan when the deadline cuts the search', async () => {
    const engine = new HardEngine();
    await warm(engine);
    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 40 });

    // `iterativeDeepening` publishes the last COMPLETED depth, falls back to
    // the truncated iteration's best-so-far, and `searchRoot` falls back to
    // `phaseEndAction` — so a cut search never hands back nothing.
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.fallback).toBeUndefined();
    expect(replaysLegally(MIDGAME, result.actions)).toBe(true);
  });

  it('returns the last completed iteration once one fits inside the deadline', async () => {
    const engine = new HardEngine();
    await warm(engine);
    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 600 });

    expect(result.depth).toBeGreaterThanOrEqual(1);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(replaysLegally(MIDGAME, result.actions)).toBe(true);
  });

  it('leaves the TARGET rung alone: the deadline moves the watchdog only', async () => {
    const engine = new HardEngine();
    const profile = { ...engine.profile };
    await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 1 });

    // `searchRoot` arms the meter with `chooseWork(profile, targetMs)`; the
    // deadline is not one of its inputs.
    expect(engine.ctx.meter.limit).toBe(chooseWork(profile, 3000));
  });

  it('keeps abortFactor × target as the default watchdog', async () => {
    // A profile fat enough that the work rung (the ladder's top, 3.2e6 units)
    // cannot be spent inside a third of a second: what stops this search is
    // the watchdog, and nothing else.
    const engine = new HardEngine({ profile: { unitsPerMs: 1_000_000, samples: 8 } });
    await warm(engine);

    const startedAt = Date.now();
    const withDefault = await engine.searchTurn(MIDGAME, { targetMs: 300 });
    const defaultMs = Date.now() - startedAt;

    const deadlineStartedAt = Date.now();
    const withDeadline = await engine.searchTurn(MIDGAME, { targetMs: 300, deadlineMs: 300 });
    const deadlineMs = Date.now() - deadlineStartedAt;

    expect(withDefault.stats.stopReason).toBe('abort');
    expect(withDeadline.stats.stopReason).toBe('abort');
    expect(DESKTOP.time.abortFactor).toBe(3);
    // Default: ~3 × 300 ms. Explicit: ~300 ms. The 600 ms gap between them is
    // wide enough to survive a loaded box; the bounds sit inside it rather
    // than tight against either number.
    expect(defaultMs).toBeGreaterThan(600);
    expect(defaultMs).toBeLessThan(900 + 500);
    expect(deadlineMs).toBeLessThan(600);
    expect(deadlineMs).toBeLessThan(defaultMs);
  });

  it('refuses a non-finite or non-positive deadline, whatever the mode', async () => {
    const engine = new HardEngine();
    for (const bad of [0, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: bad })).rejects.toThrow(RangeError);
      // Validated even where it is ignored: `work` mode reads no clock, but a
      // caller passing a broken deadline has a bug either way.
      await expect(engine.searchTurn(MIDGAME, { work: WORK_LADDER[0], deadlineMs: bad })).rejects.toThrow(RangeError);
    }
  });
});

/**
 * A11's profile trap and the decision taken on it (option (i), recorded in
 * `docs/hard-ai/e0/E0.2-E0.4-RECORD.md` §E0.2).
 *
 * `search/time.ts#updateProfile` used to be called only after a search that
 * stopped on WORK. Under A11 the deadline IS the allowance, so a profile that
 * overestimates the box aborts every search — and would therefore never see the
 * sample that corrects it. `work / elapsedMs` is a throughput measurement
 * whether or not the search was cut, so the engine now folds in every measured
 * search.
 */
describe('device profile under A11', () => {
  it('updates the profile from an aborted search', async () => {
    const engine = new HardEngine();
    await warm(engine);
    expect(engine.profile.samples).toBe(0);

    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 1500 });

    expect(result.stats.stopReason).toBe('abort');
    // Long enough and heavy enough to clear A16's floors, which the next test
    // pins from the other side. 1,500 ms rather than a few hundred because
    // this box shares itself with two heavy slots: at load ~80 a 600 ms search
    // spent only 10,320 units, under the half-rung floor.
    // The half-rung floor is a throughput claim about the box: GitHub's
    // 2-core runner measured 9,522 units in 1,500 ms against the 12,500 floor
    // (deploy run 35346032064, 2026-09-18), so it is asserted only with the
    // wall-clock flag; the structural claims below always run.
    if (process.env.MUJU_WALLCLOCK_TESTS) expect(result.work).toBeGreaterThanOrEqual(MIN_PROFILE_SAMPLE_WORK);
    expect(engine.profile.samples).toBe(1);
    expect(engine.profile.unitsPerMs).toBeGreaterThan(0);
  });

  /**
   * A16's tiny-sample guard. A 1 ms deadline stops the search inside the FIXED
   * cost of one — packing, the level-2 tables, root generation, the canonical
   * replay — which `chooseWork` does not model; measured here that interval
   * reads as ~9 units/ms against a real ~100, and adopting it would shorten the
   * next search, and so the next sample, without limit.
   */
  it('ignores a sample too short or too cheap to be a throughput measurement', async () => {
    const engine = new HardEngine();
    await warm(engine);
    const before = { ...engine.profile };

    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 1 });

    expect(result.stats.stopReason).toBe('abort');
    expect(result.work).toBeLessThan(MIN_PROFILE_SAMPLE_WORK);
    expect(engine.profile).toEqual(before);
    expect(engine.profile.samples).toBe(0);
  });

  it('states the floors it guards with', () => {
    // Half a work rung, and 20 ms — see `engine.ts`'s constants.
    expect(MIN_PROFILE_SAMPLE_WORK).toBe(WORK_LADDER[0] / 2);
    expect(MIN_PROFILE_SAMPLE_MS).toBe(20);
  });

  it('never touches the profile in fixed-work mode', async () => {
    const engine = new HardEngine();
    const before = { ...engine.profile };
    await engine.searchTurn(MIDGAME, { work: WORK_LADDER[2] });
    expect(engine.profile).toEqual(before);
  });
});

/**
 * A5: the RELEASE row funds both arms at the shipped browser allowance,
 * `wall:8000`, which is ABOVE the DESKTOP profile's `time.maxMs` of 6,000. The
 * clamp lives in `search/time.ts#targetMs` (`if (raw > cfg.maxMs) return
 * cfg.maxMs`), and `engine.ts` calls that function only when the caller passes
 * no `targetMs` — so an explicit 8,000 reaches `chooseWork` unclamped. Pinned
 * here because A5 rests on it.
 */
describe('an explicit targetMs is not clamped by maxMs (A5)', () => {
  it('sizes the rung for 8,000 ms on a DESKTOP-shaped engine', async () => {
    const engine = new HardEngine();
    const profile = { ...engine.profile };
    expect(engine.config.time.maxMs).toBe(6000);

    // A 1 ms deadline makes this cheap: the meter is armed before the first
    // stop poll, so `meter.limit` is the rung the engine chose.
    await engine.searchTurn(MIDGAME, { targetMs: 8000, deadlineMs: 1 });

    expect(engine.ctx.meter.limit).toBe(chooseWork(profile, 8000));
    expect(chooseWork(profile, 8000)).toBeGreaterThan(chooseWork(profile, engine.config.time.maxMs));
  });
});
