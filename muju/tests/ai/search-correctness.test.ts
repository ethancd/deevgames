// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { createUnitFromDefinition } from '../../src/game/building';
import { beamSearchPlans } from '../../src/ai/planner/beam';
import { tacticalSharpen } from '../../src/ai/eval/sharpener';
import { selectChild } from '../../src/ai/search/uct';
import { runMCTS } from '../../src/ai/search/mcts';
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
 const s=createInitialGameState();s.turn.phase='place';s.players.white.resources=5;
 const gen=vi.fn((state:typeof s)=>state.turn.currentPlayer==='white'&&state.board.units.length===6 ? [
  {id:'bad',actions:[{type:'END_PLACE_PHASE' as const}],score:0,tags:[]},
  {id:'good',actions:[{type:'BUY_UNIT' as const,definitionId:'fire_1',position:{x:0,y:0}}],score:0,tags:[]},
 ]:[]);
 const plan=runMCTS(s,'white',{iterations:40,timeLimitMs:5000,progressiveWideningAlpha:0.5},gen,state=>state.board.units.length>6?100:-100);
 expect(plan.id).toBe('good');
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

});
