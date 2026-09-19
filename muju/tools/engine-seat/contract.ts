import { z } from 'zod';
import { MAX_BLACK_CRYSTAL_HANDICAP } from '../../src/game/rules';
import type { PlayerId } from '../../src/game/types';
import type { RoomSnapshot } from '../../src/online/types';

/**
 * The one string that opens the Phasing Hard seat.
 *
 * It is a claim about a RELEASE GATE, not a feature switch: "the Hard engine
 * has passed M7". Nothing in this tree can verify it, which is exactly why it
 * is a literal a human types into a private config file rather than a boolean
 * anyone can flip, and why its absence — the default — refuses.
 */
export const PHASING_HARD_READINESS = 'M7-passed';

const readiness = z.literal(PHASING_HARD_READINESS).optional();

export const seatContractSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('phasing-smoke'), phasingHardReadiness: readiness }).strict(),
  z.object({ mode: z.literal('pinned'),
    expectedMatchPolicy: z.object({ version: z.literal(1), toolTier: z.enum(['bare', 'harnessed', 'centaur', 'tool-builder']),
      protocolId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/) }).strict(),
    expectedTimeControl: z.object({ delaySeconds: z.number().int().min(0).max(600), bankSeconds: z.number().int().min(1).max(14400) }).strict(),
    expectedHandicap: z.number().int().min(0).max(MAX_BLACK_CRYSTAL_HANDICAP),
    phasingHardReadiness: readiness,
  }).strict(),
]);
export type SeatContract = z.infer<typeof seatContractSchema>;

/** Only call for an authenticated response. Public long-poll snapshots omit this field. */
export function assertAuthenticatedSeat(room: RoomSnapshot, player: PlayerId): void {
  if (room.authenticatedPlayer !== player) throw new Error('Server authenticated seat is absent or differs from the declared credentials player.');
}

/**
 * The seat's room gate. Two refusals come first, and neither has a CLI bypass.
 *
 * 1. PHASING ONLY. This used to read the other way round — "Phasing Hard seat
 *    is blocked pending M7 readiness" — because the branch's Hard search still
 *    represented Standard. It no longer does: `core/state.ts Replica.pack`
 *    throws `PackError: pack: ruleset "standard" is not "phasing"`, so a
 *    Standard room cannot be searched at all, and a seat pointed at one used to
 *    accept the contract, build an engine and only then return
 *    `fallback: pack-error` for every turn. Refusing the ruleset here turns
 *    that into one clear message before any engine exists.
 *
 * 2. DEFAULT CLOSED ANYWAY. Being ABLE to run is not permission to run. The
 *    Hard engine has not passed its Phasing release gates — M6 is a bootstrap
 *    checkpoint that misses two pre-registered floors
 *    (`docs/hard-ai/phasing/M6-STATUS.md`) — and the production AI guards
 *    (`src/ai/worker/handler.ts` refusing Phasing, and the UI gates) stay shut.
 *    So the seat refuses unless the contract carries
 *    `phasingHardReadiness: "M7-passed"` VERBATIM. An absent field, a call with
 *    no expected contract at all, and (by the schema) any other value are all
 *    refusals; only the literal opens it. The only place it is set in this tree
 *    is a test-only configuration.
 */
export function assertSeatRoom(room: RoomSnapshot, expected?: { roomId: string; contract: SeatContract }): void {
  const contract = expected ? seatContractSchema.parse(expected.contract) : undefined;
  const ruleset = room.state.ruleset ?? 'standard';
  if (ruleset !== 'phasing') throw new Error(`Hard seat plays Phasing only; this room is "${ruleset}" and the Hard replica cannot pack it.`);
  if (contract?.phasingHardReadiness !== PHASING_HARD_READINESS) {
    throw new Error(`Phasing Hard seat is closed: the seat contract must declare phasingHardReadiness: "${PHASING_HARD_READINESS}" once the Hard engine has passed its Phasing release gates.`);
  }
  if (room.archivedAt) throw new Error('Archived rooms are read-only.');
  if (!expected) return;
  if (room.id !== expected.roomId) throw new Error('Server room identity differs from the configured seat.');
  if (contract.mode === 'phasing-smoke') {
    if (room.matchPolicy !== undefined) throw new Error('Phasing smoke mode requires an ordinary room without a match policy.');
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
