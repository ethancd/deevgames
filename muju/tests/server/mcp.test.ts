// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Server } from 'node:http';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { piece, position } from '../fixtures/analysis';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup(rateLimit = 600, path?: string) {
  const store = new RoomStore(path);
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

it.each([false, true])('batches read-only analysis and replays its witness through room preview (stdio=%s)', async stdio => {
  const directory = mkdtempSync(join(tmpdir(), 'muju-analysis-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'rooms.sqlite'), { store, url } = await setup(600, path);
  const host = store.create({ name: 'Analyst' }), roomId = host.room.id;
  store.join(roomId, { name: 'Opponent', inviteCode: host.inviteCode });
  const db = new DatabaseSync(path);
  const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(roomId)!.data as string);
  saved.state = position([piece('hi', 'fire_1', 'white', 4, 4), piece('target', 'plant_1', 'black', 4, 5), piece('anchor', 'plant_1', 'black', 8, 8)], 4);
  db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(saved), roomId); db.close();
  const client = await clientFor(url, stdio), before = store.get(roomId);
  const observed = await call(client, 'muju_observe', { roomId, player: 'white', briefing: true });
  expect(observed.analysis).toMatchObject({ revision: 1, perspective: 'white', stateKind: 'current' });
  expect(observed.briefing.sections.economy).toBeDefined();
  const result = await call(client, 'muju_analyze', { roomId, expectedRevision: 1, player: 'white',
    topics: ['economy', 'opportunities', 'spawn'], targets: { unitIds: ['target'] }, detail: 'full', replies: false });
  const witness = result.sections.opportunities.lines[0].witness;
  expect(witness).toBeDefined();
  const command = { roomId, token: host.credentials.token, expectedRevision: 1, requestId: 'analysis-preview-witness', actions: witness };
  const preview = await call(client, 'muju_preview', command);
  expect(preview.room.units.some((u: { id: string }) => u.id === 'target')).toBe(false);
  expect(preview.room.analysis.stateKind).toBe('afterHypothetical');
  expect(store.get(roomId)).toEqual(before);
  const exchange = await call(client, 'muju_analyze', { roomId, expectedRevision: 1, player: 'white',
    topics: ['exchange', 'spawn'], hypotheticalActions: witness });
  expect(exchange.stateKind).toBe('afterHypothetical');
  expect(exchange.sections.exchange.captured).toMatchObject([{ id: 'target', catalogueValue: 5 }]);
  const stale = await client.callTool({ name: 'muju_analyze', arguments: { roomId, expectedRevision: 0, player: 'white', topics: ['economy'] } });
  expect(stale.isError).toBe(true);
  expect(stale.structuredContent).toMatchObject({ code: 'STALE_REVISION' });
  await call(client, 'muju_play', command);
  const changed = await call(client, 'muju_wait_for_change', { roomId, afterRevision: 1, timeoutMs: 0, briefing: true, player: 'white', sinceRevision: 1 });
  expect(changed.room.briefing.diff.mode).toBe('changed_sections');
  const idle = await call(client, 'muju_wait_for_change', { roomId, afterRevision: 2, timeoutMs: 0, briefing: true });
  expect(idle).toEqual({ changed: false, revision: 2, phase: 'playing' });
}, 10000);

describe('MCP and HTTP interoperability', () => {
  it.each([false, true])('stages, races replacements, cancels and retrieves private receipts across MCP and HTTP (stdio=%s)', async stdio => {
    const now = 1800000000000, clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    cleanups.push(() => clock.mockRestore());
    const { url, requests } = await setup(), client = await clientFor(url, stdio);
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['muju_stage', 'muju_cancel_stage', 'muju_staged']));
    const host = await call(client, 'muju_create_room', { name: 'Staging White', timeControl: { delaySeconds: 2, bankSeconds: 3 } });
    const roomId = host.credentials.roomId, token = host.credentials.token;
    const guest = await call(client, 'muju_join_room', { roomId, name: 'Staging Black', inviteCode: host.invitation.inviteCode });
    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const endpoint = `${url}/api/muju/rooms/${roomId}/stage`;
    const initial = await call(client, 'muju_staged', { roomId, token });
    expect(initial).toMatchObject({ version: 0, pending: null, clockPressure: { players: { white: { completedTurns: 0 } } } });
    const observed = await call(client, 'muju_observe', { roomId, player: 'white', briefing: true });
    expect(observed.briefing.clockPressure).toEqual(observed.clockPressure);
    const unitId = observed.units.find((unit: any) => unit.owner === 'white' && unit.definitionId === 'fire_1').id;
    const move = { type: 'MOVE', unitId, to: 'C1' }, end = { type: 'END_ACTION_PHASE' };
    const body = { requestId: 'mcp-stage-primary', expectedTurnNumber: 1, expectedStageVersion: 0,
      commitWhenRemainingMs: 1000, actions: [move, end] };
    const accepted = await call(client, 'muju_stage', { roomId, token, ...body });
    expect(accepted.pending.actions[0].to).toEqual({ x: 2, y: 0 });
    expect(await (await fetch(endpoint, { headers: auth })).json()).toMatchObject({ version: 1, pending: accepted.pending });
    expect((await fetch(endpoint)).status).toBe(401);
    expect((await fetch(endpoint, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(403);
    expect((await fetch(`${endpoint}?stageId=${accepted.pending.id}`, { headers: { Authorization: `Bearer ${guest.credentials.token}` } })).status).toBe(404);
    expect((await fetch(endpoint, { method: 'POST', headers: auth, body: JSON.stringify({ ...body, actions: [] }) })).status).toBe(400);
    expect((await fetch(endpoint, { method: 'POST', headers: auth, body: JSON.stringify({ ...body, commitWhenRemainingMs: 0 }) })).status).toBe(400);
    const publicRoom = await call(client, 'muju_observe', { roomId });
    expect(publicRoom.staging).toBeUndefined();
    expect(JSON.stringify(publicRoom)).not.toContain('commitWhenRemainingMs');
    const idleBefore = await call(client, 'muju_wait_for_change', { roomId, afterRevision: 1, timeoutMs: 0 });
    expect(idleBefore.changed).toBe(false);
    expect(idleBefore.staging).toBeUndefined();
    const race = await Promise.all(['first', 'second'].map(suffix => fetch(endpoint, { method: 'POST', headers: auth,
      body: JSON.stringify({ ...body, requestId: `http-race-${suffix}`, expectedStageVersion: 1, actions: [end] }) })));
    expect(race.map(response => response.status).sort()).toEqual([200, 409]);
    const cancelled = await call(client, 'muju_cancel_stage', { roomId, token, requestId: 'mcp-cancel-stage', expectedTurnNumber: 1, expectedStageVersion: 2 });
    expect(cancelled).toMatchObject({ version: 3, pending: null, latestReceipt: { status: 'cancelled' } });
    const finalBody = { ...body, expectedStageVersion: 3, requestId: 'mcp-final-stage',
      actions: [{ type: 'MOVE', unitId: 'private-illegal-primary', to: 'H8' }], fallbacks: [[move, end], [{ type: 'RESIGN' }]] };
    const finalStage = await call(client, 'muju_stage', { roomId, token, ...finalBody });
    clock.mockReturnValue(now + 4000);
    const racingPlay = await client.callTool({ name: 'muju_play', arguments: { roomId, token, expectedRevision: 1,
      requestId: 'late-for-stage-play', actions: [end] } });
    expect(racingPlay.isError).toBe(true);
    expect(racingPlay.structuredContent).toMatchObject({ code: 'STALE_REVISION' });
    const fired = await call(client, 'muju_staged', { roomId, token, stageId: finalStage.acknowledgement.stageId });
    expect(fired).toMatchObject({ version: 5, pending: null, requestedStage: { status: 'executed', candidateIndex: 1, revision: 2 } });
    expect((await call(client, 'muju_stage', { roomId, token, ...finalBody })).acknowledgement).toEqual(finalStage.acknowledgement);
    const changed = await call(client, 'muju_wait_for_change', { roomId, afterRevision: 1, timeoutMs: 0, briefing: true, player: 'black' });
    expect(changed).toMatchObject({ changed: true, revision: 2, room: { activePlayer: 'black',
      clockPressure: { players: { white: { completedTurns: 1, meanElapsedMs: 4000, meanBankSpentMs: 2000 } } } } });
    expect(changed.events[0].actions).toEqual([move, end]);
    expect(changed.room.staging).toBeUndefined();
    expect(JSON.stringify(changed)).not.toContain('private-illegal-primary');
    expect(JSON.stringify(await call(client, 'muju_history', { roomId }))).not.toContain('candidateIndex');
    const smallClock = await call(client, 'muju_clock', { roomId });
    expect(smallClock.clockPressure).toEqual(changed.room.clockPressure);
    const preview = await call(client, 'muju_preview', { roomId, token: guest.credentials.token, expectedRevision: 2,
      requestId: 'staged-black-preview', actions: [end] });
    expect(preview.liveClockPressure).toEqual(smallClock.clockPressure);
    expect(preview.room.clockPressure).toBeUndefined();
    expect(preview.room.staging).toBeUndefined();
    const blackPlay = await call(client, 'muju_play', { roomId, token: guest.credentials.token, expectedRevision: 2,
      requestId: 'staged-black-play', actions: [end] });
    expect(blackPlay.staging).toMatchObject({ version: 0, pending: null });
    if (stdio) expect(requests).toEqual(expect.arrayContaining([`POST /api/muju/rooms/${roomId}/stage/cancel`, `GET /api/muju/rooms/${roomId}/stage`]));
  }, 15000);
  it.each([false, true])('exposes live delay clocks, separates preview clocks, and wakes on timeout (stdio=%s)', async stdio => {
    const { url } = await setup(), client = await clientFor(url, stdio);
    const preset = await call(client, 'muju_create_room', { name: 'Preset', timeControl: 'rapid' });
    expect(preset.room.timeControl).toEqual({ delaySeconds: 30, bankSeconds: 600 });
    const hosted = await call(client, 'muju_create_room', { name: 'Timed White', timeControl: { delaySeconds: 1, bankSeconds: 3 } });
    const roomId = hosted.credentials.roomId;
    expect(hosted.room.clock.runningPlayer).toBeNull();
    const joined = await call(client, 'muju_join_room', { roomId, inviteCode: hosted.invitation.inviteCode, name: 'Timed Black' });
    const initial = joined.room.clock;
    expect(initial).toMatchObject({ runningPlayer: 'white', bankRemainingMs: { white: 3000, black: 3000 } });
    expect(initial.deadlineAtMs - initial.turnStartedAtMs).toBe(4000);
    const clock = await call(client, 'muju_clock', { roomId });
    expect(clock.clock.deadlineAtMs).toBe(initial.deadlineAtMs);
    expect(clock.board).toBeUndefined();
    expect(JSON.stringify(clock).length).toBeLessThan(2200);
    const legal = await call(client, 'muju_legal_actions', { roomId, limit: 1 });
    expect(legal.clock.runningPlayer).toBe('white');
    const command = { roomId, token: hosted.credentials.token, expectedRevision: 1, requestId: 'timed-preview-turn', actions: [{ type: 'END_ACTION_PHASE' }] };
    const preview = await call(client, 'muju_preview', command);
    expect(preview.room.activePlayer).toBe('black');
    expect(preview.room.clock).toBeUndefined();
    expect(preview.liveClock).toMatchObject({ runningPlayer: 'white', deadlineAtMs: initial.deadlineAtMs });
    const idle = await call(client, 'muju_wait_for_change', { roomId, afterRevision: 1, timeoutMs: 0 });
    expect(idle).toMatchObject({ changed: false, revision: 1, clock: { runningPlayer: 'white', deadlineAtMs: initial.deadlineAtMs } });
    const changed = await call(client, 'muju_wait_for_change', { roomId, afterRevision: 1, timeoutMs: 5000 });
    expect(changed).toMatchObject({ changed: true, revision: 2, phase: 'victory', eventsComplete: true,
      room: { activePlayer: null, winner: 'black', victoryReason: 'timeout', clock: { runningPlayer: null, bankRemainingMs: { white: 0, black: 3000 } } } });
    expect(changed.events).toEqual([{ revision: 2, player: 'white', actions: [], result: { winner: 'black', reason: 'timeout' } }]);
    const late = await client.callTool({ name: 'muju_play', arguments: command });
    expect(late.isError).toBe(true);
    expect(late.structuredContent).toMatchObject({ code: 'TIME_EXPIRED', room: { winner: 'black', victoryReason: 'timeout' } });
    const response = await fetch(`${url}/api/muju/rooms/${roomId}/actions`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hosted.credentials.token}` },
      body: JSON.stringify({ expectedRevision: 1, requestId: 'late-http-request', actions: [{ type: 'END_ACTION_PHASE' }] }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'TIME_EXPIRED', room: { state: { victoryReason: 'timeout' } } });
    const history = await call(client, 'muju_history', { roomId });
    expect(history.entries).toMatchObject([{ kind: 'result', reason: 'timeout', winner: 'black' }]);
  }, 15000);
  it.each([false, true])('queries the same persistent score over MCP and HTTP (stdio=%s)', async stdio => {
    const { url, store } = await setup(), client = await clientFor(url, stdio);
    const host = store.create({ name: 'White' }), id = host.room.id;
    store.join(id, { name: 'Black', inviteCode: host.inviteCode });
    const hi = store.get(id).state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
    store.act(id, host.credentials.token, { expectedRevision: 1, requestId: 'history-mcp-opening', actions: [
      { type: 'MOVE', unitId: hi.id, to: { x: 2, y: 0 } }, { type: 'END_ACTION_PHASE' },
    ] });
    const latest = await call(client, 'muju_history', { roomId: id, limit: 2 });
    expect(latest.entries.map((entry: any) => entry.kind)).toEqual(['mining', 'upkeep']);
    expect(latest).toMatchObject({ total: 3, hasEarlier: true, hasLater: false });
    const opening = await call(client, 'muju_history', { roomId: id, before: latest.entries[0].sequence });
    expect(opening.entries[0].notation).toBe('🔥1 B1→C1');
    const all = await call(client, 'muju_history', { roomId: id, after: 0 });
    const http = await (await fetch(`${url}/api/muju/rooms/${id}/history?after=0&includeUndone=false`)).json();
    expect(all.entries).toEqual(http.entries);
    expect(all.notation.actions).toContain('attacker stays put');
    expect((await fetch(`${url}/api/muju/rooms/${id}/history?limit=0`)).status).toBe(400);
    expect((await fetch(`${url}/api/muju/rooms/${id}/history?before=2&after=1`)).status).toBe(400);
  });
  it.each([false,true])('creates and observes a four-action room through MCP (stdio=%s)', async stdio => {
    const {url}=await setup(),client=await clientFor(url,stdio);
    const hosted=await call(client,'muju_create_room',{name:'Variant host',actionsPerTurn:4});
    expect(hosted.room.actionsPerTurn).toBe(4);
    expect(hosted.credentials.serverUrl).toMatch(/^http:/);
    expect(hosted.watchUrl).toBe(`${hosted.credentials.serverUrl}/muju/?room=${hosted.credentials.roomId}&watch=1`);
    const observed=await call(client,'muju_observe',{roomId:hosted.credentials.roomId});
    expect(observed.turn.actionsRemaining).toBe(4);
    expect(observed.actionsPerTurn).toBe(4);
    expect(observed.watchUrl).toBe(hosted.watchUrl);
    const rules=await call(client,'muju_rules');expect(rules.actionsPerTurn.options).toEqual([4]);
    expect(rules.resourceMap).toMatchObject({total:504,maximumReserve:16,startingReserves:[0,4,8,16]});
    expect(rules.catalogue.filter((unit: {element:string})=>unit.element==='plant').map((unit: {mining:number})=>unit.mining)).toEqual([3,5,8]);
  });
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
    const skill = readFileSync(new URL('../../public/skills/muju-time-awareness/SKILL.md', import.meta.url), 'utf8');
    const proposal = readFileSync(new URL('../../public/skills/muju-time-awareness/references/staged-play.md', import.meta.url), 'utf8');
    for (const client of [white, black]) {
      const listed = await client.listResources();
      expect(listed.resources.map(resource => resource.uri)).toContain('muju://skills/muju-time-awareness');
      const skillResource = await client.readResource({ uri: 'muju://skills/muju-time-awareness' });
      expect(skillResource.contents).toEqual([{ uri: 'muju://skills/muju-time-awareness', mimeType: 'text/markdown', text: skill }]);
      const skillTool = await client.callTool({ name: 'muju_time_awareness', arguments: {} });
      expect(skillTool.isError).not.toBe(true);
      expect(skillTool.content).toEqual([{ type: 'text', text: skill }]);
      const design = await client.readResource({ uri: 'muju://skills/muju-time-awareness/staged-play' });
      expect(design.contents[0]).toMatchObject({ mimeType: 'text/markdown', text: proposal });
    }
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
  it('restores either occupied seat without joining or mutating, and requires the matching private token', async () => {
    const { store, url } = await setup();
    const host = store.create({ name: 'Host' });
    const guest = store.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
    const endpoint = `${url}/api/muju/rooms/${host.room.id}/restore`;
    const restore = (player: string, token?: string) => fetch(endpoint, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ player }) });
    for (const credentials of [host.credentials, guest.credentials]) {
      const response = await restore(credentials.player, credentials.token);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(guest.room);
    }
    expect((await restore('white')).status).toBe(401);
    expect((await restore('white', 'wrong-token')).status).toBe(403);
    expect((await restore('black', host.credentials.token)).status).toBe(403);
    expect((await restore('observer', host.credentials.token)).status).toBe(400);
    expect(store.get(host.room.id)).toEqual(guest.room);
    // Anonymous observers can read and wait, but cannot restore or mutate a seat.
    const publicRoom = await (await fetch(`${url}/api/muju/rooms/${host.room.id}`)).json();
    expect(publicRoom).toEqual(guest.room);
    expect(JSON.stringify(publicRoom)).not.toContain(host.credentials.token);
    expect(JSON.stringify(publicRoom)).not.toContain(guest.credentials.token);
    expect((await fetch(`${url}/api/muju/rooms/${host.room.id}/actions`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: 1, requestId: 'observer-denied', actions: [{ type: 'RESIGN' }] }) })).status).toBe(401);
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

it.each([false, true])('discovers, creates and plays a crystal-handicap room through MCP (stdio=%s)', async stdio => {
  const { url } = await setup();
  const client = await clientFor(url, stdio);
  const discovery = await client.listTools();
  const schema = discovery.tools.find(t => t.name === 'muju_create_room')!.inputSchema;
  expect(schema.properties!.blackCrystalHandicap).toMatchObject({ type: 'integer', minimum: 0, maximum: 20, default: 0 });
  const liveRules = await call(client, 'muju_rules');
  expect(liveRules.blackCrystalHandicap).toMatchObject({ default: 0, min: 1, max: 20 });
  for (const amount of [1, 2, 3, 20]) {
    const host = await call(client, 'muju_create_room', { name: 'Handicap host', side: 'black', blackCrystalHandicap: amount });
    expect(host.room).toMatchObject({ blackCrystalHandicap: amount, players: { black: { resources: amount }, white: { resources: 0 } } });
    const guest = await call(client, 'muju_join_room', { roomId: host.credentials.roomId, inviteCode: host.invitation.inviteCode, name: 'White' });
    const turn = await call(client, 'muju_play', { roomId: host.credentials.roomId, token: guest.credentials.token,
      expectedRevision: guest.room.revision, requestId: `handicap-white-${amount}`, actions: [{ type: 'END_ACTION_PHASE' }] });
    expect(turn.turn).toMatchObject({ currentPlayer: 'black', phase: amount < 3 ? 'action' : 'place', actionsRemaining: 4 });
    expect(turn.players.black.resources).toBe(amount);
  }
  for (const amount of [-1, 21, 1.5]) {
    const rejected = await client.callTool({ name: 'muju_create_room', arguments: { name: 'Invalid', blackCrystalHandicap: amount } });
    expect(rejected.isError).toBe(true);
  }
}, 15000);
