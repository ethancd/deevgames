import {describe,it,expect,beforeEach} from 'vitest';
import {createInitialGameState} from '../../src/game/board';
import {UNEQUAL_ROUTES_MAP,INITIAL_MAP_RESOURCES} from '../../src/game/resourceMap';
import {MAPS} from '../../lab/maps/maps';
import {applyAction} from '../../src/ai/simulate';
import {checkInvariants} from '../../lab/harness/invariants';
import {saveGameState,loadGameState} from '../../src/utils/persistence';

describe('Unequal routes production map',()=>{
 beforeEach(()=>localStorage.clear());
 it('ships exactly reviewed map D, with 340 fresh layers and rotational starts',()=>{
  expect(UNEQUAL_ROUTES_MAP).toEqual(MAPS.find(m=>m.id==='D')!.cells);
  expect(INITIAL_MAP_RESOURCES).toBe(340);
  const s=createInitialGameState();expect(s.board.cells.flat().map(c=>c.resourceLayers)).toEqual(UNEQUAL_ROUTES_MAP);
  expect(s.board.cells.flat().every(c=>c.minedDepth===0)).toBe(true);checkInvariants(s,'fresh D');
 });
 it('mines a shallow fresh well from depth one and conserves its original capacity',()=>{
  let s=createInitialGameState();const u=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='plant_1')!;
  u.position={x:3,y:0};s=applyAction(s,{type:'MINE',unitId:u.id});
  expect(s.players.white.resources).toBe(2);expect(s.board.cells[0][3].minedDepth).toBe(2);expect(s.board.cells[0][3].resourceLayers).toBe(0);checkInvariants(s,'mined shallow');
 });
 it('preserves legacy saves and starts the new board only for new games',()=>{
  const old=createInitialGameState(Array(100).fill(5));delete old.board.initialResourceLayers;
  const u=old.board.units[0];const mined=applyAction(old,{type:'MINE',unitId:u.id});saveGameState(mined);
  expect(loadGameState()).toEqual(mined);checkInvariants(loadGameState()!,'legacy save');
  expect(createInitialGameState().board.cells.flat().reduce((s,c)=>s+c.resourceLayers,0)).toBe(340);
 });
 it('round-trips a new map save and detects resource corruption',()=>{
  const s=createInitialGameState();saveGameState(s);expect(loadGameState()).toEqual(s);checkInvariants(loadGameState()!,'D save');
  s.board.cells[0][3].resourceLayers++;expect(()=>checkInvariants(s,'corrupt')).toThrow();
 });
});
