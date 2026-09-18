// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from '../../server/rooms';
import { observe, legalActions } from '../../server/observation';
import { analysisService } from '../../server/analysis';
import type { RoomAction } from '../../src/online/types';
const stores: RoomStore[] = [], dirs: string[] = [];
afterEach(() => { stores.forEach(s => s.close()); stores.length = 0; dirs.forEach(d => rmSync(d, { recursive: true, force: true })); dirs.length = 0; vi.useRealTimers(); });
const open = (path?: string) => { const s = new RoomStore(path); stores.push(s); return s; };
function setup(store = open()) {
  const host = store.create({ name: 'White', ruleset: 'phasing', timeControl: { delaySeconds: 10, bankSeconds: 60 } });
  const guest = store.join(host.room.id, { name: 'Black', inviteCode: host.inviteCode });
  const play = (player: 'white' | 'black', actions: RoomAction[]) => {
    const current = store.get(host.room.id);
    return store.act(host.room.id, (player === 'white' ? host : guest).credentials.token,
      { expectedRevision: current.revision, requestId: `phasing-${current.revision}`, actions });
  };
  return { store, host, guest, play, id: host.room.id };
}
it('preserves full-turn clock, undo, public pending commitments, arrival history and analysis identity', () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(1800000000000);
  const { store, host, play, id } = setup();
  const before = store.get(id), deadline = before.clock!.deadlineAtMs;
  vi.setSystemTime(1800000002000);
  let prepared = play('white', [{ type: 'END_ACTION_PHASE' }]);
  expect(prepared.state.turn.currentPlayer).toBe('white');
  expect(prepared.clock!.deadlineAtMs).toBe(deadline);
  expect(prepared.canUndo).toBe(true);
  const reverted = play('white', [{ type: 'UNDO' }]);
  expect(reverted.state.board).toEqual(before.state.board);
  expect(reverted.state.players).toEqual(before.state.players);
  expect(reverted.clock!.deadlineAtMs).toBe(deadline);
  prepared = play('white', [{ type: 'END_ACTION_PHASE' }]);
  const bought = play('white', [{ type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }]);
  expect(observe(bought)).toMatchObject({ ruleset: 'phasing', pendingSummons: [{ definitionId: 'fire_1', cost: 3 }] });
  expect(observe(bought).analysis).toMatchObject({ supported: true, ruleset: 'phasing' });
  expect(legalActions(bought, { type: 'BUY_UNIT', limit: 200 }).actions.some(a => JSON.stringify(a).includes('A1'))).toBe(false);
  expect(analysisService.analyze(bought, { roomId: id, expectedRevision: bought.revision, player: 'white', topics: ['threats'] })).toMatchObject({ supported: true });
  expect(store.listActive().find(r => r.id === id)).toMatchObject({ ruleset: 'phasing' });
  const black = play('white', [{ type: 'END_PLACE_PHASE' }]);
  expect(black.clock!.runningPlayer).toBe('black'); expect(black.canUndo).toBe(false);
  const white = play('black', [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }]);
  expect(white.state.lastSummoning!.summoned).toHaveLength(1);
  expect(white.state.pendingSummons).toHaveLength(0);
  const history = store.moveHistory(id, { after: 0, limit: 200 });
  expect(history.entries.some(e => e.kind === 'purchase' && e.description.includes('phasing'))).toBe(true);
  expect(history.entries.some(e => e.kind === 'summoning')).toBe(true);
  expect(host.room.state.ruleset).toBe('phasing');
});
it('persists commitments across server restart while Standard rooms retain their rules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'muju-phasing-')); dirs.push(dir);
  const path = join(dir, 'rooms.sqlite'); const store = open(path);
  const { id, play } = setup(store);
  const saved = play('white', [{ type: 'END_ACTION_PHASE' }, { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }, { type: 'END_PLACE_PHASE' }]);
  const standard = store.create({ name: 'Standard' });
  const reloaded = open(path);
  expect(reloaded.get(id).state).toEqual(saved.state);
  expect(reloaded.get(standard.room.id).state.ruleset).toBe('standard');
});
it('rejects invalid rulesets and atomic batches that try to act after preparation or summon twice on one square', () => {
  const { store, host, play, id } = setup();
  expect(() => store.create({ name: 'Invalid', ruleset: 'mystery' })).toThrow();
  const before = store.get(id);
  expect(() => play('white', [{ type: 'END_ACTION_PHASE' }, { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } },
    { type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }])).toThrow();
  expect(store.get(id).state).toEqual(before.state);
  const starter = host.room.state.board.units[0];
  expect(() => play('white', [{ type: 'END_ACTION_PHASE' }, { type: 'MOVE', unitId: starter.id, to: { x: 2, y: 0 } }])).toThrow();
});
