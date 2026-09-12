// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Server } from 'node:http';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup(rateLimit = 600) {
  const store = new RoomStore();
  let listener: Server;
  const app = createApp(store, { publicUrl: 'http://localhost:3003', rateLimit });
  await new Promise<void>((resolve, reject) => { listener = app.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()); });
  const address = listener!.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const requests: string[] = [];
  listener!.on('request', req => requests.push(`${req.method} ${req.url}`));
  cleanups.push(async () => { listener.closeAllConnections(); await new Promise<void>(r => listener.close(() => r())); store.close(); });
  return { store, url, requests };
}
async function clientFor(url: string, stdio = false) {
  const client = new Client({ name: 'muju-test-agent', version: '1' });
  const transport = stdio ? new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'server/stdio.ts'],
    cwd: process.cwd(), env: { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), MUJU_SERVER_URL: url }, stderr: 'pipe' })
    : new StreamableHTTPClientTransport(new URL(`${url}/mcp`));
  await client.connect(transport); cleanups.push(() => client.close());
  return client;
}
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(JSON.stringify(result.content));
  return result.structuredContent as any;
}

describe('MCP and HTTP interoperability', () => {
  it.each([false, true])('returns tiny idle results without repeated snapshot downloads (stdio=%s)', async stdio => {
    const { store, url, requests } = await setup();
    const host = store.create({ name: 'Host' });
    const client = await clientFor(url, stdio);
    requests.length = 0;
    const result = await call(client, 'muju_wait_for_change', { roomId: host.room.id, afterRevision: 0, timeoutMs: 1100 });
    expect(result).toEqual({ changed: false, revision: 0, phase: 'playing' });
    expect(JSON.stringify(result).length).toBeLessThan(100);
    // The SDK also probes GET /mcp for an optional event stream after connecting.
    expect(requests.filter(r => r !== 'GET /mcp')).toEqual([stdio
      ? `GET /api/muju/rooms/${host.room.id}/changes?afterRevision=0&timeoutMs=1100` : 'POST /mcp']);
  }, 10000);
  it('long polls joins and final moves, validates input and cancels abandoned waits', async () => {
    const { store, url } = await setup();
    const host = store.create({ name: 'Host', side: 'white' });
    const endpoint = `${url}/api/muju/rooms/${host.room.id}/changes`;
    const started = Date.now();
    const unchanged = await (await fetch(`${endpoint}?afterRevision=0&timeoutMs=100`)).json();
    expect(Date.now() - started).toBeGreaterThanOrEqual(90);
    expect(unchanged).toEqual({ changed: false, revision: 0, phase: 'playing' });
    const waiting = fetch(`${endpoint}?afterRevision=0&timeoutMs=2000`);
    const nativeWait = store.wait(host.room.id, 0, 2000);
    store.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
    expect(await nativeWait).toMatchObject({ changed: true, revision: 1, room: { ready: true } });
    expect(await (await waiting).json()).toMatchObject({ changed: true, revision: 1, room: { ready: true } });
    for (const query of ['afterRevision=-1', 'afterRevision=no', 'afterRevision=0&timeoutMs=25001', 'timeoutMs=0']) {
      expect((await fetch(`${endpoint}?${query}`)).status).toBe(400);
    }
    expect((await fetch(`${endpoint}?afterRevision=1&timeoutMs=0`, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(403);
    const controller = new AbortController();
    const cancelled = store.wait(host.room.id, 1, 25000, controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    store.act(host.room.id, host.credentials.token, { expectedRevision: 1, requestId: 'traffic-resign', actions: [{ type: 'RESIGN' }] });
    expect(await (await fetch(`${endpoint}?afterRevision=1&timeoutMs=25000`)).json())
      .toMatchObject({ changed: true, revision: 2, phase: 'victory', room: { state: { winner: 'black' } } });
    expect(await (await fetch(`${endpoint}?afterRevision=2&timeoutMs=25000`)).json())
      .toEqual({ changed: false, revision: 2, phase: 'victory' });
  });
  it('plays one room through a real HTTP MCP client and a separate stdio agent', async () => {
    const { url } = await setup();
    const white = await clientFor(url), black = await clientFor(url, true);
    const tools = await white.listTools();
    expect(tools.tools.map(t => t.name)).toContain('muju_wait_for_change');
    const resources = await white.readResource({ uri: 'muju://rules' });
    expect(resources.contents.length).toBe(1);
    const host = await call(white, 'muju_create_room', { name: 'White agent', side: 'white' });
    const roomId = host.credentials.roomId;
    const guest = await call(black, 'muju_join_room', { roomId, inviteCode: host.invitation.inviteCode, name: 'Black agent' });
    expect(guest.credentials.player).toBe('black');
    const observed = await call(white, 'muju_observe', { roomId });
    const moves = await call(white, 'muju_legal_actions', { roomId, type: 'MOVE', limit: 1 });
    const action = moves.actions[0].action;
    expect(typeof action.to).toBe('string');
    const input = { roomId, token: host.credentials.token, expectedRevision: observed.revision, requestId: 'mcp-move-1', actions: [action] };
    const preview = await call(white, 'muju_preview', input);
    expect(preview.preview).toBe(true);
    expect((await call(white, 'muju_observe', { roomId })).revision).toBe(observed.revision);
    const moved = await call(white, 'muju_play', input);
    expect(moved.units).toEqual(preview.room.units);
    expect((await call(white, 'muju_play', input)).revision).toBe(moved.revision);
    const wait = call(black, 'muju_wait_for_change', { roomId, afterRevision: moved.revision, timeoutMs: 3000 });
    await call(white, 'muju_play', { roomId, token: host.credentials.token, expectedRevision: moved.revision, requestId: 'mcp-end-white', actions: [{ type: 'END_ACTION_PHASE' }] });
    const change = await wait;
    expect(change.changed).toBe(true); expect(change.room.turn.currentPlayer).toBe('black');
    const final = await call(black, 'muju_play', { roomId, token: guest.credentials.token, expectedRevision: change.room.revision,
      requestId: 'mcp-black-resign', actions: [{ type: 'RESIGN' }] });
    expect(final.winner).toBe('white');
    expect((await (await fetch(`${url}/api/muju/rooms/${roomId}`)).json()).state.phase).toBe('victory');
  }, 15000);
  it('rejects cross-origin writes, malformed JSON, missing credentials and stale revisions', async () => {
    const { url, store } = await setup();
    const host = store.create({ name: 'Host' });
    store.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
    const endpoint = `${url}/api/muju/rooms/${host.room.id}/actions`;
    const body = JSON.stringify({ expectedRevision: 0, requestId: 'http-action', actions: [{ type: 'END_ACTION_PHASE' }] });
    expect((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body })).status).toBe(403);
    expect((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status).toBe(401);
    expect((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${host.credentials.token}` }, body })).status).toBe(409);
    expect((await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status).toBe(400);
    expect((await fetch(endpoint, { method: 'POST', body })).status).toBe(415);
    expect(store.get(host.room.id).revision).toBe(1);
  });
  it('limits excessive requests', async () => {
    const { url } = await setup(1);
    expect((await fetch(`${url}/api/muju/health`)).status).toBe(200);
    expect((await fetch(`${url}/api/muju/health`)).status).toBe(429);
  });
});

it.each([false, true])('notifies MCP about human moves, undo and handoff without missing changes between waits (stdio=%s)', async stdio => {
  const { store, url } = await setup();
  const host = store.create({ name: 'Human' });
  store.join(host.room.id, { name: 'Agent', inviteCode: host.inviteCode });
  const client = await clientFor(url, stdio), roomId = host.room.id;
  const unitId = store.get(roomId).state.board.units[0].id;
  const humanPlay = async (revision: number, actions: object[]) => {
    const response = await fetch(`${url}/api/muju/rooms/${roomId}/actions`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${host.credentials.token}` },
      body: JSON.stringify({ expectedRevision: revision, requestId: `human-move-${revision}`, actions }) });
    expect(response.status).toBe(200);
  };
  const waiting = call(client, 'muju_wait_for_change', { roomId, afterRevision: 1, timeoutMs: 2000 });
  await humanPlay(1, [{ type: 'MOVE', unitId, to: { x: 2, y: 0 } }]);
  const move = await waiting;
  expect(move).toMatchObject({ changed: true, eventsComplete: true,
    events: [{ revision: 2, player: 'white', actions: [{ type: 'MOVE', to: 'C1' }] }],
    room: { activePlayer: 'white', canUndo: true } });
  expect((await call(client, 'muju_legal_actions', { roomId, type: 'UNDO' })).total).toBe(1);
  await call(client, 'muju_play', { roomId, token: host.credentials.token, expectedRevision: 2,
    requestId: 'mcp-human-undo', actions: [{ type: 'UNDO' }] });
  await humanPlay(3, [{ type: 'END_ACTION_PHASE' }]);
  const change = await call(client, 'muju_wait_for_change', { roomId, afterRevision: 2, timeoutMs: 0 });
  expect(change.events.map((e: any) => e.actions[0].type)).toEqual(['UNDO', 'END_ACTION_PHASE']);
  expect(change.room).toMatchObject({ activePlayer: 'black', canUndo: false });
}, 10000);
