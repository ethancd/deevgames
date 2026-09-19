// @vitest-environment node
/**
 * The turn PACES on the Hard seat (`src/ai/turnTime.ts`): what a 10 s, 30 s or
 * 60 s allowance actually buys the engine, and what it must not disturb.
 *
 * Three claims, in the order they matter.
 *
 *   1. THE DEFAULT SEAT IS THE ONE THE RELEASE MEASURED, on every box. The
 *      rungs added above 3,200,000 units are reachable only from an allowance
 *      ABOVE `quick`: `chooseTurnWork` refuses any rung above
 *      `RELEASE_TOP_RUNG` at or below `QUICK_TURN_ALLOWANCE_MS`, whatever
 *      `profile.unitsPerMs` the box has MEASURED — which is the thing the
 *      ladder alone could not promise, since 10,000 ms × 640 units/ms already
 *      asks for 6,400,000. Pinned two ways: by sweeping `unitsPerMs` from 50 to
 *      5,000 over 8,000 ms (the E6 release row) and 10,000 ms (`quick`) and
 *      asserting the rung is exactly what the PRE-EXTENSION ladder chose, and
 *      by enumerating every allowance up to 10,000 ms on the profile
 *      throughputs DESIGN §6.3 names. The move follows from the rung, so this
 *      is the whole of the compatibility claim for the search (the determinism
 *      and golden tests, which run at fixed work of 400,000 units and below,
 *      never reach the new rungs at all).
 *   2. A LONG ALLOWANCE BUYS A BIGGER RUNG, proportionally, on every profile —
 *      the reason the extension exists. Before it, the ladder's top of
 *      3,200,000 units was ~5.3 s of desktop search whatever the allowance
 *      said, which is why the release measured a mean turn of 4.9 s inside
 *      8,000 ms. Above `quick` the rung comes off `WORK_LADDER_FINE`, whose √2
 *      step leaves at most 29% of the allowance unbuyable instead of 50%, and
 *      the search runs E4.3's iteration-cost rule so the rung is actually spent
 *      (`ctx.wallFit`; `docs/hard-ai/e4/E4.3-ITER-FIT.md` measured 83.5% of the
 *      rung spent against 100.1%).
 *   3. AN EXPLICIT ALLOWANCE BEATS THE DEVICE DEFAULT. `time.maxMs` is what
 *      `search/time.ts targetMs` clamps its own estimate to; it is not a
 *      ceiling on a `targetMs` the caller named (A5, already pinned for 8,000
 *      ms in `deadline.test.ts` — here at all three paces), and the macro
 *      transposition table is sized for the rung that results.
 */
import { describe, expect, it, vi } from 'vitest';
import { HardEngine } from '../../../src/ai/hard/engine';
import {
  QUICK_TURN_ALLOWANCE_MS,
  RELEASE_TOP_RUNG,
  TT_GROWTH_BASE_RUNG,
  TT_GROWTH_MAX_BITS,
  WORK_LADDER,
  WORK_LADDER_FINE,
  chooseTurnWork,
  chooseWork,
  ttBitsForRung,
} from '../../../src/ai/hard/search/time';
import { DESKTOP, MIDRANGE, PHONE, type DeviceProfile, type HardConfig } from '../../../src/ai/hard/config';
import { AI_TURN_SECONDS, aiTurnBudgetMs } from '../../../src/ai/turnTime';
import { applyAction } from '../../../src/ai/simulate';
import { isLegalAction } from '../../../src/game/legality';
import type { AIAction } from '../../../src/ai/types';
import type { GameState } from '../../../src/game/types';
import { buildState } from './game-fixture';

// E0.5 timeout budget: every search here is cut by a 1 ms deadline or funded
// at the ladder's first rung; 60 s is this file's explicit ceiling.
vi.setConfig({ testTimeout: 60_000 });

/** The ladder as it shipped through E6, before the pace extension. */
const OLD_WORK_LADDER: readonly number[] = [25e3, 50e3, 100e3, 200e3, 400e3, 800e3, 1.6e6, 3.2e6];

/** `chooseWork` as it was, against the ladder as it was. */
function oldChooseWork(profile: DeviceProfile, targetMs: number): number {
  let chosen = OLD_WORK_LADDER[0];
  for (const rung of OLD_WORK_LADDER) if (rung <= profile.unitsPerMs * targetMs) chosen = rung;
  return chosen;
}

/**
 * DESIGN §6.3's three profiles at the throughput its table gives them, which
 * is what a warmed `updateProfile` converges on (`config.ts` ships every engine
 * at `INITIAL_UNITS_PER_MS` = 200 until its own searches measure the box).
 */
const PROFILES: ReadonlyArray<{ name: string; cfg: HardConfig; unitsPerMs: number }> = [
  { name: 'desktop', cfg: DESKTOP, unitsPerMs: 600 },
  { name: 'midrange', cfg: MIDRANGE, unitsPerMs: 400 },
  { name: 'phone', cfg: PHONE, unitsPerMs: 200 },
];

/** A mid-game action phase, as in `deadline.test.ts`: a real candidate list and
 * no must-answer short-circuit. */
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

/** The canonical replay every caller does (`useAI.ts`, `bots/hard.ts`). */
function replaysLegally(state: GameState, actions: readonly AIAction[]): boolean {
  let current = state;
  for (const action of actions) {
    if (!isLegalAction(current, action)) return false;
    current = applyAction(current, action);
  }
  return true;
}

describe('the work ladder keeps every rung it had', () => {
  it('starts with the old ladder, unchanged, and extends it by ×2', () => {
    expect(WORK_LADDER.slice(0, OLD_WORK_LADDER.length)).toEqual(OLD_WORK_LADDER);
    expect(WORK_LADDER.slice(OLD_WORK_LADDER.length)).toEqual([6.4e6, 12.8e6, 25.6e6, 51.2e6]);
    for (let i = 1; i < WORK_LADDER.length; i++) expect(WORK_LADDER[i]).toBe(WORK_LADDER[i - 1] * 2);
  });

  it('keeps the √2 ladder a superset of it, as the work-fit arm requires', () => {
    for (const rung of WORK_LADDER) expect(WORK_LADDER_FINE).toContain(rung);
    for (let i = 1; i < WORK_LADDER_FINE.length; i++) {
      expect(WORK_LADDER_FINE[i]).toBeGreaterThan(WORK_LADDER_FINE[i - 1]);
    }
  });

  /**
   * The invariant, enumerated. Every millisecond from 1 to 10,000 — which
   * covers every `time.minMs`/`maxMs`/`baseMs` any profile carries, the
   * release's 8,000 ms and `quick`'s 10,000 ms — on each profile's own
   * throughput, plus the throughputs the profile table's boundaries name.
   */
  it('chooses exactly the rung it used to for every allowance up to 10,000 ms', () => {
    for (const unitsPerMs of [200, 250, 400, 600, 640, 1000]) {
      const profile: DeviceProfile = { unitsPerMs, samples: 4 };
      for (let ms = 1; ms <= 10_000; ms++) {
        // A budget of 6.4e6 units is the first the new rungs can answer, and
        // 1,000 units/ms × 10,000 ms = 1e7 crosses it: the enumeration is
        // asserted where the two ladders must agree and the crossing point is
        // stated rather than hidden.
        if (unitsPerMs * ms >= WORK_LADDER[OLD_WORK_LADDER.length]) continue;
        expect(chooseWork(profile, ms)).toBe(oldChooseWork(profile, ms));
      }
    }
  });

  /**
   * ITEM 1, THE WHOLE OF IT. `chooseWork` multiplies the allowance by the
   * MEASURED throughput, so the ladder alone cannot keep the default seat where
   * the release left it: at 640 units/ms `quick`'s 10,000 ms asks for exactly
   * 6,400,000 units and would take the first new rung (and, through
   * `ttBitsForRung`, an extra transposition-table bit). `chooseTurnWork` — the
   * one function `engine.ts` funds a wall-mode turn through — refuses it.
   *
   * The sweep runs 50 to 5,000 units/ms, which brackets every profile DESIGN
   * §6.3 describes (200-600) and every box a browser might turn out to be, and
   * asserts the rung is not merely capped but EQUAL to the rung the eight-rung
   * ladder chose, at both 8,000 ms (the E6 release row) and 10,000 ms (default
   * Hard). 30,000 ms and 60,000 ms are asserted to cross the old top exactly
   * when the √2 ladder's first rung above it can be afforded.
   */
  it('holds every allowance up to quick at the pre-extension rung, and only frees the longer ones', () => {
    // The rung a `normal`/`deep` turn has to reach before it can exceed the old
    // top at all: the first `WORK_LADDER_FINE` entry above it (4,520,000).
    const firstFreeRung = WORK_LADDER_FINE.find(rung => rung > RELEASE_TOP_RUNG) as number;
    expect(firstFreeRung).toBe(4.52e6);
    for (let unitsPerMs = 50; unitsPerMs <= 5000; unitsPerMs += 50) {
      const profile: DeviceProfile = { unitsPerMs, samples: 8 };
      for (const ms of [8_000, QUICK_TURN_ALLOWANCE_MS]) {
        const rung = chooseTurnWork(profile, ms, ms, DESKTOP.time);
        expect([unitsPerMs, ms, rung]).toEqual([unitsPerMs, ms, oldChooseWork(profile, ms)]);
        expect(rung).toBeLessThanOrEqual(RELEASE_TOP_RUNG);
        // …and with it, the transposition table the profile has always had.
        expect(ttBitsForRung(DESKTOP.ttBitsMacro, rung)).toBe(DESKTOP.ttBitsMacro);
      }
      for (const ms of [30_000, 60_000]) {
        const rung = chooseTurnWork(profile, ms, ms, DESKTOP.time);
        expect([unitsPerMs, ms, rung > RELEASE_TOP_RUNG]).toEqual([unitsPerMs, ms, unitsPerMs * ms >= firstFreeRung]);
      }
    }
    // A box fast enough for the cap to BIND at quick, stated rather than
    // implied: 640 units/ms is where the uncapped ladder would move.
    const fast: DeviceProfile = { unitsPerMs: 640, samples: 8 };
    expect(chooseWork(fast, QUICK_TURN_ALLOWANCE_MS)).toBe(6.4e6);
    expect(chooseTurnWork(fast, QUICK_TURN_ALLOWANCE_MS, QUICK_TURN_ALLOWANCE_MS, DESKTOP.time)).toBe(RELEASE_TOP_RUNG);
  });

  /** The engine may not import `src/ai/turnTime.ts` (`lab/hard-ai/deps.ts`), so
   * the allowance is restated as a literal there. This is the join. */
  it('keeps the engine\'s quick-allowance constant equal to the pace it names', () => {
    expect(QUICK_TURN_ALLOWANCE_MS).toBe(aiTurnBudgetMs('hard', 'quick'));
    expect(RELEASE_TOP_RUNG).toBe(OLD_WORK_LADDER[OLD_WORK_LADDER.length - 1]);
    expect(TT_GROWTH_BASE_RUNG).toBe(RELEASE_TOP_RUNG);
  });

  it('is unmoved at the two allowances the release was measured at', () => {
    // The shipped engine's own profile, cold: `INITIAL_UNITS_PER_MS`.
    const cold = DESKTOP.profile;
    const warm: DeviceProfile = { unitsPerMs: 600, samples: 8 };
    for (const profile of [cold, warm]) {
      for (const ms of [8_000, aiTurnBudgetMs('hard', 'quick')]) {
        expect(chooseWork(profile, ms)).toBe(oldChooseWork(profile, ms));
      }
    }
    expect(aiTurnBudgetMs('hard', 'quick')).toBe(10_000);
  });
});

describe('the rung each Hard pace selects', () => {
  /**
   * The table this lane exists to produce. `quick` is the old top rung on
   * desktop — deliberately: it is the allowance the release was measured at
   * plus a fifth, and it must not move. `normal` and `deep` come off the √2
   * ladder, so midrange and phone land on rungs the ×2 ladder does not have
   * (9.05e6, 18.1e6, 4.52e6) rather than leaving up to half the allowance
   * unbuyable; desktop's two happen to be ×2 rungs at 600 units/ms.
   */
  const EXPECTED: Record<string, { quick: number; normal: number; deep: number }> = {
    desktop: { quick: 3.2e6, normal: 12.8e6, deep: 25.6e6 },
    midrange: { quick: 3.2e6, normal: 9.05e6, deep: 18.1e6 },
    phone: { quick: 1.6e6, normal: 4.52e6, deep: 9.05e6 },
  };

  /** What `engine.ts` asks for: the allowance is both the clock the rung is
   * sized from and the allowance that decides which ladder and cap apply. */
  const paceRung = (profile: DeviceProfile, ms: number): number => chooseTurnWork(profile, ms, ms, DESKTOP.time);

  for (const { name, unitsPerMs } of PROFILES) {
    it(`${name}: 10 s / 30 s / 60 s buy ${EXPECTED[name].quick} / ${EXPECTED[name].normal} / ${EXPECTED[name].deep} units`, () => {
      const profile: DeviceProfile = { unitsPerMs, samples: 8 };
      expect(paceRung(profile, aiTurnBudgetMs('hard', 'quick'))).toBe(EXPECTED[name].quick);
      expect(paceRung(profile, aiTurnBudgetMs('hard', 'normal'))).toBe(EXPECTED[name].normal);
      expect(paceRung(profile, aiTurnBudgetMs('hard', 'deep'))).toBe(EXPECTED[name].deep);
    });

    it(`${name}: a longer pace always buys strictly more work`, () => {
      const profile: DeviceProfile = { unitsPerMs, samples: 8 };
      const quick = paceRung(profile, aiTurnBudgetMs('hard', 'quick'));
      const normal = paceRung(profile, aiTurnBudgetMs('hard', 'normal'));
      const deep = paceRung(profile, aiTurnBudgetMs('hard', 'deep'));
      expect(normal).toBeGreaterThan(quick);
      expect(deep).toBeGreaterThan(normal);
      // On the √2 ladder the rung is within a factor of √2 of the allowance it
      // was funded from, so at least 70% of a `deep` allowance is buyable (the
      // ×2 ladder could leave half of it unreachable).
      expect(deep).toBeGreaterThan((profile.unitsPerMs * AI_TURN_SECONDS.hard.deep * 1000) / Math.SQRT2 - 1);
    });
  }

  it('would have capped all three paces at the same 3.2e6 before the extension', () => {
    const profile: DeviceProfile = { unitsPerMs: 600, samples: 8 };
    for (const pace of ['quick', 'normal', 'deep'] as const) {
      expect(oldChooseWork(profile, aiTurnBudgetMs('hard', pace))).toBe(3.2e6);
    }
  });
});

describe('transposition-table sizing follows the rung', () => {
  it('leaves every pre-extension rung on the profile\'s own table', () => {
    for (const { cfg } of PROFILES) {
      for (const rung of WORK_LADDER) {
        if (rung > TT_GROWTH_BASE_RUNG) continue;
        expect(ttBitsForRung(cfg.ttBitsMacro, rung)).toBe(cfg.ttBitsMacro);
      }
      // And every fixed-work budget the goldens and the lab actually use.
      for (const work of [2_000, 4_440, 25_000, 100_000, 200_000, 400_000, 600_000]) {
        expect(ttBitsForRung(cfg.ttBitsMacro, work)).toBe(cfg.ttBitsMacro);
      }
    }
  });

  it('adds one bit per doubling above the old top rung, capped at three', () => {
    const base = DESKTOP.ttBitsMacro;
    expect(ttBitsForRung(base, 3.2e6)).toBe(base);
    expect(ttBitsForRung(base, 6.4e6)).toBe(base + 1);
    expect(ttBitsForRung(base, 12.8e6)).toBe(base + 2);
    expect(ttBitsForRung(base, 25.6e6)).toBe(base + 3);
    expect(ttBitsForRung(base, 51.2e6)).toBe(base + TT_GROWTH_MAX_BITS);
    // An off-ladder rung rounds DOWN with the ladder: a fixed-work caller at
    // 5,000,000 units gets the table 3.2e6 gets, never a larger one.
    expect(ttBitsForRung(base, 5e6)).toBe(base);
    expect(ttBitsForRung(base, 6.4e6 - 1)).toBe(base);
  });

  /**
   * The memory contract, stated in bytes so the phone row is checkable rather
   * than asserted. An entry is 16 bytes (`search/tt.ts`: 4 `Int32Array` words),
   * and the browser builds every Hard seat from `DESKTOP` — so the top row IS
   * what a phone running `deep` at 427 units/ms or more would allocate.
   */
  it('bounds the worst case at 67.1 MB desktop, 33.6 MB midrange, 4.2 MB phone', () => {
    const bytes = (bits: number): number => 2 ** bits * 16;
    const worst = (cfg: HardConfig): number => bytes(ttBitsForRung(cfg.ttBitsMacro, WORK_LADDER[WORK_LADDER.length - 1]));
    expect(worst(DESKTOP)).toBe(67_108_864);
    expect(worst(MIDRANGE)).toBe(33_554_432);
    expect(worst(PHONE)).toBe(4_194_304);
    // Four times the table each profile has always carried, and no more.
    for (const { cfg } of PROFILES) expect(worst(cfg)).toBe(bytes(cfg.ttBitsMacro) * 2 ** TT_GROWTH_MAX_BITS);
  });
});

/**
 * The engine end of the same three claims: that `searchTurn` really does size
 * the meter and the table from the allowance it was handed, and really does
 * hand the table back when the allowance shrinks again.
 *
 * Every search here carries `deadlineMs: 1`, so it is abandoned at the first
 * stop poll — the meter and the table are armed before that poll, which is what
 * makes this cheap enough to assert on. (`deadline.test.ts` pins that the
 * deadline moves the watchdog and nothing else.)
 */
describe('searchTurn sizes the turn from an explicit allowance', () => {
  const warm = { unitsPerMs: 600, samples: 8 };

  it('funds 30 s and 60 s past the profile\'s maxMs of 6,000', async () => {
    const engine = new HardEngine({ profile: { ...warm } });
    expect(engine.config.time.maxMs).toBe(6000);

    for (const pace of ['quick', 'normal', 'deep'] as const) {
      const ms = aiTurnBudgetMs('hard', pace);
      await engine.searchTurn(MIDGAME, { targetMs: ms, deadlineMs: 1 });
      expect(engine.ctx.meter.limit).toBe(chooseTurnWork(warm, ms, ms, DESKTOP.time));
      expect(engine.profile).toEqual(warm); // a 1 ms sample is below A16's floors
    }
    expect(chooseTurnWork(warm, aiTurnBudgetMs('hard', 'deep'), aiTurnBudgetMs('hard', 'deep'), DESKTOP.time)).toBeGreaterThan(
      chooseTurnWork(warm, engine.config.time.maxMs, engine.config.time.maxMs, DESKTOP.time),
    );
  });

  /**
   * E4.3's iteration-cost rule is armed by the ALLOWANCE and by nothing else
   * (`ctx.wallFit`, `search/pvs.ts`): the 45% gate a `deep` turn cannot spend
   * its rung through is replaced above `quick` and kept at or below it, and a
   * FIXED-work search — every determinism gate — never sees it at all.
   */
  it('arms the iteration-cost rule for an above-quick allowance only', async () => {
    const engine = new HardEngine({ profile: { ...warm } });
    for (const [pace, armed] of [['quick', false], ['normal', true], ['deep', true]] as const) {
      await engine.searchTurn(MIDGAME, { targetMs: aiTurnBudgetMs('hard', pace), deadlineMs: 1 });
      expect([pace, engine.ctx.wallFit]).toEqual([pace, armed]);
    }
    // The release's own allowance, and `?hardMs`'s usual value, are both under
    // it; and a fixed-work call clears the flag whatever ran before it.
    for (const ms of [8_000, QUICK_TURN_ALLOWANCE_MS]) {
      await engine.searchTurn(MIDGAME, { targetMs: ms, deadlineMs: 1 });
      expect(engine.ctx.wallFit).toBe(false);
    }
    await engine.searchTurn(MIDGAME, { targetMs: aiTurnBudgetMs('hard', 'deep'), deadlineMs: 1 });
    expect(engine.ctx.wallFit).toBe(true);
    await engine.searchTurn(MIDGAME, { work: WORK_LADDER[0] });
    expect(engine.ctx.wallFit).toBe(false);
  });

  it('grows the macro table for a deep turn and gives it back for a quick one', async () => {
    const engine = new HardEngine({ profile: { ...warm } });
    const base = engine.config.ttBitsMacro;
    expect(engine.ctx.tt.bits).toBe(base);

    await engine.searchTurn(MIDGAME, { targetMs: aiTurnBudgetMs('hard', 'deep'), deadlineMs: 1 });
    expect(engine.ctx.tt.bits).toBe(base + 3);

    await engine.searchTurn(MIDGAME, { targetMs: aiTurnBudgetMs('hard', 'normal'), deadlineMs: 1 });
    expect(engine.ctx.tt.bits).toBe(base + 2);

    // The table a 10 s turn gets does not depend on the 60 s turn before it:
    // that is what keeps the move a function of the position and the rung.
    await engine.searchTurn(MIDGAME, { targetMs: aiTurnBudgetMs('hard', 'quick'), deadlineMs: 1 });
    expect(engine.ctx.tt.bits).toBe(base);
  });

  /**
   * The rung a 60 s turn picks is far more work than a slow box can spend
   * inside 60 s, let alone inside the 300 ms allowed here — which is the state
   * the stopwatch must survive: the seat still plays a real, canonically
   * verified turn rather than ending its phase. (`deadline.test.ts` pins the
   * same property at the pre-pace allowances; this is it at the deepest one,
   * where the gap between the rung and the clock is widest.)
   */
  it('still publishes a verified, legal turn when the deadline cuts a deep one', async () => {
    const engine = new HardEngine({ profile: { ...warm } });
    const ms = aiTurnBudgetMs('hard', 'deep');
    const result = await engine.searchTurn(MIDGAME, { targetMs: ms, deadlineMs: 300 });

    expect(engine.ctx.meter.limit).toBe(chooseTurnWork(warm, ms, ms, DESKTOP.time));
    expect(result.stats.stopReason).toBe('abort');
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.fallback).toBeUndefined();
    expect(replaysLegally(MIDGAME, result.actions)).toBe(true);
  });

  /** Fixed-work mode reads no clock, so `deadlineMs` cannot make one of these
   * cheap: the rungs searched here are the ones the goldens and the lab
   * actually use. The boundary itself (3.2e6, the largest rung that must still
   * get the profile's own table) is pinned on `ttBitsForRung` above, where it
   * costs no search. */
  it('never resizes the table for the fixed-work budgets the lab uses', async () => {
    const engine = new HardEngine();
    const base = engine.config.ttBitsMacro;
    for (const work of [25_000, 400_000]) {
      await engine.searchTurn(MIDGAME, { work });
      expect(engine.ctx.tt.bits).toBe(base);
    }
  });
});
