import fs from 'node:fs';import path from 'node:path';
import {createInitialGameState} from '../../../src/game/board';
import {applyAction} from '../../../src/ai/simulate';
import {isLegalAction} from '../../../src/game/legality';
import {startTurn} from '../../../src/game/turn';
import {getAllSpawnPositions} from '../../../src/game/spawning';
import {getUnitDefinition} from '../../../src/game/units';
import {singleThreats} from '../../../server/analysis/tactics';
import {WorkBudget} from '../../../server/analysis/core';
import {describeAction} from '../../../server/notation';
import {AIEngineV2} from '../../../src/ai/engine-v2';
import {evaluatePosition} from '../../../src/ai/evaluation';
const dir=path.resolve('lab/results/handicap-census-2026-09-14'),c=JSON.parse(fs.readFileSync(path.join(dir,'census.json'),'utf8')),a=JSON.parse(fs.readFileSync(path.join(dir,'analysis.json'),'utf8')),ft=JSON.parse(fs.readFileSync(path.join(dir,'features.json'),'utf8'));
const bins=new Map([0,3,4].map(h=>[h,fs.readFileSync(path.join(dir,`states-h${h}.bin`))])),width=(h:number)=>h===0?797:h===3?3678:8012;
const xy=(n:number)=>({x:n%10,y:Math.floor(n/10)}),coord=(n:number)=>String.fromCharCode(65+n%10)+(1+Math.floor(n/10));
const rec=(h:number,w:number,b:number)=>{const o=((w-1)*width(h)+b-1)*24,x=bins.get(h)!;return {index:x.readFloatLE(o),wm:x[o+12],bm:x[o+13],wa:x[o+14],ba:x[o+15]};};
function step(s:any,action:any){if(!isLegalAction(s,action))throw Error('Illegal replay '+JSON.stringify(action));return applyAction(s,action);}
export function position(h:number,w:number,b:number){let s=createInitialGameState(undefined,undefined,h);s={...s,board:{...s.board,units:s.board.units.map((u,i)=>({...u,id:'initial-'+i}))}};
 for(const [i,to] of c.whiteStates[w-1].witness)s=step(s,{type:'MOVE',unitId:s.board.units[i].id,to:xy(to)});s=step(s,{type:'END_ACTION_PHASE'});
 const f=c.families[c.patterns[b-1].family],p=c.patterns[b-1];const ids=s.board.units.filter(u=>u.owner==='black').map(u=>u.id);
 if(f.buy){s=step(s,{type:'BUY_UNIT',definitionId:f.buy,position:xy(99)});ids.push(s.board.units.find(u=>u.owner==='black'&&!ids.includes(u.id))!.id);}
 if(f.promote!==null)s=step(s,{type:'PROMOTE_UNIT',unitId:ids[f.promote]});
 if(s.turn.phase==='place')s=step(s,{type:'END_PLACE_PHASE'});
 for(const [i,to]of p.witness)s=step(s,{type:'MOVE',unitId:ids[i],to:xy(99-to)});
 s=step(s,{type:'END_ACTION_PHASE'});return s;
}
const tests=new Map<string,[number,number,number]>();
const add=(h:number,w:number,b:number)=>{if(Number.isFinite(rec(h,w,b).index))tests.set(`${h}-${w}-${b}`,[h,w,b]);};
let seed=31415926;
for(const h of [3,4])for(const f of c.families.filter((f:any)=>f.minHandicap<=h)){
 const candidates=c.patterns.filter((p:any)=>p.family===f.id);
 for(let j=0;j<26;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const w=seed%797+1;seed=(Math.imul(seed,1664525)+1013904223)>>>0;add(h,w,candidates[seed%candidates.length].id);}
 for(const w of [74,157,675,779,792])add(h,w,a.familyResponses.find((r:any)=>r.Handicap===h&&r.W1_ID===w&&r.Family===f.id).Best_pattern);
}
let cases=0,masks=0,lines=0;const examples:any[]=[];
if(!process.argv.includes('--continuations'))for(const [h,w,b]of tests.values()){
 const s=position(h,w,b),p=c.patterns[b-1],r=rec(h,w,b),bf=ft.black[b-1],wf=ft.white[w-1];
 if(s.turn.currentPlayer!=='white'||s.turn.turnNumber!==2||s.inactivityPlies!==2||s.board.units.some(u=>u.damageTaken!==0))throw Error('Boundary');
 if(s.players.white.resources!==wf.income||s.players.black.resources!==h-p.spent+bf.income||s.players.black.resourcesGained!==bf.income)throw Error('Bank / income');
 if(s.board.cells.flat().reduce((n,v)=>n+v.resourceLayers,0)+s.players.white.resources+s.players.black.resources+p.spent!==504+h)throw Error('Conservation');
 for(const seat of ['white','black'] as const){const t=seat==='white'?s:startTurn(s,'black'),enemy=seat==='white'?p.units:ft.white[w-1].units;
  const sp=getAllSpawnPositions(seat,t.board).map(v=>v.y*10+v.x).sort((a,b)=>a-b),exp=(seat==='white'?wf:bf).spawn.slice().sort((a:number,b:number)=>a-b);
  if(sp.join(',')!==exp.join(','))throw Error('Spawn geometry');
  if(seat==='black'&&t.players.black.resources!==s.players.black.resources-bf.rent)throw Error('Upkeep');
  let mask=0;const evidence:any[]=[];
  for(let i=0;i<enemy.length;i++){
   const n=enemy[i].position,def=seat==='white'?enemy[i].definitionId:c.definitions[enemy[i].def].id;
   const target=t.board.units.find(u=>u.owner!==seat&&u.position.x===n%10&&u.position.y===Math.floor(n/10)&&u.definitionId===def)!;
   if(!target)throw Error('Canonical target missing');
   const result=singleThreats(t,target.id,['existing','promotion','purchase'],new WorkBudget(Infinity,Infinity),Infinity,true);
   if(!result.complete)throw Error('Tactical audit incomplete');
   if(result.lines.length){mask|=1<<i;lines+=result.lines.length;const z=result.lines[0];evidence.push({target:getUnitDefinition(def).name+' '+coord(n),ap:z.ap,crystals:z.crystals,actions:z.actions.map(describeAction)});}
  }
  if(mask!==(seat==='white'?r.wm:r.bm))throw Error(`Mask disagreement H${h} W${w} B${b} ${seat}: ${mask}, ${seat==='white'?r.wm:r.bm}`);
  masks++;if([675,779,792].includes(w))examples.push({h,w,b,seat,mask,evidence});
 }cases++;if(cases%40===0)console.log('Verified',cases,'/',tests.size);
}
if(cases)fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify({cases,masks,lines,seed:31415926,noB1Attacks:true,examples},null,2));
if(!process.argv.includes('--continuations')){console.log(JSON.stringify({cases,masks,lines}));process.exit(0);}
const cp=new Map<string,[number,number,number]>();
const whites=[74,157,675,779,792];
const radiWins=a.overview.find((x:any)=>x.handicap===3).best.filter((r:any)=>r.family===2).sort((x:any,y:any)=>y.score-x.score);
if(radiWins.length)whites.push(radiWins[0].w);
for(const w of whites)for(const h of [0,3,4])for(const r of a.familyResponses.filter((r:any)=>r.Handicap===h&&r.W1_ID===w))cp.set(`${h}-${w}-${r.Best_pattern}`,[h,w,r.Best_pattern]);
// Compare a shared forward-Hi geometry across all spending families even where
// the static index instead chooses a compact retreat.
for(const h of [3,4])for(const f of c.families.filter((f:any)=>f.minHandicap<=h)){
 const p=c.patterns.find((p:any)=>p.family===f.id&&p.p.slice(0,3).join(',')==='54,11,10'&&(!f.buy||p.p[3]===0));
 if(p)cp.set(`${h}-779-${p.id}`,[h,779,p.id]);
}
const outfile=path.join(dir,'continuations.json'),results:any[]=fs.existsSync(outfile)?JSON.parse(fs.readFileSync(outfile,'utf8')):[];
const config={fixedWork:25000,beamWidth:16,outputPlans:12,tacticalDepth:2,mctsIterations:180,tacticalNodes:5000};
for(const [h,w,b]of cp.values()){
 if(results.some(r=>r.h===h&&r.w===w&&r.b===b))continue;
 let s=position(h,w,b);const initial=evaluatePosition(s,'white'),turns:any[]=[];
 for(let ply=0;ply<2&&s.phase==='playing';ply++){
  const actor=s.turn.currentPlayer,engine=new AIEngineV2('easy');engine.setSeed(14092026+ply);engine.setConfig(config);const actions:any[]=[];let calls=0;
  while(s.phase==='playing'&&s.turn.currentPlayer===actor&&calls<3){const r=await engine.findBestAction(s);calls++;
   for(const action of r.plan.actions){if(s.phase!=='playing'||s.turn.currentPlayer!==actor)break;actions.push(describeAction(action));s=step(s,action);}}
  if(s.phase==='playing'&&s.turn.currentPlayer===actor){if(s.turn.phase==='place')s=step(s,{type:'END_PLACE_PHASE'});s=step(s,{type:'END_ACTION_PHASE'});actions.push('End turn at diagnostic cap');}
  turns.push({actor,calls,actions});
 }
 const z={h,w,b,family:c.patterns[b-1].family,openingIndex:rec(h,w,b).index,initialEngineStatic:initial,engineStaticAfterB2:evaluatePosition(s,'white'),material:s.board.units.reduce((z,u)=>z+(u.owner==='white'?1:-1)*getUnitDefinition(u.definitionId).cost,0),banks:[s.players.white.resources,s.players.black.resources],turns,status:s.phase,winner:s.winner,finalUnits:s.board.units.map(u=>({owner:u.owner,type:u.definitionId,square:coord(u.position.y*10+u.position.x)}))};results.push(z);
 fs.writeFileSync(outfile,JSON.stringify(results,null,2));console.log('Continuation',results.length,'/',cp.size,`H${h} W${w} B${b}`,'static',z.engineStaticAfterB2.toFixed(2));
}
fs.writeFileSync(path.join(dir,'continuation-config.json'),JSON.stringify({whiteIDs:whites,pairs:cp.size,config,seed:14092026,maxCallsPerTurn:3},null,2));
