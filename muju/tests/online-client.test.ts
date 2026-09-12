import { afterEach, expect, it, vi } from 'vitest';
import { loadConnection, observerUrl, parseObserverConnection, parseSeatCredentials, readRoom, waitRoom } from '../src/online/client';

const seat = { roomId: 'a'.repeat(32), player: 'white', token: 'b'.repeat(64), serverUrl: 'https://muju.example' };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it('imports browser and MCP credentials, including Markdown URLs, code fences and optional invitations', () => {
  const markdown = `[${seat.serverUrl}](${seat.serverUrl})`;
  expect(parseSeatCredentials(JSON.stringify({ ...seat, serverUrl: markdown, inviteCode: 'c'.repeat(64) }), 'http://localhost'))
    .toEqual({ ...seat, inviteCode: 'c'.repeat(64) });
  expect(parseSeatCredentials('```json\n' + JSON.stringify({ credentials: seat }) + '\n```', 'http://localhost')).toEqual(seat);
  const { serverUrl, ...legacy } = seat;
  expect(parseSeatCredentials(JSON.stringify({ credentials: legacy, invitation: { serverUrl } }), 'http://localhost')).toEqual(seat);
  expect(parseSeatCredentials(JSON.stringify(legacy), serverUrl)).toEqual(seat);
});

it('rejects malformed imports without including private input in error messages', () => {
  for (const input of ['null', '{"token":"private-do-not-echo"', JSON.stringify({ ...seat, player: 'observer' }),
    JSON.stringify({ ...seat, roomId: '../actions' }), JSON.stringify({ ...seat, serverUrl: 'javascript:alert(1)' }),
    JSON.stringify({ ...seat, serverUrl: 'https://user:password@muju.example' })]) {
    expect(() => parseSeatCredentials(input, seat.serverUrl)).toThrow();
    try { parseSeatCredentials(input, seat.serverUrl); } catch (error) { expect(String(error)).not.toContain('private-do-not-echo'); }
  }
  localStorage.setItem(`muju:online:${seat.serverUrl}:${seat.roomId}`, JSON.stringify({ ...seat, serverUrl: 'https://another.example' }));
  expect(loadConnection(seat.serverUrl, seat.roomId)).toBeNull();
});

it('watch links and live reads contain neither seat nor invitation credentials', async () => {
  const link = observerUrl(seat.serverUrl, seat.roomId);
  const observer = { roomId: seat.roomId, serverUrl: seat.serverUrl };
  expect(parseObserverConnection(link, 'http://localhost')).toEqual(observer);
  expect(parseObserverConnection(`${link}#invite=${'c'.repeat(64)}`, 'http://localhost')).toEqual(observer);
  expect(parseObserverConnection(seat.roomId, seat.serverUrl)).toEqual(observer);
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', fetch);
  await readRoom(observer);
  await waitRoom(observer, 7);
  for (const [url, init] of fetch.mock.calls) {
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(url).not.toContain(seat.token);
    expect(init.method).toBe('GET');
  }
});
