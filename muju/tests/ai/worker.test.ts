// @vitest-environment node
import { it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { getUnitDefinition } from '../../src/game/units';
import { createInitialGameState } from '../../src/game/board';
import { AIWorkerClient, SearchCancelled, type WorkerLike } from '../../src/ai/worker/client';
import { createSearchHandler, type HardEngineFactory } from '../../src/ai/worker/handler';
import { AI_PROTOCOL, type SearchRequest, type SearchResponse, type TurnResult } from '../../src/ai/worker/protocol';
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
/**
 * THE PHASING GUARD IS GONE (2026-09-21). The worker used to refuse a
 * `ruleset: 'phasing'` state unless the request carried a `phasingPreview`
 * marker. Standard is retired, so every request is a Phasing request and no
 * marker exists: the handler must search one on all three routes (per-action,
 * whole-turn v2, whole-turn hard) exactly as it does any other state.
 */
const PHASING_TURN: TurnResult = {
 actions:[{type:'END_ACTION_PHASE'}],scoreCc:3,depth:2,work:1000,
 stats:{nodes:0,qnodes:0,turnNodes:0,evals:0,ttHits:0,ttProbes:0,depth:2,seldepth:2,
  byClass:new Int32Array(9),proverCalls:0,dfpnCalls:0,catalogRebuilds:0,replicaDivergences:0,
  work:1000,elapsedMs:4,stopReason:'complete'},
 source:'search',endKey:'phasing-stub',
};
const hardStub: HardEngineFactory = () => ({ async searchTurn(){return PHASING_TURN;}, setSeed(){} });
it('searches a Phasing state with no marker, on every route',async()=>{
 const handler=createSearchHandler(solver,undefined,hardStub);
 const phasing=():SearchRequest=>({...request(),version:AI_PROTOCOL,state:createInitialGameState(undefined,4,0,'phasing')});
 const action=await handler(phasing());expect(action.type).toBe('result');
 const turn=await handler({...phasing(),requestId:2,mode:'turn'});
 expect(turn.type).toBe('result');if(turn.type!=='result')return;
 expect(turn.result.turnActions?.length).toBeGreaterThan(0);
 const hard=await handler({...phasing(),requestId:3,mode:'turn',engine:'hard'});
 expect(hard.type).toBe('turn');if(hard.type!=='turn')return;
 expect(hard.engineUsed).toBe('hard');expect(hard.result.actions).toEqual(PHASING_TURN.actions);
});
