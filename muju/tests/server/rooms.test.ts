// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PHASING_RULES_VERSION, RETIRED_STANDARD_VERSION, RoomStore } from '../../server/rooms';
import { legalActions, observe } from '../../server/observation';
import { INACTIVITY_LIMIT } from '../../src/game/inactivity';
import { phaseEndAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import { createUnit } from '../../src/game/board';
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

it('previews, commits, notifies and persists immediate checkmate without playing queued commands', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'muju-checkmate-')); directories.push(dir);
  const path = join(dir, 'rooms.sqlite');
  const { store, host, guest, id } = setup(path);
  const invader = createUnit('fire_1', 'white', { x: 9, y: 8 });
  const db = new DatabaseSync(path);
  const saved = JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id)!.data as string);
  saved.state.board.units = [invader, createUnit('fire_1', 'black', { x: 4, y: 4 })];
  db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(saved), id); db.close();
  const move: RoomAction = { type: 'MOVE', unitId: invader.id, to: { x: 9, y: 9 } };
  // The occupation resolves at the turn transition, so the mining that pays for
  // the move happens first and END_PLACE_PHASE is the command left unplayed.
  const played: RoomAction[] = [move, { type: 'END_ACTION_PHASE' }];
  const command = request(1, [...played, { type: 'END_PLACE_PHASE' }], 'mate-and-queued-end');
  const before = store.get(id), preview = store.act(id, host.credentials.token, command, true);
  expect(preview.state).toMatchObject({ phase: 'victory', winner: 'white', victoryReason: 'home-checkmate' });
  expect(store.get(id)).toEqual(before);
  const waiting = store.wait(id, 1, 2000);
  const won = store.act(id, host.credentials.token, command);
  expect(won.state).toEqual(preview.state);
  expect(won.state.turn.currentPlayer).toBe('white');
  expect(won.state.lastIncome).toMatchObject({ player: 'white', turnNumber: 1 });
  expect(won.canUndo).toBe(false);
  expect(won.history.at(-1)?.actions).toEqual(played);
  expect(won.lastTurnReplay?.frames.map(frame => frame.action)).toEqual(played);
  expect(legalActions(won).total).toBe(0);
  expect(await waiting).toMatchObject({ changed: true, phase: 'victory', room: { state: { victoryReason: 'home-checkmate' } } });
  expect(store.act(id, host.credentials.token, command)).toEqual(won);
  expect(() => store.act(id, guest.credentials.token, request(2, [{ type: 'END_ACTION_PHASE' }], 'mate-no-reply'))).toThrow('illegal');
  const reconnect = new RoomStore(path); stores.push(reconnect);
  expect(reconnect.restore(id, guest.credentials.token, 'black')).toEqual({ ...won, authenticatedPlayer: 'black' });
});

describe('authoritative shared rooms', () => {
  it('draws after twenty ordinary income-earning turns without kills', () => {
    expect(INACTIVITY_LIMIT).toBe(20);
    const {store,id,host,guest}=setup();let room=store.get(id);
    // A quiet Phasing turn is Act, then END_ACTION_PHASE to mine and pay upkeep,
    // then END_PLACE_PHASE to hand over — and only the handoff advances the clock.
    for(let ply=1;ply<=INACTIVITY_LIMIT;ply++) {
      const token=room.state.turn.currentPlayer==='white'?host.credentials.token:guest.credentials.token;
      room=store.act(id,token,request(room.revision,[{type:'END_ACTION_PHASE'}],`mine-${ply}-clock`));
      expect(room.state.inactivityPlies).toBe(ply-1);
      room=store.act(id,token,request(room.revision,[{type:'END_PLACE_PHASE'}],`end-${ply}-clock`));
      expect(room.state.inactivityPlies).toBe(ply);
      expect(room.state.phase).toBe(ply===INACTIVITY_LIMIT?'victory':'playing');
    }
    expect(room.state.victoryReason).toBe('inactivity');
    expect(room.state.players.white.resourcesGained).toBeGreaterThan(0);
    expect(room.state.players.black.resourcesGained).toBeGreaterThan(0);
  });
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
    const mined=store.act(id,host.credentials.token,request(3,[{type:'END_ACTION_PHASE'}],'mine-four'));
    expect(mined.state.turn).toMatchObject({currentPlayer:'white',phase:'place'});
    const next=store.act(id,host.credentials.token,request(mined.revision,[{type:'END_PLACE_PHASE'}],'handoff-four'));
    expect(next.state.turn).toMatchObject({currentPlayer:'black',actionsRemaining:4});
    expect(next.state.actionsPerTurn).toBe(4);
    expect(store.create({name:'Default'}).room.state.actionsPerTurn).toBe(4);
    for(const actionsPerTurn of [0,5,6,7,'4',null]) expect(()=>store.create({name:'Invalid',actionsPerTurn})).toThrow();
  });
  // In-place migration of `muju-online-2`/`-3` rooms is gone with Standard: it
  // would have rewritten a Standard game as a room stamped with the played
  // revision. `tests/server/standard-retirement.test.ts` pins the refusal.
  it('stamps the one played rules revision on every new room', () => {
    const dir=mkdtempSync(join(tmpdir(),'muju-revision-'));directories.push(dir);
    const path=join(dir,'rooms.sqlite'),store=new RoomStore(path);stores.push(store);
    const omitted=store.create({name:'Omitted',side:'white'});
    const explicit=store.create({name:'Explicit',side:'white',ruleset:'phasing'});
    const db=new DatabaseSync(path);
    const version=(id:string)=>db.prepare("SELECT json_extract(data, '$.rulesVersion') AS v FROM rooms WHERE id = ?").get(id)!.v;
    expect(version(omitted.room.id)).toBe(PHASING_RULES_VERSION);
    expect(version(explicit.room.id)).toBe(PHASING_RULES_VERSION);
    expect(omitted.room.state.ruleset).toBe('phasing');
    // `muju-online-5` belongs to the unmerged codex/phasing-only-canonical branch.
    expect(PHASING_RULES_VERSION).toBe('muju-phasing-2');
    // Named, never written: no room has carried it since 2026-09-21.
    expect(RETIRED_STANDARD_VERSION).toBe('muju-online-6');
    expect(db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE json_extract(data, '$.rulesVersion') = ?").get(RETIRED_STANDARD_VERSION)!.n).toBe(0);
    db.close();
  });
  // A stored room was agreed under the ten-ply clock. It is never replayed under the
  // twenty-ply one: the row survives untouched and every call takes the existing
  // changed-rules path, exactly as an unmigratable version always has.
  it.each(['muju-online-4','muju-phasing-1'])('refuses to play %s rooms under the new clock without losing them', version => {
    const dir=mkdtempSync(join(tmpdir(),'muju-retired-'));directories.push(dir);
    const path=join(dir,'rooms.sqlite'),store=new RoomStore(path);stores.push(store);
    const host=store.create({name:'Human',side:'white'});
    const guest=store.join(host.room.id,{name:'Agent',inviteCode:host.inviteCode});
    const id=host.room.id,before=store.get(id);
    const db=new DatabaseSync(path);
    db.prepare("UPDATE rooms SET data = json_set(data, '$.rulesVersion', ?, '$.state.inactivityPlies', 8) WHERE id = ?").run(version,id);
    db.close();
    const reopened=new RoomStore(path);stores.push(reopened);
    for(const call of [
      ()=>reopened.get(id),
      ()=>reopened.get(id,host.credentials.token),
      ()=>reopened.act(id,host.credentials.token,request(before.revision,[{type:'END_ACTION_PHASE'}],'retired-play')),
      ()=>reopened.act(id,host.credentials.token,request(before.revision,[{type:'END_ACTION_PHASE'}],'retired-preview'),true),
      ()=>reopened.moveHistory(id),
      ()=>reopened.restore(id,guest.credentials.token,'black'),
    ]) {
      let code:string|undefined;
      try { call(); } catch (error) { code=(error as {code?:string}).code; }
      expect(code).toBe('RULES_CHANGED');
    }
    // Nothing was rewritten, migrated or deleted, and the lobby stops offering it.
    const after=new DatabaseSync(path);
    const row=after.prepare('SELECT data FROM rooms WHERE id = ?').get(id);
    const stored=JSON.parse(row!.data as string) as {rulesVersion:string;state:{inactivityPlies:number;board:unknown}};
    after.close();
    expect(stored.rulesVersion).toBe(version);
    expect(stored.state.inactivityPlies).toBe(8);
    expect(stored.state.board).toEqual(before.state.board);
    expect(reopened.listActive().map(r=>r.id)).not.toContain(id);
  });
  it('keeps reusable invitations private and never exposes private credentials in snapshots', () => {
    const { store, host, guest, id } = setup();
    expect(guest.credentials.player).toBe('black');
    const serialized = JSON.stringify(store.get(id));
    expect(serialized).not.toContain(host.credentials.token);
    expect(serialized).not.toContain(guest.credentials.token);
    expect(serialized).not.toContain(host.inviteCode);
    expect(serialized).not.toContain('tokenHash');
    const takeover = store.join(id, { name: 'New browser', inviteCode: host.inviteCode });
    expect(takeover.credentials.player).toBe('black');
    expect(() => store.get(id, guest.credentials.token)).toThrow('credential is invalid');
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
    // Mining and upkeep belong to the mover, so the seat does not change here.
    expect(preview.state.turn).toMatchObject({ currentPlayer: 'white', phase: 'place' });
    expect(store.get(id).revision).toBe(1);
    const committed = store.act(id, host.credentials.token, input);
    expect(store.act(id, host.credentials.token, input)).toEqual(committed);
    expect(() => store.act(id, host.credentials.token, { ...input, actions: [{ type: 'RESIGN' }] })).toThrow('new requestId');
  });
  it('persists credentials, receipts and state across a restart and concurrent store handles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'muju-')); directories.push(dir);
    const path = join(dir, 'rooms.sqlite');
    const { store, host, guest, id } = setup(path);
    const input = request(1, [{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }]);
    const result = store.act(id, host.credentials.token, input);
    expect(result.state.turn.currentPlayer).toBe('black');
    store.close(); stores.splice(stores.indexOf(store), 1);
    const reopened = new RoomStore(path); stores.push(reopened);
    const second = new RoomStore(path); stores.push(second);
    expect(reopened.get(id, guest.credentials.token)).toEqual({ ...result, authenticatedPlayer: 'black' });
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
    // Upkeep is the mover's own business now: END_ACTION_PHASE mines and then
    // charges, and a seat reviewing its keep-set stops there rather than paying.
    store.act(id, host.credentials.token, request(1, [{ type: 'SET_UPKEEP_REVIEW', enabled: true }]));
    const result = store.act(id, host.credentials.token, request(2, [{ type: 'END_ACTION_PHASE' }], 'white-mine'));
    expect(result.state.upkeepPending).toBe(true);
    expect(() => store.act(id, guest.credentials.token, request(3, [{ type: 'PAY_UPKEEP', keepUnitIds: [] }], 'bad-upkeep'))).toThrow('illegal');
    const paid = store.act(id, host.credentials.token, request(3, [phaseEndAction(result.state)], 'paid-upkeep'));
    expect(paid.state.upkeepPending).toBe(false);
    const handed = store.act(id, host.credentials.token, request(paid.revision, [{ type: 'END_PLACE_PHASE' }], 'white-end'));
    expect(handed.state.turn.currentPlayer).toBe('black');
    const victory = store.act(id, guest.credentials.token, request(handed.revision, [{ type: 'RESIGN' }], 'resignation'));
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
  // A Phasing turn is Act, then END_ACTION_PHASE (mine and pay upkeep, which is
  // the mover's own ordinary step), then Prepare, then END_PLACE_PHASE to hand
  // over. Undo reaches everything up to the handoff and never past it.
  play([{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }]);
  play([{ type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }], guest.credentials.token);
  const fixture = new DatabaseSync(path);
  fixture.prepare("UPDATE rooms SET data = json_set(data, '$.state.players.white.resources', 20) WHERE id = ?").run(id);
  fixture.close();
  room = store.get(id);
  const before = room.state;
  expect(before.turn).toMatchObject({ currentPlayer: 'white', phase: 'action', turnNumber: 2 });
  play([{ type: 'END_ACTION_PHASE' }]);
  const mined = room.state;
  expect(mined.turn.phase).toBe('place');
  const unit = mined.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
  play([{ type: 'PROMOTE_UNIT', unitId: unit.id }]);
  expect(room.canUndo).toBe(true);
  const promoted = room.state;
  expect(() => play([{ type: 'UNDO' }], guest.credentials.token)).toThrow('current player');
  const reconnect = new RoomStore(path); stores.push(reconnect);
  expect(reconnect.get(id).canUndo).toBe(true);
  expect(reconnect.get(id).state).toEqual(promoted);
  const undo = request(room.revision, [{ type: 'UNDO' }], 'reconnect-undo');
  expect(reconnect.act(id, host.credentials.token, undo, true).state).toEqual(mined);
  expect(reconnect.get(id, host.credentials.token)).toEqual(room);
  room = reconnect.act(id, host.credentials.token, undo);
  expect(room.state).toEqual(mined);
  expect(reconnect.act(id, host.credentials.token, undo)).toEqual(room);
  // One more step reverses the mine-and-upkeep transition itself.
  play([{ type: 'UNDO' }]);
  expect(room.state).toEqual(before);
  expect(room.canUndo).toBe(false);
  play([{ type: 'END_ACTION_PHASE' }]);
  play([{ type: 'BUY_UNIT', definitionId: 'fire_1', position: { x: 0, y: 0 } }]);
  play([{ type: 'UNDO' }]);
  expect(room.state).toEqual(mined);
  play([{ type: 'END_PLACE_PHASE' }]);
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
  const turn:RoomAction[]=[...batch,{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}];
  store.act(id,host.credentials.token,request(3,turn,'preview-turn'),true);
  expect(store.get(id).lastTurnReplay).toBeNull();
  const ended=store.act(id,host.credentials.token,request(3,turn,'commit-turn'));
  // The mining that closes the action phase is a frame of the turn it paid for.
  expect(ended.lastTurnReplay?.frames.map(f=>f.action.type)).toEqual(['MOVE','MOVE','MOVE','MOVE','END_ACTION_PHASE']);
  expect(ended.lastTurnReplay?.initialBoard).toEqual(before.state.board);
  expect(ended.lastTurnReplay?.frames.map(f=>f.board.units.find(u=>u.id===unit.id)?.position)).toEqual([
    {x:3,y:0},{x:5,y:0},{x:6,y:0},{x:7,y:0},{x:7,y:0},
  ]);
  const reopened=new RoomStore(path);stores.push(reopened);
  expect(reopened.get(id).lastTurnReplay).toEqual(ended.lastTurnReplay);
  const next=reopened.act(id,guest.credentials.token,request(4,[{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}],'black-pass'));
  expect(next.lastTurnReplay).toMatchObject({player:'black',frames:[{action:{type:'END_ACTION_PHASE'}}]});
});

it('records the mover’s own mine-and-upkeep as an undo step, without undoing the opponent’s batch', () => {
  const dir=mkdtempSync(join(tmpdir(),'muju-upkeep-'));directories.push(dir);
  const path=join(dir,'rooms.sqlite');const {store,host,guest,id}=setup(path);
  let room=store.get(id),serial=0;
  const play=(actions:RoomAction[],token=host.credentials.token)=>{
    room=store.act(id,token,request(room.revision,actions,`upkeep-step-${serial++}`));return room;
  };
  // Standard charged the INCOMING seat at its turn start, so upkeep was that
  // seat's first undo step. Phasing charges the mover at END_ACTION_PHASE, so the
  // same guarantee has to hold one step earlier: the transition is the mover's
  // own ordinary undo step, and reversing it must not disturb the turn the
  // opponent already completed.
  play([{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}]);
  play([{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}],guest.credentials.token);
  const whiteId=room.state.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!.id;
  play([{type:'END_ACTION_PHASE'},{type:'PROMOTE_UNIT',unitId:whiteId},{type:'END_PLACE_PHASE'}]);
  const blackId=room.state.board.units.find(u=>u.owner==='black'&&u.definitionId==='fire_1')!.id;
  play([{type:'MOVE',unitId:blackId,to:{x:5,y:9}},{type:'END_ACTION_PHASE'},{type:'END_PLACE_PHASE'}],guest.credentials.token);
  const beforeUpkeep=room.state;
  expect(beforeUpkeep.turn).toMatchObject({currentPlayer:'white',phase:'action'});

  play([{type:'END_ACTION_PHASE'}]);
  const paid=room.state;
  expect(paid.lastUpkeep).toEqual({player:'white',paid:1,released:[],turnNumber:3});
  expect(paid.upkeepPending).toBe(false);expect(room.canUndo).toBe(true);
  expect(legalActions(room,{type:'UNDO'}).total).toBe(1);
  expect(()=>store.act(id,guest.credentials.token,request(room.revision,[{type:'UNDO'}],'wrong-seat-upkeep'))).toThrow('current player');

  const reopened=new RoomStore(path);stores.push(reopened);
  expect(reopened.get(id).canUndo).toBe(true);
  const undoRequest=request(room.revision,[{type:'UNDO'}],'refund-upkeep');
  const preview=reopened.act(id,host.credentials.token,undoRequest,true);
  expect(preview.state).toEqual(beforeUpkeep);
  expect(store.get(id).state).toEqual(paid);
  room=reopened.act(id,host.credentials.token,undoRequest);
  expect(reopened.act(id,host.credentials.token,undoRequest)).toEqual(room);
  expect(room.state).toEqual(beforeUpkeep);
  // Black's finished turn is exactly where Black left it.
  expect(room.state.board.units.find(u=>u.id===blackId)?.position).toEqual({x:5,y:9});
  expect(room.state.players.black).toEqual(beforeUpkeep.players.black);
  expect(room.canUndo).toBe(false);

  // Reviewing the keep-set stops the same transition before it charges.
  play([{type:'SET_UPKEEP_REVIEW',enabled:true}]);
  play([{type:'END_ACTION_PHASE'}]);
  const pending=room.state;
  expect(pending.upkeepPending).toBe(true);
  expect(()=>play([{type:'END_PLACE_PHASE'}])).toThrow('illegal');
  const kept=pending.board.units.filter(u=>u.owner==='white'&&u.id!==whiteId).map(u=>u.id);
  play([{type:'PAY_UPKEEP',keepUnitIds:kept}]);
  expect(room.state.board.units.some(u=>u.id===whiteId)).toBe(false);
  expect(room.state.players.white.resources).toBe(pending.players.white.resources);
  play([{type:'UNDO'}]);expect(room.state).toEqual(pending);
  play([{type:'PAY_UPKEEP',keepUnitIds:pending.board.units.filter(u=>u.owner==='white').map(u=>u.id)}]);
  expect(room.state.players.white).toEqual(paid.players.white);
  play([{type:'END_PLACE_PHASE'}]);
  expect(room.canUndo).toBe(false);
  expect(room.lastTurnReplay?.frames.map(f=>f.action.type)).toEqual(['END_ACTION_PHASE','PAY_UPKEEP']);
});
