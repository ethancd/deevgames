// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore, ROOM_IDLE_MS } from '../../server/rooms';
import { RoomError } from '../../server/schema';
import type { PlayerId, Ruleset } from '../../src/game/types';
import type { RoomAction } from '../../src/online/types';

const epoch = 1800000000000;
const stores = new Set<RoomStore>(), directories: string[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => { stores.forEach(store => store.close()); stores.clear(); directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); vi.useRealTimers(); });
const open = (path?: string, limit?: number) => { const store = new RoomStore(path, limit); stores.add(store); return store; };
const close = (store: RoomStore) => { store.close(); stores.delete(store); };
const command = (expectedRevision: number, actions: RoomAction[], requestId = `lifecycle-${expectedRevision}`) => ({ expectedRevision, requestId, actions });
function file() { const dir = mkdtempSync(join(tmpdir(), 'muju-lifecycle-')); directories.push(dir); return join(dir, 'rooms.sqlite'); }
function setup(options: { side?: PlayerId; ruleset?: Ruleset; timed?: boolean; path?: string } = {}) {
  const store = open(options.path);
  const host = store.create({ name: 'Host', side: options.side ?? 'white', ruleset: options.ruleset ?? 'standard', timeControl: options.timed ? 'rapid' : null });
  const id = host.room.id, guest = store.join(id, { name: 'Guest', inviteCode: host.inviteCode });
  return { store, host, guest, id };
}
function code(operation: () => unknown, expected: string) { try { operation(); throw new Error('Expected rejection'); } catch (error) { expect(error).toBeInstanceOf(RoomError); expect((error as RoomError).code).toBe(expected); } }

it.each(['white', 'black'] as const)('reuses the invited seat when %s hosts, revokes the old token and preserves the running game', side => {
  const { store, host, guest, id } = setup({ side, timed: true });
  const white = side === 'white' ? host : guest;
  const unit = guest.room.state.board.units.find(unit => unit.owner === 'white' && unit.definitionId === 'fire_1')!;
  vi.setSystemTime(epoch + 1000);
  store.act(id, white.credentials.token, command(1, [{ type: 'MOVE', unitId: unit.id, to: { x: 2, y: 0 } }]));
  vi.setSystemTime(epoch + 40000);
  const before = store.get(id), history = store.moveHistory(id);
  const takeover = store.join(id, { name: 'Different browser', inviteCode: host.inviteCode });
  expect(takeover.credentials.player).toBe(guest.credentials.player);
  expect(takeover.credentials.token).not.toBe(guest.credentials.token);
  expect(takeover.inviteCode).toBe(host.inviteCode);
  expect(takeover.room).toMatchObject({ state: before.state, seats: before.seats, lastMoveAt: before.lastMoveAt, clock: before.clock, revision: before.revision + 1 });
  expect(store.moveHistory(id).entries).toEqual(history.entries);
  expect(store.get(id, host.credentials.token).state).toEqual(before.state);
  code(() => store.restore(id, guest.credentials.token, guest.credentials.player), 'INVALID_SEAT');
  code(() => store.act(id, guest.credentials.token, command(takeover.room.revision, [{ type: 'RESIGN' }])), 'INVALID_SEAT');
  code(() => store.join(id, { name: 'Wrong link', inviteCode: 'f'.repeat(64) }), 'INVALID_INVITE');
  const again = store.join(id, { name: 'Back', inviteCode: host.inviteCode });
  code(() => store.get(id, takeover.credentials.token), 'INVALID_SEAT');
  expect(store.get(id, again.credentials.token).state).toEqual(before.state);
  const publicData = JSON.stringify([store.get(id), store.listActive(), store.moveHistory(id)]);
  for (const secret of [host.credentials.token, guest.credentials.token, takeover.credentials.token, host.inviteCode!]) expect(publicData).not.toContain(secret);
});

it('cancels only the taken-over seat’s pending plan and cannot fire it later', () => {
  const { store, host, guest, id } = setup({ side: 'black', timed: true });
  const stage = store.stage(id, guest.credentials.token, { requestId: 'pending-old-browser', expectedTurnNumber: 1, expectedStageVersion: 0, commitWhenRemainingMs: 1000, actions: [{ type: 'END_ACTION_PHASE' }] });
  const taken = store.join(id, { name: 'New', inviteCode: host.inviteCode });
  expect(store.staged(id, taken.credentials.token, stage.pending!.id)).toMatchObject({ pending: null, latestReceipt: { status: 'cancelled' } });
  vi.setSystemTime(epoch + 629000);
  expect(store.get(id).state.turn.currentPlayer).toBe('white');
  const hostRoom = setup({ timed: true });
  hostRoom.store.stage(hostRoom.id, hostRoom.host.credentials.token, { requestId: 'host-pending-plan', expectedTurnNumber: 1, expectedStageVersion: 0, commitWhenRemainingMs: 1000, actions: [{ type: 'END_ACTION_PHASE' }] });
  hostRoom.store.join(hostRoom.id, { name: 'New guest', inviteCode: hostRoom.host.inviteCode });
  expect(hostRoom.store.staged(hostRoom.id, hostRoom.host.credentials.token).pending).not.toBeNull();
});

it('wakes a displaced long poll with INVALID_SEAT and lets spectators keep watching', async () => {
  vi.useRealTimers();
  const { store, id, host, guest } = setup();
  const displaced = store.wait(id, 1, 1000, undefined, guest.credentials.token);
  const observed = store.wait(id, 1, 1000);
  store.join(id, { name: 'New browser', inviteCode: host.inviteCode });
  await expect(displaced).rejects.toMatchObject({ code: 'INVALID_SEAT' });
  await expect(observed).resolves.toMatchObject({ changed: true, room: { revision: 2 } });
});

it.each(['standard', 'phasing'] as const)('archives an idle %s game at exactly 24 hours, retaining every review position', ruleset => {
  const { store, id, host } = setup({ ruleset });
  vi.setSystemTime(epoch + 1000);
  const moved = store.act(id, host.credentials.token, command(1, [{ type: 'END_ACTION_PHASE' }]));
  const history = store.moveHistory(id);
  vi.setSystemTime(epoch + 1000 + ROOM_IDLE_MS - 1);
  expect(store.get(id).archivedAt).toBeUndefined();
  expect(store.listActive().map(room => room.id)).toContain(id);
  vi.setSystemTime(epoch + 1000 + ROOM_IDLE_MS);
  code(() => store.act(id, host.credentials.token, command(moved.revision, [{ type: 'UNDO' }])), 'ROOM_ARCHIVED');
  const archived = store.get(id);
  expect(archived).toMatchObject({ archivedAt: new Date(epoch + 1000 + ROOM_IDLE_MS).toISOString(), canUndo: false, state: { phase: 'victory', winner: null, victoryReason: 'abandoned', board: moved.state.board } });
  expect(store.listActive()).toEqual([]);
  expect(store.listArchived().rooms[0]).toMatchObject({ id, ruleset, reason: 'abandoned' });
  expect(store.moveHistory(id).entries.slice(0, -1)).toEqual(history.entries);
  const result = store.moveHistory(id).entries.at(-1)!;
  expect(store.position(id, result.sequence).state).toEqual(archived.state);
  expect(store.position(id, 0).state.board).toEqual(host.room.state.board);
  code(() => store.join(id, { name: 'Late', inviteCode: host.inviteCode }), 'ROOM_ARCHIVED');
  code(() => store.act(id, host.credentials.token, command(archived.revision, [{ type: 'SET_UPKEEP_REVIEW', enabled: true }]), true), 'ROOM_ARCHIVED');
  expect(store.get(id).revision).toBe(archived.revision);
});

it('reads, joining, takeovers, previews, failed moves and preference changes do not extend room life', () => {
  const store = open(), host = store.create({ name: 'Waiting' }), id = host.room.id;
  vi.setSystemTime(epoch + ROOM_IDLE_MS - 1000);
  store.join(id, { name: 'Guest', inviteCode: host.inviteCode });
  store.join(id, { name: 'Again', inviteCode: host.inviteCode });
  const pref = store.act(id, host.credentials.token, command(2, [{ type: 'SET_UPKEEP_REVIEW', enabled: true }]));
  store.act(id, host.credentials.token, command(pref.revision, [{ type: 'END_ACTION_PHASE' }]), true);
  expect(() => store.act(id, host.credentials.token, command(pref.revision, [{ type: 'MOVE', unitId: 'missing', to: { x: 4, y: 4 } }]))).toThrow();
  store.moveHistory(id); store.position(id, 0); store.restore(id, host.credentials.token, 'white');
  expect(store.get(id).lastMoveAt).toBe(new Date(epoch).toISOString());
  vi.setSystemTime(epoch + ROOM_IDLE_MS);
  expect(store.get(id).archivedAt).toBeDefined();
});

it('successful moves and undo reset inactivity, but an idempotent retry does not', () => {
  const { store, host, id } = setup();
  vi.setSystemTime(epoch + 1000);
  const unit = host.room.state.board.units.find(unit => unit.owner === 'white' && unit.definitionId === 'fire_1')!;
  const move = command(1, [{ type: 'MOVE', unitId: unit.id, to: { x: 2, y: 0 } }]);
  store.act(id, host.credentials.token, move);
  vi.setSystemTime(epoch + 2000);
  expect(store.act(id, host.credentials.token, move).lastMoveAt).toBe(new Date(epoch + 1000).toISOString());
  store.act(id, host.credentials.token, command(2, [{ type: 'UNDO' }]));
  vi.setSystemTime(epoch + 1000 + ROOM_IDLE_MS);
  expect(store.get(id).archivedAt).toBeUndefined();
  vi.setSystemTime(epoch + 2000 + ROOM_IDLE_MS);
  expect(store.get(id).archivedAt).toBeDefined();
});

it('archives waiting and already-finished rooms, preserves results, and releases capacity', () => {
  const store = open(undefined, 2), waiting = store.create({ name: 'Waiting' }), host = store.create({ name: 'Finished' });
  store.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
  const finished = store.act(host.room.id, host.credentials.token, command(1, [{ type: 'RESIGN' }]));
  const history = store.moveHistory(host.room.id);
  vi.setSystemTime(epoch + ROOM_IDLE_MS);
  const next = store.create({ name: 'New room' });
  expect(store.listActive().map(room => room.id)).toEqual([next.room.id]);
  expect(store.get(waiting.room.id).state.victoryReason).toBe('abandoned');
  expect(store.get(host.room.id).state).toEqual(finished.state);
  expect(store.moveHistory(host.room.id).entries).toEqual(history.entries);
  expect(store.listArchived().rooms).toHaveLength(2);
});

it.each([false, true])('settles clock and archive deadlines chronologically after downtime (late join: %s)', lateJoin => {
  const store = open(), host = store.create({ name: 'Host', timeControl: 'rapid' });
  if (lateJoin) vi.setSystemTime(epoch + ROOM_IDLE_MS - 1000);
  store.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
  vi.setSystemTime(epoch + ROOM_IDLE_MS + 630000);
  const ended = store.get(host.room.id);
  expect(ended.archivedAt).toBe(new Date(epoch + ROOM_IDLE_MS).toISOString());
  expect(ended.state.victoryReason).toBe(lateJoin ? 'abandoned' : 'timeout');
  expect(ended.clock).toMatchObject({ runningPlayer: null, deadlineAtMs: null });
});

it('archives without a connected client, survives restarts, and serializes multiple schedulers', () => {
  const path = file(), { store, id, host } = setup({ path });
  vi.setSystemTime(epoch + ROOM_IDLE_MS - 250);
  vi.advanceTimersByTime(250);
  const db = new DatabaseSync(path);
  const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string); db.close();
  expect(saved.archivedAt).toBeDefined();
  close(store);
  const reopened = open(path), second = open(path);
  expect(second.restore(id, host.credentials.token, 'white')).toEqual(reopened.get(id, host.credentials.token));
  expect(second.moveHistory(id).entries.filter(entry => entry.kind === 'result')).toHaveLength(1);
  expect(second.get(id).revision).toBe(saved.revision);
});

it('migrates old records at startup and only lets the original host restore a consumed invitation', () => {
  const path = file(), { store, host, guest, id } = setup({ path, side: 'black' });
  close(store);
  const db = new DatabaseSync(path);
  db.prepare("UPDATE rooms SET data = json_remove(json_set(data, '$.inviteHash', NULL), '$.createdAt', '$.lastMoveAt', '$.invitedPlayer'), idle_at = NULL WHERE id = ?").run(id); db.close();
  const reopened = open(path);
  code(() => reopened.join(id, { name: 'Unknown browser', inviteCode: host.inviteCode }), 'INVALID_INVITE');
  reopened.restore(id, guest.credentials.token, 'white', 'f'.repeat(64));
  code(() => reopened.join(id, { name: 'Guest attempt', inviteCode: 'f'.repeat(64) }), 'INVALID_INVITE');
  reopened.restore(id, host.credentials.token, 'black', host.inviteCode);
  const migrated = reopened.join(id, { name: 'New browser', inviteCode: host.inviteCode });
  expect(migrated.credentials.player).toBe('white');
  expect(migrated.room.lastMoveAt).toBe(new Date(epoch).toISOString());
  close(reopened);
  vi.setSystemTime(epoch + ROOM_IDLE_MS);
  const restarted = open(path);
  expect(restarted.listActive()).toEqual([]);
  expect(restarted.get(id).archivedAt).toBeDefined();
});

it('paginates archived summaries deterministically without leaking private data', () => {
  const store = open();
  const admissions = Array.from({ length: 5 }, (_, i) => store.create({ name: `Archive ${i}` }));
  vi.setSystemTime(epoch + ROOM_IDLE_MS);
  const first = store.listArchived(undefined, 2), second = store.listArchived(first.nextCursor!, 2), third = store.listArchived(second.nextCursor!, 2);
  const all = [...first.rooms, ...second.rooms, ...third.rooms];
  expect(all.map(room => room.id)).toEqual(admissions.map(admission => admission.room.id).sort().reverse());
  expect(third.nextCursor).toBeNull();
  for (const admission of admissions) {
    expect(JSON.stringify(all)).not.toContain(admission.credentials.token);
    expect(JSON.stringify(all)).not.toContain(admission.inviteCode);
  }
  expect(JSON.stringify(all)).not.toMatch(/board|tokenHash|inviteHash|staging/);
  code(() => store.listArchived('f'.repeat(32)), 'INVALID_CURSOR');
});
