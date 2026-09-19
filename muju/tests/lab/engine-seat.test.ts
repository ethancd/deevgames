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
function resultFor(state: GameState, actions: AIAction[] = [{ type: 'END_ACTION_PHASE' }]): RootResult {
  const after = actions.reduce(applyAction, state), p = new Replica().pack(after, allocState());
  return { actions, scoreCc: 0, depth: 1, work: 25000, stats: newSearchStats(), source: 'search',
    endKey: [p.kposHi, p.kposLo].map(word => (word >>> 0).toString(16).padStart(8, '0')).join('') };
}
function fixture() {
  const state = createInitialGameState();
  const room: RoomSnapshot = { id: 'a'.repeat(32), revision: 1, ready: true, seats: { white: 'Engine', black: 'Opponent' },
    state, history: [], updatedAt: new Date().toISOString() };
  const journal: SeatJournal = { version: 1, seed: 42, connection: { serverUrl: 'http://localhost', roomId: room.id, player: 'white', token: 'secret'.repeat(8) } };
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
  const transport: SeatTransport = { read: vi.fn().mockResolvedValue({ ...room, ready: false }),
    wait: vi.fn().mockResolvedValue({ changed: true, room }), play };
  await runSeat({ journal, transport, createEngine, save: s => stored.push(structuredClone(s)), log: e => logs.push(e) });
  expect(transport.wait).toHaveBeenCalledWith(journal.connection, 1, undefined);
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
  expect(logs[0]).toMatchObject({ event: 'search', fallback: 'divergence', verified: false });
});

it('re-verifies an actual bounded Standard HardEngine search', async () => {
  const { state } = fixture(), engine = new HardEngine(hardEnginePatch('desktop'));
  engine.setSeed(42);
  const result = await engine.searchTurn(state, { work: 25_000 });
  expect(result.fallback).toBeUndefined();
  expect(verifySeatTurn(state, result).turn.currentPlayer).toBe('black');
});
