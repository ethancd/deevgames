// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Server } from 'node:http';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import { assertScopeRoom, matchScopeFor } from '../../server/matchScope';
import type { MatchPolicy } from '../../src/online/types';
const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function listenerFor(store: RoomStore, roomId?: string) {
  const server: Server = await new Promise(resolve => { const s = createApp(store, { publicUrl: 'http://localhost', matchRoomId: roomId }).listen(0, '127.0.0.1', () => resolve(s)); });
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
function rooms(toolTier: MatchPolicy['toolTier'] = 'harnessed') {
  const store = new RoomStore(); cleanups.push(() => store.close());
  const match = store.create({ name: 'Match', matchPolicy: { version: 1, toolTier, protocolId: 'single-room-correction' } });
  store.join(match.room.id, { name: 'Guest', inviteCode: match.inviteCode });
  const ordinary = store.create({ name: 'Ordinary' }); store.join(ordinary.room.id, { name: 'Other', inviteCode: ordinary.inviteCode });
  return { store, match, ordinary };
}
async function clientFor(url: string, stdio: boolean) {
  const client = new Client({ name: 'scope-test', version: '1' });
  const transport = stdio ? new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'server/stdio.ts'], cwd: process.cwd(),
    env: { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), MUJU_SERVER_URL: url }, stderr: 'pipe' })
    : new StreamableHTTPClientTransport(new URL(`${url}/mcp`));
  await client.connect(transport); cleanups.push(() => client.close()); return client;
}
async function deniedTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args }).then(value => ({ value }), error => ({ error }));
  if ('error' in result) expect(String(result.error)).toMatch(/Unknown tool|not found|Invalid params/i);
  else expect(result.value.isError).toBe(true);
}
const post = (url: string, body: unknown, token?: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
it.each([false, true])('blocks mirror creation and every cross-room MCP read with identical stdio scope (stdio=%s)', async stdio => {
  const { store, match, ordinary } = rooms(), url = await listenerFor(store, match.room.id), client = await clientFor(url, stdio);
  const tools = (await client.listTools()).tools.map(tool => tool.name);
  expect(tools).toEqual(expect.arrayContaining(['muju_rules', 'muju_observe', 'muju_legal_actions', 'muju_preview', 'muju_stage', 'muju_play']));
  for (const name of ['muju_create_room', 'muju_join_room', 'muju_analyze']) expect(tools).not.toContain(name);
  await deniedTool(client, 'muju_create_room', { name: 'Mirror' });
  await deniedTool(client, 'muju_join_room', { roomId: match.room.id, name: 'Takeover', inviteCode: match.inviteCode });
  await deniedTool(client, 'muju_analyze', { roomId: ordinary.room.id, expectedRevision: 1, player: 'white', topics: ['economy'] });
  for (const name of ['muju_observe', 'muju_clock', 'muju_history', 'muju_legal_actions', 'muju_wait_for_change']) {
    const result = await client.callTool({ name, arguments: { roomId: ordinary.room.id, ...(name === 'muju_wait_for_change' ? { afterRevision: 0, timeoutMs: 0 } : {}) } });
    expect(result.isError).toBe(true); expect(result.structuredContent).toMatchObject({ code: 'MATCH_SERVICE_RESTRICTED' });
  }
  await deniedTool(client, 'muju_play', { roomId: ordinary.room.id, token: ordinary.credentials.token, expectedRevision: 1, requestId: 'cross-room-play', actions: [{ type: 'END_ACTION_PHASE' }] });
  const observed = await client.callTool({ name: 'muju_observe', arguments: { roomId: match.room.id } });
  expect(observed.isError).not.toBe(true); expect((observed.structuredContent as any).analysis.sections).toEqual({});
  expect((await client.callTool({ name: 'muju_play', arguments: { roomId: match.room.id, token: match.credentials.token,
    expectedRevision: 1, requestId: 'same-room-play', actions: [{ type: 'END_ACTION_PHASE' }] } })).isError).not.toBe(true);
  expect(store.get(match.room.id, match.credentials.token).revision).toBe(2);
  expect(store.get(ordinary.room.id).revision).toBe(1);
});
it('default-denies direct HTTP mirror/list/join/restore/static and cross-room paths, without mutating ordinary service behavior', async () => {
  const { store, match, ordinary } = rooms(), url = await listenerFor(store, match.room.id), normalUrl = await listenerFor(store);
  const deniedReads = ['/api/muju/rooms', '/api/muju/rooms/archived', `/api/muju/rooms/invitations/${match.inviteCode}`,
    `/api/muju/rooms/watch/${match.room.watchCode}`, `/api/muju/rooms/${ordinary.room.id}`, `/api/muju/rooms/${ordinary.room.id}/history`,
    `/api/muju/rooms/${ordinary.room.id}/positions/0`, `/api/muju/rooms/${ordinary.room.id}/changes?afterRevision=0&timeoutMs=0`, '/muju/', '/SKILL.md'];
  for (const path of deniedReads) {
    const response = await fetch(url + path); expect(response.status, path).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MATCH_SERVICE_RESTRICTED' });
  }
  for (const [path, body] of [['/api/muju/rooms', { name: 'Mirror' }], [`/api/muju/rooms/${match.room.id}/join`, { name: 'Takeover', inviteCode: match.inviteCode }],
    [`/api/muju/rooms/${match.room.id}/restore`, { player: 'white' }], [`/api/muju/rooms/${ordinary.room.id}/actions`, { expectedRevision: 1, requestId: 'mirror-replay', actions: [{ type: 'END_ACTION_PHASE' }] }]] as const) {
    expect((await post(url + path, body, match.credentials.token)).status).toBe(403);
  }
  const health = await (await fetch(`${url}/api/muju/health`)).json();
  expect(health.matchScope).toEqual({ roomId: match.room.id, matchPolicy: match.room.matchPolicy });
  expect((await fetch(`${url}/api/muju/rooms/${match.room.id}/history?after=0&limit=200`)).status).toBe(200);
  expect((await fetch(`${url}/api/muju/rooms/${match.room.id}/positions/0`)).status).toBe(200);
  expect((await fetch(`${normalUrl}/api/muju/rooms`)).status).toBe(200);
  expect((await post(`${normalUrl}/api/muju/rooms`, { name: 'Ordinary control' })).status).toBe(201);
  const normalClient = await clientFor(normalUrl, false);
  expect((await normalClient.listTools()).tools.map(t => t.name)).toContain('muju_analyze');
  expect((await normalClient.callTool({ name: 'muju_analyze', arguments: { roomId: ordinary.room.id, expectedRevision: 1, player: 'white', topics: ['economy'] } })).isError).not.toBe(true);
  expect(store.get(match.room.id, match.credentials.token).revision).toBe(1);
});
it.each(['bare', 'centaur'] as const)('exposes exactly permitted assistance for %s while keeping all reads scoped', async tier => {
  const { store, match, ordinary } = rooms(tier), url = await listenerFor(store, match.room.id), client = await clientFor(url, false);
  const tools = (await client.listTools()).tools.map(t => t.name);
  expect(tools.includes('muju_analyze')).toBe(tier === 'centaur'); expect(tools.includes('muju_preview')).toBe(tier === 'centaur');
  const briefing = await client.callTool({ name: 'muju_observe', arguments: { roomId: match.room.id, briefing: true } });
  expect(briefing.isError === true).toBe(tier === 'bare');
  const body = { expectedRevision: 1, requestId: 'scoped-preview', actions: [{ type: 'END_ACTION_PHASE' }] };
  expect((await post(`${url}/api/muju/rooms/${match.room.id}/preview`, body, match.credentials.token)).status).toBe(tier === 'bare' ? 403 : 200);
  if (tier === 'centaur') {
    await deniedTool(client, 'muju_analyze', { roomId: ordinary.room.id, expectedRevision: 1, player: 'white', topics: ['economy'] });
  } else {
    const unitId = match.room.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id;
    const moved = await client.callTool({ name: 'muju_play', arguments: { roomId: match.room.id, token: match.credentials.token,
      expectedRevision: 1, requestId: 'bare-live-move', actions: [{ type: 'MOVE', unitId, to: 'C1' }] } });
    expect(moved.isError).not.toBe(true); expect((moved.structuredContent as any).canUndo).toBe(false);
    await deniedTool(client, 'muju_play', { roomId: match.room.id, token: match.credentials.token,
      expectedRevision: 2, requestId: 'bare-undo-attempt', actions: [{ type: 'UNDO' }] });
    expect(store.get(match.room.id).revision).toBe(2);
  }
});
it('fails closed on missing scope/policy and detects a dropped policy without changing unrelated rooms', () => {
  const { store, match, ordinary } = rooms();
  expect(() => createApp(store, { publicUrl: 'http://localhost', matchRoomId: ordinary.room.id })).toThrow(/explicit v1 matchPolicy/);
  expect(() => createApp(store, { publicUrl: 'http://localhost', matchRoomId: '' })).toThrow();
  const room = store.get(match.room.id), scope = matchScopeFor(room);
  expect(() => assertScopeRoom(scope, { ...room, matchPolicy: undefined })).toThrow(/missing/);
  expect(() => assertScopeRoom(scope, { ...room, matchPolicy: { ...room.matchPolicy!, toolTier: 'centaur' } })).toThrow(/differs/);
});
