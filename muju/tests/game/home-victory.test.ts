import {describe,it,expect} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {startTurn} from '../../src/game/turn';
import {applyAction,isTerminal} from '../../src/ai/simulate';
import {gameReducer} from '../../src/hooks/useGameState';
import {evaluatePosition,quickEvaluate,shouldResign} from '../../src/ai/evaluation';
import {getHomeOccupier} from '../../src/game/victory';
import {getAllSpawnPositions} from '../../src/game/spawning';
import {saveGameState,loadGameState} from '../../src/utils/persistence';
import {extractPublicState} from '../../src/ai/state/observation';
import type {PlayerId} from '../../src/game/types';

for(const attacker of ['white','black'] as PlayerId[])describe(`home victory ${attacker}`,()=>{
 const defender=attacker==='white'?'black':'white',k=attacker==='white'?9:0;
 function invasion(){const s=createInitialGameState();s.turn.currentPlayer=attacker;s.board.units=s.board.units.filter(u=>u.owner===attacker||!(u.position.x===k&&u.position.y===k+(k?-1:1)));const u=s.board.units.find(u=>u.owner===attacker&&u.definitionId==='fire_1')!;u.position={x:k,y:k+(k?-1:1)};return {s,u};}
 it('arrival is not victory; opponent gets a full reply, then turn start wins before queue/healing',()=>{
  const {s,u}=invasion();s.players[attacker].buildQueue=[{id:'later',definitionId:'fire_1',owner:attacker,turnsRemaining:2}];
  let next=applyAction(s,{type:'MOVE',unitId:u.id,to:{x:k,y:k}});expect(next.phase).toBe('playing');expect(isTerminal(next)).toBe(false);
  next=applyAction(next,{type:'END_ACTION_PHASE'});expect(next.turn.currentPlayer).toBe(defender);expect(next.phase).toBe('playing');
  expect(getAllSpawnPositions(defender,next.board)).toHaveLength(0);
  const result=applyAction(next,{type:'END_ACTION_PHASE'});expect(result.winner).toBe(attacker);expect(result.victoryReason).toBe('home-occupation');
  expect(result.players[attacker].buildQueue[0].turnsRemaining).toBe(2);expect(isTerminal(result)).toBe(true);
  expect(evaluatePosition(result,attacker)).toBe(100000);expect(quickEvaluate(result,defender)).toBe(-100000);
  expect(applyAction(result,{type:'RESIGN'})).toBe(result);expect(gameReducer(next,{type:'END_ACTION_PHASE'})).toEqual(result);
 });
 it('killing the occupier during the reply prevents victory',()=>{
  const {s,u}=invasion();s.board.units.push(createUnit('water_1',defender,{x:k,y:k+(k?-1:1)}));u.position={x:k,y:k};
  let next=startTurn(s,defender);const killer=next.board.units.find(x=>x.owner===defender&&x.position.x===k&&x.position.y!==k)!;
  next=applyAction(next,{type:'ATTACK',unitId:killer.id,targetPosition:{x:k,y:k}});expect(getHomeOccupier(next.board,attacker)).toBeUndefined();
  next=applyAction(next,{type:'END_ACTION_PHASE'});expect(next.phase).toBe('playing');
 });
 it('zero-attack units qualify; friendly home occupation does not; legacy comparison is explicit',()=>{
  const s=createInitialGameState();const u=s.board.units.find(u=>u.owner===attacker&&u.definitionId==='plant_1')!;u.position={x:k,y:k};
  expect(startTurn(s,attacker).winner).toBe(attacker);expect(startTurn(s,defender).phase).toBe('playing');
  s.victoryRule='elimination';expect(startTurn(s,attacker).phase).toBe('playing');expect(extractPublicState(s,attacker).victoryRule).toBe('elimination');
 });
 it('loading an invasion mid-turn is not a retroactive victory; terminal saves retain the reason',()=>{
  const {s,u}=invasion();u.position={x:k,y:k};s.turn.currentPlayer=defender;saveGameState(s);let next=loadGameState()!;expect(next.phase).toBe('playing');
  next=applyAction(next,{type:'END_ACTION_PHASE'});saveGameState(next);expect(loadGameState()?.victoryReason).toBe('home-occupation');
 });
});
it('simultaneous invasions resolve for the player whose turn starts first',()=>{
 const s=createInitialGameState();s.board.units.find(u=>u.owner==='white')!.position={x:9,y:9};s.board.units.find(u=>u.owner==='black')!.position={x:0,y:0};
 expect(startTurn(s,'white').winner).toBe('white');expect(startTurn(s,'black').winner).toBe('black');
});

it('spending the final crystal can automatically end the reply and resolve occupation',()=>{
 let s=createInitialGameState();s.board.units.find(u=>u.owner==='white')!.position={x:9,y:9};s.turn.currentPlayer='black';s.turn.phase='queue';s.players.black.resources=1;
 s=applyAction(s,{type:'QUEUE_UNIT',definitionId:'fire_1'});expect(s.winner).toBe('white');expect(s.victoryReason).toBe('home-occupation');
});
it('the AI does not resign a material deficit under the invasion rule',()=>{
 const s=createInitialGameState();s.board.units=s.board.units.filter(u=>u.owner==='black'||u.definitionId==='fire_1');
 expect(shouldResign(s,'white')).toBe(false);s.victoryRule='elimination';expect(shouldResign(s,'white')).toBe(true);
});
it('a coordinated three-attacker reply can remove a tier-4 Metal corner occupier',async()=>{
 const {clearHomePlan}=await import('../../lab/experiments/home-policies');
 let s=createInitialGameState();s.turn.currentPlayer='black';s.board.units=[createUnit('metal_4','white',{x:9,y:9}),createUnit('water_4','black',{x:9,y:8}),createUnit('water_4','black',{x:8,y:9}),createUnit('water_4','black',{x:8,y:8})];
 const plan=clearHomePlan(s);expect(plan).not.toBeNull();for(const a of plan!)s=applyAction(s,a);
 expect(getHomeOccupier(s.board,'white')).toBeUndefined();expect(s.winner).toBe('black');
});
