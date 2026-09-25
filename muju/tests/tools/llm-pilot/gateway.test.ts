// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { RoomStore } from '../../../server/rooms';
import { createMcpServer, type RoomBackend } from '../../../server/mcp';
import { matchScopeFor } from '../../../server/matchScope';
import type { MatchPolicy, RoomAdmission, RoomChange, RoomSnapshot } from '../../../src/online/types';
import {
  attachHelperTools,
  attachPilotMemoryTool,
  createGatewayServer,
  deterministicPlayRequestId,
  PILOT_MEMORY_RECENT_EXPERIENCES,
  readPilotMemory,
  seatConfigSchema,
  stripDuplicateStructuredContent,
  withGatewayGuarantees,
} from '../../../tools/llm-pilot/gateway';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function tmpGameDir() {
  // Mirrors the real layout (CAMPAIGN_DIR/games/<gameId>) so the default
  // `MUJU_PILOT_DIR`-less snapshot lookup (two levels up from gameDir) resolves
  // sensibly instead of walking above the OS temp root.
  const root = mkdtempSync(join(tmpdir(), 'muju-gateway-test-'));
  dirs.push(root);
  const gameDir = join(root, 'games', 'P01-W');
  mkdirSync(gameDir, { recursive: true });
  return gameDir;
}

/** A stubbed backend: an in-process RoomStore (real game rules, no HTTP, no live site). */
function stubBackend(store: RoomStore): RoomBackend {
  return {
    create: input => store.create(input),
    join: (id, input) => store.join(id, input),
    get: (id, token) => store.get(id, token),
    moveHistory: (id, query) => store.moveHistory(id, query),
    wait: (id, afterRevision, timeoutMs, signal) => store.wait(id, afterRevision, timeoutMs, signal),
    act: (id, token, input, preview) => store.act(id, token, input, preview),
    stage: (id, token, input) => store.stage(id, token, input),
    cancelStage: (id, token, input) => store.cancelStage(id, token, input),
    staged: (id, token, stageId) => store.staged(id, token, stageId),
  };
}
function matchFor(toolTier: MatchPolicy['toolTier']) {
  const store = new RoomStore();
  const admission = store.create({ name: 'Player', matchPolicy: { version: 1, toolTier, protocolId: 'llm-pilot-test' } });
  store.join(admission.room.id, { name: 'Engine', inviteCode: admission.inviteCode });
  const room = store.get(admission.room.id);
  return { store, room, admission };
}
async function clientOver(server: Awaited<ReturnType<typeof createGatewayServer>>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'gateway-test', version: '1' });
  await client.connect(clientTransport);
  return client;
}
function config(roomId: string, tier: MatchPolicy['toolTier'], seatToken: string) {
  return seatConfigSchema.parse({ serverUrl: 'https://example.invalid', roomId, seatToken, tier });
}

describe('tool tiers', () => {
  it.each(['bare', 'harnessed', 'centaur', 'tool-builder'] as const)('exposes exactly the permitted tools for %s and refuses create/join', async tier => {
    const { store, room, admission } = matchFor(tier);
    const scope = matchScopeFor(room);
    const backend = withGatewayGuarantees(stubBackend(store), config(room.id, tier, admission.credentials.token), () => {});
    const server = createMcpServer(backend, 'https://example.invalid', scope);
    attachPilotMemoryTool(server, tmpGameDir());
    const client = await clientOver(server);
    const tools = (await client.listTools()).tools.map(t => t.name);

    // Always present regardless of tier.
    for (const name of ['muju_rules', 'muju_observe', 'muju_clock', 'muju_history', 'muju_play', 'muju_wait_for_change', 'pilot_memory']) {
      expect(tools, tier).toContain(name);
    }
    // Never present for any tier — create/join are refused by scopeBackend itself.
    for (const name of ['muju_create_room', 'muju_join_room']) expect(tools, tier).not.toContain(name);
    const created = await client.callTool({ name: 'muju_create_room', arguments: { name: 'Mirror' } })
      .then(value => ({ value }), error => ({ error }));
    if ('error' in created) expect(String(created.error), tier).toMatch(/Unknown tool|not found|Invalid params/i);
    else expect(created.value.isError, tier).toBe(true);

    // rules-oracle tools: everything but bare.
    const oracleTools = ['muju_legal_actions', 'muju_preview', 'muju_stage', 'muju_cancel_stage', 'muju_staged'];
    for (const name of oracleTools) expect(tools.includes(name), `${tier}/${name}`).toBe(tier !== 'bare');
    // hosted analysis: centaur only.
    expect(tools.includes('muju_analyze'), tier).toBe(tier === 'centaur');

    await client.close();
    store.close();
  });
});

describe('token injection', () => {
  it('always uses the configured seat token, ignoring whatever the client sends', async () => {
    const { store, room, admission } = matchFor('harnessed');
    const scope = matchScopeFor(room);
    const seenTokens: (string | undefined)[] = [];
    const recordingBackend: RoomBackend = { ...stubBackend(store), get: (id, token) => { seenTokens.push(token); return store.get(id, token); } };
    const backend = withGatewayGuarantees(recordingBackend, config(room.id, 'harnessed', admission.credentials.token), () => {});
    const server = createMcpServer(backend, 'https://example.invalid', scope);
    const client = await clientOver(server);

    const result = await client.callTool({ name: 'muju_observe', arguments: { roomId: room.id } });
    expect(result.isError).not.toBe(true);
    // Every downstream get() used the real configured seat token; the tool never even accepts one.
    expect(seenTokens.every(token => token === admission.credentials.token)).toBe(true);

    await client.close();
    store.close();
  });
});

describe('idempotent play', () => {
  it('replaces a retried play’s requestId with a deterministic hash, and journals only accepted plays', async () => {
    const { store, room, admission } = matchFor('harnessed');
    const scope = matchScopeFor(room);
    const gameDir = tmpGameDir();
    const seenRequestIds: string[] = [];
    const recordingBackend: RoomBackend = { ...stubBackend(store), act: (id, token, input, preview) => {
      seenRequestIds.push((input as { requestId: string }).requestId);
      return store.act(id, token, input, preview);
    } };
    const cfg = config(room.id, 'harnessed', admission.credentials.token);
    const backend = withGatewayGuarantees(recordingBackend, cfg, event => appendFileSync(join(gameDir, 'actions.jsonl'), `${JSON.stringify(event)}\n`));
    const server = createMcpServer(backend, 'https://example.invalid', scope);
    const client = await clientOver(server);

    const unitId = room.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id;
    const args = { roomId: room.id, token: 'placeholder-token-the-model-made-up-000000', expectedRevision: 1, actions: [{ type: 'MOVE', unitId, to: 'C1' }] };

    const first = await client.callTool({ name: 'muju_play', arguments: { ...args, requestId: 'model-retry-attempt-one' } });
    expect(first.isError).not.toBe(true);
    const second = await client.callTool({ name: 'muju_play', arguments: { ...args, requestId: 'model-retry-attempt-TWO-different-text' } });
    expect(second.isError).not.toBe(true);

    // Same logical play, two different model-supplied requestId strings — the gateway
    // still computed and forwarded the SAME deterministic id both times, and it is
    // neither of the model's own texts (so a garbled retry id can never matter).
    expect(seenRequestIds).toHaveLength(2);
    expect(seenRequestIds[0]).toBe(seenRequestIds[1]);
    expect(seenRequestIds[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(seenRequestIds).not.toContain('model-retry-attempt-one');
    expect(seenRequestIds).not.toContain('model-retry-attempt-TWO-different-text');
    // Independently reproducible from the transformed (square-notation-decoded) actions
    // the backend actually received, so a real retried play is provably idempotent.
    expect(seenRequestIds[0]).toBe(deterministicPlayRequestId(room.id, 1, [{ type: 'MOVE', unitId, to: { x: 2, y: 0 } }]));
    const journaled = readFileSync(join(gameDir, 'actions.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(journaled.length).toBe(2);
    for (const entry of journaled) expect(entry.requestId).toBe(seenRequestIds[0]);

    await client.close();
    store.close();
  });
});

describe('pilot_memory', () => {
  it('returns the frozen snapshot for the manifest-pinned version, never live data', () => {
    const gameDir = tmpGameDir();
    writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify({ snapshotVersion: 3 }));
    const snapshotDir = join(gameDir, '..', '..', 'memory', 'snapshots', 'v3');
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(join(snapshotDir, 'playbook.md'), '# version: 3\nOpen with Hi toward a rich patch.');
    writeFileSync(join(snapshotDir, 'experiences.jsonl'), `${JSON.stringify({ gameId: 'P01-W', reflection: 'anchor the rectangle' })}\n`);

    const memory = readPilotMemory(gameDir);
    expect(memory.available).toBe(true);
    expect(memory.playbook).toContain('Hi toward a rich patch');
    expect(memory.experiences).toEqual([{ gameId: 'P01-W', reflection: 'anchor the rectangle' }]);
    expect(memory.olderExperiences).toBe(0);
  });
  it('serves only the most recent records, trimmed to identity and reflection (older ones live in the playbook)', () => {
    const gameDir = tmpGameDir();
    writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify({ snapshotVersion: 4 }));
    const snapshotDir = join(gameDir, '..', '..', 'memory', 'snapshots', 'v4');
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(join(snapshotDir, 'playbook.md'), 'version: 4');
    const records = Array.from({ length: PILOT_MEMORY_RECENT_EXPERIENCES + 3 }, (_, i) =>
      JSON.stringify({ gameId: `G${i}`, result: 'loss', reflection: `r${i}`, citedRevisions: [1, 2, 3], droppedCitations: [], writtenAt: 'x' }));
    writeFileSync(join(snapshotDir, 'experiences.jsonl'), `${records.join('\n')}\n`);
    const memory = readPilotMemory(gameDir);
    expect(memory.experiences).toHaveLength(PILOT_MEMORY_RECENT_EXPERIENCES);
    expect(memory.experiences![0]).toEqual({ gameId: 'G3', result: 'loss', reflection: 'r3' });
    expect(memory.olderExperiences).toBe(3);
  });
  it('serves a record\'s engineProfile (STRATEGOS W1.14) and adds nothing to a desktop record', () => {
    const gameDir = tmpGameDir();
    writeFileSync(join(gameDir, 'manifest.json'), JSON.stringify({ snapshotVersion: 5 }));
    const snapshotDir = join(gameDir, '..', '..', 'memory', 'snapshots', 'v5');
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(join(snapshotDir, 'experiences.jsonl'), [
      { gameId: 'D1-W', engineSourceSha256: 'a'.repeat(64), reflection: 'desktop' },
      { gameId: 'S1-W', engineSourceSha256: 'a'.repeat(64), engineProfile: 'strategos', reflection: 'strategos' },
    ].map(record => JSON.stringify(record)).join('\n'));
    expect(readPilotMemory(gameDir).experiences).toEqual([
      { gameId: 'D1-W', engineSourceSha256: 'a'.repeat(64), reflection: 'desktop' },
      { gameId: 'S1-W', engineSourceSha256: 'a'.repeat(64), engineProfile: 'strategos', reflection: 'strategos' },
    ]);
  });
  it('reports unavailable rather than fabricating memory when no snapshot exists', () => {
    const gameDir = tmpGameDir();
    expect(readPilotMemory(gameDir)).toEqual({ available: false });
  });
});

describe('tool-builder helper tools (muju_run_helper / muju_write_file)', () => {
  // Isolates this test's heavy-slot queue from the machine-wide one (heavy.ts's own documented
  // test pattern) — this repo may share the machine with an unrelated live campaign holding both
  // real slots, and this suite must never wait on (or bypass) that queue.
  const previousHeavyDir = process.env.MUJU_HEAVY_DIR;
  beforeAll(() => { process.env.MUJU_HEAVY_DIR = mkdtempSync(join(tmpdir(), 'muju-gateway-heavy-')); });
  afterAll(() => { if (previousHeavyDir === undefined) delete process.env.MUJU_HEAVY_DIR; else process.env.MUJU_HEAVY_DIR = previousHeavyDir; });
  function helperServer(gameDir: string, workspaceDir: string) {
    const server = new McpServer({ name: 'test-gateway', version: '1' });
    attachHelperTools(server, gameDir, workspaceDir, 'P07-W');
    return server;
  }

  it('createGatewayServer only attaches helper tools for tool-builder, and requires a workspaceDir for it', async () => {
    const { store, room, admission } = matchFor('centaur');
    const gameDir = tmpGameDir();
    const cfgCentaur = config(room.id, 'centaur', admission.credentials.token);
    const centaurServer = await createGatewayServer(cfgCentaur, { gameDir, scope: matchScopeFor(room) });
    const centaurTools = (await clientOver(centaurServer).then(c => c.listTools())).tools.map(t => t.name);
    expect(centaurTools).not.toContain('muju_run_helper');
    expect(centaurTools).not.toContain('muju_write_file');
    store.close();

    const { store: store2, room: room2, admission: admission2 } = matchFor('tool-builder');
    const cfgBuilder = config(room2.id, 'tool-builder', admission2.credentials.token);
    await expect(createGatewayServer(cfgBuilder, { gameDir: tmpGameDir(), scope: matchScopeFor(room2) }))
      .rejects.toThrow(/workspaceDir/);
    const workspaceDir = mkdtempSync(join(tmpdir(), 'muju-gateway-ws-'));
    dirs.push(workspaceDir);
    const builderServer = await createGatewayServer(cfgBuilder, { gameDir: tmpGameDir(), scope: matchScopeFor(room2), workspaceDir });
    const builderTools = (await clientOver(builderServer).then(c => c.listTools())).tools.map(t => t.name);
    expect(builderTools).toContain('muju_run_helper');
    expect(builderTools).toContain('muju_write_file');
    store2.close();
  });

  it('muju_write_file writes only inside the workspace, and rejects an escape attempt', async () => {
    const gameDir = tmpGameDir();
    const workspaceDir = mkdtempSync(join(tmpdir(), 'muju-gateway-ws-'));
    dirs.push(workspaceDir);
    const server = helperServer(gameDir, workspaceDir);
    const client = await clientOver(server);

    const ok = await client.callTool({ name: 'muju_write_file', arguments: { path: 'helper.py', content: 'print(1)\n' } });
    expect(ok.isError).not.toBe(true);
    expect(readFileSync(join(workspaceDir, 'helper.py'), 'utf8')).toBe('print(1)\n');

    const escape = await client.callTool({ name: 'muju_write_file', arguments: { path: '../outside.txt', content: 'x' } });
    expect(escape.isError).toBe(true);

    await client.close();
  });

  it('muju_run_helper runs sandboxed: a legitimate script succeeds; reading the repo and reaching the network both fail', async () => {
    const gameDir = tmpGameDir();
    const workspaceDir = mkdtempSync(join(tmpdir(), 'muju-gateway-ws-'));
    dirs.push(workspaceDir);
    const server = helperServer(gameDir, workspaceDir);
    const client = await clientOver(server);

    const legit = await client.callTool({ name: 'muju_run_helper', arguments: { command: '/bin/echo', args: ['ok-from-sandbox'] } });
    expect(legit.isError).not.toBe(true);
    expect(JSON.stringify(legit.structuredContent)).toContain('ok-from-sandbox');

    const readRepo = await client.callTool({ name: 'muju_run_helper',
      arguments: { command: '/bin/cat', args: [join(__dirname, '../../../tools/llm-pilot/players.ts')] } });
    expect((readRepo.structuredContent as { exitCode: number }).exitCode).not.toBe(0);

    const network = await client.callTool({ name: 'muju_run_helper',
      arguments: { command: '/usr/bin/curl', args: ['-sS', '--max-time', '5', 'https://example.com'] } });
    expect((network.structuredContent as { exitCode: number }).exitCode).not.toBe(0);

    await client.close();
  }, 30_000);
});

describe('stripDuplicateStructuredContent', () => {
  it('drops the duplicate structured copy only when text content carries the result', () => {
    const withBoth = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"a":1}' }], structuredContent: { a: 1 } } };
    expect(stripDuplicateStructuredContent(withBoth)).toEqual({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"a":1}' }] } });
    const structuredOnly = { jsonrpc: '2.0', id: 2, result: { content: [], structuredContent: { a: 1 } } };
    expect(stripDuplicateStructuredContent(structuredOnly)).toEqual(structuredOnly);
    const notification = { jsonrpc: '2.0', method: 'notifications/progress', params: {} };
    expect(stripDuplicateStructuredContent(notification)).toEqual(notification);
  });
});
