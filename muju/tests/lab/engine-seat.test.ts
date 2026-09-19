// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
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
import { assertSeatRoom, ENGINE_ALLOWANCE_MS, runSeat, type SeatJournal, type SeatTransport } from '../../tools/engine-seat/runner';
import { verifySeatTurn } from '../../tools/engine-seat/verify';
import { assertSeatConfiguration, contractFor, initializeSeat, seatConfigSchema, seatJournalSchema, type SeatConfig } from '../../tools/engine-seat/config';
function resultFor(state: GameState, actions: AIAction[] = [{ type: 'END_ACTION_PHASE' }]): RootResult {
  const after = actions.reduce(applyAction, state), p = new Replica().pack(after, allocState());
  return { actions, scoreCc: 0, depth: 1, work: 25000, stats: newSearchStats(), source: 'search',
    endKey: [p.kposHi, p.kposLo].map(word => (word >>> 0).toString(16).padStart(8, '0')).join('') };
}
function fixture() {
  const state = createInitialGameState();
  const room: RoomSnapshot = { id: 'a'.repeat(32), authenticatedPlayer: 'white', revision: 1, ready: true, seats: { white: 'Engine', black: 'Opponent' },
    state, history: [], updatedAt: new Date().toISOString() };
  const journal: SeatJournal = { version: 2, admission: 'join', contract: { mode: 'standard-smoke' }, seed: 42,
    connection: { serverUrl: 'http://localhost', roomId: room.id, player: 'white', token: 'secret'.repeat(8) } };
  const finish = { ...room, revision: 2, state: { ...state, phase: 'victory' as const, winner: 'white' as const } };
  return { state, room, journal, finish };
}
describe('canonical whole-turn verification', () => {
  it('checks the supplied end key, and rejects partial, illegal, fallback, and cross-turn lines', () => {
    const { state } = fixture(), result = resultFor(state);
    expect(verifySeatTurn(state, result).turn.currentPlayer).toBe('black');
    expect(() => verifySeatTurn(state, { ...result, endKey: '0'.repeat(16) })).toThrow(/Kpos mismatch/);
    expect(() => verifySeatTurn(state, { ...result, source: 'fallback' })).toThrow(/fallback/);
    expect(() => verifySeatTurn(state, { ...result, actions: [] })).toThrow(/length/);
    expect(() => verifySeatTurn(state, { ...result, actions: [{ type: 'MOVE', unitId: 'missing', to: { x: 5, y: 5 } }] })).toThrow(/Illegal/);
    expect(() => verifySeatTurn(state, { ...result, actions: [...result.actions, { type: 'END_ACTION_PHASE' }] })).toThrow(/cross-turn/);
    const action = { type: 'MOVE' as const, unitId: state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id, to: { x: 2, y: 0 } };
    expect(() => verifySeatTurn(state, resultFor(state, [action]))).toThrow(/partial turn/);
  });
  it('blocks Phasing and archives before engine construction', () => {
    const { room } = fixture();
    expect(() => assertSeatRoom({ ...room, state: { ...room.state, ruleset: 'phasing' } })).toThrow(/pending M7/);
    expect(() => assertSeatRoom({ ...room, archivedAt: '2026-09-19' })).toThrow(/read-only/);
  });
});
it('long-polls, searches at exactly 60s, durably saves before submission, and retries the identical batch', async () => {
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
  expect(transport.read).toHaveBeenCalledTimes(4); // Initial, public-wait refresh, pre-submit, uncertain retry.
  expect(createEngine).toHaveBeenCalledTimes(1); expect(createEngine).toHaveBeenCalledWith(42);
  expect(searchTurn).toHaveBeenCalledWith(state, { targetMs: ENGINE_ALLOWANCE_MS, deadlineMs: ENGINE_ALLOWANCE_MS });
  expect(play).toHaveBeenCalledTimes(2); expect(play.mock.calls[0]).toEqual(play.mock.calls[1]);
  expect(stored.at(-1)?.pending).toBeUndefined(); expect(logs.find(e => e.event === 'search')).toMatchObject({ verified: true, allowanceMs: 60000, overrunMs: 0 });
  expect(JSON.stringify(logs)).not.toContain(journal.connection.token);
});
it('recovers a pending request after terminal acknowledgement loss without searching again', async () => {
  const { journal, finish } = fixture();
  journal.pending = { expectedRevision: 1, requestId: 'persisted-batch', actions: [{ type: 'END_ACTION_PHASE' }] };
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

function pinnedFixture() {
  const value = fixture();
  const config = seatConfigSchema.parse({ mode: 'pinned', serverUrl: value.journal.connection.serverUrl, roomId: value.room.id,
    seed: 42, stateFile: '/private/seat.json', credentials: { roomId: value.room.id, player: 'white', token: value.journal.connection.token },
    expectedMatchPolicy: { version: 1, toolTier: 'harnessed', protocolId: 'standard-infrastructure-v1' },
    expectedTimeControl: { delaySeconds: 60, bankSeconds: 1800 }, expectedHandicap: 0 });
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
      if (pending) journal.pending = { expectedRevision: 1, requestId: 'persisted-batch', actions: [{ type: 'END_ACTION_PHASE' }] };
      const original = structuredClone(journal.pending), createEngine = vi.fn(), save = vi.fn();
      const transport = { read: vi.fn().mockResolvedValue(change(room)), wait: vi.fn(), play: vi.fn() };
      await expect(runSeat({ journal, transport, createEngine, save, log: vi.fn() })).rejects.toThrow();
      expect(createEngine).not.toHaveBeenCalled(); expect(transport.wait).not.toHaveBeenCalled(); expect(transport.play).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled(); expect(journal.pending).toEqual(original);
    }
  });
  it('keeps the fixed 60s allowance, verifies the server contract again before submission, and recovers an identical pending batch', async () => {
    const { journal, room, finish, state, config } = pinnedFixture(), logs: Record<string, unknown>[] = [];
    const searchTurn = vi.fn().mockResolvedValue(resultFor(state));
    const transport = { read: vi.fn().mockResolvedValue(room), wait: vi.fn(), play: vi.fn().mockResolvedValue(finish) };
    await runSeat({ journal, transport, createEngine: () => ({ searchTurn }), save: vi.fn(), log: e => logs.push(e) });
    expect(searchTurn).toHaveBeenCalledWith(state, { targetMs: 60000, deadlineMs: 60000 });
    expect(transport.read).toHaveBeenCalledTimes(2);
    expect(logs.find(e => e.event === 'room-contract-verified')).toMatchObject({ mode: 'pinned', roomId: room.id,
      matchPolicy: config.expectedMatchPolicy, timeControl: config.expectedTimeControl, handicap: 0 });
    journal.pending = { expectedRevision: 1, requestId: 'persisted-batch', actions: [{ type: 'END_ACTION_PHASE' }] };
    const original = structuredClone(journal.pending), createEngine = vi.fn();
    transport.read.mockResolvedValue(finish); transport.play.mockClear();
    await runSeat({ journal, transport, createEngine, save: vi.fn(), log: vi.fn() });
    expect(transport.play).toHaveBeenCalledExactlyOnceWith(journal.connection, original);
    expect(createEngine).not.toHaveBeenCalled(); expect(journal.pending).toBeUndefined();
  });
  it.each(mismatchedRooms)('re-reads and rejects %s after search before sending the durable batch', async (_label, change) => {
    const { room, journal, state } = pinnedFixture(), save = vi.fn();
    const transport = { read: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce(change(room)), wait: vi.fn(), play: vi.fn() };
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
    const transport = { read: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce(room).mockResolvedValueOnce({ ...room, matchPolicy: undefined }),
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
    const transport = { read: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce({ ...room, revision: 2 }), wait: vi.fn(), play: vi.fn() };
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
    const transport = { read: vi.fn().mockResolvedValueOnce(room).mockResolvedValueOnce({ ...room, authenticatedPlayer: 'black' }), wait: vi.fn(), play: vi.fn() };
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
    expect(() => assertSeatConfiguration(persisted, config)).not.toThrow();
    expect(persisted.contract).toEqual(contractFor(config)); expect(persisted.connection.token).toBe(config.credentials.token);
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
  it('preserves explicit ordinary Standard invite-based smoke initialization', async () => {
    const { room, journal } = fixture(), reserve = vi.fn();
    const config = seatConfigSchema.parse({ mode: 'standard-smoke', serverUrl: journal.connection.serverUrl, roomId: room.id, seed: 42,
      stateFile: '/private/smoke.json', name: 'Engine', inviteCode: 'a'.repeat(64) });
    const { serverUrl: _serverUrl, ...credentials } = journal.connection;
    const transport = { read: vi.fn(), inspect: vi.fn().mockResolvedValue(room), join: vi.fn().mockImplementation(async () => {
      expect(reserve).toHaveBeenCalledTimes(1); return { room, credentials };
    }) };
    const joined = await initializeSeat(config, reserve, transport);
    expect(joined.admission).toBe('join'); expect(joined.contract).toEqual({ mode: 'standard-smoke' }); expect(transport.join).toHaveBeenCalledTimes(1);
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
      value => ({ mode: 'standard-smoke', serverUrl: value.serverUrl, roomId: value.roomId, seed: value.seed, stateFile: value.stateFile, credentials: value.credentials }),
      value => ({ mode: 'standard-smoke', serverUrl: value.serverUrl, roomId: value.roomId, seed: value.seed, stateFile: value.stateFile, name: 'Engine', inviteCode: 'a'.repeat(64) }),
    ];
    for (const mutate of mutations) expect(() => assertSeatConfiguration(journal, seatConfigSchema.parse(mutate(config)))).toThrow(/differs|differ/);
    expect(() => seatJournalSchema.parse({ ...journal, version: 1, contract: undefined })).toThrow();
    expect(() => seatJournalSchema.parse({ ...journal, contract: { mode: 'pinned' } })).toThrow();
  });
});

it('re-verifies an actual bounded Standard HardEngine search', async () => {
  const { state } = fixture(), engine = new HardEngine(hardEnginePatch('desktop'));
  engine.setSeed(42);
  const result = await engine.searchTurn(state, { work: 25_000 });
  expect(result.fallback).toBeUndefined();
  expect(verifySeatTurn(state, result).turn.currentPlayer).toBe('black');
});
