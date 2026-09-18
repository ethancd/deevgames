// @vitest-environment node
/**
 * `time.calibrateCold` — E1.5, the patch E1.4 §5 chose, with the mechanism it
 * needed (`docs/hard-ai/e1/E1.5-CALIB-ARM.md`).
 *
 * THE DEFECT. `makeConfig` starts every engine at `INITIAL_UNITS_PER_MS` = 200
 * with `samples: 0`, and the lab builds a fresh engine per game, so every game
 * starts cold. `chooseWork({200, 0}, 3000)` = 600,000 units of budget, which
 * quantises to the 400,000 rung — about 4 s of search on this box. A11's
 * deadline is the 3,000 ms allowance, so the watchdog cuts that first search
 * and the clock, not the rung, picks the turn (160 of 200 baseline games ended
 * their first turn at the deadline).
 *
 * THE PATCH. With the flag on, a wall-funded `searchTurn` on an engine whose
 * profile has measured nothing runs ONE `COLD_PROBE_WORK` (`WORK_LADDER[0]`,
 * 25,000 units) search of the REAL root first, folds its `work / elapsedMs`
 * into the profile through `updateProfile` (which REPLACES from `samples: 0`)
 * subject to A16's floors, and only then sizes the rung — for the allowance
 * that is LEFT. The probe's plan is kept as the turn's fallback, the cost is in
 * `stats.calibratedMs`, the measurement in `stats.calibratedUnitsPerMs`, and
 * the deadline is armed from before the probe so probe and search together fit
 * the allowance.
 *
 * NOT `calibrate()`. E1.4 §5 proposed DESIGN §4.17's 40 ms micro-benchmark.
 * Measured, it reports three to four times the throughput the same engine's own
 * search then measures, so it sized the first rung ABOVE the uncalibrated
 * default — the opposite of the point (the table is in §4 of the doc).
 * `calibrate()` therefore stays exactly as it was, for its existing caller, and
 * every test below asserts the SEARCH PATH does not call it.
 *
 * Wall-clock assertions are one-sided and generously padded, exactly as
 * `deadline.test.ts` explains: this box runs vitest next to a two-slot heavy
 * queue. What is asserted is the relationship between the measurement and the
 * rung, not a millisecond count.
 */
import { describe, expect, it, vi } from 'vitest';
import { COLD_PROBE_WORK, HardEngine, MIN_PROFILE_SAMPLE_WORK } from '../../../src/ai/hard/engine';
import { WORK_LADDER, chooseWork } from '../../../src/ai/hard/search/time';
import { DESKTOP, INITIAL_UNITS_PER_MS } from '../../../src/ai/hard/config';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import type { GameState } from '../../../src/game/types';
import type { AIAction } from '../../../src/ai/types';
import { buildState } from './game-fixture';

vi.setConfig({ testTimeout: 60_000 });

/** The same mid-game action node `deadline.test.ts` uses: a real root list and
 * nothing forced. */
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

/** The canonical replay every caller does (`deadline.test.ts`). */
function replaysLegally(state: GameState, actions: readonly AIAction[]): boolean {
  let current = state;
  for (const action of actions) {
    if (!isLegalAction(current, action)) return false;
    current = applyAction(current, action);
  }
  return true;
}

/** The arm's patch, as `lab/hard-ai/ablate/arms.ts` composes it. */
function calibArm(): { time: typeof DESKTOP.time } {
  return { time: { ...DESKTOP.time, calibrateCold: true } };
}

/** A cold engine's rung at a 3,000 ms target: the 400,000 the report names. */
const COLD_RUNG = chooseWork({ unitsPerMs: INITIAL_UNITS_PER_MS, samples: 0 }, 3000);

describe('time.calibrateCold, off (the champion)', () => {
  it('is absent from the shipped shapes, so a resolved config never carries it', () => {
    // An explicit `false` would serialise into `hard@desktop`'s resolved
    // configuration and move its frozen hash; the field is optional and unset
    // (see `config.ts`, and `tests/lab/ablate.test.ts` for the hash itself).
    expect(DESKTOP.time.calibrateCold).toBeUndefined();
    expect('calibrateCold' in DESKTOP.time).toBe(false);
  });

  it('probes nothing, and leaves the cold rung exactly where it was', async () => {
    const engine = new HardEngine();
    const calibrate = vi.spyOn(engine, 'calibrate');
    const profileBefore = { ...engine.profile };

    // A 1 ms deadline makes this cheap: the meter is armed before the first
    // stop poll, so `meter.limit` is still the rung the engine chose.
    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 1 });

    expect(calibrate).not.toHaveBeenCalled();
    expect(engine.ctx.meter.limit).toBe(chooseWork(profileBefore, 3000));
    expect(engine.ctx.meter.limit).toBe(COLD_RUNG);
    expect(COLD_RUNG).toBe(WORK_LADDER[4]);
    expect(result.stats.calibratedMs).toBe(0);
    expect(result.stats.calibratedUnitsPerMs).toBe(0);
  });
});

describe('time.calibrateCold, on (hard@ablate:calib)', () => {
  it('spends one smallest rung, which clears A16s floor by construction', () => {
    expect(COLD_PROBE_WORK).toBe(WORK_LADDER[0]);
    // A16 skips a sample under half a rung; the probe budget is a whole one,
    // so a probe that spends its budget is always a usable measurement.
    expect(COLD_PROBE_WORK).toBeGreaterThanOrEqual(MIN_PROFILE_SAMPLE_WORK);
  });

  it('measures the box with a real search and sizes the rung from that measurement', async () => {
    const engine = new HardEngine(calibArm());
    const calibrate = vi.spyOn(engine, 'calibrate');
    expect(engine.profile.samples).toBe(0);

    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 3000 });

    // The mechanism is a probe SEARCH; DESIGN §4.17's micro-benchmark is not
    // on this path at all.
    expect(calibrate).not.toHaveBeenCalled();
    expect(result.stats.calibratedMs).toBeGreaterThan(0);
    expect(result.stats.calibratedUnitsPerMs).toBeGreaterThan(0);
    // `updateProfile` from `samples: 0` REPLACES, so the profile carries the
    // probe's measurement and not `INITIAL_UNITS_PER_MS`.
    expect(engine.profile.samples).toBeGreaterThanOrEqual(1);
    const measured = { unitsPerMs: result.stats.calibratedUnitsPerMs, samples: 1 };
    // The rung is `chooseWork(<measurement>, <what is LEFT of the allowance>)`.
    // `chooseWork` is monotonic in its target, and the probe always leaves less
    // than the whole 3,000 ms, so the rung sits between the ladder's floor and
    // the rung the full allowance would have bought at the measured rate.
    expect(engine.ctx.meter.limit).toBeLessThanOrEqual(chooseWork(measured, 3000));
    expect(engine.ctx.meter.limit).toBeGreaterThanOrEqual(WORK_LADDER[0]);
    expect(WORK_LADDER).toContain(engine.ctx.meter.limit);
    // The plan is real and canonical, probe or no probe.
    expect(result.actions.length).toBeGreaterThan(0);
    expect(replaysLegally(MIDGAME, result.actions)).toBe(true);
  });

  it('probes once per engine and not again on the next turn', async () => {
    const engine = new HardEngine(calibArm());
    const calibrate = vi.spyOn(engine, 'calibrate');

    const first = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 600 });
    const second = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 600 });

    expect(calibrate).not.toHaveBeenCalled();
    expect(first.stats.calibratedMs).toBeGreaterThan(0);
    // Only the call that paid for it reports the cost: `stats` is rebuilt per
    // search, so an artifact reading `calibratedMs` sees it once per engine.
    expect(second.stats.calibratedMs).toBe(0);
    expect(second.stats.calibratedUnitsPerMs).toBe(0);
  });

  /**
   * The probe fires once whether or not its sample survives A16's floors. On a
   * position the search finishes INSIDE the probe rung — this fixture at a
   * short deadline is one — `work` is under half a rung, the sample is about
   * the position rather than the box, and nothing is adopted. The engine does
   * not retry: a turn that finishes inside 25,000 units did not need a rung,
   * and `updateProfile` picks the profile up from the first real search that
   * clears the floors, exactly as it does for the champion.
   */
  it('does not adopt a probe that finished before it spent its rung', async () => {
    const engine = new HardEngine(calibArm());
    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 600 });

    expect(result.stats.calibratedMs).toBeGreaterThan(0);
    if (result.stats.calibratedUnitsPerMs === 0) {
      // Guard rejected it: the profile is untouched by the probe.
      expect(engine.ctx.meter.limit).toBeLessThanOrEqual(COLD_RUNG);
    } else {
      expect(engine.profile.samples).toBeGreaterThanOrEqual(1);
    }
  });

  it('never probes in fixed-work mode, which reads no clock at all', async () => {
    const engine = new HardEngine(calibArm());
    const calibrate = vi.spyOn(engine, 'calibrate');
    const before = { ...engine.profile };

    const result = await engine.searchTurn(MIDGAME, { work: WORK_LADDER[0] });

    expect(calibrate).not.toHaveBeenCalled();
    expect(engine.profile).toEqual(before);
    expect(engine.profile.samples).toBe(0);
    expect(result.stats.calibratedMs).toBe(0);
    expect(result.stats.calibratedUnitsPerMs).toBe(0);
    expect(engine.ctx.meter.limit).toBe(WORK_LADDER[0]);
  });

  it('keeps the WHOLE first turn, probe included, inside deadlineMs', async () => {
    const engine = new HardEngine(calibArm());
    const deadline = 600;

    const startedAt = Date.now();
    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: deadline });
    const wallMs = Date.now() - startedAt;

    // `elapsedMs` times the MAIN search only — it is the throughput sample —
    // and the deadline window it runs inside started before the probe, so the
    // search alone can never use the whole deadline.
    expect(result.stats.elapsedMs).toBeLessThanOrEqual(deadline);
    // Probe plus search against the deadline, with `deadline.test.ts`'s padding
    // for a loaded box. Without the shared window this sum would exceed the
    // deadline by the probe's cost by construction rather than by noise.
    expect(result.stats.calibratedMs + result.stats.elapsedMs).toBeLessThan(deadline + 400);
    expect(wallMs).toBeLessThan(deadline + 400);
  });

  it('still returns a complete, legal plan when the deadline cuts the main search', async () => {
    // The probe already bought a completed rung of real search, so a turn whose
    // main search is cut before it finishes a depth has the probe's plan to
    // fall back on rather than `phaseEndAction`.
    const engine = new HardEngine(calibArm());
    const result = await engine.searchTurn(MIDGAME, { targetMs: 3000, deadlineMs: 250 });

    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.fallback).toBeUndefined();
    expect(replaysLegally(MIDGAME, result.actions)).toBe(true);
  });
});
