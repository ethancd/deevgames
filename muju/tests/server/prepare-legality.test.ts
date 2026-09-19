// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Server } from 'node:http';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import { describeAction } from '../../server/observation';
import { actionKeys, exhaustivePrepare, mixedPrepare } from '../fixtures/prepare-legality';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
it.each(['standard', 'phasing'] as const)('serves the complete %s Prepare oracle over MCP with exact paginated totals', async ruleset => {
  const directory = mkdtempSync(join(tmpdir(), 'muju-prepare-oracle-'));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'rooms.sqlite'), store = new RoomStore(path);
  cleanups.push(() => store.close());
  const host = store.create({ name: 'White', ruleset }), roomId = host.room.id;
  store.join(roomId, { name: 'Black', inviteCode: host.inviteCode });
  const state = mixedPrepare(ruleset), db = new DatabaseSync(path);
  const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(roomId)!.data as string);
  saved.state = state;
  db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(saved), roomId); db.close();
  const listener: Server = await new Promise((resolve, reject) => {
    const server = createApp(store, { publicUrl: 'http://localhost', rateLimit: 600 }).listen(0, '127.0.0.1', error => error ? reject(error) : resolve(server));
  });
  cleanups.push(async () => { listener.closeAllConnections(); await new Promise<void>(resolve => listener.close(() => resolve())); });
  const client = new Client({ name: 'prepare-oracle-regression', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(listener.address() as { port: number }).port}/mcp`)));
  cleanups.push(() => client.close());
  const read = async (args: Record<string, unknown>) => {
    const response = await client.callTool({ name: 'muju_legal_actions', arguments: { roomId, ...args } });
    expect(response.isError).not.toBe(true);
    return response.structuredContent as unknown as { total: number; nextOffset: number | null; actions: { action: unknown }[] };
  };
  const expected = [...exhaustivePrepare(state), { type: 'RESIGN' as const }].map(describeAction);
  for (const type of [undefined, 'BUY_UNIT'] as const) {
    const wanted = type ? expected.filter(a => a.type === type) : expected, actual: unknown[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const page = await read({ ...(type ? { type } : {}), offset, limit: 7 });
      expect(page.total).toBe(wanted.length);
      expect(page.actions).toHaveLength(Math.min(7, wanted.length - offset));
      expect(page.nextOffset).toBe(offset + 7 < wanted.length ? offset + 7 : null);
      actual.push(...page.actions.map(row => row.action)); offset = page.nextOffset;
    }
    expect(actionKeys(actual)).toEqual(actionKeys(wanted));
    expect(new Set(actionKeys(actual)).size).toBe(wanted.length);
    const exhausted = await read({ ...(type ? { type } : {}), offset: wanted.length, limit: 7 });
    expect(exhausted).toMatchObject({ total: wanted.length, actions: [], nextOffset: null });
  }
});
