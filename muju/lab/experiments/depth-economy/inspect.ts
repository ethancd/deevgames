import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createInitialGameState} from './.sandbox/src/game/board';
import {setEconomy} from './.sandbox/src/game/economy';
import {applyAction} from './.sandbox/src/ai/simulate';
import {checkInvariants} from './.sandbox/lab/harness/invariants';
import {isLegalAction} from './.sandbox/src/game/legality';
import {summaryState,OUT,save,hash,miningOpportunity} from './common';
const load=(name:string)=>gunzipSync(readFileSync(`${OUT}/${name}.jsonl.gz`)).toString().trim().split('\n').map(l=>JSON.parse(l));
const replays:any[]=[],routePersistence:any[]=[];
// First paired seed for key divergent cells, plus the unique safety cap.
for(const economy of ['A','B','C'] as const)for(const label of ['scripted','sustain']){
 setEconomy(economy);const games=load(`${label}-${economy}`);
 for(const g of games.filter(g=>([0,3,6,7].includes(g.cell)&&g.i===0&&!g.swapped)||g.cap)){
  let s=createInitialGameState();const highlights:any[]=[];
  for(const e of g.events){assert.ok(isLegalAction(s,e.action),`${g.id}/${e.ply}`);s=applyAction(s,e.action);checkInvariants(s,`${g.id}/${e.ply}`);
   if(e.action.type==='PROMOTE_UNIT'||e.upkeep?.released?.length||e.removed?.length||e.fifth>0||s.phase==='victory')highlights.push(e);
  }
  assert.deepEqual(summaryState(s),g.final);replays.push({id:g.id,seed:g.seed,actions:g.events.length,verifiedHash:hash(summaryState(s)),winner:g.winner,winType:g.winType,cap:g.cap,highlights,final:g.final});
 }
}
for(const economy of ['A','B','C'] as const){setEconomy(economy);
 const origins=new Map(load(`sustain-origins-${economy}`).map(o=>[o.id,o]));
 for(const g of load(`sustain-counterfactual-${economy}`).filter(g=>g.branch==='promote')){
  const o=origins.get(g.originId)!,initial=o.state;let s=initial;
  const opportunities:any[]=[{turn:s.turn.turnNumber,alive:true,...miningOpportunity(s,s.board.units.find((u:any)=>u.id===o.unitId))}];
  for(const e of g.events){s=applyAction(s,e.action);if(s.turn.currentPlayer===o.aSeat&&e.player!==o.aSeat){const u=s.board.units.find((u:any)=>u.id===o.unitId);opportunities.push({turn:s.turn.turnNumber,alive:!!u,...u?miningOpportunity(s,u):{}});if(!u)break;}}
  routePersistence.push({origin:o.id,opponent:o.b,owner:o.aSeat,opportunities});
 }
}
save('inspected-replays',replays);save('route-persistence',routePersistence);console.log({verifiedReplays:replays.length,promotionRoutes:routePersistence.length});
