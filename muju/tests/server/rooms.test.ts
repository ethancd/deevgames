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
  it('persists a four-action room, rejects overspending and preserves its budget through undo and handoff', () => {
    const dir=mkdtempSync(join(tmpdir(),'muju-four-'));directories.push(dir);
    const path=join(dir,'rooms.sqlite'),store=new RoomStore(path);stores.push(store);
    const host=store.create({name:'Four',side:'white',actionsPerTurn:4});
    const guest=store.join(host.room.id,{name:'Guest',inviteCode:host.inviteCode});
    const id=host.room.id,hi=host.room.state.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
    expect(observe(guest.room).actionsPerTurn).toBe(4);
    const moves=Array.from({length:5},(_,i)=>({type:'MOVE' as const,unitId:hi.id,to:{x:i%2?1:2,y:0}}));
    expect(()=>store.act(id,host.credentials.token,request(1,moves))).toThrow('Action 5');
    expect(store.get(id).state.turn.actionsRemaining).toBe(4);
    const moved=store.act(id,host.credentials.token,request(1,moves.slice(0,4),'four-moves'));
    expect(moved.state.turn.actionsRemaining).toBe(0);
    const reopened=new RoomStore(path);stores.push(reopened);
    expect(reopened.get(id).state.actionsPerTurn).toBe(4);
    const undone=reopened.act(id,host.credentials.token,request(2,[{type:'UNDO'}],'undo-four'));
    expect(undone.state.turn.actionsRemaining).toBe(4);
    const next=store.act(id,host.credentials.token,request(3,[{type:'END_ACTION_PHASE'}],'handoff-four'));
    expect(next.state.turn).toMatchObject({currentPlayer:'black',actionsRemaining:4});
    expect(next.state.actionsPerTurn).toBe(4);
    expect(store.create({name:'Standard'}).room.state.actionsPerTurn).toBe(6);
    for(const actionsPerTurn of [0,5,7,'4',null]) expect(()=>store.create({name:'Invalid',actionsPerTurn})).toThrow();
  });
  it('continues version-two rooms with six actions without replacing their board', () => {
    const dir=mkdtempSync(join(tmpdir(),'muju-legacy-'));directories.push(dir);
    const path=join(dir,'rooms.sqlite'),{store,id,host}=setup(path);
    const before=store.get(id),db=new DatabaseSync(path);
    db.prepare("UPDATE rooms SET data = json_remove(json_set(data, '$.rulesVersion', 'muju-online-2'), '$.state.actionsPerTurn') WHERE id = ?").run(id);db.close();
    expect(store.get(id).state.board).toEqual(before.state.board);
    expect(store.act(id,host.credentials.token,request(1,[{type:'END_ACTION_PHASE'}])).state.turn.actionsRemaining).toBe(6);
  });
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

it('undo restores placement, promotion and phase changes, survives reconnects and cannot cross turns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'muju-undo-')); directories.push(dir);
  const path = join(dir, 'rooms.sqlite');
  const { store, host, guest, id } = setup(path);
  let room = store.get(id), serial = 0;
  const play = (actions: RoomAction[], token = host.credentials.token) => {
    room = store.act(id, token, request(room.revision, actions, `undo-step-${serial++}`));
    return room;
  };
  play([{ type: 'END_ACTION_PHASE' }]);
  play([{ type: 'END_ACTION_PHASE' }], guest.credentials.token);
  const fixture = new DatabaseSync(path);
  fixture.prepare("UPDATE rooms SET data = json_set(data, '$.state.players.white.resources', 20) WHERE id = ?").run(id);
  fixture.close();
  room = store.get(id);
  const before = room.state;
  const unit = before.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
  play([{ type: 'PROMOTE_UNIT', unitId: unit.id }]);
  expect(room.canUndo).toBe(true);
  const promoted = room.state;
  play([{ type: 'END_PLACE_PHASE' }]);
  expect(() => play([{ type: 'UNDO' }], guest.credentials.token)).toThrow('current player');
  const reconnect = new RoomStore(path); stores.push(reconnect);
  expect(reconnect.get(id).canUndo).toBe(true);
  const undo = request(room.revision, [{ type: 'UNDO' }], 'reconnect-undo');
  expect(reconnect.act(id, host.credentials.token, undo, true).state).toEqual(promoted);
  expect(reconnect.get(id)).toEqual(room);
  room = reconnect.act(id, host.credentials.token, undo);
  expect(room.state).toEqual(promoted);
  expect(reconnect.act(id, host.credentials.token, undo)).toEqual(room);
  play([{ type: 'UNDO' }]);
  expect(room.state).toEqual(before);
  expect(room.canUndo).toBe(false);
  play([{ type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }]);
  play([{ type: 'UNDO' }]);
  expect(room.state).toEqual(before);
  play([{ type: 'END_PLACE_PHASE' }]);
  play([{ type: 'END_ACTION_PHASE' }]);
  expect(room.canUndo).toBe(false);
  expect(() => play([{ type: 'UNDO' }], guest.credentials.token)).toThrow('undo history');
});

it('undo reverses atomic combat commands and preserves independent upkeep preferences', () => {
  const { store, host, guest, id } = setup();
  const before = store.get(id);
  const unit = before.state.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
  const moved = store.act(id, host.credentials.token, request(1, [
    { type: 'MOVE', unitId: unit.id, to: { x: 2, y: 0 } },
    { type: 'MOVE', unitId: unit.id, to: { x: 3, y: 0 } },
  ]));
  expect(moved.canUndo).toBe(true);
  store.act(id, guest.credentials.token, request(2, [{ type: 'SET_UPKEEP_REVIEW', enabled: true }], 'review-black'));
  expect(() => store.act(id, host.credentials.token, request(2, [{ type: 'UNDO' }], 'stale-undo'))).toThrow('revision 3');
  expect(() => store.act(id, host.credentials.token, request(3, [{ type: 'UNDO' }, { type: 'END_ACTION_PHASE' }], 'batch-undo'))).toThrow('alone');
  const restored = store.act(id, host.credentials.token, request(3, [{ type: 'UNDO' }], 'restore-moves'));
  expect(restored.state).toEqual({ ...before.state, reviewUpkeep: { ...before.state.reviewUpkeep, black: true } });
  expect(restored.canUndo).toBe(false);
  expect(restored.history.at(-1)?.actions).toEqual([{ type: 'UNDO' }]);
});

it('persists per-action replays across reconnects, removes undone batches, and ignores preview', () => {
  const dir=mkdtempSync(join(tmpdir(),'muju-replay-')); directories.push(dir);
  const path=join(dir,'rooms.sqlite'); const {store,host,guest,id}=setup(path);
  const before=store.get(id); const unit=before.state.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
  const batch:RoomAction[]=[{type:'MOVE',unitId:unit.id,to:{x:6,y:0}},{type:'MOVE',unitId:unit.id,to:{x:7,y:0}}];
  store.act(id,host.credentials.token,request(1,batch,'replay-batch'));
  store.act(id,host.credentials.token,request(2,[{type:'UNDO'}],'undo-replay'));
  store.act(id,host.credentials.token,request(3,[...batch,{type:'END_ACTION_PHASE'}],'preview-turn'),true);
  expect(store.get(id).lastTurnReplay).toBeNull();
  const ended=store.act(id,host.credentials.token,request(3,[...batch,{type:'END_ACTION_PHASE'}],'commit-turn'));
  expect(ended.lastTurnReplay?.frames.map(f=>f.action.type)).toEqual(['MOVE','MOVE','MOVE','MOVE']);
  expect(ended.lastTurnReplay?.initialBoard).toEqual(before.state.board);
  expect(ended.lastTurnReplay?.frames.map(f=>f.board.units.find(u=>u.id===unit.id)?.position)).toEqual([
    {x:3,y:0},{x:5,y:0},{x:6,y:0},{x:7,y:0},
  ]);
  const reopened=new RoomStore(path);stores.push(reopened);
  expect(reopened.get(id).lastTurnReplay).toEqual(ended.lastTurnReplay);
  const next=reopened.act(id,guest.credentials.token,request(4,[{type:'END_ACTION_PHASE'}],'black-pass'));
  expect(next.lastTurnReplay).toMatchObject({player:'black',frames:[]});
});
