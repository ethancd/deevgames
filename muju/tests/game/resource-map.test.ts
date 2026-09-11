import {describe,it,expect} from 'vitest';
import {createInitialGameState} from '../../src/game/board';
import {UNEQUAL_ROUTES_MAP,INITIAL_MAP_RESOURCES} from '../../src/game/resourceMap';
import {MAPS} from '../../lab/maps/maps';
import {saveGameState,loadGameState,SCHEMA_VERSION} from '../../src/utils/persistence';
import {checkInvariants} from '../../lab/harness/invariants';
import {endTurn} from '../../src/game/turn';
describe('Unequal routes passive reserves',()=>{
 it('changes only the four shelves and F3/E8, preserving rotation with 496 total',()=>{
  const expected=MAPS.find(m=>m.id==='D')!.cells.map(n=>({2:0,3:4,4:8,5:10}[n]!));
  for(const index of [32,42,57,67])expected[index]=4;
  for(const index of [25,74])expected[index]=0;
  expect(UNEQUAL_ROUTES_MAP).toEqual(expected);
  expect([...UNEQUAL_ROUTES_MAP].reverse()).toEqual(UNEQUAL_ROUTES_MAP);expect(INITIAL_MAP_RESOURCES).toBe(496);
  expect([0,4,8,10].map(n=>UNEQUAL_ROUTES_MAP.filter(x=>x===n).length)).toEqual([18,50,12,20]);
  checkInvariants(createInitialGameState(),'initial');
 });
 it('round-trips reserves, public banks, turn flags and the income recap',()=>{
  const s=endTurn(createInitialGameState());saveGameState(s);expect(loadGameState()).toEqual(s);checkInvariants(s,'roundtrip');
 });
 it('rejects every earlier schema rather than trying to migrate an unfinished game',()=>{
  for(let schemaVersion=1;schemaVersion<SCHEMA_VERSION;schemaVersion++){
   localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion,state:createInitialGameState()}));
   expect(loadGameState()).toBeNull();expect(localStorage.getItem('elemental-tactics-save')).toBeNull();
  }
 });
 it('detects conservation and negative reserve/bank corruption',()=>{
  for(const corrupt of [(s:ReturnType<typeof createInitialGameState>)=>s.board.cells[0][0].resourceLayers--,s=>s.players.white.resources=-1]){
   const s=createInitialGameState();corrupt(s);expect(()=>checkInvariants(s,'corrupt')).toThrow();
  }
 });
});
