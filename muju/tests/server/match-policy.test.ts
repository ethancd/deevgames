// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import { AnalysisService } from '../../server/analysis';
import type { MatchPolicy, RoomAdmission } from '../../src/online/types';
const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup(stdio = false) {
  const store = new RoomStore();
  const listener: Server = await new Promise(resolve => { const s = createApp(store, { publicUrl: 'http://localhost' }).listen(0, '127.0.0.1', () => resolve(s)); });
  const url = `http://127.0.0.1:${(listener.address() as { port: number }).port}`;
  cleanups.push(async () => { listener.closeAllConnections(); await new Promise<void>(r => listener.close(() => r())); store.close(); });
  const client = new Client({ name: 'tier-test', version: '1' });
  const transport = stdio ? new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'server/stdio.ts'], cwd: process.cwd(),
    env: { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)), MUJU_SERVER_URL: url }, stderr: 'pipe' })
    : new StreamableHTTPClientTransport(new URL(`${url}/mcp`));
  await client.connect(transport); cleanups.push(() => client.close());
  return { store, url, client };
}
async function post(url: string, body: unknown, token?: string) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}
it.each([false, true])('blocks anonymous and automatic analysis at HTTP MCP and stdio boundaries (stdio=%s)', async stdio => {
  const { url, client } = await setup(stdio);
  const matchPolicy: MatchPolicy = { version: 1, toolTier: 'harnessed', protocolId: 't6-test' };
  const host: RoomAdmission = await (await post(`${url}/api/muju/rooms`, { name: 'Host', matchPolicy, timeControl: 'classical' })).json();
  const id = host.room.id, token = host.credentials.token;
  await post(`${url}/api/muju/rooms/${id}/join`, { name: 'Guest', inviteCode: host.inviteCode });
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: { roomId: id, ...args } });
  for (const name of ['muju_analyze', 'muju_observe', 'muju_wait_for_change']) {
    const args = name === 'muju_analyze' ? { expectedRevision: 1, player: 'white', topics: ['economy'] }
      : name === 'muju_observe' ? { briefing: true } : { afterRevision: 0, timeoutMs: 0, briefing: true };
    const response = await call(name, args);
    expect(response.isError).toBe(true); expect(response.structuredContent).toMatchObject({ code: 'MATCH_TOOL_RESTRICTED' });
  }
  const unchangedBriefing = await call('muju_wait_for_change', { afterRevision: 1, timeoutMs: 0, briefing: true });
  expect(unchangedBriefing.isError).toBe(true);
  expect(unchangedBriefing.structuredContent).toMatchObject({ code: 'MATCH_TOOL_RESTRICTED' });
  const observed = (await call('muju_observe')).structuredContent as any;
  expect(observed.matchPolicy).toEqual(matchPolicy);
  expect(observed.analysis).toMatchObject({ supported: false, sections: {}, next: [] });
  expect((await call('muju_legal_actions')).isError).not.toBe(true);
  const command = { expectedRevision: 1, requestId: 'tier-preview-1', actions: [{ type: 'END_ACTION_PHASE' }] };
  const preview = await call('muju_preview', { token, ...command });
  expect(preview.isError).not.toBe(true);
  expect((preview.structuredContent as any).room.analysis.sections).toEqual({});
  const play = await call('muju_play', { token, ...command });
  expect(play.isError).not.toBe(true);
  expect((play.structuredContent as any).analysis.sections).toEqual({});
  const change = (await call('muju_wait_for_change', { afterRevision: 1, timeoutMs: 0 })).structuredContent as any;
  expect(change.room.analysis.sections).toEqual({});
  // Authenticated error snapshots also go through the same restricted headline.
  const stale = await call('muju_play', { token, ...command, requestId: 'tier-stale-1' });
  expect(stale.isError).toBe(true);
  const current = await (await fetch(`${url}/api/muju/rooms/${id}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(current.matchPolicy).toEqual(matchPolicy);
  expect(JSON.stringify(observed)).not.toContain(token);
});
it('enforces bare preview/stage via direct HTTP as well as MCP, without revoking credentials', async () => {
  const { url, client, store } = await setup();
  const host = store.create({ name: 'Bare', matchPolicy: { version: 1, toolTier: 'bare', protocolId: 'bare-test' }, timeControl: 'classical' });
  store.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
  const id = host.room.id, token = host.credentials.token;
  const command = { expectedRevision: 1, requestId: 'bare-preview-1', actions: [{ type: 'END_ACTION_PHASE' }] };
  const stage = { requestId: 'bare-stage-1', expectedTurnNumber: 1, expectedStageVersion: 0, commitWhenRemainingMs: 5000, actions: command.actions };
  for (const [route, body] of [['preview', command], ['stage', stage]] as const) {
    const res = await post(`${url}/api/muju/rooms/${id}/${route}`, body, token);
    expect(res.status).toBe(403); expect(await res.json()).toMatchObject({ code: 'MATCH_TOOL_RESTRICTED' });
  }
  for (const [name, args] of [['muju_legal_actions', {}], ['muju_preview', command], ['muju_stage', stage]] as const) {
    const result = await client.callTool({ name, arguments: { roomId: id, token, ...args } });
    expect(result.isError).toBe(true); expect(result.structuredContent).toMatchObject({ code: 'MATCH_TOOL_RESTRICTED' });
  }
  const blockedMutation = await post(`${url}/api/muju/rooms/${id}/actions`, { ...command, matchPolicy: { version: 1, toolTier: 'centaur', protocolId: 'cheat' } }, token);
  expect(blockedMutation.status).toBe(400);
  expect((await post(`${url}/api/muju/rooms/${id}/actions`, command, token)).status).toBe(200);
  expect(store.get(id, token).matchPolicy?.toolTier).toBe('bare');
});
it.each(['centaur', undefined] as const)('preserves analysis in %s rooms', async toolTier => {
  const { store, client } = await setup();
  const host = store.create({ name: 'Host', ...(toolTier ? { matchPolicy: { version: 1, toolTier, protocolId: 'centaur-test' } } : {}) });
  store.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
  const result = await client.callTool({ name: 'muju_observe', arguments: { roomId: host.room.id, briefing: true } });
  expect(result.isError).not.toBe(true); expect((result.structuredContent as any).briefing.sections.economy).toBeDefined();
});
it('checks policy before cache hits and persists restrictions across database restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'muju-tier-')), path = join(directory, 'rooms.sqlite');
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  let store = new RoomStore(path);
  const host = store.create({ name: 'Builder', matchPolicy: { version: 1, toolTier: 'tool-builder', protocolId: 'builder-test' } });
  const service = new AnalysisService(), restricted = store.get(host.room.id), ordinary = { ...restricted, matchPolicy: undefined };
  const input = { roomId: host.room.id, expectedRevision: 0, player: 'white', topics: ['economy'] };
  service.headline(ordinary); service.analyze(ordinary, input); service.briefing(ordinary, 'white');
  expect(service.headline(restricted).sections).toEqual({});
  expect(() => service.analyze(restricted, input)).toThrow(/disables hosted analysis/);
  expect(() => service.briefing(restricted, 'white')).toThrow(/disables hosted analysis/);
  store.close(); store = new RoomStore(path); cleanups.push(() => store.close());
  expect(store.get(host.room.id, host.credentials.token).matchPolicy).toEqual(restricted.matchPolicy);
});

it('runs a complete verified engine turn over real HTTP with the issued private credential', async () => {
  const { store, url } = await setup();
  const { joinRoom } = await import('../../src/online/client');
  const { runSeat } = await import('../../tools/engine-seat/runner');
  const { HardEngine } = await import('../../src/ai/hard/engine');
  const { hardEnginePatch } = await import('../../lab/hard-ai/bots/hard');
  const host = store.create({ name: 'Human Black', side: 'black' });
  const guest = await joinRoom(url, host.room.id, 'Engine', host.inviteCode!);
  const journal = { version: 2 as const, admission: 'issued' as const, contract: { mode: 'standard-smoke' as const },
    seed: 42, connection: { ...guest.credentials, serverUrl: url } };
  const controller = new AbortController(), logs: Record<string, unknown>[] = [];
  await runSeat({ journal, signal: controller.signal, save: saved => expect(saved.connection.token).toBe(guest.credentials.token),
    createEngine: seed => { const engine = new HardEngine(hardEnginePatch('desktop')); engine.setSeed(seed);
      return { searchTurn: state => engine.searchTurn(state, { work: 25_000 }) }; },
    log: event => { logs.push(event); if (event.event === 'submitted') controller.abort(); } });
  expect(store.get(host.room.id, guest.credentials.token)).toMatchObject({ revision: 2, state: { turn: { currentPlayer: 'black' } } });
  expect(logs.find(event => event.event === 'search')).toMatchObject({ verified: true, fallback: null });
  expect(JSON.stringify(logs)).not.toContain(guest.credentials.token);
  expect(store.get(host.room.id, host.credentials.token).seats.black).toBe('Human Black');
});
