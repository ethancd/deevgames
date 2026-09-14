// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { vi.useRealTimers(); for (const close of cleanups.splice(0).reverse()) await close(); });
function setup(path?: string) {
  const store = new RoomStore(path); cleanups.push(() => store.close());
  return store;
}
function game(store: RoomStore, name: string, timeControl?: { delaySeconds: number; bankSeconds: number }) {
  const host = store.create({ name, timeControl });
  store.join(host.room.id, { name: `${name} opponent`, inviteCode: host.inviteCode });
  return host;
}

it('public HTTP lobby lists lightweight unfinished rooms, sorts activity, and keeps seats private', async () => {
  const store = setup();
  const listener = createApp(store, { publicUrl: 'http://localhost:3003' }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
  cleanups.push(() => new Promise<void>(resolve => { listener.closeAllConnections(); listener.close(() => resolve()); }));
  const url = `http://127.0.0.1:${(listener.address() as { port: number }).port}/api/muju/rooms`;
  const initial = await fetch(url);
  expect(initial.status).toBe(200);
  expect(initial.headers.get('cache-control')).toBe('no-store');
  expect(await initial.json()).toEqual({ rooms: [] });

  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
  const first = game(store, 'First');
  vi.setSystemTime(new Date('2026-09-12T12:01:00Z'));
  const second = game(store, 'Second');
  const finished = game(store, 'Finished');
  store.act(finished.room.id, finished.credentials.token, { expectedRevision: 1, requestId: 'lobby-resign', actions: [{ type: 'RESIGN' }] });
  vi.setSystemTime(new Date('2026-09-12T12:02:00Z'));
  const waiting = store.create({ name: 'Waiting' });
  const { rooms } = await (await fetch(url)).json();
  expect(rooms.map((room: { id: string }) => room.id)).toEqual([second.room.id, first.room.id, waiting.room.id]);
  expect(rooms[0]).toEqual({ id: second.room.id, ready: true, seats: { white: 'Second', black: 'Second opponent' },
    turnNumber: 1, currentPlayer: 'white', updatedAt: '2026-09-12T12:01:00.000Z' });
  expect(JSON.stringify(rooms[0]).length).toBeLessThan(300);
  expect(rooms[2].ready).toBe(false);
  expect((await fetch(`${url}/${first.room.id}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: 1, requestId: 'lobby-no-seat', actions: [{ type: 'RESIGN' }] }) })).status).toBe(401);
  expect((await fetch(`${url}/${first.room.id}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Observer', inviteCode: 'a'.repeat(64) }) })).status).toBe(403);
  store.act(first.room.id, first.credentials.token, { expectedRevision: 1, requestId: 'lobby-end-turn', actions: [{ type: 'END_ACTION_PHASE' }] });
  const updated = await (await fetch(url)).json();
  expect(updated.rooms[0]).toMatchObject({ id: first.room.id, currentPlayer: 'black' });
  expect((await fetch(`${url}/${first.room.id}`)).status).toBe(200);
});

it('discovers persisted and compatible legacy games while skipping incompatible rooms', () => {
  const dir = mkdtempSync(join(tmpdir(), 'muju-lobby-')); cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'rooms.sqlite'), store = setup(path);
  const current = game(store, 'Current'), legacy = game(store, 'Legacy'), old = game(store, 'Old'), invalid = game(store, 'Invalid');
  const db = new DatabaseSync(path);
  db.prepare("UPDATE rooms SET data = json_set(data, '$.rulesVersion', 'muju-online-3', '$.state.actionsPerTurn', 6) WHERE id = ?").run(legacy.room.id);
  db.prepare("UPDATE rooms SET data = json_set(data, '$.rulesVersion', 'old') WHERE id = ?").run(old.room.id);
  db.prepare("UPDATE rooms SET data = json_set(data, '$.state.actionsPerTurn', 6) WHERE id = ?").run(invalid.room.id);
  db.close();
  const reopened = setup(path);
  expect(reopened.listActive().map(room => room.id).sort()).toEqual([current.room.id, legacy.room.id].sort());
  expect(reopened.get(legacy.room.id).state.actionsPerTurn).toBe(4);
});

it('removes games whose clocks expired even before the background timer runs', () => {
  vi.useFakeTimers();
  const store = setup();
  const host = game(store, 'Timed', { delaySeconds: 0, bankSeconds: 1 });
  expect(store.listActive().map(room => room.id)).toEqual([host.room.id]);
  vi.setSystemTime(Date.now() + 1001);
  expect(store.listActive()).toEqual([]);
  expect(store.get(host.room.id).state.victoryReason).toBe('timeout');
});
