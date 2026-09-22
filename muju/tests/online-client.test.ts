import { afterEach, expect, it, vi } from 'vitest';
import { invitationUrl, loadConnection, observerUrl, parseObserverConnection, parseSeatCredentials, readRoom, resolveInvitationLink, resolveObserverConnection, waitRoom } from '../src/online/client';

const seat = { roomId: 'a'.repeat(32), player: 'white', token: 'b'.repeat(64), serverUrl: 'https://muju.example' };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it('shares and resolves six-letter invitations on the selected host, retaining legacy links', async () => {
  const link = invitationUrl(`${seat.serverUrl}/`, seat.roomId, 'abcdef');
  expect(link).toBe(`${seat.serverUrl}/join/abcdef`);
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roomId: seat.roomId }) });
  vi.stubGlobal('fetch', fetch);
  expect(await resolveInvitationLink(link)).toEqual({ serverUrl: seat.serverUrl, roomId: seat.roomId, inviteCode: 'abcdef' });
  expect(fetch.mock.calls[0][0]).toBe(`${seat.serverUrl}/api/muju/rooms/invitations/abcdef`);
  expect(parseSeatCredentials(JSON.stringify({ ...seat, inviteCode: 'abcdef' }), seat.serverUrl).inviteCode).toBe('abcdef');
  const legacy = invitationUrl(seat.serverUrl, seat.roomId, 'c'.repeat(64));
  expect(await resolveInvitationLink(legacy)).toEqual({ serverUrl: seat.serverUrl, roomId: seat.roomId, inviteCode: 'c'.repeat(64) });
  expect(fetch).toHaveBeenCalledTimes(1);
});

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

it('resolves short watch links as observers even with a saved seat, and accepts old links and room IDs', async () => {
  const link = observerUrl(`${seat.serverUrl}/`, seat.roomId, 'uvwxyz');
  expect(link).toBe(`${seat.serverUrl}/watch/uvwxyz`);
  localStorage.setItem(`muju:online:${seat.serverUrl}:${seat.roomId}`, JSON.stringify(seat));
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roomId: seat.roomId }) });
  vi.stubGlobal('fetch', fetch);
  const observer = { serverUrl: seat.serverUrl, roomId: seat.roomId };
  expect(await resolveObserverConnection(link, 'https://another.example')).toEqual(observer);
  expect(fetch.mock.calls[0][0]).toBe(`${seat.serverUrl}/api/muju/rooms/watch/uvwxyz`);
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  expect(await resolveObserverConnection(observerUrl(seat.serverUrl, seat.roomId), seat.serverUrl)).toEqual(observer);
  expect(await resolveObserverConnection(seat.roomId, seat.serverUrl)).toEqual(observer);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(loadConnection(seat.serverUrl, seat.roomId)).toEqual(seat);
});
