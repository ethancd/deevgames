// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore, ROOM_IDLE_MS } from '../../server/rooms';
import type { RoomAction } from '../../src/online/types';

const epoch = 1800000000000;
const stores: RoomStore[] = [], directories: string[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => { stores.splice(0).forEach(store => store.close()); directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); vi.useRealTimers(); });
const open = (path?: string, maxRooms?: number) => { const store = new RoomStore(path, maxRooms); stores.push(store); return store; };
const request = (revision: number, actions: RoomAction[]) => ({ expectedRevision: revision, actions, requestId: `fork-test-${revision}` });
function setup(timeControl: unknown = 'rapid', path?: string) {
  const store = open(path), host = store.create({ name: 'White', timeControl, blackCrystalHandicap: 9.5 });
  const id = host.room.id, guest = store.join(id, { name: 'Black', inviteCode: host.inviteCode });
  return { store, host, guest, id };
}
const forkInput = (revision: number) => ({ name: 'Fork host', side: 'black', expectedRevision: revision });

describe('independent forks with fresh clocks', () => {
  it('preserves a partial Black turn, isolates seats/history/staging, and starts Black only on join', () => {
    const { store, host, guest, id } = setup();
    store.act(id, host.credentials.token, request(1, [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }]));
    const unit = store.get(id).state.board.units.find(u => u.owner === 'black' && u.definitionId === 'fire_1')!;
    store.act(id, guest.credentials.token, request(2, [{ type: 'MOVE', unitId: unit.id, to: { x: 7, y: 9 } }]));
    vi.setSystemTime(epoch + 45000);
    store.stage(id, guest.credentials.token, { requestId: 'source-private-stage', expectedTurnNumber: 1, expectedStageVersion: 0,
      commitWhenRemainingMs: 1000, actions: [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }] });
    const before = store.get(id, guest.credentials.token);
    expect(before.state.turn).toMatchObject({ currentPlayer: 'black', actionsRemaining: 3 });
    expect(before.clock?.bankRemainingMs.black).toBe(585000);
    expect(before.staging?.pending).toBeTruthy();
    const fork = store.fork(id, forkInput(before.revision)), fid = fork.room.id;
    expect(fork.room.state).toEqual(before.state);
    expect(fork.room).toMatchObject({ revision: 0, ready: false, canUndo: false, seats: { white: null, black: 'Fork host' },
      history: [], lastTurnReplay: null, forkedFrom: { roomId: id, revision: before.revision, sequence: null, watchCode: before.watchCode },
      clock: { runningPlayer: null, deadlineAtMs: null, turnStartedAtMs: null, delayRemainingMs: 30000, bankRemainingMs: { white: 600000, black: 600000 } } });
    expect(fork.inviteCode).not.toBe(host.inviteCode);
    expect(fork.credentials.token).not.toBe(guest.credentials.token);
    expect(fork.room.watchCode).not.toBe(before.watchCode);
    expect(store.resolveInvitation(fork.inviteCode!)).toEqual({ roomId: fid });
    expect(store.get(fid, fork.credentials.token).staging?.pending).toBeNull();
    expect(store.moveHistory(fid)).toMatchObject({ entries: [], recordingStart: { complete: false, player: 'black', turnNumber: 1 } });
    expect(store.position(fid, 0).state).toEqual(before.state);
    expect(store.get(id, guest.credentials.token)).toEqual(before);
    expect(() => store.get(fid, guest.credentials.token)).toThrow(/invalid/);
    expect(() => store.join(fid, { name: 'Old invitation', inviteCode: host.inviteCode })).toThrow(/invalid/);
    vi.setSystemTime(epoch + 100000);
    expect(store.get(fid).clock?.bankRemainingMs).toEqual({ white: 600000, black: 600000 });
    const joined = store.join(fid, { name: 'New White', inviteCode: fork.inviteCode });
    expect(joined.credentials.player).toBe('white');
    expect(joined.room.clock).toMatchObject({ runningPlayer: 'black', deadlineAtMs: Date.now() + 630000, delayRemainingMs: 30000 });
    expect(joined.room.clockPressure).toMatchObject({ sampling: { completeFromGameStart: false }, players: { white: { completedTurns: 0 }, black: { completedTurns: 0 } } });
    expect(() => store.act(fid, fork.credentials.token, request(1, [{ type: 'UNDO' }]))).toThrow(/UNDO/);
    const moved = store.act(fid, fork.credentials.token, request(1, [{ type: 'MOVE', unitId: unit.id, to: { x: 6, y: 9 } }]));
    expect(moved.state.turn.actionsRemaining).toBe(2);
    expect(store.act(fid, fork.credentials.token, request(2, [{ type: 'UNDO' }])).state).toEqual(before.state);
    expect(store.get(id).state).toEqual(before.state);
  });

  it.each(['timeout', 'abandoned'] as const)('resumes %s exactly, including after persistence/restart, and preserves the original verdict', reason => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-forks-')); directories.push(dir);
    const path = join(dir, 'rooms.sqlite');
    const { store, host, id } = setup(reason === 'timeout' ? { delaySeconds: 0, bankSeconds: 2 } : null, path);
    const unit = host.room.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
    const before = store.act(id, host.credentials.token, request(1, [{ type: 'MOVE', unitId: unit.id, to: { x: 2, y: 0 } }]));
    vi.setSystemTime(epoch + (reason === 'timeout' ? 2000 : ROOM_IDLE_MS));
    const terminal = store.get(id);
    expect(terminal.state.victoryReason).toBe(reason);
    const fork = store.fork(id, { ...forkInput(terminal.revision), timeControl: { delaySeconds: 150, bankSeconds: 1800 } });
    expect(fork.room.state).toEqual(before.state);
    expect(fork.room.forkedFrom?.resumedAfter).toBe(reason);
    expect(fork.room.archivedAt).toBeUndefined();
    expect(fork.room.clock?.bankRemainingMs).toEqual({ white: 1800000, black: 1800000 });
    expect(store.get(id)).toEqual(terminal);
    store.close(); stores.splice(stores.indexOf(store), 1);
    const reopened = open(path);
    expect(reopened.get(fork.room.id).state).toEqual(before.state);
    expect(reopened.position(fork.room.id, 0).state).toEqual(before.state);
    const joined = reopened.join(fork.room.id, { name: 'Returning White', inviteCode: fork.inviteCode });
    expect(joined.room.clock).toMatchObject({ runningPlayer: 'white', deadlineAtMs: Date.now() + 1950000 });
    expect(reopened.get(id).state.victoryReason).toBe(reason);
  });

  it('forks a saved movement step or root without carrying later moves or undo across the boundary', () => {
    const { store, host, id } = setup(null);
    const unit = host.room.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
    const moved = store.act(id, host.credentials.token, request(1, [{ type: 'MOVE', unitId: unit.id, to: { x: 5, y: 0 } }]));
    const sequence = store.moveHistory(id).entries[0].sequence;
    const fork = store.fork(id, { ...forkInput(moved.revision), sequence, step: 1 });
    expect(fork.room.state).toEqual(store.position(id, sequence, 1).state);
    expect(fork.room.state.turn.actionsRemaining).toBe(3);
    expect(fork.room.state.board.units.find(u => u.id === unit.id)?.position).toEqual({ x: 3, y: 0 });
    const root = store.fork(id, { ...forkInput(moved.revision), sequence: 0 });
    expect(root.room.state).toEqual(host.room.state);
    store.act(id, host.credentials.token, request(2, [{ type: 'UNDO' }]));
    expect(() => store.fork(id, { ...forkInput(3), sequence })).toThrow(/unavailable or was undone/);
    expect(store.get(fork.room.id).state).toEqual(fork.room.state);
  });

  it('preserves gameplay bookkeeping and immutable match policy without importing private room data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-fork-state-')); directories.push(dir);
    const path = join(dir, 'rooms.sqlite');
    const { store, id } = setup('rapid', path);
    const db = new DatabaseSync(path);
    const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string);
    saved.state.turn.phase = 'place'; saved.state.upkeepPending = true; saved.state.inactivityPlies = 7;
    saved.state.progressThisTurn = true; saved.state.reviewUpkeep = { white: true };
    saved.state.board.units[0].damageTaken = 2; saved.state.board.units[0].attackedThisTurn = ['defeated-unit'];
    saved.state.board.units[0].promotedThisPlacement = true;
    saved.state.pendingSummons = [{ id: 'pending', definitionId: 'fire_1', owner: 'black', position: { x: 8, y: 8 }, cost: 3 }];
    saved.matchPolicy = { version: 1, toolTier: 'bare', protocolId: 'fork-policy' };
    db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(saved), id); db.close();
    const fork = store.fork(id, forkInput(1));
    expect(fork.room.state).toEqual(saved.state);
    expect(fork.room.matchPolicy).toEqual(saved.matchPolicy);
    expect(fork.room.canUndo).toBe(false);
    expect(() => store.fork(id, { ...forkInput(1), matchPolicy: null })).toThrow();
  });

  it('inherits controls by default, accepts presets/custom/null, and validates requests', () => {
    const { store, id } = setup();
    for (const [timeControl, expected] of [['blitz', { delaySeconds: 10, bankSeconds: 120 }], ['classical', { delaySeconds: 60, bankSeconds: 1800 }],
      [{ delaySeconds: 150, bankSeconds: 1800 }, { delaySeconds: 150, bankSeconds: 1800 }], [null, null]] as const) {
      expect(store.fork(id, { ...forkInput(1), timeControl }).room.timeControl).toEqual(expected);
    }
    expect(store.fork(id, forkInput(1)).room.timeControl).toEqual({ delaySeconds: 30, bankSeconds: 600 });
    const untimed = store.create({ name: 'Untimed' });
    expect(store.fork(untimed.room.id, forkInput(0)).room.clock).toBeNull();
    for (const extra of [{ step: 1 }, { sequence: -1 }, { sequence: 0, step: 2 }, { sequence: 999 }, { timeControl: 'unknown' },
      { timeControl: { delaySeconds: 601, bankSeconds: 1 } }, { timeControl: { delaySeconds: 0, bankSeconds: 0 } }, { state: {} }, { token: 'secret' }]) {
      expect(() => store.fork(id, { ...forkInput(1), ...extra })).toThrow();
    }
    expect(() => store.fork(id, { name: 'No revision' })).toThrow();
    expect(() => store.fork(id, forkInput(0))).toThrow(/changed/);
    expect(() => store.fork('a'.repeat(32), forkInput(0))).toThrow(/not found/);
  });

  it('persists expiry even if a stale fork fails, rejects other final positions, and enforces room capacity', () => {
    const { store, id } = setup({ delaySeconds: 0, bankSeconds: 1 });
    vi.setSystemTime(epoch + 1000);
    expect(() => store.fork(id, forkInput(1))).toThrow(/changed/);
    expect(store.get(id).state.victoryReason).toBe('timeout');
    const other = setup(null);
    other.store.act(other.id, other.host.credentials.token, request(1, [{ type: 'RESIGN' }]));
    expect(() => other.store.fork(other.id, forkInput(2))).toThrow(/earlier playable position/);
    expect(other.store.fork(other.id, { ...forkInput(2), sequence: 0 }).room.state.phase).toBe('playing');
    const limited = open(undefined, 1), host = limited.create({ name: 'Only room' });
    expect(() => limited.fork(host.room.id, forkInput(0))).toThrow(/room limit/);
    expect(limited.listActive()).toHaveLength(1);
  });
});


it('preserves MICRO MUJU variant identity through fork, join and play', () => {
  const store = open(), source = store.create({ name: 'Micro host', variant: 'micro', timeControl: 'rapid' });
  const fork = store.fork(source.room.id, { name: 'Micro fork', expectedRevision: 0 });
  expect(fork.room.state).toEqual(source.room.state);
  expect(fork.room.state.variant).toBe('micro');
  expect(store.get(fork.room.id).state.actionsPerTurn).toBe(2);
  store.join(fork.room.id, { name: 'Micro opponent', inviteCode: fork.inviteCode });
  const after = store.act(fork.room.id, fork.credentials.token, request(1, [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }]));
  expect(after.state.turn.currentPlayer).toBe('black');
  expect(after.state.variant).toBe('micro');
});
