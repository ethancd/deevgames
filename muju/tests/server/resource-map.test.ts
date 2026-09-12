// @vitest-environment node
import {expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {RoomStore} from '../../server/rooms';
import {createInitialGameState} from '../../src/game/board';
import {endTurn} from '../../src/game/turn';
import {PRE_CENTRAL_MAP} from '../fixtures/pre-central-map';
import {UNEQUAL_ROUTES_MAP} from '../../src/game/resourceMap';

it('retains an in-progress old-map room across restart and uses the new map only for new rooms',()=>{
 const dir=mkdtempSync(join(tmpdir(),'muju-map-compat-')),path=join(dir,'rooms.sqlite');
 let store=new RoomStore(path);
 try{
  const host=store.create({name:'Existing player',side:'white'});
  const guest=store.join(host.room.id,{name:'Other player',inviteCode:host.inviteCode});
  const db=new DatabaseSync(path);
  const saved=JSON.parse(db.prepare('SELECT data FROM rooms WHERE id = ?').get(host.room.id)!.data as string);
  saved.state=endTurn(createInitialGameState(PRE_CENTRAL_MAP));
  db.prepare('UPDATE rooms SET data = ? WHERE id = ?').run(JSON.stringify(saved),host.room.id);
  db.close();store.close();store=new RoomStore(path);
  const resumed=store.get(host.room.id,guest.credentials.token);
  expect(resumed.revision).toBe(saved.revision);
  expect(resumed.state).toEqual(saved.state);
  expect(resumed.state.board.initialResourceLayers).toEqual(PRE_CENTRAL_MAP);
  const next=store.act(host.room.id,guest.credentials.token,{expectedRevision:resumed.revision,requestId:'old-map-black-turn',actions:[{type:'END_ACTION_PHASE'}]});
  expect(next.state.board).toEqual(endTurn(saved.state).board);
  expect(next.state.board.initialResourceLayers).toEqual(PRE_CENTRAL_MAP);
  const fresh=store.create({name:'New player'});
  expect(fresh.room.state.board.initialResourceLayers).toEqual(UNEQUAL_ROUTES_MAP);
  expect(fresh.room.state.board.cells.flat().reduce((n,c)=>n+c.resourceLayers,0)).toBe(480);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
