import {describe,it,expect,beforeEach} from 'vitest';
import {createInitialGameState} from '../../src/game/board';
import {UNEQUAL_ROUTES_MAP,INITIAL_MAP_RESOURCES} from '../../src/game/resourceMap';
import {MAPS} from '../../lab/maps/maps';
import {isValidMove} from '../../src/game/movement';
import {isValidSpawnPosition} from '../../src/game/spawning';
import {canMine,executeMine} from '../../src/game/mining';
import {applyAction} from '../../src/ai/simulate';
import {checkInvariants} from '../../lab/harness/invariants';
import {saveGameState,loadGameState} from '../../src/utils/persistence';

describe('Unequal routes production map',()=>{
 beforeEach(()=>localStorage.clear());
 it('changes only the 16 two-crystal cells of reviewed map D to blank, with 308 fresh layers',()=>{
  expect(UNEQUAL_ROUTES_MAP).toEqual(MAPS.find(m=>m.id==='D')!.cells.map(n=>n===2?0:n));
  expect(UNEQUAL_ROUTES_MAP.filter(n=>n===0)).toHaveLength(16);
  expect([...UNEQUAL_ROUTES_MAP].reverse()).toEqual(UNEQUAL_ROUTES_MAP);
  expect(INITIAL_MAP_RESOURCES).toBe(308);
  const s=createInitialGameState();expect(s.board.cells.flat().map(c=>c.resourceLayers)).toEqual(UNEQUAL_ROUTES_MAP);
  expect(s.board.cells.flat().every(c=>c.minedDepth===0)).toBe(true);checkInvariants(s,'fresh D');
 });
 it('keeps blank approaches walkable and spawn-eligible, with no mining yield',()=>{
  let s=createInitialGameState();const u=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='plant_1')!;
  u.position={x:2,y:0};expect(isValidMove(u,{x:3,y:0},s.board)).toBe(true);
  s=applyAction(s,{type:'MOVE',unitId:u.id,to:{x:3,y:0}});
  const moved=s.board.units.find(p=>p.id===u.id)!;expect(moved.position).toEqual({x:3,y:0});
  expect(canMine(moved,s.board)).toBe(false);
  expect(executeMine(s.board,u.id,0)).toEqual({board:s.board,newResources:0,amountMined:0});
  expect(s.board.cells[0][3].minedDepth).toBe(0);checkInvariants(s,'blank approach');
  moved.position={x:4,y:0};expect(isValidSpawnPosition({x:3,y:0},'white',s.board)).toBe(true);
 });
 it('mines remaining three-crystal seams from depth one and preserves two-crystal remainders',()=>{
  let s=createInitialGameState();const u=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
  u.position={x:2,y:0};s=applyAction(s,{type:'MINE',unitId:u.id});
  expect(s.players.white.resources).toBe(1);expect(s.board.cells[0][2].minedDepth).toBe(1);expect(s.board.cells[0][2].resourceLayers).toBe(2);checkInvariants(s,'mined seam');
  saveGameState(s);expect(loadGameState()).toEqual(s);
 });
 it('preserves legacy saves and starts the new board only for new games',()=>{
  const old=createInitialGameState(Array(100).fill(5));delete old.board.initialResourceLayers;
  const u=old.board.units[0];const mined=applyAction(old,{type:'MINE',unitId:u.id});saveGameState(mined);
  expect(loadGameState()).toEqual(mined);checkInvariants(loadGameState()!,'legacy save');
  expect(createInitialGameState().board.cells.flat().reduce((s,c)=>s+c.resourceLayers,0)).toBe(308);
 });
 it('round-trips a new map save and detects resource corruption',()=>{
  const s=createInitialGameState();saveGameState(s);expect(loadGameState()).toEqual(s);checkInvariants(loadGameState()!,'D save');
  s.board.cells[0][3].resourceLayers++;expect(()=>checkInvariants(s,'corrupt')).toThrow();
 });
});
