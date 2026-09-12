import {describe,it,expect} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {UNIT_DEFINITIONS} from '../../src/game/units';
import {applyAction} from '../../src/ai/simulate';
import {isLegalAction} from '../../src/game/legality';
import {getAllSpawnPositions} from '../../src/game/spawning';
import {endTurn} from '../../src/game/turn';
function position(){const s=createInitialGameState();s.turn.phase='place';s.players.white.resources=40;s.players.white.resourcesGained=40;return s;}
describe('public purchases and promotion climb',()=>{
 it.each(['white','black'] as const)('%s can fund two cheap pieces, but not three, on turn two',player=>{
  let s=createInitialGameState();
  if(player==='black')s=applyAction(s,{type:'END_ACTION_PHASE'});
  const anchor=s.board.units.find(u=>u.owner===player&&u.definitionId==='water_1')!;
  const target=player==='white'?{x:3,y:3}:{x:6,y:6};
  s=applyAction(s,{type:'MOVE',unitId:anchor.id,to:target});
  s=applyAction(s,{type:'END_ACTION_PHASE'});
  if(s.turn.phase==='place')s=applyAction(s,{type:'END_PLACE_PHASE'});
  s=applyAction(s,{type:'END_ACTION_PHASE'});
  expect(s.turn.currentPlayer).toBe(player);expect(s.turn.turnNumber).toBe(2);
  expect(s.players[player].resources).toBe(6);
  for(const definitionId of ['fire_1','lightning_1']){
   const position=getAllSpawnPositions(player,s.board)[0];
   const action={type:'BUY_UNIT' as const,definitionId,position};
   expect(isLegalAction(s,action)).toBe(true);s=applyAction(s,action);
  }
  expect(s.players[player].resources).toBe(0);
  expect(s.board.units.filter(u=>u.owner===player)).toHaveLength(5);
  expect(s.turn.actionsRemaining).toBe(4);
  const third={type:'BUY_UNIT' as const,definitionId:'fire_1',position:getAllSpawnPositions(player,s.board)[0]};
  // Check the budget boundary even if the engine automatically ends Place.
  const place={...s,turn:{...s.turn,phase:'place' as const}};
  expect(isLegalAction(place,third)).toBe(false);expect(applyAction(place,third)).toBe(place);
 });
 it('seven crystals buy one Hi promotion and one new Hi',()=>{
  let s=position();s.players.white.resources=s.players.white.resourcesGained=7;
  const hi=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
  s=applyAction(s,{type:'PROMOTE_UNIT',unitId:hi.id});
  expect(s.players.white.resources).toBe(3);
  expect(s.board.units.find(u=>u.id===hi.id)?.definitionId).toBe('fire_2');
  s=applyAction(s,{type:'BUY_UNIT',definitionId:'fire_1',position:{x:0,y:0}});
  expect(s.players.white.resources).toBe(0);expect(s.turn.actionsRemaining).toBe(4);
  expect(s.board.units.filter(u=>u.owner==='white')).toHaveLength(4);
 });
 it.each(UNIT_DEFINITIONS.map(d=>[d.id,d.tier,d.cost] as const))('buys %s only if tier 1 and charges its exact cost',(definitionId,tier,cost)=>{
  const s=position();const action={type:'BUY_UNIT' as const,definitionId,position:{x:0,y:0}};
  expect(isLegalAction(s,action)).toBe(tier===1);const next=applyAction(s,action);
  if(tier!==1){expect(next).toBe(s);return;}
  expect(next.players.white.resources).toBe(40-cost);expect(next.players.white.resourcesGained).toBe(40);
  const u=next.board.units.at(-1)!;expect(u.placedThisTurn).toBe(true);expect(u.canActThisTurn).toBe(true);
  expect(next.turn.actionsRemaining).toBe(4);expect(next.players.black.resources).toBe(0);
 });
 it('rejects wrong phase, occupied, outside, noninteger, unknown, unaffordable and blocked purchases',()=>{
  const base=position();
  for(const pos of [{x:1,y:0},{x:2,y:2},{x:-1,y:0},{x:0.5,y:0}])expect(isLegalAction(base,{type:'BUY_UNIT',definitionId:'fire_1',position:pos})).toBe(false);
  const a={type:'BUY_UNIT' as const,definitionId:'fire_1',position:{x:0,y:0}};
  expect(applyAction({...base,turn:{...base.turn,phase:'action'}},a).board.units).toHaveLength(6);
  expect(isLegalAction(base,{...a,definitionId:'unknown'})).toBe(false);
  base.players.white.resources=0;expect(isLegalAction(base,a)).toBe(false);
  base.players.white.resources=40;base.board.units.push(createUnit('lightning_1','black',{x:0,y:0}));
  expect(getAllSpawnPositions('white',base.board)).toEqual([]);expect(isLegalAction(base,{...a,position:{x:1,y:1}})).toBe(false);
 });
 it('allows arbitrary buy/promote ordering, but no same-turn double promotion or promotion on purchase turn',()=>{
  let s=position();const hi=s.board.units[0];
  s=applyAction(s,{type:'BUY_UNIT',definitionId:'fire_1',position:{x:0,y:0}});const bought=s.board.units.at(-1)!;
  expect(applyAction(s,{type:'PROMOTE_UNIT',unitId:bought.id})).toBe(s);
  s=applyAction(s,{type:'PROMOTE_UNIT',unitId:hi.id});expect(s.board.units[0].definitionId).toBe('fire_2');
  expect(s.players.white.resources).toBe(33);expect(applyAction(s,{type:'PROMOTE_UNIT',unitId:hi.id})).toBe(s);
  s=applyAction(s,{type:'END_PLACE_PHASE'});s=endTurn(s);s=endTurn(s);
  expect(s.board.units.find(u=>u.id===bought.id)?.placedThisTurn).toBe(false);
  s=applyAction(s,{type:'PROMOTE_UNIT',unitId:bought.id});expect(s.board.units.find(u=>u.id===bought.id)?.definitionId).toBe('fire_2');
  s=applyAction(s,{type:'PROMOTE_UNIT',unitId:hi.id});expect(s.board.units[0].definitionId).toBe('fire_3');
  expect(applyAction(s,{type:'PROMOTE_UNIT',unitId:hi.id})).toBe(s);
 });
 it('buys and strikes in the same turn without action tax or summoning sickness',()=>{
  let s=position();s.board.units[1].position={x:4,y:4};s.board.units.push(createUnit('plant_1','black',{x:5,y:4}));
  s=applyAction(s,{type:'BUY_UNIT',definitionId:'fire_1',position:{x:4,y:3}});const u=s.board.units.at(-1)!;
  s=applyAction(s,{type:'END_PLACE_PHASE'});s=applyAction(s,{type:'MOVE',unitId:u.id,to:{x:5,y:3}});
  s=applyAction(s,{type:'ATTACK',unitId:u.id,targetPosition:{x:5,y:4}});
  expect(s.board.units.find(x=>x.owner==='black'&&x.position.x===5)).toBeUndefined();expect(s.turn.actionsRemaining).toBe(2);
 });
 it('infiltration blocking cannot be cleared before purchases',()=>{
  let s=createInitialGameState();s.turn.phase='place';s.players.white.resources=6;
  const w=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='water_1')!;
  const b=s.board.units.find(u=>u.owner==='black'&&u.definitionId==='fire_1')!;
  w.position={x:4,y:4};b.position={x:3,y:4};
  for(const pos of [{x:4,y:3},{x:3,y:3},{x:3,y:4}])expect(isLegalAction(s,{type:'BUY_UNIT',definitionId:'fire_1',position:pos})).toBe(false);
  s=applyAction(s,{type:'END_PLACE_PHASE'});s=applyAction(s,{type:'ATTACK',unitId:w.id,targetPosition:{x:3,y:4}});
  expect(s.board.units.some(u=>u.id===b.id)).toBe(false);
  expect(isLegalAction(s,{type:'BUY_UNIT',definitionId:'fire_1',position:{x:4,y:3}})).toBe(false);
 });
});
