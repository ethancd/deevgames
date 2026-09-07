import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { UNIT_DEFINITIONS } from '../../src/game/units';
import { MAPS, REGIONS, distance } from './maps';
import { POLICIES,opening,mapSummary,geographicRoles,geometry,starterUpperBound,finance } from './model';
import { replay } from './replay';
const start=Date.now(),out=resolve('lab/results/map-study-2026-09-07');mkdirSync(out,{recursive:true});
const catalogueHash=createHash('sha256').update(JSON.stringify(UNIT_DEFINITIONS)).digest('hex');
const modelHash=createHash('sha256').update(['maps.ts','model.ts','replay.ts','run.ts'].map(f=>readFileSync(new URL(f,import.meta.url))).join('')).digest('hex');
const maps=[];
for(const map of MAPS){
 console.log(`Analyzing ${map.id}: opening widths 64 / 256 / 1024…`);
 const runs=[64,256,1024].flatMap(width=>POLICIES.map(policy=>opening(map,policy,width)));
 let replays=0;for(const r of runs)for(const p of r.turns){replay(map,p);replay(map,p,true);replays+=2;}
 const main=POLICIES.map(policy=>({policy,width:0,turns:Array.from({length:5},(_,i)=>{
  const options=runs.filter(r=>r.policy===policy).map(r=>r.turns[i]);
  return options.reduce((a,b)=>(['bank','plant','home'].includes(policy) ? b.gross>a.gross||b.gross===a.gross&&b.objectiveScore>a.objectiveScore : b.objectiveScore>a.objectiveScore)?b:a);
 })}));
 const bank=main.find(r=>r.policy==='bank')!;
 // A single final witness supplies every income prefix; never splice incompatible best prefixes.
 const incomes=Array.from({length:5},(_,i)=>bank.turns[4].path.filter(s=>s.turn<=i+1&&s.kind==='mine').reduce((sum,s)=>sum+(s.amount??0),0));
 const roles=geographicRoles(map);
 const reservedActions=[3,4,5].flatMap(actions=>['bank','plant'].map(policy=>opening(map,policy,256,5,actions)));
 for(const r of reservedActions)for(const point of r.turns){replay(map,point);replay(map,point,true);replays+=2;}
 const evidence={...map,summaryMetrics:mapSummary(map),geometry:geometry(map),roles,openings:main,reservedActions,
  convergence:runs.map(r=>({width:r.width,policy:r.policy,gross:r.turns.map(p=>p.gross),cash:r.turns.map(p=>p.cash)})),
  starterBounds:Array.from({length:5},(_,i)=>starterUpperBound(map,6*(i+1))),
  financeIncome:incomes,access:UNIT_DEFINITIONS.map(u=>({id:u.id,turn:finance(u,incomes)})),replays,
  sensitivity:[] as {swap:number[];bank5:number;plant3:number;plant5:number}[]};
 const protectedCells=new Set([0,1,10,11,88,89,98,99]),seen=new Set<string>();
 // Swap two adjacent rotational orbits: exact total + depth histogram preservation.
 for(let p=0;p<50;p++)for(let q=0;q<100;q++)if(distance(p,q)===1&&map.cells[p]!==map.cells[q]){
  const a=Math.min(p,99-p),b=Math.min(q,99-q),key=[a,b].sort((x,y)=>x-y).join('/');
  if(a===b||seen.has(key)||[a,b,99-a,99-b].some(x=>protectedCells.has(x)))continue;seen.add(key);
  const cells=[...map.cells];for(const [x,y] of [[a,b],[99-a,99-b]])[cells[x],cells[y]]=[cells[y],cells[x]];
  const probe={...map,cells},bank=opening(probe,'bank',256),plant=opening(probe,'plant',256);
  replay(probe,bank.turns[4]);replay(probe,plant.turns[4]);evidence.replays+=2;
  evidence.sensitivity.push({swap:[a,b],bank5:bank.turns[4].gross,plant3:plant.turns[2].gross,plant5:plant.turns[4].gross});
 }
 maps.push(evidence);writeFileSync(`${out}/${map.id}.json`,JSON.stringify(evidence,null,2)+'\n');
 console.log(`${map.id}: ${evidence.replays} legal replays; ${evidence.sensitivity.length} nearby layouts; ${Object.values(roles.roles).filter(r=>r.sole).length}/24 sole-cheapest geographic witnesses`);
}
const result={version:1,catalogueHash,modelHash,units:UNIT_DEFINITIONS,regions:REGIONS,elapsedSeconds:(Date.now()-start)/1000,maps,
 assumptions:[
 'Lab-only 10×10 maps; v1.3 catalogue held fixed. A=500 crystals, B–E=340; variation therefore includes scarcity relative to A.',
 'Every cell starts at minedDepth 0. Capacity is total existing depth, never a mining-yield multiplier.',
 'Regional mining routes use both fresh wells and a counterfactual with the top three layers removed everywhere; exact for one already-acquired unit, starting in the district or traveling from home, open movement, one district, six actions, no opponents or other bodies.',
 'Opening income routes use the real three starters, shared depletion, collision-aware moves, six actions/own turn, optional Plant promotions; opponent stays still and passes. No new units or combat.',
 'Beam widths 64/256/1024 are heuristic searches; retain the best witnessed result across widths at each horizon because wider beams can discard narrower-beam paths. Every displayed horizon has its own legal witness; only equality with the independent starter upper bound certifies optimum in that restricted model.',
 'East/south/center searches add an explicit 0.4-point-per-square destination preference for one unit; these are route probes, not Pareto frontiers or comparable strategy ratings. Home restricts all pieces to the near 4×4.',
 'Action-reserve probes allow only 3/4/5 economic actions per turn; unused actions represent an opportunity cost, not simulated protection or enemy responses.',
 'Financing uses all prefixes of ONE five-turn bank witness, holds its income fixed despite target purchases/upgrades, and stops new income after turn 5. It omits target placement traffic, protection, competing spending and feedback; not earliest actual tier access.',
 'Role counts depend on the declared region/target/action/survival grid; missing witnesses are model questions, not proof of useless units. Acquisition, tech and opponent responses are excluded.',
 'Geometry reports open-board approach distances and hypothetical Radi spawn-blocking costs; it does not establish a first-player advantage or a forced invasion.',
 'Sensitivity swaps adjacent rotational pairs while preserving total, histogram and starting home squares; width-256 unopposed bank/Plant probes are repeated, not complete game balance tests.',
 ]};
writeFileSync(`${out}/comparison.json`,JSON.stringify(result)+'\n');
const lines=['# Five fixed mineral maps — static study','',`Catalogue SHA-256: \`${catalogueHash}\`. Model SHA-256: \`${modelHash}\`.`, '',
'## Resource geometry','', '| Map | Total | M1 / M2 / M3 / M4 / M5 accessible | ≥4-layer components | Largest rich component | Central four |', '|---|---:|---|---:|---:|---:|'];
for(const m of maps){const s=m.summaryMetrics;lines.push(`| ${m.id} ${m.name} | ${s.total} | ${s.accessibleByMining.slice(1).join(' / ')} | ${s.clusters.length} | ${s.largestRichCluster} | ${s.centralFour} |`);}
lines.push('','## Unopposed opening witnesses','', 'Gross / banked crystals at the end of own turn 5, after six shared actions per turn. Plant promotes as soon as affordable; its bank deducts the upgrades. Destination probes are not optimized competitive strategies.','', '| Map | Bank | Plant investment | Home only | East probe | South probe | Center probe |','|---|---:|---:|---:|---:|---:|---:|');
for(const m of maps)lines.push(`| ${m.id} | ${m.openings.map(o=>{const p=o.turns[4];return `${p.gross} / ${p.cash}`;}).join(' | ')} |`);
lines.push('','## Plant income by own turn (gross)','', '| Map | Turn 1 | Turn 2 | Turn 3 | Turn 4 | Turn 5 | Bank at turn 5 |', '|---|---:|---:|---:|---:|---:|---:|');
for(const m of maps){const p=m.openings.find(o=>o.policy==='plant')!;lines.push(`| ${m.id} | ${p.turns.map(t=>t.gross).join(' | ')} | ${p.turns[4].cash} |`);}
lines.push('','## Reserving actions for other duties','', 'Plant investment: gross income / banked crystals at own turn 5. Reserved actions are not simulated defense.','', '| Map | 6 economic actions | 5 | 4 | 3 |','|---|---:|---:|---:|---:|');
for(const m of maps)lines.push(`| ${m.id} | ${[6,5,4,3].map(a=>{const r=a===6?m.openings.find(o=>o.policy==='plant')!:m.reservedActions.find(o=>o.policy==='plant'&&o.actionsPerTurn===a)!;const p=r.turns[4];return `${p.gross} / ${p.cash}`;}).join(' | ')} |`);
lines.push('','## Geographic single-unit roles','', '| Unit | A sole-cheapest tasks | B | C | D | E |','|---|---:|---:|---:|---:|---:|');
for(const u of UNIT_DEFINITIONS)lines.push(`| ${u.id} | ${maps.map(m=>m.roles.roles[u.id].sole).join(' | ')} |`);
lines.push('','## One-square sensitivity','', 'Compare with the width-256 parent run. Moving a rotational pair preserves both total crystals and the depth histogram. Results are gross Plant income, not win rates.','', '| Map | Swaps | Parent T3 / T5 | T3 range | T5 range |','|---|---:|---:|---|---|');
for(const m of maps){const parent=m.convergence.find(r=>r.width===256&&r.policy==='plant')!;const s=m.sensitivity;lines.push(`| ${m.id} | ${s.length} | ${parent.gross[2]} / ${parent.gross[4]} | ${s.length?`${Math.min(...s.map(s=>s.plant3))}–${Math.max(...s.map(s=>s.plant3))}`:'n/a'} | ${s.length?`${Math.min(...s.map(s=>s.plant5))}–${Math.max(...s.map(s=>s.plant5))}`:'n/a'} |`);}
lines.push('','## Scope and limitations','',...result.assumptions.map(a=>'- '+a),'',`Verified ${maps.reduce((s,m)=>s+m.replays,0)} production-engine replays (including rotated seats and sensitivity witnesses). Runtime: ${result.elapsedSeconds.toFixed(2)} seconds.`);
writeFileSync(`${out}/comparison.md`,lines.join('\n')+'\n');
console.log(`Finished in ${result.elapsedSeconds.toFixed(2)}s. ${out}`);
