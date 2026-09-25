// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MICRO_ROOM_RULES_VERSION, RoomStore } from '../../server/rooms';
import { legalActions, observe, rulesFor } from '../../server/observation';
import { analysisService } from '../../server/analysis';

const stores: RoomStore[] = [], dirs: string[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
const open = (path = ':memory:') => { const store = new RoomStore(path); stores.push(store); return store; };
let request = 0;
const act = (store: RoomStore, id: string, token: string, revision: number, actions: unknown[]) =>
  store.act(id, token, { expectedRevision: revision, requestId: `micro-request-${request++}`, actions });

describe('MICRO MUJU rooms', () => {
  it('creates a micro-muju-1 room with the Micro opening and joins it', () => {
    const store = open();
    const host = store.create({ name: 'Host', variant: 'micro' });
    expect(host.room.state.variant).toBe('micro');
    expect(host.room.state.actionsPerTurn).toBe(2);
    expect(host.room.state.board.cells).toHaveLength(6);
    const guest = store.join(host.room.id, { name: 'LLM', inviteCode: host.inviteCode });
    expect(guest.credentials.player).toBe('black');
    const room = observe(guest.room);
    expect(room).toMatchObject({ game: 'MICRO MUJU', variant: 'micro', rulesVersion: MICRO_ROOM_RULES_VERSION, actionsPerTurn: 2, killClock: null });
    expect(room.coordinates).toMatch(/A–F.*F6/);
  });

  it('refuses a handicap or a different action budget, and keeps Prime at four', () => {
    const store = open();
    expect(() => store.create({ name: 'Host', variant: 'micro', blackCrystalHandicap: 2 })).toThrow(/two actions per turn and no crystal handicap/);
    expect(() => store.create({ name: 'Host', variant: 'micro', actionsPerTurn: 4 })).toThrow(/two actions per turn/);
    expect(() => store.create({ name: 'Host', actionsPerTurn: 2 })).toThrow(/four actions/);
    expect(store.create({ name: 'Host' }).room.state.actionsPerTurn).toBe(4);
  });

  it('survives a restart and is listed as an active Micro room', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-micro-')); dirs.push(dir);
    const path = join(dir, 'rooms.sqlite');
    const first = open(path);
    const micro = first.create({ name: 'Host', variant: 'micro' }), prime = first.create({ name: 'Host' });
    first.close(); stores.splice(stores.indexOf(first), 1);
    const second = open(path);
    expect(second.get(micro.room.id).state.variant).toBe('micro');
    expect(second.get(prime.room.id).state.variant).toBeUndefined();
    const listed = second.listActive();
    expect(listed.find(r => r.id === micro.room.id)?.variant).toBe('micro');
    expect(listed.find(r => r.id === prime.room.id)?.variant).toBeUndefined();
    expect(second.listArchived().rooms).toHaveLength(0);
  });

  it('enforces Micro rules through play and the rules oracle', () => {
    const store = open();
    const host = store.create({ name: 'Host', variant: 'micro' });
    const guest = store.join(host.room.id, { name: 'LLM', inviteCode: host.inviteCode });
    const { id } = host.room, token = host.credentials.token;
    const hi = guest.room.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
    let room = act(store, id, token, guest.room.revision, [{ type: 'MOVE', unitId: hi.id, to: { x: 3, y: 0 } }, { type: 'MOVE', unitId: hi.id, to: { x: 3, y: 2 } }]);
    expect(room.state.turn.actionsRemaining).toBe(0);
    room = act(store, id, token, room.revision, [{ type: 'END_ACTION_PHASE' }]);
    expect(() => act(store, id, token, room.revision, [{ type: 'BUY_UNIT', definitionId: 'metal_1', position: { x: 0, y: 0 } }])).toThrow(/illegal/);
    expect(() => act(store, id, token, room.revision, [{ type: 'PROMOTE_UNIT', unitId: hi.id }])).toThrow(/illegal/);
    expect(() => act(store, id, token, room.revision, [{ type: 'SET_UPKEEP_REVIEW', enabled: true }])).toThrow(/no upkeep/);
    const buys = legalActions(room, { type: 'BUY_UNIT', limit: 200 }).actions.map(a => (a.action as { definitionId: string }).definitionId);
    expect(new Set(buys)).toEqual(new Set(['fire_1', 'water_1', 'plant_1']));
  });

  it('turns hosted analysis off for Micro rooms only', () => {
    const store = open();
    const micro = store.create({ name: 'Host', variant: 'micro' }).room, prime = store.create({ name: 'Host' }).room;
    expect(analysisService.headline(micro)).toMatchObject({ supported: false, reason: 'ANALYSIS_UNAVAILABLE' });
    expect(() => analysisService.briefing(micro, 'white')).toThrow(/not available for MICRO MUJU/);
    expect(analysisService.headline(prime).supported).not.toBe(false);
  });

  it('serves Micro rules on request without changing the default payload', () => {
    const micro = rulesFor('micro');
    expect(micro.catalogue.map(d => d.id)).toEqual(['fire_1', 'water_1', 'plant_1']);
    expect(micro.resourceMap.total).toBe(112);
    expect(rulesFor().catalogue).toHaveLength(18);
  });
});
