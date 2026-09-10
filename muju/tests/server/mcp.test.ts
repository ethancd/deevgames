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
  cleanups.push(async () => { listener.closeAllConnections(); await new Promise<void>(r => listener.close(() => r())); store.close(); });
  return { store, url };
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
