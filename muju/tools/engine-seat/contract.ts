import { z } from 'zod';
import { MAX_BLACK_CRYSTAL_HANDICAP } from '../../src/game/rules';
import type { PlayerId } from '../../src/game/types';
import type { RoomSnapshot } from '../../src/online/types';

export const seatContractSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('standard-smoke') }).strict(),
  z.object({ mode: z.literal('pinned'),
    expectedMatchPolicy: z.object({ version: z.literal(1), toolTier: z.enum(['bare', 'harnessed', 'centaur', 'tool-builder']),
      protocolId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/) }).strict(),
    expectedTimeControl: z.object({ delaySeconds: z.number().int().min(0).max(600), bankSeconds: z.number().int().min(1).max(14400) }).strict(),
    expectedHandicap: z.number().int().min(0).max(MAX_BLACK_CRYSTAL_HANDICAP),
  }).strict(),
]);
export type SeatContract = z.infer<typeof seatContractSchema>;

/** Only call for an authenticated response. Public long-poll snapshots omit this field. */
export function assertAuthenticatedSeat(room: RoomSnapshot, player: PlayerId): void {
  if (room.authenticatedPlayer !== player) throw new Error('Server authenticated seat is absent or differs from the declared credentials player.');
}

/** No CLI bypass: this branch's Hard search still represents Standard. M7 must
 * replace this guard only after its separate parity/strength evidence exists. */
export function assertSeatRoom(room: RoomSnapshot, expected?: { roomId: string; contract: SeatContract }): void {
  if ((room.state.ruleset ?? 'standard') !== 'standard') throw new Error('Phasing Hard seat is blocked pending M7 readiness.');
  if (room.archivedAt) throw new Error('Archived rooms are read-only.');
  if (!expected) return;
  if (room.id !== expected.roomId) throw new Error('Server room identity differs from the configured seat.');
  const contract = seatContractSchema.parse(expected.contract);
  if (contract.mode === 'standard-smoke') {
    if (room.matchPolicy !== undefined) throw new Error('Standard smoke mode requires an ordinary room without a match policy.');
    return;
  }
  const policy = room.matchPolicy, wanted = contract.expectedMatchPolicy;
  if (!policy || policy.version !== wanted.version || policy.toolTier !== wanted.toolTier || policy.protocolId !== wanted.protocolId) {
    throw new Error('Server match policy is absent or differs from the pinned contract.');
  }
  const clockRule = room.timeControl;
  if (!clockRule || clockRule.delaySeconds !== contract.expectedTimeControl.delaySeconds || clockRule.bankSeconds !== contract.expectedTimeControl.bankSeconds) {
    throw new Error('Server time control is absent or differs from the pinned contract.');
  }
  // Pinned evidence must report the actual field, including explicit zero.
  if (room.state.blackCrystalHandicap !== contract.expectedHandicap) throw new Error('Server handicap is absent or differs from the pinned contract.');
  const clock = room.clock;
  if (!clock || !Number.isFinite(clock.serverNowMs) || !Number.isFinite(clock.delayRemainingMs) || clock.delayRemainingMs < 0 ||
      !Number.isFinite(clock.bankRemainingMs?.white) || clock.bankRemainingMs.white < 0 ||
      !Number.isFinite(clock.bankRemainingMs?.black) || clock.bankRemainingMs.black < 0) throw new Error('Pinned room clock is absent or invalid.');
  if (room.ready && room.state.phase === 'playing' &&
      (clock.runningPlayer !== room.state.turn.currentPlayer || clock.deadlineAtMs === null || !Number.isFinite(clock.deadlineAtMs) ||
       clock.turnStartedAtMs === null || !Number.isFinite(clock.turnStartedAtMs))) throw new Error('Pinned room clock is not running for the current player.');
}
