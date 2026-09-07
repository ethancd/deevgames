// @vitest-environment node
import { it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { getUnitDefinition } from '../../src/game/units';
import { createInitialGameState } from '../../src/game/board';
import { extractPublicState, extractPrivateState } from '../../src/ai/state/observation';
import { AIWorkerClient, SearchCancelled, type WorkerLike } from '../../src/ai/worker/client';
import { createSearchHandler } from '../../src/ai/worker/handler';
import type { SearchRequest, SearchResponse } from '../../src/ai/worker/protocol';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { SearchBudget, seededRandom } from '../../src/ai/runtime';
import { reconcileBelief } from '../../src/ai/belief/reconcile';
import { updateBeliefOnPlacement } from '../../src/ai/belief/update';
let solver: TacticalSolver;
beforeAll(async()=>{solver=await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));});
function request(): SearchRequest {
 const state=createInitialGameState();
 return {version:1,type:'search',gameId:'test',requestId:1,revision:0,player:'white',observation:extractPublicState(state,'white'),own:extractPrivateState(state,'white'),difficulty:'easy',seed:831,decisionMs:1000,fixedWork:5000};
}
it('worker handler and direct engine have identical fixed-work outcomes and real counters',async()=>{
 const r=request();const direct=new AIEngineV2(r.difficulty);direct.setTacticalSolver(solver);direct.setSeed(r.seed);direct.setConfig({fixedWork:r.fixedWork});
 const a=await direct.findBestAction(r.observation), b=await createSearchHandler(solver)(r);
 expect(b.type).toBe('result');if(b.type!=='result')return;
 expect(b.result.plan).toEqual(a.plan);expect(b.result.debug).toEqual(a.debug);
 expect(b.result.stats?.iterations).toBe(a.stats?.iterations);
 expect(b.result.nodesSearched).toBe(b.result.stats?.iterations);
 expect(b.result.stats!.candidates).toBeGreaterThan(0);
});
it('nonzero seeded search is invariant to exact enemy stockpile and hidden queue',async()=>{
 const a=createInitialGameState(), b=structuredClone(a);a.players.black.resourcesGained=b.players.black.resourcesGained=15;
 a.players.black.resources=15;b.players.black.resources=0;b.players.black.resourcesSpent=15;b.players.black.buildQueue=[{id:'secret',owner:'black',definitionId:'water_4',turnsRemaining:3}];
 const results=[];for(const state of [a,b]) {const e=new AIEngineV2('easy');e.setSeed(90);e.setTacticalSolver(solver);e.setConfig({fixedWork:20000,mctsIterations:3,beamWidth:3,outputPlans:3,tacticalDepth:0});results.push(await e.findBestAction(state));}
 expect(results[0].plan).toEqual(results[1].plan);expect(results[0].debug).toEqual(results[1].debug);
 expect(results[0].stats!.iterations).toBeGreaterThan(0);
});
it('budget deadline covers tactical and initial candidate work',async()=>{
 const r=request();const e=new AIEngineV2('hard');e.setTacticalSolver(solver);
 const start=performance.now(), result=await e.findBestAction(r.observation,10);
 expect(performance.now()-start).toBeLessThan(100);expect(result.stats?.stopReason).toBe('deadline');
 let time=10;const b=new SearchBudget(5,10,()=>time);expect(b.spend()).toBe(true);time=16;expect(b.exhausted()).toBe(true);
});
it('worker rejects an unmasked opponent request',async()=>{
 const r=request();r.observation.players.black.resources=12;
 const result=await createSearchHandler(solver)(r);expect(result.type).toBe('error');
});
class FakeWorker implements WorkerLike {
 onmessage: WorkerLike['onmessage']=null;onerror: WorkerLike['onerror']=null;
 sent: SearchRequest[]=[];terminated=false;
 postMessage(r:SearchRequest){this.sent.push(r);} terminate(){this.terminated=true;}
 reply(data:SearchResponse){this.onmessage?.({data} as MessageEvent<SearchResponse>);}
}
it('masks before posting, ignores stale revisions, and terminates on cancellation',async()=>{
 const workers:FakeWorker[]=[];const c=new AIWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w;},'game',1);
 const s=createInitialGameState();s.players.black.resources=42;s.players.black.buildQueue=[{id:'secret',owner:'black',definitionId:'metal_4',turnsRemaining:0}];
 const pending=c.findBestAction(s,'hard',3000,3);const first=workers[0], posted=first.sent[0];
 expect(posted.observation.players.black.resources).toBe(0);expect(posted.observation.players.black.buildQueue).toEqual([]);expect(JSON.stringify(posted)).not.toContain('secret');
 first.reply({...posted,revision:2,type:'error',message:'stale'});
 const rejected=expect(pending).rejects.toBeInstanceOf(SearchCancelled);c.cancel();await rejected;expect(first.terminated).toBe(true);
 const next=c.findBestAction(s,'easy',100,4);expect(workers).toHaveLength(2);
 workers[1].reply({...workers[1].sent[0],type:'result',result:{plan:{actions:[{type:'END_ACTION_PHASE'}],score:0},nodesSearched:0,timeMs:1,depth:0}});
 expect((await next).plan.actions[0].type).toBe('END_ACTION_PHASE');c.cancel();
});
it('worker errors and watchdog timeouts reject instead of passing',async()=>{
 vi.useFakeTimers();try{const w=new FakeWorker(),c=new AIWorkerClient(()=>w,'timeout');
 const pending=c.findBestAction(createInitialGameState(),'hard',10,0);const rejected=expect(pending).rejects.toThrow('timed out');
 await vi.advanceTimersByTimeAsync(2100);await rejected;expect(w.terminated).toBe(true);
 }finally{vi.useRealTimers();}
});
it('posterior conserves money, uses an upper bound, and permits saving',()=>{
 const s=createInitialGameState();s.players.black.resourcesGained=30;s.players.black.resourcesManifested=7;
 const belief=reconcileBelief(extractPublicState(s,'white'),'black',50,seededRandom(8));
 expect(belief.maxResources).toBe(23);expect(belief.minResources).toBe(0);expect(belief.particles[0].resources).toBe(23);
 // Costs are read from the actual catalogue, not assumptions about unit names.
 for(const p of belief.particles) { expect(p.resources).toBeGreaterThanOrEqual(0); expect(p.resources+p.buildQueue.reduce((n,q)=>n+getUnitDefinition(q.definitionId).cost,0)).toBe(23); }
});
it('revealed queued units are not charged twice',()=>{
 const b={minResources:0,maxResources:10,particles:[{id:'a',resources:7,weight:1,buildQueue:[{id:'q',definitionId:'fire_2',owner:'black' as const,turnsRemaining:0}]}]};
 const next=updateBeliefOnPlacement(b,3,'fire_2');expect(next.particles[0].resources).toBe(7);expect(next.particles[0].buildQueue).toEqual([]);
});
it('newly inferred queues cannot already be ready before their first possible turn start',()=>{
 const s=createInitialGameState();s.players.black.resourcesGained=20;
 const belief=reconcileBelief(extractPublicState(s,'white'),'black',100,seededRandom(27));
 for(const p of belief.particles)for(const q of p.buildQueue)expect(q.turnsRemaining).toBeGreaterThan(0);
});

it('legacy saves without a manifested-spending field still cross the masked boundary',async()=>{
 const r=request();delete (r.observation.players.black as Partial<typeof r.observation.players.black>).resourcesManifested;
 r.fixedWork=100;
 expect((await createSearchHandler(solver)(r)).type).toBe('result');
});
