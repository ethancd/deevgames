import type { PlayerId } from '../src/game/types';
import type { ClockPaceTotals, ClockPressure, ClockSnapshot } from '../src/online/timeControl';

/** Aggregates are independent of move/undo history, which cannot reconstruct thinking time. */
export interface ClockHistory {
  sampling: ClockPressure['sampling'];
  players: Record<PlayerId, ClockPaceTotals>;
  activeTurn: { player: PlayerId; turnNumber: number; startedAtMs: number } | null;
}
export function newClockHistory(now: number, revision: number, completeFromGameStart: boolean): ClockHistory {
  const totals = (): ClockPaceTotals => ({ completedTurns: 0, totalElapsedMs: 0, totalBankSpentMs: 0,
    firstTurnStartedAtMs: null, lastTurnCompletedAtMs: null });
  return { sampling: { window: 'all_tracked_completed_turns', startedAtMs: now, startedRevision: revision,
    completeFromGameStart, terminalTurns: 'excluded' }, players: { white: totals(), black: totals() }, activeTurn: null };
}
export function completeClockTurn(history: ClockHistory, player: PlayerId, turnNumber: number, now: number, delayMs: number) {
  const turn = history.activeTurn;
  history.activeTurn = null;
  if (!turn || turn.player !== player || turn.turnNumber !== turnNumber) return;
  const totals = history.players[player], elapsed = Math.max(0, now - turn.startedAtMs);
  totals.completedTurns++;
  totals.totalElapsedMs += elapsed;
  totals.totalBankSpentMs += Math.max(0, elapsed - delayMs);
  totals.firstTurnStartedAtMs ??= turn.startedAtMs;
  totals.lastTurnCompletedAtMs = now;
}
export function projectClockPressure(history: ClockHistory, clock: ClockSnapshot): ClockPressure {
  const player = (side: PlayerId): ClockPressure['players'][PlayerId] => {
    const totals = history.players[side], n = totals.completedTurns;
    const meanBankSpentMs = n ? totals.totalBankSpentMs / n : null;
    return { ...totals, meanElapsedMs: n ? totals.totalElapsedMs / n : null, meanBankSpentMs,
      remainingBankMs: clock.bankRemainingMs[side], projection: {
        status: meanBankSpentMs === null ? 'no_samples' : meanBankSpentMs === 0 ? 'no_observed_drain' : 'estimated',
        turnsCovered: meanBankSpentMs ? clock.bankRemainingMs[side] / meanBankSpentMs : null,
      } };
  };
  return { sampling: history.sampling, projectionBasis: 'if historical pace continues; not turns left in the game',
    players: { white: player('white'), black: player('black') } };
}
