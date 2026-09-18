// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createHash, randomInt } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';

vi.mock('node:crypto', async importOriginal => {
  const crypto = await importOriginal<typeof import('node:crypto')>();
  return { ...crypto, randomInt: vi.fn(crypto.randomInt) };
});
const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { vi.clearAllMocks(); for (const close of cleanups.splice(0).reverse()) await close(); });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

it('reserves unique lowercase codes across restarts, keeps invitations private and preserves invited-seat takeover', () => {
  const dir = mkdtempSync(join(tmpdir(), 'muju-invitations-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'rooms.sqlite');
  const store = new RoomStore(path); cleanups.push(() => store.close());
  const db = new DatabaseSync(path); cleanups.push(() => db.close());
  db.prepare('INSERT INTO room_invitations (code_hash, room_id) VALUES (?, ?)').run(hash('aaaaaa'), 'reserved');
  for (let i = 0; i < 6; i++) vi.mocked(randomInt).mockReturnValueOnce(0);
  const host = store.create({ name: 'Host' });
  expect(host.inviteCode).toMatch(/^[a-z]{6}$/);
  expect(host.inviteCode).not.toBe('aaaaaa');
  expect(host.room.watchCode).toMatch(/^[a-z]{6}$/);
  expect(host.room.watchCode).not.toBe(host.inviteCode);
  expect(store.resolveWatch(host.room.watchCode!)).toEqual({ roomId: host.room.id });
  expect(() => store.resolveInvitation(host.room.watchCode!)).toThrow('not found');
  expect(() => store.join(host.room.id, { name: 'Observer', inviteCode: host.room.watchCode })).toThrow('invalid');
  expect(store.resolveInvitation(host.inviteCode!)).toEqual({ roomId: host.room.id });
  expect(JSON.stringify(store.get(host.room.id))).not.toContain(host.inviteCode);
  expect(JSON.stringify(store.listActive())).not.toContain(host.inviteCode);
  const reopened = new RoomStore(path); cleanups.push(() => reopened.close());
  expect(reopened.resolveInvitation(host.inviteCode!)).toEqual({ roomId: host.room.id });
  expect(reopened.get(host.room.id).watchCode).toBe(host.room.watchCode);
  expect(reopened.resolveWatch(host.room.watchCode!)).toEqual({ roomId: host.room.id });
  const guest = reopened.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
  expect(guest.room.ready).toBe(true);
  const takeover = store.join(host.room.id, { name: 'Third', inviteCode: host.inviteCode });
  expect(() => store.restore(host.room.id, guest.credentials.token, guest.credentials.player)).toThrow('invalid');
  expect(store.restore(host.room.id, takeover.credentials.token, takeover.credentials.player).ready).toBe(true);
  // Reused links locate the same room and transfer only the invited seat.
  expect(store.resolveInvitation(host.inviteCode!)).toEqual({ roomId: host.room.id });
  for (const code of ['ABCDEF', 'abcde', 'abcdefg', 'abc123']) expect(() => store.resolveInvitation(code)).toThrow();
  const legacy = store.create({ name: 'Legacy' });
  db.prepare("UPDATE rooms SET data = json_set(data, '$.inviteHash', ?) WHERE id = ?").run(hash('c'.repeat(64)), legacy.room.id);
  expect(store.join(legacy.room.id, { name: 'Legacy guest', inviteCode: 'c'.repeat(64) }).room.ready).toBe(true);
  // Simulate an older room with no watch mapping, including a random code collision.
  db.prepare('DELETE FROM room_watch_links WHERE room_id = ?').run(legacy.room.id);
  for (const char of host.room.watchCode!) vi.mocked(randomInt).mockReturnValueOnce(char.charCodeAt(0) - 97);
  const migrated = reopened.get(legacy.room.id);
  expect(migrated.watchCode).toMatch(/^[a-z]{6}$/);
  expect(migrated.watchCode).not.toBe(host.room.watchCode);
  expect(migrated.revision).toBe(1);
  expect(store.resolveWatch(migrated.watchCode!)).toEqual({ roomId: legacy.room.id });
});

it('resolves invitations over HTTP without claiming a seat and rejects missing codes', async () => {
  const store = new RoomStore(); cleanups.push(() => store.close());
  const listener = createApp(store, { publicUrl: 'http://localhost:3003' }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject); });
  cleanups.push(() => new Promise<void>(resolve => { listener.closeAllConnections(); listener.close(() => resolve()); }));
  const base = `http://127.0.0.1:${(listener.address() as { port: number }).port}/api/muju/rooms`;
  expect((await fetch(`${base}/invitations/zzzzzz`)).status).toBe(404);
  expect((await fetch(`${base}/invitations/ABCDEF`)).status).toBe(400);
  expect((await fetch(`${base}/watch/zzzzzz`)).status).toBe(404);
  expect((await fetch(`${base}/watch/ABCDEF`)).status).toBe(400);
  const host = store.create({ name: 'Host' });
  const response = await fetch(`${base}/invitations/${host.inviteCode}`);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ roomId: host.room.id });
  const watch = await fetch(`${base}/watch/${host.room.watchCode}`);
  expect(watch.headers.get('cache-control')).toBe('no-store');
  expect(await watch.json()).toEqual({ roomId: host.room.id });
  expect(store.get(host.room.id).ready).toBe(false);
  const joined = await fetch(`${base}/${host.room.id}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Guest', inviteCode: host.inviteCode }) });
  expect(joined.status).toBe(200);
});
