// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { RoomStore } from '../../server/rooms';
import { legalActions, observe } from '../../server/observation';
import { phaseEndAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import type { ActionRequest, RoomAction } from '../../src/online/types';

const stores: RoomStore[] = [];
const directories: string[] = [];
afterEach(() => { stores.splice(0).forEach(s => s.close()); directories.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });
function setup(path?: string) {
  const store = new RoomStore(path); stores.push(store);
  const host = store.create({ name: 'Human', side: 'white' });
  const guest = store.join(host.room.id, { name: 'Agent', inviteCode: host.inviteCode });
  return { store, host, guest, id: host.room.id };
}
const request = (revision: number, actions: RoomAction[], requestId = 'test-request-1'): ActionRequest => ({ expectedRevision: revision, actions, requestId });

describe('authoritative shared rooms', () => {
  it('uses a one-use invitation and never exposes private credentials in snapshots', () => {
    const { store, host, guest, id } = setup();
    expect(guest.credentials.player).toBe('black');
    const serialized = JSON.stringify(store.get(id));
    expect(serialized).not.toContain(host.credentials.token);
    expect(serialized).not.toContain(guest.credentials.token);
    expect(serialized).not.toContain(host.inviteCode);
    expect(serialized).not.toContain('tokenHash');
    expect(() => store.join(id, { name: 'Intruder', inviteCode: host.inviteCode })).toThrow('already been used');
    expect(() => store.act(id, 'invalid', request(1, [{ type: 'END_ACTION_PHASE' }]))).toThrow('credential is invalid');
  });
  it('allows Black hosting and prevents play before the guest joins', () => {
    const store = new RoomStore(); stores.push(store);
    const host = store.create({ name: 'Black', side: 'black' });
    expect(() => store.act(host.room.id, host.credentials.token, request(0, [{ type: 'END_ACTION_PHASE' }]))).toThrow('wait for the other player');
    expect(store.join(host.room.id, { name: 'White', inviteCode: host.inviteCode }).credentials.player).toBe('white');
  });
  it('applies exactly the existing game engine and serializes revision conflicts', () => {
    const { store, host, guest, id } = setup();
    const initial = store.get(id);
    const action = { type: 'END_ACTION_PHASE' } as const;
    expect(() => store.act(id, guest.credentials.token, request(1, [action]))).toThrow('illegal');
    const result = store.act(id, host.credentials.token, request(1, [action]));
    expect(result.state).toEqual(applyAction(initial.state, action));
    expect(result.revision).toBe(2);
    expect(() => store.act(id, guest.credentials.token, request(1, [action], 'another-request'))).toThrow('revision 2');
  });
  it('does not partially commit invalid batches or permit crossing the turn boundary', () => {
    const { store, host, id } = setup();
    const before = store.get(id);
    const unitId = before.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!.id;
    expect(() => store.act(id, host.credentials.token, request(1, [
      { type: 'MOVE', unitId, to: { x: 2, y: 0 } }, { type: 'MOVE', unitId: 'not-a-unit', to: { x: 3, y: 0 } },
    ]))).toThrow('Action 2');
    expect(store.get(id)).toEqual(before);
    expect(() => store.act(id, host.credentials.token, request(1, [{ type: 'END_ACTION_PHASE' }, { type: 'END_ACTION_PHASE' }]))).toThrow('Action 2');
    expect(store.get(id)).toEqual(before);
  });
  it('previews without mutation, retries exactly once, and rejects request ID reuse', () => {
    const { store, host, id } = setup();
    const input = request(1, [{ type: 'END_ACTION_PHASE' }]);
    const preview = store.act(id, host.credentials.token, input, true);
    expect(preview.state.turn.currentPlayer).toBe('black');
    expect(store.get(id).revision).toBe(1);
    const committed = store.act(id, host.credentials.token, input);
    expect(store.act(id, host.credentials.token, input)).toEqual(committed);
    expect(() => store.act(id, host.credentials.token, { ...input, actions: [{ type: 'RESIGN' }] })).toThrow('new requestId');
  });
  it('persists credentials, receipts and state across a restart and concurrent store handles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-')); directories.push(dir);
    const path = join(dir, 'rooms.sqlite');
    const { store, host, guest, id } = setup(path);
    const input = request(1, [{ type: 'END_ACTION_PHASE' }]);
    const result = store.act(id, host.credentials.token, input);
    store.close(); stores.splice(stores.indexOf(store), 1);
    const reopened = new RoomStore(path); stores.push(reopened);
    const second = new RoomStore(path); stores.push(second);
    expect(reopened.get(id, guest.credentials.token)).toEqual(result);
    expect(reopened.act(id, host.credentials.token, input)).toEqual(result);
    second.act(id, guest.credentials.token, request(2, [{ type: 'END_ACTION_PHASE' }], 'black-request'));
    expect(() => reopened.act(id, guest.credentials.token, request(2, [{ type: 'END_ACTION_PHASE' }], 'stale-request'))).toThrow('revision 3');
  });
  it('rejects malformed, out-of-range, injected and oversized actions', () => {
    const { store, host, id } = setup();
    for (const action of [{ type: 'RESTORE_STATE', state: {} }, { type: 'RESET_GAME' }, { type: 'MOVE', unitId: 'x', to: { x: 10, y: 0 } }, { type: 'MOVE', unitId: 'x', to: null }]) {
      expect(() => store.act(id, host.credentials.token, { expectedRevision: 1, requestId: 'bad-input', actions: [action] })).toThrow();
    }
    expect(() => store.act(id, host.credentials.token, request(1, Array(33).fill({ type: 'END_ACTION_PHASE' })))).toThrow();
    expect(store.get(id).revision).toBe(1);
  });
  it('offers complete multi-action movement, paginates, and names squares', () => {
    const { store, id } = setup();
    const room = store.get(id), legal = legalActions(room, { type: 'MOVE', limit: 200 });
    expect(legal.actions.some(a => (a.actionCost ?? 0) > 1)).toBe(true);
    expect(legalActions(room, { limit: 2 }).nextOffset).toBe(2);
    expect(observe(room).units[0].square).toBe('B1');
    expect(observe(room).units[0].id).toBe(room.state.board.units[0].id);
  });
  it('settles upkeep and resignation through the same engine', () => {
    const { store, host, guest, id } = setup();
    store.act(id, guest.credentials.token, request(1, [{ type: 'SET_UPKEEP_REVIEW', enabled: true }]));
    const result = store.act(id, host.credentials.token, request(2, [{ type: 'END_ACTION_PHASE' }], 'white-end'));
    expect(result.state.upkeepPending).toBe(true);
    expect(() => store.act(id, guest.credentials.token, request(3, [{ type: 'PAY_UPKEEP', keepUnitIds: [] }], 'bad-upkeep'))).toThrow('illegal');
    const paid = store.act(id, guest.credentials.token, request(3, [phaseEndAction(result.state)], 'paid-upkeep'));
    expect(paid.state.upkeepPending).toBe(false);
    const victory = store.act(id, guest.credentials.token, request(4, [{ type: 'RESIGN' }], 'resignation'));
    expect(victory.state.winner).toBe('white');
    expect(legalActions(victory).total).toBe(0);
  });
  it('can finish a complete two-agent match and refuses post-game moves', () => {
    const { store, host, guest, id } = setup();
    let room = store.get(id);
    for (let n = 0; n < 200 && room.state.phase !== 'victory'; n++) {
      const token = room.state.turn.currentPlayer === 'white' ? host.credentials.token : guest.credentials.token;
      room = store.act(id, token, request(room.revision, [phaseEndAction(room.state)], `turn-step-${n}`));
    }
    expect(room.state.phase).toBe('victory');
    expect(room.state.victoryReason).toBe('inactivity');
    expect(() => store.act(id, host.credentials.token, request(room.revision, [{ type: 'END_ACTION_PHASE' }], 'after-game'))).toThrow('illegal');
  });
  it('fails closed on incompatible saved rules', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-')); directories.push(dir);
    const path = join(dir, 'rooms.sqlite');
    const { store, id } = setup(path);
    const db = new DatabaseSync(path);
    db.prepare("UPDATE rooms SET data = json_set(data, '$.rulesVersion', 'old') WHERE id = ?").run(id);
    db.close();
    expect(() => store.get(id)).toThrow('older rules');
  });
});
