// @vitest-environment node
/**
 * The kill-clock verdict is forced only within `KILL_CLOCK_FORCED_HANDOFFS` of
 * the root; further away it is a flat mild preference, because either side's
 * next kill resets it and the interior search is candidate-limited
 * (`docs/changes/2026-09-22-kill-clock.md`, coordinator decisions).
 */
import { describe, expect, it, afterEach } from 'vitest';
import { INACTIVITY_LIMIT } from '../../../src/game/inactivity';
import {
  BOUNDED_CLOCK_CC,
  KILL_CLOCK_FORCED_HANDOFFS,
  KILL_CLOCK_SOFT_CC,
  killClockHandoffsFromRoot,
  setKillClockPolicy,
  setKillClockRootClock,
  terminalScore,
} from '../../../src/ai/hard/eval/evaluate';
import { Reason, Result, WIN_CC, MATE_PLY_CC, type PackedState } from '../../../src/ai/hard/types';
import type { ClockReadingCore, ClockVerdict } from '../../../src/ai/hard/strategy/types';

const decided = (result: Result, reason: Reason) => ({ result, reason } as unknown as PackedState);
afterEach(() => {
  setKillClockRootClock(INACTIVITY_LIMIT - 1);
  setKillClockPolicy(null);
});

/** A `KillClockPolicy.reading` with only `verdict` populated — `decidedCc`
 * (W1.6) reads nothing else off it. */
function readingOf(verdict: ClockVerdict): ClockReadingCore {
  return { side: 0, r: 0, verdict, marginL: 0, marginMid: 0 };
}

describe('kill-clock terminal scoring', () => {
  it('defaults to a forced verdict for direct callers', () => {
    expect(killClockHandoffsFromRoot()).toBe(1);
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 0, 3)).toBe(WIN_CC - 3 * MATE_PLY_CC);
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 1, 3)).toBe(-(WIN_CC - 3 * MATE_PLY_CC));
  });
  it('keeps the verdict forced through the opponent\'s single reply', () => {
    setKillClockRootClock(INACTIVITY_LIMIT - KILL_CLOCK_FORCED_HANDOFFS);
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 1, 6)).toBe(WIN_CC - 6 * MATE_PLY_CC);
  });
  it('softens a verdict that lies beyond the forced window, from either side', () => {
    setKillClockRootClock(INACTIVITY_LIMIT - KILL_CLOCK_FORCED_HANDOFFS - 1);
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 1, 9)).toBe(KILL_CLOCK_SOFT_CC);
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 0, 9)).toBe(-KILL_CLOCK_SOFT_CC);
    setKillClockRootClock(1);
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 0, 9)).toBe(KILL_CLOCK_SOFT_CC);
  });
  it('never softens a mate or elimination, and a tie is still a draw', () => {
    setKillClockRootClock(0);
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.HOME_CHECKMATE), 0, 4)).toBe(WIN_CC - 4 * MATE_PLY_CC);
    expect(terminalScore(decided(Result.DRAW, Reason.KILL_CLOCK), 0, 4)).toBe(0);
  });
});

/**
 * STRATEGOS W1.6 (`config.ts EvalFix.clockLedger`): a `KillClockPolicy` with a
 * non-null `reading` installed — the only way `search/root.ts` ever installs
 * one under the flag — changes a distant kill-clock terminal's magnitude from
 * the flat `KILL_CLOCK_SOFT_CC` to a verdict-dependent choice; the FORCED
 * window (`KILL_CLOCK_FORCED_HANDOFFS`) still always scores full scale,
 * proven or not. `reading === null` (every other profile, always) leaves the
 * legacy branch running byte for byte, checked above.
 */
describe('kill-clock terminal scoring under EvalFix.clockLedger (a policy.reading installed)', () => {
  it('full scale when the reading is proven, however far beyond the forced window', () => {
    setKillClockRootClock(0); // killClockHandoffsFromRoot() = 10, far beyond the forced window
    setKillClockPolicy({ rootClock: 0, reading: readingOf('proven-win') });
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 0, 9)).toBe(WIN_CC - 9 * MATE_PLY_CC);
    setKillClockPolicy({ rootClock: 0, reading: readingOf('proven-loss') });
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 1, 9)).toBe(WIN_CC - 9 * MATE_PLY_CC);
  });

  it('BOUNDED_CLOCK_CC, not the flat KILL_CLOCK_SOFT_CC, when the reading is bounded-win/bounded-loss and far from the root', () => {
    setKillClockRootClock(0);
    for (const verdict of ['bounded-win', 'bounded-loss'] as const) {
      setKillClockPolicy({ rootClock: 0, reading: readingOf(verdict) });
      expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 0, 9)).toBe(BOUNDED_CLOCK_CC);
      expect(BOUNDED_CLOCK_CC).not.toBe(KILL_CLOCK_SOFT_CC);
    }
  });

  /**
   * Coordinator decision (2026-09-24), superseding W1.6's original "bounded
   * and open alike" brief: an `open` reading has no verdict to sign the
   * bigger `BOUNDED_CLOCK_CC` with (the plan's own "signed by the verdict"
   * language for the bounded score) — the intervals overlap and neither side
   * is established as winning the clock at all. Scoring it at
   * `BOUNDED_CLOCK_CC` anyway reproduced the 2026-09-22 failure one flag
   * later: a 125,000 cc prize on a deep, unverified clock-out the
   * candidate-limited interior search cannot confirm, preferring a clock-out
   * found nine hand-offs deep over a free capture available now. So `open`,
   * unlike `bounded-*`, keeps the SAME soft value desktop has always used.
   */
  it('KILL_CLOCK_SOFT_CC, not BOUNDED_CLOCK_CC, when the reading is open and far from the root', () => {
    setKillClockRootClock(0);
    setKillClockPolicy({ rootClock: 0, reading: readingOf('open') });
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 0, 9)).toBe(KILL_CLOCK_SOFT_CC);
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 1, 9)).toBe(KILL_CLOCK_SOFT_CC);
    expect(KILL_CLOCK_SOFT_CC).not.toBe(BOUNDED_CLOCK_CC);
  });

  it('full scale within the forced hand-offs even when the reading is only bounded', () => {
    setKillClockRootClock(INACTIVITY_LIMIT - 1); // killClockHandoffsFromRoot() = 1 <= KILL_CLOCK_FORCED_HANDOFFS
    setKillClockPolicy({ rootClock: INACTIVITY_LIMIT - 1, reading: readingOf('bounded-win') });
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 0, 2)).toBe(WIN_CC - 2 * MATE_PLY_CC);
  });

  it('a clock-out that follows a kill is NOT forced, even from a root two hand-offs from the end', () => {
    // Root hand-offs = 1 (inside the window), but the terminal sits 11 turns
    // deep: a kill on the way restarted the clock, so the root's count says
    // nothing about it and an unproven reading keeps it at BOUNDED_CLOCK_CC.
    setKillClockRootClock(INACTIVITY_LIMIT - 1);
    setKillClockPolicy({ rootClock: INACTIVITY_LIMIT - 1, reading: readingOf('bounded-win') });
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 0, INACTIVITY_LIMIT + 1)).toBe(BOUNDED_CLOCK_CC);
    // ...while a proven reading still scores it at full scale.
    setKillClockPolicy({ rootClock: INACTIVITY_LIMIT - 1, reading: readingOf('proven-win') });
    expect(terminalScore(decided(Result.WHITE_WIN, Reason.KILL_CLOCK), 0, INACTIVITY_LIMIT + 1)).toBe(
      WIN_CC - (INACTIVITY_LIMIT + 1) * MATE_PLY_CC,
    );
  });

  it('the sign follows the leaf\'s own winner, not the reading\'s side or verdict', () => {
    setKillClockRootClock(0);
    setKillClockPolicy({ rootClock: 0, reading: readingOf('proven-loss') }); // read from White's side
    // The LEAF actually decided for Black; scored from White's root the sign
    // must be negative, and from Black's root positive — `decidedCc`'s
    // magnitude does not care which side `reading.verdict` names.
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 0, 9)).toBe(-(WIN_CC - 9 * MATE_PLY_CC));
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 1, 9)).toBe(WIN_CC - 9 * MATE_PLY_CC);
  });

  it('desktop is unchanged: no policy installed at all takes the legacy branch, not this one', () => {
    setKillClockRootClock(INACTIVITY_LIMIT - KILL_CLOCK_FORCED_HANDOFFS - 1);
    setKillClockPolicy(null);
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 1, 9)).toBe(KILL_CLOCK_SOFT_CC);
  });

  it('a policy WITHOUT a reading (searchFix.killClockPolicy alone, evalFix.clockLedger off) also takes the legacy branch', () => {
    setKillClockRootClock(INACTIVITY_LIMIT - KILL_CLOCK_FORCED_HANDOFFS - 1);
    setKillClockPolicy({ rootClock: INACTIVITY_LIMIT - KILL_CLOCK_FORCED_HANDOFFS - 1, reading: null });
    expect(terminalScore(decided(Result.BLACK_WIN, Reason.KILL_CLOCK), 1, 9)).toBe(KILL_CLOCK_SOFT_CC);
  });
});
