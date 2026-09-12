import type { PlayerId } from '../game/types';

/** A fresh, non-accumulating delay per full turn, followed by a personal bank. */
export interface TimeControl { delaySeconds: number; bankSeconds: number }
export const TIME_CONTROL_PRESETS = {
  blitz: { label: 'Blitz', duration: '≈10 minutes', delaySeconds: 10, bankSeconds: 120 },
  rapid: { label: 'Rapid', duration: '≈45 minutes', delaySeconds: 30, bankSeconds: 600 },
  classical: { label: 'Classical', duration: '≈2 hours', delaySeconds: 60, bankSeconds: 1800 },
} as const;
export type TimeControlPreset = keyof typeof TIME_CONTROL_PRESETS;
export interface ClockSnapshot {
  serverNowMs: number;
  runningPlayer: PlayerId | null;
  turnStartedAtMs: number | null;
  deadlineAtMs: number | null;
  delayRemainingMs: number;
  bankRemainingMs: Record<PlayerId, number>;
}

/** Project a server observation without ticking the game revision or trusting a client clock. */
export function projectClock(clock: ClockSnapshot, nowMs: number): ClockSnapshot {
  const elapsed = clock.runningPlayer ? Math.max(0, nowMs - clock.serverNowMs) : 0;
  const bankRemainingMs = { ...clock.bankRemainingMs };
  if (clock.runningPlayer) bankRemainingMs[clock.runningPlayer] = Math.max(0,
    bankRemainingMs[clock.runningPlayer] - Math.max(0, elapsed - clock.delayRemainingMs));
  return { ...clock, serverNowMs: nowMs, bankRemainingMs, delayRemainingMs: Math.max(0, clock.delayRemainingMs - elapsed) };
}

export function formatClock(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
