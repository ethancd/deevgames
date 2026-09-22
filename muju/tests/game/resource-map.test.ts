import {describe,it,expect} from 'vitest';
import {createInitialGameState} from '../../src/game/board';
import {UNEQUAL_ROUTES_MAP,INITIAL_MAP_RESOURCES} from '../../src/game/resourceMap';
import {PRE_CENTRAL_MAP} from '../fixtures/pre-central-map';
import {PRE_EXPANSION_MAP} from '../fixtures/pre-expansion-map';
import {saveGameState,loadGameState} from '../../src/utils/persistence';
import {checkInvariants} from '../../lab/harness/invariants';
import {endTurn} from '../../src/game/turn';
describe('Unequal routes passive reserves',()=>{
 it('starts new games on the expansion-economy map with 504 total',()=>{
  const expected=Array<number>(100).fill(4);
  const paint=(squares:string[],reserve:number)=>squares.forEach(square=>{expected['ABCDEFGHIJ'.indexOf(square[0])+(Number(square.slice(1))-1)*10]=reserve;});
  paint(['D1','E1','F1','D2','E2','F2','D3','E3','F3','E8','F8','G8','E9','F9','G9','E10','F10','G10'],0);
  paint(['A1','B1','C1','A2','B2','A3','J8','I9','J9','H10','I10','J10'],8);
  paint(['H2','I2','H3','I3','B8','C8','B9','C9'],16);
  paint(['F4','D5','E5','F5','E6','F6','G6','E7'],8);
  expect(UNEQUAL_ROUTES_MAP).toEqual(expected);
  expect([...UNEQUAL_ROUTES_MAP].reverse()).toEqual(UNEQUAL_ROUTES_MAP);expect(INITIAL_MAP_RESOURCES).toBe(504);
  expect([0,4,8,16].map(n=>UNEQUAL_ROUTES_MAP.filter(x=>x===n).length)).toEqual([18,54,20,8]);
  expect(createInitialGameState().board.cells.flat().map(cell=>cell.resourceLayers)).toEqual(expected);
  checkInvariants(createInitialGameState(),'initial');
 });
 it.each([
  [5, PRE_CENTRAL_MAP], [6, PRE_CENTRAL_MAP], [6, PRE_EXPANSION_MAP],
] as const)('keeps the old map and depletion when resuming a schema-%s save', (schemaVersion, oldMap)=>{
  const old=endTurn(createInitialGameState(oldMap));
  localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion,state:old}));
  const resumed=loadGameState()!;
  expect(resumed.board).toEqual(old.board);
  expect(resumed.players).toEqual(old.players);
  expect(resumed.board.initialResourceLayers).toEqual(oldMap);
  expect(resumed.board.initialResourceLayers).not.toEqual(UNEQUAL_ROUTES_MAP);
  checkInvariants(resumed,'old-map resume');
  const next=endTurn(resumed);
  expect(next.board.initialResourceLayers).toEqual(oldMap);
  checkInvariants(next,'old-map next turn');
  expect(createInitialGameState().board.initialResourceLayers).toEqual(UNEQUAL_ROUTES_MAP);
 });
 it('round-trips reserves, public banks, turn flags and the income recap',()=>{
  const s=endTurn(createInitialGameState());saveGameState(s);expect(loadGameState()).toEqual(s);checkInvariants(s,'roundtrip');
 });
 it('rejects pre-passive-mining schemas without replacing their obsolete rules',()=>{
  for(let schemaVersion=1;schemaVersion<5;schemaVersion++){
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
