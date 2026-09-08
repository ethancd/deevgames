// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { createUnitFromDefinition } from '../../src/game/building';
import { beamSearchPlans } from '../../src/ai/planner/beam';
import { tacticalSharpen } from '../../src/ai/eval/sharpener';
import { selectChild } from '../../src/ai/search/uct';
import { runMCTS } from '../../src/ai/search/mcts';
import { extractPublicState, extractPrivateState } from '../../src/ai/state/observation';
import type { MCTSChild } from '../../src/ai/search/types';

it('does not collapse different destinations for the same moving piece',()=>{
 const s=createInitialGameState(); const plans=beamSearchPlans(s,'white',{maxSteps:1,beamWidth:100,outputPlans:100});
 const moves=plans.filter(p=>p.actions[0]?.type==='MOVE');expect(moves.length).toBeGreaterThan(3);
 expect(new Set(moves.map(p=>p.id)).size).toBe(moves.length);
});
it('evaluates consecutive same-player attacks from a fixed perspective',()=>{
 const s=createInitialGameState();s.board.units=[createUnitFromDefinition('fire_3','white',{x:2,y:2},'w'),createUnitFromDefinition('plant_1','black',{x:2,y:3},'b')];
 expect(tacticalSharpen(s,'white',1)).toBeGreaterThan(10000);
 expect(tacticalSharpen(s,'black',1)).toBeLessThan(-10000);
 s.turn.actionsRemaining=0;
 expect(tacticalSharpen(s,'white',2)).toBe(tacticalSharpen(s,'white',0));
});
it('opponent selection minimizes root payoff instead of cooperating',()=>{
 const child=(id:string,v:number):MCTSChild=>({plan:{id,actions:[],score:0,tags:[]},priorValue:0,node:{visits:10,totalValue:v,children:new Map()}});
 const n={visits:100,totalValue:0,children:new Map([['good',child('good',100)],['bad',child('bad',-100)]])};
 expect(selectChild(n,0,1,1)?.plan.id).toBe('good');expect(selectChild(n,0,1,-1)?.plan.id).toBe('bad');
});
it('expands alternative root choices rather than searching only its first child',()=>{
 const s=createInitialGameState();s.turn.phase='queue';s.players.white.resources=5;
 const knowledge={public:extractPublicState(s,'white'),own:extractPrivateState(s,'white'),opponentBelief:{particles:[],minResources:0,maxResources:0}};
 const gen=vi.fn((state:typeof s)=>state.turn.currentPlayer==='white'&&state.players.white.buildQueue.length===0 ? [
  {id:'bad',actions:[{type:'END_TURN' as const}],score:0,tags:[]},
  {id:'good',actions:[{type:'QUEUE_UNIT' as const,definitionId:'fire_1'}],score:0,tags:[]},
 ]:[]);
 const plan=runMCTS(knowledge,'white',{iterations:40,timeLimitMs:5000,progressiveWideningAlpha:0.5},gen,state=>state.players.white.buildQueue.length?100:-100);
 expect(plan.id).toBe('good');
});
it('does not change AI decisions when only the opponents hidden spending changes',async()=>{
 const {AIEngineV2}=await import('../../src/ai/engine-v2');
 const a=createInitialGameState(),b=structuredClone(a);
 a.players.black.resourcesGained=10;b.players.black.resourcesGained=10;
 a.players.black.resources=10;b.players.black.resources=4;b.players.black.resourcesSpent=6;
 b.players.black.buildQueue=[{id:'secret',definitionId:'fire_3',turnsRemaining:2,owner:'black'}];
 const random=vi.spyOn(Math,'random').mockReturnValue(0.5);
 try {
  const results=[];
  for(const s of [a,b]){const e=new AIEngineV2('easy');e.setConfig({mctsIterations:0,beamWidth:3,outputPlans:3,tacticalDepth:0});results.push(await e.findBestAction(s));}
  expect(results[0].plan).toEqual(results[1].plan);expect(results[0].debug?.topPlans).toEqual(results[1].debug?.topPlans);
 } finally {random.mockRestore();}
});
it('does not double-penalize promotion spending or resign with reserve assets',async()=>{
 const {scorePartialPlan}=await import('../../src/ai/planner/scoring');
 const {shouldResign}=await import('../../src/ai/evaluation');
 const s=createInitialGameState();s.turn.phase='place';s.players.white.resources=20;s.players.white.resourcesGained=20;
 const unit=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='plant_1')!;
 const promote={id:'promote',actions:[{type:'PROMOTE_UNIT' as const,unitId:unit.id}],score:0,tags:[]};
 const pass={id:'pass',actions:[{type:'END_PLACE_PHASE' as const}],score:0,tags:[]};
 expect(scorePartialPlan(promote,s,'white')).toBeGreaterThan(scorePartialPlan(pass,s,'white'));
 s.board.units=s.board.units.filter(u=>u.owner==='black'||u.id===unit.id);
 for(const u of s.board.units)if(u.owner==='black')u.definitionId='metal_3';
 expect(shouldResign(s,'white')).toBe(false);s.players.white.resources=0;
 s.players.white.buildQueue=[{id:'q',owner:'white',definitionId:'fire_3',turnsRemaining:0}];
 expect(shouldResign(s,'white')).toBe(false);
});
