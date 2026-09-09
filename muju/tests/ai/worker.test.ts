// @vitest-environment node
import { it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { getUnitDefinition } from '../../src/game/units';
import { createInitialGameState } from '../../src/game/board';
import { AIWorkerClient, SearchCancelled, type WorkerLike } from '../../src/ai/worker/client';
import { createSearchHandler } from '../../src/ai/worker/handler';
import type { SearchRequest, SearchResponse } from '../../src/ai/worker/protocol';
import { instantiateTactics, type TacticalSolver } from '../../src/ai/wasm/kernel';
import { AIEngineV2 } from '../../src/ai/engine-v2';
import { SearchBudget, seededRandom } from '../../src/ai/runtime';
let solver: TacticalSolver;
beforeAll(async()=>{solver=await instantiateTactics(readFileSync('src/ai/wasm/tactics.wasm'));});
function request(): SearchRequest {
 const state=createInitialGameState();
 return {version:2,type:'search',gameId:'test',requestId:1,revision:0,player:'white',state,difficulty:'easy',seed:831,decisionMs:1000,fixedWork:5000};
}
it('worker handler and direct engine have identical fixed-work outcomes and real counters',async()=>{
 const r=request();const direct=new AIEngineV2(r.difficulty);direct.setTacticalSolver(solver);direct.setSeed(r.seed);direct.setConfig({fixedWork:r.fixedWork});
 const a=await direct.findBestAction(r.state), b=await createSearchHandler(solver)(r);
 expect(b.type).toBe('result');if(b.type!=='result')return;
 expect(b.result.plan).toEqual(a.plan);expect(b.result.debug).toEqual(a.debug);
 expect(b.result.stats?.iterations).toBe(a.stats?.iterations);
 expect(b.result.nodesSearched).toBe(b.result.stats?.iterations);
 expect(b.result.stats!.candidates).toBeGreaterThan(0);
});
it('budget deadline covers tactical and initial candidate work',async()=>{
 const r=request();const e=new AIEngineV2('hard');e.setTacticalSolver(solver);
 const start=performance.now(), result=await e.findBestAction(r.state,10);
 expect(performance.now()-start).toBeLessThan(100);expect(result.stats?.stopReason).toBe('deadline');
 let time=10;const b=new SearchBudget(5,10,()=>time);expect(b.spend()).toBe(true);time=16;expect(b.exhausted()).toBe(true);
});
it('worker rejects a mismatched acting player',async()=>{
 const r=request();r.player='black';
 const result=await createSearchHandler(solver)(r);expect(result.type).toBe('error');
});
class FakeWorker implements WorkerLike {
 onmessage: WorkerLike['onmessage']=null;onerror: WorkerLike['onerror']=null;
 sent: SearchRequest[]=[];terminated=false;
 postMessage(r:SearchRequest){this.sent.push(r);} terminate(){this.terminated=true;}
 reply(data:SearchResponse){this.onmessage?.({data} as MessageEvent<SearchResponse>);}
}
it('posts both banks, ignores stale revisions, and terminates on cancellation',async()=>{
 const workers:FakeWorker[]=[];const c=new AIWorkerClient(()=>{const w=new FakeWorker();workers.push(w);return w;},'game',1);
 const s=createInitialGameState();s.players.black.resources=42;
 const pending=c.findBestAction(s,'hard',3000,3);const first=workers[0], posted=first.sent[0];
 expect(posted.state.players.black.resources).toBe(42);expect(posted.state).toEqual(s);
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
