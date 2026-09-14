import fs from 'node:fs';
import path from 'node:path';
import {createInitialGameState} from '../../../src/game/board';
import {endTurn,startTurn} from '../../../src/game/turn';
import {applyAction} from '../../../src/ai/simulate';
import {isLegalAction} from '../../../src/game/legality';
import {getAllSpawnPositions} from '../../../src/game/spawning';
import {singleThreats} from '../../../server/analysis/tactics';
import {WorkBudget} from '../../../server/analysis/core';
import {describeAction} from '../../../server/notation';
import {AIEngineV2} from '../../../src/ai/engine-v2';
import {evaluatePosition} from '../../../src/ai/evaluation';
import {getUnitDefinition} from '../../../src/game/units';
const dir=path.resolve(process.argv[2]??'lab/results/opening-census-2026-09-14');
const c=JSON.parse(fs.readFileSync(path.join(dir,'census.json'),'utf8')),a=JSON.parse(fs.readFileSync(path.join(dir,'analysis.json'),'utf8'));
const bin=fs.readFileSync(path.join(dir,'joint.bin')),F=a.features,N=c.count;
const xy=(n:number)=>({x:n%10,y:Math.floor(n/10)});
export function position(w:number,b:number){let s=createInitialGameState();
 for(const [i,to] of c.states[w-1].witness){const act={type:'MOVE' as const,unitId:s.board.units[i].id,to:xy(to)};if(!isLegalAction(s,act))throw Error('W witness illegal');s=applyAction(s,act);}s=endTurn(s);
 for(const [i,to] of c.states[b-1].witness){const act={type:'MOVE' as const,unitId:s.board.units[i+3].id,to:xy(99-to)};if(!isLegalAction(s,act))throw Error('B witness illegal');s=applyAction(s,act);}s=endTurn(s);return s;
}
const pairs=new Map<string,[number,number]>();const add=(w:number,b:number)=>{const off=((w-1)*N+b-1)*12;if(Number.isFinite(bin.readFloatLE(off)))pairs.set(w+'-'+b,[w,b]);};
let seed=14092026;for(let i=0;i<160;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const w=1+seed%N;seed=(Math.imul(seed,1664525)+1013904223)>>>0;add(w,1+seed%N);}
for(const w of [1,8,547,675,749,779,780,791,792,795,796,797])for(const b of [1,8,675,721,749,779,780,791,792,796,797])add(w,b);
for(const o of Array.from({length:8},(_,i)=>i+1)){const f=F.find((s:any)=>s.order===o);add(f.id,a.bestByW[f.id-1].b);}
let cases=0,masks=0,lines=0;const examples:any[]=[];
for(const [w,b] of (process.argv.includes('--continuations')?[]:pairs.values())){
 const s=position(w,b),off=((w-1)*N+b-1)*12;
 if(s.players.white.resources!==F[w-1].bank||s.players.black.resources!==F[b-1].bank||s.inactivityPlies!==2||s.turn.currentPlayer!=='white'||s.turn.turnNumber!==2)throw Error('Boundary mismatch');
 if(s.board.cells.flat().reduce((n,v)=>n+v.resourceLayers,0)+s.players.white.resources+s.players.black.resources!==504)throw Error('Conservation');
 for(const [seat,j] of [['white',0],['black',1]] as const){
  const t=seat==='white'?s:startTurn(s,'black');let mask=0;const witnesses=[];
  if(getAllSpawnPositions(seat,t.board).length!==F[(seat==='white'?w:b)-1].spawnCount)throw Error('Spawn count mismatch');
  for(let i=0;i<3;i++){
   const target=t.board.units[seat==='white'?3+i:i];
   const result=singleThreats(t,target.id,['existing','promotion','purchase'],new WorkBudget(Infinity,Infinity),Infinity,true);
   if(!result.complete)throw Error('Incomplete verification');
   if(result.lines.length){mask|=1<<i;const e=result.lines[0];lines+=result.lines.length;witnesses.push({target:getUnitDefinition(target.definitionId).name,actions:e.actions.map(describeAction),rawActions:e.actions,ap:e.ap,crystals:e.crystals});}
  }
  if(mask!==bin[off+4+j])throw Error(`Capture mask ${w},${b},${seat}: ${mask} != ${bin[off+4+j]}`);
  masks++;if([792,780,1,8,675].includes(w)&&[792,791,721,8,1,796].includes(b))examples.push({w,b,seat,mask,witnesses});
 }cases++;if(cases%40===0)console.log('Verified '+cases+' joint states');
}
if(cases)fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify({cases,masks,lines,method:'Seed 14092026. Production replay, turn settlement, conservation, spawn and exhaustive singleThreats cross-check.',examples},null,2));
console.log(JSON.stringify({cases,masks,lines}));
// Deterministic bounded continuations, a diagnostic beyond the first-round index.
const benchmarkPairs=new Map<string,[number,number]>();
for(const w of [1,74,157,675,779,792]){
 const cand=[a.bestByW[w-1].b,792,791,721,157,151,c.states.find((f:any)=>f.p.join(',')==='1,11,10').id];
 for(const b of cand)if(Number.isFinite(bin.readFloatLE(((w-1)*N+b-1)*12)))benchmarkPairs.set(w+'-'+b,[w,b]);
}
const continuations:any[]=process.argv.includes('--continuations')?JSON.parse(fs.readFileSync(path.join(dir,'continuations.json'),'utf8')):[];
for(const [w,b]of benchmarkPairs.values()){
 if(continuations.some(x=>x.w===w&&x.b===b))continue;
 let s=position(w,b);const turns:any[]=[];
 for(let ply=0;ply<2&&s.phase==='playing';ply++){
  const actor=s.turn.currentPlayer,engine=new AIEngineV2('easy');engine.setSeed(14092026+ply);engine.setConfig({fixedWork:8000,beamWidth:10,outputPlans:8,tacticalDepth:1,mctsIterations:80,tacticalNodes:1500});
  const actions:any[]=[];let calls=0,work=0;
  while(s.phase==='playing'&&s.turn.currentPlayer===actor&&calls<3){
   const r=await engine.findBestAction(s);calls++;work+=r.stats?.candidates??0;
   for(const action of r.plan.actions){if(s.turn.currentPlayer!==actor||s.phase!=='playing')break;if(!isLegalAction(s,action))throw Error('Engine illegal');actions.push(describeAction(action));s=applyAction(s,action);}
  }
  if(s.phase==='playing'&&s.turn.currentPlayer===actor){if(s.turn.phase==='place')s=applyAction(s,{type:'END_PLACE_PHASE'});s=applyAction(s,{type:'END_ACTION_PHASE'});actions.push('End turn (diagnostic cap)');}
  turns.push({actor,actions,calls,work});
 }
 continuations.push({w,b,initialIndex:bin.readFloatLE(((w-1)*N+b-1)*12),turns,result:s.phase,winner:s.winner,engineStaticAfterB2:evaluatePosition(s,'white'),material:s.board.units.reduce((v,u)=>v+(u.owner==='white'?1:-1)*getUnitDefinition(u.definitionId).cost,0),banks:[s.players.white.resources,s.players.black.resources],finalUnits:s.board.units.map(u=>({owner:u.owner,type:u.definitionId,square:String.fromCharCode(65+u.position.x)+(1+u.position.y)}))});
 console.log('Continuation '+w+'-'+b+' '+continuations.length+'/'+benchmarkPairs.size);
 fs.writeFileSync(path.join(dir,'continuations.json'),JSON.stringify(continuations,null,2));
}
