// @vitest-environment node
/**
 * The kill-clock verdict is forced only within `KILL_CLOCK_FORCED_HANDOFFS` of
 * the root; further away it is a flat mild preference, because either side's
 * next kill resets it and the interior search is candidate-limited
 * (`docs/changes/2026-09-22-kill-clock.md`, coordinator decisions).
 */
import { describe, expect, it, afterEach } from 'vitest';
import { INACTIVITY_LIMIT } from '../../../src/game/inactivity';
import { KILL_CLOCK_FORCED_HANDOFFS, KILL_CLOCK_SOFT_CC, killClockHandoffsFromRoot, setKillClockRootClock, terminalScore } from '../../../src/ai/hard/eval/evaluate';
import { Reason, Result, WIN_CC, MATE_PLY_CC, type PackedState } from '../../../src/ai/hard/types';

const decided = (result: Result, reason: Reason) => ({ result, reason } as unknown as PackedState);
afterEach(() => setKillClockRootClock(INACTIVITY_LIMIT - 1));

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
