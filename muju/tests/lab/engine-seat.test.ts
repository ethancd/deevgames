// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import type { AIAction } from '../../src/ai/types';
import { allocState, Replica } from '../../src/ai/hard/core/state';
import { newSearchStats } from '../../src/ai/hard/search/pvs';
import type { RootResult } from '../../src/ai/hard/search/root';
import type { GameState } from '../../src/game/types';
import type { RoomSnapshot } from '../../src/online/types';
import { HardEngine } from '../../src/ai/hard/engine';
import { hardEnginePatch } from '../../lab/hard-ai/bots/hard';
import { OnlineError } from '../../src/online/client';
import {
  ENGINE_ALLOWANCE_MS,
  ENGINE_TARGET_MS,
  TRANSPORT_ATTEMPTS,
  TRANSPORT_BACKOFF_MS,
  assertSeatRoom,
  classifyFallback,
  runSeat,
  type SeatJournal,
  type SeatTransport,
} from '../../tools/engine-seat/runner';
import { verifySeatTurn } from '../../tools/engine-seat/verify';
import { PHASING_HARD_READINESS, type SeatContract } from '../../tools/engine-seat/contract';
import { assertSeatConfiguration, contractFor, initializeSeat, seatConfigSchema, seatJournalSchema, type SeatConfig } from '../../tools/engine-seat/config';

/**
 * THE SEAT IS PHASING-ONLY AND DEFAULT-CLOSED.
 *
 * The runner used to be written Standard-only (`assertSeatRoom` refused any
 * `ruleset !== 'standard'` "pending M7 readiness") while the Hard replica had
 * already become Phasing-only, so the seat could not run at all: every room it
 * accepted was one `Replica.pack` refuses, and every room it could search it
 * refused. Twenty-four tests in this file and one in
 * `tests/server/match-policy.test.ts` failed on the same `PackError`.
 *
 * The port turns that round — Phasing rooms only, a complete Phasing MACRO TURN
 * (Act .. END_ACTION_PHASE .. [PAY_UPKEEP] .. Prepare .. END_PLACE_PHASE)
 * verified by `verifyTurn` against the engine's own claimed end key — and then
 * closes the seat again behind an explicit readiness claim, because being able
 * to run is not permission to run while the Hard engine has not passed its
 * Phasing release gates. `READINESS` below is the only place in this tree that
 * claim is made, and it is a TEST-ONLY configuration.
 */
const READINESS = { phasingHardReadiness: PHASING_HARD_READINESS } as const;

/**
 * `runSeat` now acquires a real heavy-work slot per search (Component A).
 * These tests exercise the turn loop, not the queue itself (that's
 * `tests/lab/heavy-queue.test.ts`), so they bypass it — otherwise every
 * `runSeat` call here would briefly touch `~/.local/state/muju-heavy`, racing
 * whatever real engine seats or other test files are using it at the same
 * time. The one test that DOES exercise the queue sets its own MUJU_HEAVY_DIR
 * and unsets this bypass for its duration.
 */
const previousBypass = process.env.MUJU_HEAVY_BYPASS;
beforeAll(() => { process.env.MUJU_HEAVY_BYPASS = '1'; });
afterAll(() => { if (previousBypass === undefined) delete process.env.MUJU_HEAVY_BYPASS; else process.env.MUJU_HEAVY_BYPASS = previousBypass; });

/** A complete Phasing macro turn: no action, no purchase, both phases ended. */
const MACRO_TURN: AIAction[] = [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];

function resultFor(state: GameState, actions: AIAction[] = MACRO_TURN): RootResult {
  const after = actions.reduce(applyAction, state), p = new Replica().pack(after, allocState());
  return { actions, scoreCc: 0, depth: 1, work: 25000, stats: newSearchStats(), source: 'search',
    endKey: [p.kposHi, p.kposLo].map(word => (word >>> 0).toString(16).padStart(8, '0')).join('') };
}
function fixture() {
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  const room: RoomSnapshot = { id: 'a'.repeat(32), authenticatedPlayer: 'white', revision: 1, ready: true, seats: { white: 'Engine', black: 'Opponent' },
    state, history: [], updatedAt: new Date().toISOString() };
  const contract: SeatContract = { mode: 'phasing-smoke', ...READINESS };
  const journal: SeatJournal = { version: 3, admission: 'join', contract, seed: 42,
    connection: { serverUrl: 'http://localhost', roomId: room.id, player: 'white', token: 'secret'.repeat(8) } };
  const finish = { ...room, revision: 2, state: { ...state, phase: 'victory' as const, winner: 'white' as const } };
  return { state, room, journal, finish };
}
describe('canonical whole-turn verification', () => {
  it('checks the supplied end key, and rejects partial, illegal, fallback, and cross-turn lines', () => {
    const { state } = fixture(), result = resultFor(state);
    expect(state.ruleset).toBe('phasing');
    expect(verifySeatTurn(state, result).turn.currentPlayer).toBe('black');
    expect(() => verifySeatTurn(state, { ...result, endKey: '0'.repeat(16) })).toThrow(/Kpos mismatch/);
    expect(() => verifySeatTurn(state, { ...result, source: 'fallback' })).toThrow(/fallback/);
    expect(() => verifySeatTurn(state, { ...result, actions: [] })).toThrow(/length/);
    expect(() => verifySeatTurn(state, { ...result, actions: [{ type: 'MOVE', unitId: 'missing', to: { x: 5, y: 5 } }] })).toThrow(/Illegal/);
    expect(() => verifySeatTurn(state, { ...result, actions: [...result.actions, { type: 'END_ACTION_PHASE' }] })).toThrow(/cross-turn/);
    // Ending only the ACTION phase leaves the same player on the same turn in
    // the Prepare phase: a Phasing turn is not over until END_PLACE_PHASE, and
    // the CANONICAL verifier is what says so (`verify/replay.ts`). The seat's
    // own "partial turn" guard below it stays as a second line of defence.
    expect(() => verifySeatTurn(state, resultFor(state, [{ type: 'END_ACTION_PHASE' }]))).toThrow(/Incomplete Phasing macro/);
    const action = { type: 'MOVE' as const, unitId: state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id, to: { x: 2, y: 0 } };
    expect(() => verifySeatTurn(state, resultFor(state, [action]))).toThrow(/Incomplete Phasing macro/);
    expect(verifySeatTurn(state, resultFor(state, [action, ...MACRO_TURN])).turn.currentPlayer).toBe('black');
  });
  it('separates a timed-out search from a diverged one instead of calling both "unsearched"', () => {
    const { state } = fixture(), ok = resultFor(state);
    expect(classifyFallback(ok)).toBeNull();
    expect(classifyFallback({ ...ok, fallback: 'divergence' })).toBe('divergence');
    expect(classifyFallback({ ...ok, fallback: 'pack-error' })).toBe('pack-error');
    const timedOut = { ...ok, source: 'fallback' as const, stats: { ...newSearchStats(), stopReason: 'abort' as const } };
    expect(classifyFallback(timedOut)).toBe('time');
    const spent = { ...ok, source: 'fallback' as const, stats: { ...newSearchStats(), stopReason: 'work' as const } };
    expect(classifyFallback(spent)).toBe('work-exhausted');
    // A complete search that still produced nothing is neither: a terminal or
    // empty root. It keeps the old word so the two real causes stand out.
    expect(classifyFallback({ ...ok, source: 'fallback' })).toBe('unsearched');
    expect(() => verifySeatTurn(state, timedOut)).toThrow(/Engine fallback: time/);
  });
  it('refuses a Standard room, an archived room, and a seat with no readiness claim', () => {
    const { room } = fixture();
    const opened = { roomId: room.id, contract: { mode: 'phasing-smoke', ...READINESS } as SeatContract };
    // The replica cannot pack a Standard room at all; this is the message.
    expect(() => assertSeatRoom({ ...room, state: { ...room.state, ruleset: 'standard' } }, opened)).toThrow(/Phasing only/);
    expect(() => assertSeatRoom({ ...room, state: { ...room.state, ruleset: undefined } }, opened)).toThrow(/Phasing only/);
    expect(() => assertSeatRoom({ ...room, archivedAt: '2026-09-19' }, opened)).toThrow(/read-only/);
    // Default closed: no contract at all, and a contract without the claim.
    expect(() => assertSeatRoom(room)).toThrow(/closed/);
    expect(() => assertSeatRoom(room, { roomId: room.id, contract: { mode: 'phasing-smoke' } })).toThrow(/phasingHardReadiness/);
    expect(() => assertSeatRoom(room, opened)).not.toThrow();
  });
  it('opens the gate on a version-pinned research claim without ever claiming M7 passed, and keeps old journals parsing', () => {
    const { room } = fixture();
    const research = { kind: 'research' as const, campaign: 'muju-llm-pilot-2026-09-23', rulesId: 'phasing-4',
      engineSourceSha256: 'a'.repeat(64), readinessEvidence: 'smoke match P00 completed and verified' };
    const opened = { roomId: room.id, contract: { mode: 'phasing-smoke', researchReadiness: research } as SeatContract };
    expect(() => assertSeatRoom(room, opened)).not.toThrow();
    expect((opened.contract as { phasingHardReadiness?: string }).phasingHardReadiness).toBeUndefined();
    // A research claim must never ride alongside an M7-passed claim.
    expect(() => seatConfigSchema.parse({ mode: 'phasing-smoke', serverUrl: 'http://localhost', roomId: room.id, seed: 1,
      stateFile: '/private/x.json', name: 'Engine', inviteCode: 'a'.repeat(64),
      phasingHardReadiness: PHASING_HARD_READINESS, researchReadiness: research })).toThrow(/both/);
    // A pre-research journal (only phasingHardReadiness, no researchReadiness field at all) still parses.
    const legacyJournal = { version: 3 as const, admission: 'join' as const,
      contract: { mode: 'phasing-smoke' as const, ...READINESS },
      seed: 42, connection: { serverUrl: 'http://localhost', roomId: room.id, player: 'white' as const, token: 'secret'.repeat(8) } };
    expect(() => seatJournalSchema.parse(legacyJournal)).not.toThrow();
  });
  it('refuses to run a whole seat without the readiness claim, before any engine or network write', async () => {
    const { room, journal } = fixture(), createEngine = vi.fn();
    delete (journal.contract as { phasingHardReadiness?: string }).phasingHardReadiness;
    const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn() };
    await expect(runSeat({ journal, transport, createEngine, save: vi.fn(), log: vi.fn() })).rejects.toThrow(/phasingHardReadiness/);
    expect(createEngine).not.toHaveBeenCalled(); expect(transport.play).not.toHaveBeenCalled(); expect(transport.wait).not.toHaveBeenCalled();
  });
  it('refuses any readiness value that is not the exact literal', () => {
    const { config } = pinnedFixture();
    for (const value of [true, 'M7', 'm7-passed', '', 'M7-passed ']) {
      expect(() => seatConfigSchema.parse({ ...config, phasingHardReadiness: value })).toThrow();
    }
  });
});
it('long-polls, searches under the deadline, durably saves before submission, and retries the identical batch', async () => {
  const { room, journal, state, finish } = fixture();
  const stored: SeatJournal[] = [], logs: Record<string, unknown>[] = [];
  const searchTurn = vi.fn().mockResolvedValue(resultFor(state));
  const createEngine = vi.fn().mockReturnValue({ searchTurn });
  const play = vi.fn().mockImplementationOnce(async (_c, request) => {
    expect(stored.at(-1)?.pending).toEqual(request); throw new TypeError('connection lost');
  }).mockResolvedValueOnce(finish);
  const transport: SeatTransport = { read: vi.fn().mockResolvedValueOnce({ ...room, ready: false }).mockResolvedValue(room),
    wait: vi.fn().mockResolvedValue({ changed: true, room: { ...room, authenticatedPlayer: undefined } }), play };
  await runSeat({ journal, transport, createEngine, save: s => stored.push(structuredClone(s)), log: e => logs.push(e) });
  expect(transport.wait).toHaveBeenCalledWith(journal.connection, 1, undefined);
  expect(transport.read).toHaveBeenCalledTimes(5); // Initial, public-wait refresh, post-acquire, pre-submit, uncertain retry.
  expect(createEngine).toHaveBeenCalledTimes(1); expect(createEngine).toHaveBeenCalledWith(42);
  // The rung is sized BELOW the watchdog: an over-estimate finishes instead of
  // being killed at the deadline it was sized for.
  expect(searchTurn).toHaveBeenCalledWith(state, { targetMs: ENGINE_TARGET_MS, deadlineMs: ENGINE_ALLOWANCE_MS });
  expect(ENGINE_TARGET_MS).toBeLessThan(ENGINE_ALLOWANCE_MS);
  expect(play).toHaveBeenCalledTimes(2); expect(play.mock.calls[0]).toEqual(play.mock.calls[1]);
  expect(play.mock.calls[0][1].actions).toEqual(MACRO_TURN);
  expect(stored.at(-1)?.pending).toBeUndefined();
  expect(logs.find(e => e.event === 'search')).toMatchObject({ verified: true, allowanceMs: 60000, targetMs: ENGINE_TARGET_MS, overrunMs: 0, fallback: null });
  expect(typeof logs.find(e => e.event === 'search')?.queueDelayMs).toBe('number');
  expect(logs.find(e => e.event === 'room-contract-verified')).toMatchObject({ mode: 'phasing-smoke', ruleset: 'phasing' });
  expect(JSON.stringify(logs)).not.toContain(journal.connection.token);
});
it('retries a failed read with bounded backoff and gives up after the last attempt', async () => {
  const { room, journal, state, finish } = fixture(), logs: Record<string, unknown>[] = [], slept: number[] = [];
  const read = vi.fn()
    .mockRejectedValueOnce(new TypeError('socket hang up'))
    .mockRejectedValueOnce(new TypeError('socket hang up'))
    .mockResolvedValue(room);
  const transport = { read, wait: vi.fn(), play: vi.fn().mockResolvedValue(finish) };
  await runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => resultFor(state) }),
    save: vi.fn(), log: e => logs.push(e), sleep: async ms => { slept.push(ms); } });
  expect(slept).toEqual([TRANSPORT_BACKOFF_MS, TRANSPORT_BACKOFF_MS * 2]);
  expect(logs.filter(e => e.event === 'transport-retry')).toHaveLength(2);
  expect(logs.filter(e => e.event === 'transport-retry').every(e => e.leg === 'read')).toBe(true);
  // Bounded: the (TRANSPORT_ATTEMPTS)th failure is the caller's problem.
  const always = vi.fn().mockRejectedValue(new TypeError('socket hang up'));
  const second = fixture();
  await expect(runSeat({ journal: second.journal, transport: { read: always, wait: vi.fn(), play: vi.fn() },
    createEngine: vi.fn(), save: vi.fn(), log: vi.fn(), sleep: async () => {} })).rejects.toThrow(/socket hang up/);
  expect(always).toHaveBeenCalledTimes(TRANSPORT_ATTEMPTS);
});
it('never retries a server answer: an OnlineError stops the read leg at once', async () => {
  const { journal } = fixture(), logs: Record<string, unknown>[] = [];
  const read = vi.fn().mockRejectedValue(new OnlineError('Gone', 'ROOM_NOT_FOUND', 404));
  await expect(runSeat({ journal, transport: { read, wait: vi.fn(), play: vi.fn() }, createEngine: vi.fn(),
    save: vi.fn(), log: e => logs.push(e), sleep: async () => { throw new Error('must not sleep'); } })).rejects.toThrow('Gone');
  expect(read).toHaveBeenCalledTimes(1);
  expect(logs.some(e => e.event === 'transport-retry')).toBe(false);
});
it('recovers a pending request after terminal acknowledgement loss without searching again', async () => {
  const { journal, finish } = fixture();
  journal.pending = { expectedRevision: 1, requestId: 'persisted-batch', actions: MACRO_TURN };
  const original = structuredClone(journal.pending), createEngine = vi.fn();
  const transport = { read: vi.fn().mockResolvedValue(finish), play: vi.fn().mockResolvedValue(finish), wait: vi.fn() };
  await runSeat({ journal, transport, createEngine, save: vi.fn(), log: vi.fn() });
  expect(transport.play).toHaveBeenCalledWith(journal.connection, original); expect(createEngine).not.toHaveBeenCalled();
  expect(journal.pending).toBeUndefined();
});
it('stops on stale revisions while preserving the pending request and credentials', async () => {
  const { journal, room, state } = fixture(), connection = structuredClone(journal.connection);
  const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn().mockRejectedValue(new OnlineError('Stale', 'STALE_REVISION', 409)) };
  await expect(runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => resultFor(state) }), save: vi.fn(), log: vi.fn() })).rejects.toThrow('Stale');
  expect(transport.play).toHaveBeenCalledTimes(1); expect(journal.pending?.expectedRevision).toBe(1); expect(journal.connection).toEqual(connection);
});
it('logs a fallback and never sends a partial or unverified replacement', async () => {
  const { journal, room, state } = fixture(), logs: Record<string, unknown>[] = [];
  const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn() };
  await expect(runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => ({ ...resultFor(state), fallback: 'divergence' }) }), save: vi.fn(), log: e => logs.push(e) })).rejects.toThrow('fallback');
  expect(transport.play).not.toHaveBeenCalled(); expect(journal.pending).toBeUndefined();
  expect(logs.find(e => e.event === 'search')).toMatchObject({ event: 'search', fallback: 'divergence', verified: false });
});
it('records a watchdog abort as time, not as a divergence', async () => {
  const { journal, room, state } = fixture(), logs: Record<string, unknown>[] = [];
  const timedOut = { ...resultFor(state), source: 'fallback' as const, stats: { ...newSearchStats(), stopReason: 'abort' as const } };
  const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn() };
  await expect(runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => timedOut }), save: vi.fn(), log: e => logs.push(e) })).rejects.toThrow(/fallback: time/);
  expect(transport.play).not.toHaveBeenCalled();
  expect(logs.find(e => e.event === 'search')).toMatchObject({ fallback: 'time', stopReason: 'abort', verified: false });
});

function pinnedFixture() {
  const value = fixture();
  const config = seatConfigSchema.parse({ mode: 'pinned', serverUrl: value.journal.connection.serverUrl, roomId: value.room.id,
    seed: 42, stateFile: '/private/seat.json', credentials: { roomId: value.room.id, player: 'white', token: value.journal.connection.token },
    expectedMatchPolicy: { version: 1, toolTier: 'harnessed', protocolId: 'phasing-infrastructure-v1' },
    expectedTimeControl: { delaySeconds: 60, bankSeconds: 1800 }, expectedHandicap: 0, ...READINESS });
  if (config.mode !== 'pinned') throw new Error('Expected pinned fixture.');
  value.journal.admission = 'issued'; value.journal.contract = contractFor(config);
  value.room.matchPolicy = config.expectedMatchPolicy; value.room.timeControl = config.expectedTimeControl;
  value.room.clock = { serverNowMs: 1000, runningPlayer: 'white', turnStartedAtMs: 1000, deadlineAtMs: 1861000,
    delayRemainingMs: 60000, bankRemainingMs: { white: 1800000, black: 1800000 } };
  value.finish = { ...value.room, revision: 2, state: value.finish.state, clock: { ...value.room.clock, runningPlayer: null, deadlineAtMs: null } };
  return { ...value, config };
}

const mismatchedRooms: [string, (room: RoomSnapshot) => RoomSnapshot][] = [
  ['room identity', room => ({ ...room, id: 'b'.repeat(32) })],
  ['Standard ruleset', room => ({ ...room, state: { ...room.state, ruleset: 'standard' } })],
  ['absent policy', room => ({ ...room, matchPolicy: undefined })],
  ['policy version', room => ({ ...room, matchPolicy: { ...room.matchPolicy!, version: 2 as 1 } })],
  ['tool tier', room => ({ ...room, matchPolicy: { ...room.matchPolicy!, toolTier: 'centaur' } })],
  ['protocol', room => ({ ...room, matchPolicy: { ...room.matchPolicy!, protocolId: 'another-protocol' } })],
  ['absent time control', room => ({ ...room, timeControl: undefined })],
  ['untimed room', room => ({ ...room, timeControl: null, clock: null })],
  ['clock delay', room => ({ ...room, timeControl: { ...room.timeControl!, delaySeconds: 30 } })],
  ['clock bank', room => ({ ...room, timeControl: { ...room.timeControl!, bankSeconds: 600 } })],
  ['absent handicap', room => ({ ...room, state: { ...room.state, blackCrystalHandicap: undefined } })],
  ['handicap', room => ({ ...room, state: { ...room.state, blackCrystalHandicap: 3 } })],
  ['absent clock', room => ({ ...room, clock: undefined })],
  ['stopped clock', room => ({ ...room, clock: { ...room.clock!, deadlineAtMs: null } })],
  ['wrong running player', room => ({ ...room, clock: { ...room.clock!, runningPlayer: 'black' } })],
];
describe('pinned room contract', () => {
  it.each(mismatchedRooms)('rejects %s before construction, waiting, submission, or pending recovery', async (_label, change) => {
    for (const pending of [false, true]) {
      const { room, journal } = pinnedFixture();
      if (pending) journal.pending = { expectedRevision: 1, requestId: 'persisted-batch', actions: MACRO_TURN };
      const original = structuredClone(journal.pending), createEngine = vi.fn(), save = vi.fn();
      const transport = { read: vi.fn().mockResolvedValue(change(room)), wait: vi.fn(), play: vi.fn() };
      await expect(runSeat({ journal, transport, createEngine, save, log: vi.fn() })).rejects.toThrow();
      expect(createEngine).not.toHaveBeenCalled(); expect(transport.wait).not.toHaveBeenCalled(); expect(transport.play).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled(); expect(journal.pending).toEqual(original);
    }
  });
  it('keeps the allowance and its margin, verifies the server contract again before submission, and recovers an identical pending batch', async () => {
    const { journal, room, finish, state, config } = pinnedFixture(), logs: Record<string, unknown>[] = [];
    const searchTurn = vi.fn().mockResolvedValue(resultFor(state));
    const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn().mockResolvedValue(finish) };
    await runSeat({ journal, transport, createEngine: () => ({ searchTurn }), save: vi.fn(), log: e => logs.push(e) });
    expect(searchTurn).toHaveBeenCalledWith(state, { targetMs: 55000, deadlineMs: 60000 });
    expect(transport.read).toHaveBeenCalledTimes(3); // Initial, post-acquire, pre-submit.
    expect(logs.find(e => e.event === 'room-contract-verified')).toMatchObject({ mode: 'pinned', roomId: room.id, ruleset: 'phasing',
      matchPolicy: config.expectedMatchPolicy, timeControl: config.expectedTimeControl, handicap: 0 });
    journal.pending = { expectedRevision: 1, requestId: 'persisted-batch', actions: MACRO_TURN };
    const original = structuredClone(journal.pending), createEngine = vi.fn();
    transport.read.mockResolvedValue(finish); transport.play.mockClear();
    await runSeat({ journal, transport, createEngine, save: vi.fn(), log: vi.fn() });
    expect(transport.play).toHaveBeenCalledExactlyOnceWith(journal.connection, original);
    expect(createEngine).not.toHaveBeenCalled(); expect(journal.pending).toBeUndefined();
  });
  it.each(mismatchedRooms)('re-reads and rejects %s after search before sending the durable batch', async (_label, change) => {
    const { room, journal, state } = pinnedFixture(), save = vi.fn();
    // Initial, post-acquire (still good), then the pre-submit re-read that catches the mismatch.
    const transport = { read: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce(room).mockResolvedValueOnce(change(room)), wait: vi.fn(), play: vi.fn() };
    await expect(runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => resultFor(state) }), save, log: vi.fn() })).rejects.toThrow();
    expect(transport.play).not.toHaveBeenCalled(); expect(journal.pending?.expectedRevision).toBe(1); expect(save).toHaveBeenCalledTimes(1);
  });
  it('rejects a changed contract returned by long-poll before searching', async () => {
    const { room, journal } = pinnedFixture(), createEngine = vi.fn();
    const transport = { read: vi.fn().mockResolvedValue({ ...room, ready: false }),
      wait: vi.fn().mockResolvedValue({ changed: true, room: { ...room, matchPolicy: undefined } }), play: vi.fn() };
    await expect(runSeat({ journal, transport, createEngine, save: vi.fn(), log: vi.fn() })).rejects.toThrow(/policy/);
    expect(createEngine).not.toHaveBeenCalled(); expect(transport.play).not.toHaveBeenCalled();
  });
  it('rechecks the contract before an uncertain retry and preserves the original pending batch', async () => {
    const { room, journal, state } = pinnedFixture();
    // Initial, post-acquire, pre-submit (all good), then the uncertain-retry recheck that catches the mismatch.
    const transport = { read: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce(room).mockResolvedValueOnce(room).mockResolvedValueOnce({ ...room, matchPolicy: undefined }),
      wait: vi.fn(), play: vi.fn().mockRejectedValue(new TypeError('lost acknowledgement')) };
    await expect(runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => resultFor(state) }), save: vi.fn(), log: vi.fn() })).rejects.toThrow(/policy/);
    expect(transport.play).toHaveBeenCalledTimes(1); expect(journal.pending).toEqual(transport.play.mock.calls[0][1]);
  });
  it('retains pending after an acknowledgement from the wrong room', async () => {
    const { room, journal, state, finish } = pinnedFixture();
    const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn().mockResolvedValue({ ...finish, id: 'b'.repeat(32) }) };
    await expect(runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => resultFor(state) }), save: vi.fn(), log: vi.fn() })).rejects.toThrow(/identity/);
    expect(transport.play).toHaveBeenCalledTimes(1); expect(journal.pending).toBeDefined();
  });
  it('rejects a stale revision found before submission without discarding the pending batch', async () => {
    const { room, journal, state } = pinnedFixture();
    const transport = { read: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce(room).mockResolvedValueOnce({ ...room, revision: 2 }), wait: vi.fn(), play: vi.fn() };
    await expect(runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => resultFor(state) }), save: vi.fn(), log: vi.fn() })).rejects.toMatchObject({ code: 'STALE_REVISION' });
    expect(transport.play).not.toHaveBeenCalled(); expect(journal.pending?.expectedRevision).toBe(1);
  });
  it('rejects insufficient room allowance before constructing the engine', async () => {
    const { room, journal } = pinnedFixture(), createEngine = vi.fn();
    room.clock!.deadlineAtMs = room.clock!.serverNowMs + 60000;
    const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn() };
    await expect(runSeat({ journal, transport, createEngine, save: vi.fn(), log: vi.fn() })).rejects.toThrow(/Insufficient room clock/);
    expect(createEngine).not.toHaveBeenCalled(); expect(transport.play).not.toHaveBeenCalled();
  });
  it('never lets smoke mode stand in for a pinned match', async () => {
    const { room } = pinnedFixture(), { journal } = fixture(), createEngine = vi.fn();
    const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn() };
    await expect(runSeat({ journal, transport, createEngine, save: vi.fn(), log: vi.fn() })).rejects.toThrow(/ordinary room/);
    expect(createEngine).not.toHaveBeenCalled(); expect(transport.play).not.toHaveBeenCalled();
  });
  it.each([undefined, 'black'] as const)('rejects missing or different authenticated identity (%s) after a public wait', async authenticatedPlayer => {
    const { room, journal } = pinnedFixture(), createEngine = vi.fn();
    const transport = { read: vi.fn().mockResolvedValueOnce({ ...room, ready: false }).mockResolvedValueOnce({ ...room, authenticatedPlayer }),
      wait: vi.fn().mockResolvedValue({ changed: true, room: { ...room, authenticatedPlayer: undefined } }), play: vi.fn() };
    await expect(runSeat({ journal, transport, createEngine, save: vi.fn(), log: vi.fn() })).rejects.toThrow(/authenticated seat/);
    expect(createEngine).not.toHaveBeenCalled(); expect(transport.play).not.toHaveBeenCalled();
  });
  it('retains the durable batch if authenticated identity changes before submission', async () => {
    const { room, journal, state } = pinnedFixture(), save = vi.fn();
    const transport = { read: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce(room).mockResolvedValueOnce({ ...room, authenticatedPlayer: 'black' }), wait: vi.fn(), play: vi.fn() };
    await expect(runSeat({ journal, transport, createEngine: () => ({ searchTurn: async () => resultFor(state) }), save, log: vi.fn() })).rejects.toThrow(/authenticated seat/);
    expect(transport.play).not.toHaveBeenCalled(); expect(journal.pending).toBeDefined(); expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('private issued credentials and resume contract', () => {
  it('initializes through an authenticated read without joining or consuming an invitation', async () => {
    const { config, room } = pinnedFixture(), reserve = vi.fn();
    const transport = { read: vi.fn().mockResolvedValue(room), inspect: vi.fn(), join: vi.fn() };
    const journal = await initializeSeat(config, reserve, transport);
    expect(transport.read).toHaveBeenCalledExactlyOnceWith({ ...config.credentials, serverUrl: config.serverUrl });
    expect(transport.join).not.toHaveBeenCalled(); expect(transport.inspect).not.toHaveBeenCalled(); expect(reserve).toHaveBeenCalledTimes(1);
    const persisted = seatJournalSchema.parse(JSON.parse(JSON.stringify(journal)));
    expect(persisted.version).toBe(3);
    expect(() => assertSeatConfiguration(persisted, config)).not.toThrow();
    expect(persisted.contract).toEqual(contractFor(config)); expect(persisted.connection.token).toBe(config.credentials.token);
    // The readiness claim is persisted WITH the contract, so a closed run
    // cannot be reopened by editing only the configuration on resume.
    expect(persisted.contract.phasingHardReadiness).toBe(PHASING_HARD_READINESS);
    const { phasingHardReadiness: _dropped, ...closed } = config;
    expect(() => assertSeatConfiguration(persisted, seatConfigSchema.parse(closed))).toThrow(/differs|differ/);
  });
  it.each(['mode', 'credentials', 'expectedMatchPolicy', 'expectedTimeControl', 'expectedHandicap'] as const)('requires explicit %s before any admission action', async field => {
    const { config } = pinnedFixture();
    const incomplete = { ...config } as Record<string, unknown>; delete incomplete[field];
    const transport = { read: vi.fn(), inspect: vi.fn(), join: vi.fn() }, reserve = vi.fn();
    await expect(initializeSeat(incomplete as SeatConfig, reserve, transport)).rejects.toThrow();
    expect(transport.read).not.toHaveBeenCalled(); expect(transport.inspect).not.toHaveBeenCalled(); expect(transport.join).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled();
  });
  it('rejects credentials for another room before reading or joining', async () => {
    const { config } = pinnedFixture(); config.credentials.roomId = 'b'.repeat(32);
    const transport = { read: vi.fn(), inspect: vi.fn(), join: vi.fn() }, reserve = vi.fn();
    await expect(initializeSeat(config, reserve, transport)).rejects.toThrow(/different room/);
    expect(transport.read).not.toHaveBeenCalled(); expect(transport.join).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled();
  });
  it('rejects a mismatched server contract before reserving credentials or joining', async () => {
    const { config, room } = pinnedFixture();
    const transport = { read: vi.fn().mockResolvedValue({ ...room, matchPolicy: undefined }), inspect: vi.fn(), join: vi.fn() }, reserve = vi.fn();
    await expect(initializeSeat(config, reserve, transport)).rejects.toThrow(/policy/);
    expect(transport.join).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled();
  });
  it('refuses to initialize a seat whose configuration makes no readiness claim', async () => {
    const { config, room } = pinnedFixture();
    const { phasingHardReadiness: _dropped, ...closed } = config;
    const transport = { read: vi.fn().mockResolvedValue(room), inspect: vi.fn(), join: vi.fn() }, reserve = vi.fn();
    await expect(initializeSeat(seatConfigSchema.parse(closed), reserve, transport)).rejects.toThrow(/phasingHardReadiness/);
    expect(transport.join).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled();
  });
  it('preserves explicit ordinary invite-based smoke initialization', async () => {
    const { room, journal } = fixture(), reserve = vi.fn();
    const config = seatConfigSchema.parse({ mode: 'phasing-smoke', serverUrl: journal.connection.serverUrl, roomId: room.id, seed: 42,
      stateFile: '/private/smoke.json', name: 'Engine', inviteCode: 'a'.repeat(64), ...READINESS });
    const { serverUrl: _serverUrl, ...credentials } = journal.connection;
    const transport = { read: vi.fn(), inspect: vi.fn().mockResolvedValue(room), join: vi.fn().mockImplementation(async () => {
      expect(reserve).toHaveBeenCalledTimes(1); return { room, credentials };
    }) };
    const joined = await initializeSeat(config, reserve, transport);
    expect(joined.admission).toBe('join'); expect(joined.contract).toEqual({ mode: 'phasing-smoke', ...READINESS }); expect(transport.join).toHaveBeenCalledTimes(1);
    expect(() => assertSeatConfiguration(seatJournalSchema.parse(JSON.parse(JSON.stringify(joined))), config)).not.toThrow();
  });
  it('rejects altered or omitted expectations and issued credentials on resume', () => {
    const { config, journal } = pinnedFixture();
    const mutations: ((value: typeof config) => SeatConfig)[] = [
      value => ({ ...value, expectedMatchPolicy: { ...value.expectedMatchPolicy, protocolId: 'changed' } }),
      value => ({ ...value, expectedMatchPolicy: { ...value.expectedMatchPolicy, toolTier: 'centaur' } }),
      value => ({ ...value, expectedTimeControl: { delaySeconds: 30, bankSeconds: 1800 } }),
      value => ({ ...value, expectedHandicap: 3 }),
      value => ({ ...value, credentials: { ...value.credentials, player: 'black' } }),
      value => ({ ...value, credentials: { ...value.credentials, token: 'changed'.repeat(8) } }),
      value => ({ mode: 'phasing-smoke', serverUrl: value.serverUrl, roomId: value.roomId, seed: value.seed, stateFile: value.stateFile, credentials: value.credentials, ...READINESS }),
      value => ({ mode: 'phasing-smoke', serverUrl: value.serverUrl, roomId: value.roomId, seed: value.seed, stateFile: value.stateFile, name: 'Engine', inviteCode: 'a'.repeat(64), ...READINESS }),
    ];
    for (const mutate of mutations) expect(() => assertSeatConfiguration(journal, seatConfigSchema.parse(mutate(config)))).toThrow(/differs|differ/);
    expect(() => seatJournalSchema.parse({ ...journal, version: 1, contract: undefined })).toThrow();
    // A version-2 journal is a STANDARD seat's journal; it is restarted, never
    // resumed into a Phasing-only seat.
    expect(() => seatJournalSchema.parse({ ...journal, version: 2 })).toThrow();
    expect(() => seatJournalSchema.parse({ ...journal, contract: { mode: 'pinned' } })).toThrow();
  });
});

it('re-verifies an actual bounded Phasing HardEngine search', async () => {
  const { state } = fixture(), engine = new HardEngine(hardEnginePatch('desktop'));
  engine.setSeed(42);
  const result = await engine.searchTurn(state, { work: 25_000 });
  expect(result.fallback).toBeUndefined();
  expect(classifyFallback(result)).toBeNull();
  // A complete Phasing macro turn: the Act phase ends, then the Prepare phase.
  expect(result.actions.map(a => a.type)).toContain('END_ACTION_PHASE');
  expect(result.actions.at(-1)?.type).toBe('END_PLACE_PHASE');
  expect(verifySeatTurn(state, result).turn.currentPlayer).toBe('black');
});

describe('per-search heavy-slot acquisition (Component A)', () => {
  /**
   * This block exercises the REAL heavy-work queue (`acquireHeavySlot` in
   * `lab/hard-ai/ladder/heavy.ts`), so it opts out of the file-wide bypass and
   * points MUJU_HEAVY_DIR at a throwaway directory instead of
   * `~/.local/state/muju-heavy`, exactly like `tests/lab/heavy-queue.test.ts`.
   */
  let dir = '';
  const envBackup: Record<string, string | undefined> = {};
  function setEnv(key: string, value: string | undefined) {
    if (!(key in envBackup)) envBackup[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muju-engine-seat-heavy-test-'));
    setEnv('MUJU_HEAVY_DIR', dir); setEnv('MUJU_HEAVY_SLOTS', '2'); setEnv('MUJU_HEAVY_BYPASS', undefined);
  });
  afterAll(() => {
    for (const [key, value] of Object.entries(envBackup)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('never lets 4 concurrent seats hold more than MUJU_HEAVY_SLOTS (2) slots at once', async () => {
    const { readSlots } = await import('../../lab/hard-ai/ladder/heavy');
    // Four independent games, each with its own room, journal, and a stubbed
    // search slow enough (60ms) to force real overlap across 4 concurrent
    // seats contending for 2 slots.
    const seats = Array.from({ length: 4 }, (_, i) => {
      const { room, journal, state, finish } = fixture();
      const roomed = { ...room, id: room.id.slice(0, -1) + i.toString(16) };
      journal.connection = { ...journal.connection, roomId: roomed.id };
      const finished = { ...finish, id: roomed.id };
      const searchTurn = vi.fn(() => new Promise(resolve => setTimeout(() => resolve(resultFor(state)), 60)));
      const transport: SeatTransport = {
        read: vi.fn().mockResolvedValueOnce({ ...roomed, ready: false }).mockResolvedValue(roomed),
        wait: vi.fn().mockResolvedValue({ changed: true, room: { ...roomed, authenticatedPlayer: undefined } }),
        play: vi.fn().mockResolvedValue(finished),
      };
      return { journal, transport, createEngine: vi.fn().mockReturnValue({ searchTurn }) };
    });
    let maxConcurrentSlots = 0;
    const polling = setInterval(() => {
      const held = readSlots().filter(s => s.record !== null && !s.stale).length;
      if (held > maxConcurrentSlots) maxConcurrentSlots = held;
    }, 5);
    try {
      await Promise.all(seats.map(seat => runSeat({ journal: seat.journal, transport: seat.transport, createEngine: seat.createEngine, save: vi.fn(), log: vi.fn() })));
    } finally { clearInterval(polling); }
    for (const seat of seats) expect(seat.createEngine).toHaveBeenCalledTimes(1);
    expect(maxConcurrentSlots).toBeGreaterThan(0); // real contention happened
    expect(maxConcurrentSlots).toBeLessThanOrEqual(2);
    expect(readSlots().filter(s => s.record !== null && !s.stale)).toHaveLength(0); // all released
  }, 10_000);
});
