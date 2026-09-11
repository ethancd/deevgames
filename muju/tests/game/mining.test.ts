import { INITIAL_MAP_RESOURCES } from '../../src/game/resourceMap';
import {describe,it,expect} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {UNIT_DEFINITIONS} from '../../src/game/units';
import {endOfTurnIncome,unitEndOfTurnTake,projectedIncome,getTotalBoardResources} from '../../src/game/mining';
import {applyAction} from '../../src/ai/simulate';
import {generateAllActions} from '../../src/ai/moves';
import {checkInvariants} from '../../lab/harness/invariants';

describe('passive income',()=>{
 it.each(UNIT_DEFINITIONS.map(d=>[d.id,d.mining] as const))('%s takes min(Mining, reserve), including zero', (id,mining)=>{
  const unit=createUnit(id,'white',{x:0,y:0});
  for(let reserve=0;reserve<=10;reserve++)expect(unitEndOfTurnTake(unit,{position:unit.position,resourceLayers:reserve})).toBe(Math.min(mining,reserve));
 });
 it('collects unconditionally from moved, attacked, bought, promoted and inactive pieces',()=>{
  const state=createInitialGameState();
  state.board.units=UNIT_DEFINITIONS.map((d,i)=>({...createUnit(d.id,'white',{x:i%10,y:Math.floor(i/10)}),hasMoved:true,hasAttacked:true,placedThisTurn:true,promotedThisPlacement:true,canActThisTurn:false}));
  const before=structuredClone(state),projection=projectedIncome(state,'white');
  const income=endOfTurnIncome(state,'white');
  expect(income.total).toBe(projection);expect(income.takes).toHaveLength(18);
  expect(income.state.players.white.resources).toBe(projection);
  expect(income.state.players.black).toEqual(state.players.black);
  expect(state).toEqual(before);checkInvariants(income.state,'all flags');
 });
 it('collects only for the mover at the final position and never consumes actions',()=>{
  const state=createInitialGameState(),u=state.board.units.find(u=>u.owner==='white'&&u.definitionId==='water_1')!;
  const moved=applyAction(state,{type:'MOVE',unitId:u.id,to:{x:2,y:1}});
  const income=endOfTurnIncome(moved,'white');
  expect(income.total).toBe(6);expect(income.state.turn.actionsRemaining).toBe(5);
  expect(income.state.board.cells[1][1].resourceLayers).toBe(10);
  expect(income.state.board.cells[1][2].resourceLayers).toBe(2);
  expect(income.state.players.black.resources).toBe(0);
  expect(getTotalBoardResources(income.state.board)+income.total).toBe(INITIAL_MAP_RESOURCES);
 });
 it('never permits or generates an active mine operation',()=>{
  const state=createInitialGameState();
  expect(generateAllActions(state,'white').every(a=>a.type==='MOVE'||a.type==='ATTACK'||a.type==='END_ACTION_PHASE')).toBe(true);
  expect(applyAction(state,{type:'MINE',unitId:state.board.units[0].id} as never)).toBe(state);
 });
 it('keeps income unchanged until the action phase ends',()=>{
  const state=createInitialGameState();
  const next=applyAction(state,{type:'END_ACTION_PHASE'});
  expect(state.players.white.resources).toBe(0);expect(next.players.white.resources).toBe(6);
  expect(next.lastIncome?.takes.map(t=>t.amount)).toEqual([1,2,3]);
  checkInvariants(next,'first income');
 });
});
