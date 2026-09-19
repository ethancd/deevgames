// @vitest-environment node
import { afterEach, expect, it } from 'vitest';
import type { AIAction } from '../../src/ai/types';
import { isLegalAction } from '../../src/game/legality';
import { getAffordablePurchases } from '../../src/game/building';
import { getAllSpawnPositions } from '../../src/game/spawning';
import { summonDisruptable } from '../../src/ai/planner/summons';
import { describeAction, legalActions, observe } from '../../server/observation';
import { piece, position, snapshot } from '../fixtures/analysis';
import { RoomStore } from '../../server/rooms';
import { createApp } from '../../server/http';
import type { Server } from 'node:http';
const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
it('returns every legal Phasing purchase in a mixed safe/risky rectangle, with exact paginated totals', () => {
  const state = position([piece('anchor', 'fire_1', 'white', 4, 4), piece('enemy', 'fire_1', 'black', 6, 6)], 5);
  state.ruleset = 'phasing'; state.turn.phase = 'place'; state.pendingSummons = [];
  const room = { ...snapshot(state), matchPolicy: { version: 1 as const, toolTier: 'harnessed' as const, protocolId: 'oracle-correction' } };
  const exhaustive: AIAction[] = getAffordablePurchases(state.players.white.resources).flatMap(def => getAllSpawnPositions('white', state.board)
    .map(position => ({ type: 'BUY_UNIT' as const, definitionId: def.id, position }))).filter(action => isLegalAction(state, action));
  const risky = exhaustive.filter(action => action.type === 'BUY_UNIT' && summonDisruptable(state, 'white', action.position));
  expect(risky.length).toBeGreaterThan(0); expect(risky.length).toBeLessThan(exhaustive.length);
  const actual: unknown[] = []; let offset: number | null = 0;
  while (offset !== null) {
    const page = legalActions(room, { type: 'BUY_UNIT', offset, limit: 7 });
    expect(page.total).toBe(exhaustive.length);
    actual.push(...page.actions.map(row => row.action)); offset = page.nextOffset;
  }
  const key = (action: unknown) => JSON.stringify(action);
  expect(actual.map(key).sort()).toEqual(exhaustive.map(describeAction).map(key).sort());
  expect(new Set(actual.map(key)).size).toBe(exhaustive.length);
});
it.each(['bare', 'harnessed', undefined] as const)('enforces UNDO as assistance over direct HTTP for %s rooms', async toolTier => {
  const store = new RoomStore(); cleanups.push(() => store.close());
  const host = store.create({ name: 'Host', ...(toolTier ? { matchPolicy: { version: 1, toolTier, protocolId: 'undo-correction' } } : {}) });
  store.join(host.room.id, { name: 'Guest', inviteCode: host.inviteCode });
  const listener: Server = await new Promise(resolve => { const server = createApp(store, { publicUrl: 'http://localhost' }).listen(0, '127.0.0.1', () => resolve(server)); });
  cleanups.push(async () => { listener.closeAllConnections(); await new Promise<void>(r => listener.close(() => r())); });
  const url = `http://127.0.0.1:${(listener.address() as { port: number }).port}/api/muju/rooms/${host.room.id}`;
  const token = host.credentials.token, unitId = host.room.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id;
  const send = (actions: unknown[], revision: number, requestId: string) => fetch(`${url}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ expectedRevision: revision, requestId, actions }) });
  expect((await send([{ type: 'MOVE', unitId, to: { x: 2, y: 0 } }], 1, 'probe-move-1')).status).toBe(200);
  const before = store.get(host.room.id, token);
  expect(before.canUndo).toBe(toolTier !== 'bare'); expect(observe(before).canUndo).toBe(toolTier !== 'bare');
  const undone = await send([{ type: 'UNDO' }], 2, 'probe-undo-1');
  if (toolTier === 'bare') {
    expect(undone.status).toBe(403); expect(await undone.json()).toMatchObject({ code: 'MATCH_TOOL_RESTRICTED' });
    for (const actions of [[{ type: 'UNDO' }, { type: 'END_ACTION_PHASE' }], [{ type: 'END_ACTION_PHASE' }, { type: 'UNDO' }]]) {
      const batch = await send(actions, 2, `batch-undo-${actions[0].type}`); expect(batch.status).toBe(403);
      expect(await batch.json()).toMatchObject({ code: 'MATCH_TOOL_RESTRICTED' });
    }
    expect(store.get(host.room.id, token)).toEqual(before);
  } else {
    expect(undone.status).toBe(200);
    expect(store.get(host.room.id).state.board.units.find(u => u.id === unitId)?.position).toEqual(host.room.state.board.units.find(u => u.id === unitId)!.position);
  }
});
