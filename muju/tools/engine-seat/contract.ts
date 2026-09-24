import { z } from 'zod';
import { MAX_BLACK_CRYSTAL_HANDICAP } from '../../src/game/rules';
import type { PlayerId } from '../../src/game/types';
import type { RoomSnapshot } from '../../src/online/types';
import type { Centi } from '../../src/ai/hard/types';
import type { RootResult, RootSource } from '../../src/ai/hard/search/root';
import type { StrategyChronicle } from '../../src/ai/hard/strategy/types';

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

/**
 * The version of `SearchTelemetryEvent` below. `main.ts` writes it on every
 * `start` line (`searchTelemetryVersion`), next to the `profile` and the
 * source hashes, so a reader of a `.jsonl` knows which shape the `search`
 * lines that follow have without guessing from their keys. Bump it (and say
 * what moved) the next time a field is added, renamed or dropped.
 * DERIVED (plan B.2 W1.14: "version the contract"): 1 is the first declared
 * shape — before W1.14 the line was an ad hoc `Record<string, unknown>`.
 */
export const SEARCH_TELEMETRY_VERSION = 1;

/**
 * VERSION 1 (`SEARCH_TELEMETRY_VERSION`) of the seat's `event: 'search'`
 * telemetry line (`runner.ts`, appended to `<stateFile>.jsonl`), STRATEGOS
 * W1.14 (plan `~/.claude/plans/can-you-respond-to-piped-book.md`, B.2 step
 * W1.14). Before this the line was an ad hoc `Record<string, unknown>` with no
 * declared shape at all; this is the first time it is typed, so "version 1"
 * names what ships today rather than a change from something earlier.
 *
 * FIXED KEYS, NEVER OMITTED. `scoreCc`, `clock` and `minedTotals` are cheap
 * facts about the searched position that exist on every search, strategos or
 * not. `strategy` is `RootResult.strategy` — present only when the profile set
 * `searchFix.strategyPlans`/`strategyVeto` (`hard@strategos` today) — and is
 * carried as an explicit `null` rather than an omitted key when the search did
 * not compute one. CHOICE (why: `fallback` below is already exactly this
 * shape — a fixed key valued `null` when there is nothing to report — so a
 * downstream reader of the seat's `.jsonl` can assume every `search` event
 * carries the same key set and never has to branch on `'strategy' in event`;
 * falsifier: a consumer that needs to distinguish "this profile never
 * computes a Chronicle" from "this search's Chronicle was empty", which no
 * caller does as of this version). A `hard@desktop` seat's `search` events
 * therefore gain three always-numeric keys and one always-`null` key; nothing
 * about the events a `hard@desktop` seat already logged is removed or
 * renamed, and `mode`/`work`/`stopReason`/`fallback`/`verified` etc. are
 * unchanged.
 */
export interface SearchTelemetryEvent {
  event: 'search';
  revision: number;
  turn: number;
  player: PlayerId;
  allowanceMs: number;
  targetMs: number;
  elapsedMs: number;
  overrunMs: number;
  depth: number;
  rung: number;
  work: number;
  source: RootSource;
  stopReason: RootResult['stats']['stopReason'];
  /** `verify.ts classifyFallback(result)`. */
  fallback: string | null;
  verified: boolean;
  /** `RootResult.scoreCc`: the root's own evaluation of the turn it returned,
   * in centi-crystals from the SEAT's point of view (the side to move at the
   * root). Read it next to `source`/`fallback`: an unsearched root reports 0. */
  scoreCc: Centi;
  /** The root position's inactivity (kill) clock: `state.inactivityPlies ?? 0`
   * (`src/game/inactivity.ts`), 0 … `INACTIVITY_LIMIT - 1`. */
  clock: number;
  /** `[white, black]` mined totals at the root, `src/game/inactivity.ts
   * minedTotal` — Black's handicap folded in, exactly as the kill clock's own
   * verdict reads it. */
  minedTotals: [number, number];
  /** `RootResult.strategy` when the search computed one, `null` otherwise. See
   * the FIXED KEYS note above for why this is never an omitted key. */
  strategy: StrategyChronicle | null;
}
