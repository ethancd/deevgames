import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createInitialGameState} from '../../../src/game/board';
import {applyAction} from '../../../src/ai/simulate';
import {isLegalAction} from '../../../src/game/legality';
import {getValidMoves} from '../../../src/game/movement';
import {getAllSpawnPositions} from '../../../src/game/spawning';
import {UNIT_DEFINITIONS,getUnitDefinition} from '../../../src/game/units';
import {getAttackModifier} from '../../../src/game/elements';
const OUT=path.resolve('lab/results/handicap-census-2026-09-14');fs.mkdirSync(OUT,{recursive:true});
const base=JSON.parse(fs.readFileSync('lab/results/opening-census-2026-09-14/census.json','utf8'));
for(const [p,h]of Object.entries(base.hashes))if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==h)throw Error('Changed baseline rule '+p);
const coord=(n:number)=>String.fromCharCode(65+n%10)+(1+Math.floor(n/10));
const xy=(n:number)=>({x:n%10,y:Math.floor(n/10)}),pos=(p:any)=>p.y*10+p.x;
const adjacent=Array.from({length:100},(_,n)=>[n>=10?n-10:-1,n<90?n+10:-1,n%10?n-1:-1,n%10<9?n+1:-1].filter(x=>x>=0));
const families=[
 {id:0,name:'Save',cost:0,defs:['fire_1','water_1','plant_1'],buy:null,promote:null,minHandicap:0},
 {id:1,name:'Buy Hi',cost:3,defs:['fire_1','water_1','plant_1','fire_1'],buy:'fire_1',promote:null,minHandicap:3},
 {id:2,name:'Buy Radi',cost:3,defs:['fire_1','water_1','plant_1','lightning_1'],buy:'lightning_1',promote:null,minHandicap:3},
 {id:3,name:'Buy Sjor',cost:4,defs:['fire_1','water_1','plant_1','water_1'],buy:'water_1',promote:null,minHandicap:4},
 {id:4,name:'Buy Gol',cost:4,defs:['fire_1','water_1','plant_1','shadow_1'],buy:'shadow_1',promote:null,minHandicap:4},
 {id:5,name:'Promote Hono',cost:4,defs:['fire_2','water_1','plant_1'],buy:null,promote:0,minHandicap:4},
 {id:6,name:'Promote Straumr',cost:4,defs:['fire_1','water_2','plant_1'],buy:null,promote:1,minHandicap:4},
 {id:7,name:'Promote Sachita',cost:4,defs:['fire_1','water_1','plant_2'],buy:null,promote:2,minHandicap:4},
];
const key=(p:number[],defs:string[])=>p.map((n,i)=>defs[i]+':'+n.toString().padStart(2,'0')).sort().join(',');
function destinations(p:number[],i:number,speed:number,block:number[]=[]){
 const seen=new Set([p[i]]),q=[[p[i],0]],result:number[]=[];
 for(let j=0;j<q.length;j++){const [s,d]=q[j];if(d===speed)continue;for(const n of adjacent[s])if(!seen.has(n)&&!p.includes(n)&&!block.includes(n)){seen.add(n);q.push([n,d+1]);result.push(n);}}
 return result;
}
function enumerate(f:any,block:number[]=[]){
 const start=f.buy?[1,11,10,0]:[1,11,10],nodes:any[]=[{p:start,d:0,parent:-1,unit:-1,to:-1}],seen=new Map([[key(start,f.defs),0]]);let edges=0;
 for(let j=0;j<nodes.length;j++){const n=nodes[j];if(n.d===4)continue;
  if(n.p.some((p:number)=>block.some(b=>Math.abs(p%10-b%10)+Math.abs(Math.floor(p/10)-Math.floor(b/10))===1)))throw Error('Unexpected legal B1 attack: extend enumerator');
  for(let i=0;i<f.defs.length;i++)for(const to of destinations(n.p,i,getUnitDefinition(f.defs[i]).speed,block)){
  edges++;const p=[...n.p];p[i]=to;const k=key(p,f.defs);if(!seen.has(k)){seen.set(k,nodes.length);nodes.push({p,d:n.d+1,parent:j,unit:i,to});}
 }}
 return {nodes,edges,seen};
}
const map=base.initialMap,genus=new Map<string,number>(),species=new Map<string,number>();
const zone=(n:number)=>[0,1,2,10,11,20].includes(n)?'home':map[n]===0?'dry':map[n]===16?(n%10>5?'east expansion':'south expansion'):map[n]===8?'central':n%10+Math.floor(n/10)<=5?'near ground':'outer ground';
function features(p:number[],defs:string[],f:any,d:number){
 const canonical=p.map((n,i)=>({rel:n,definitionId:defs[i],slot:i})).sort((a,b)=>a.definitionId.localeCompare(b.definitionId)||a.rel-b.rel);
 const spawn:number[]=[];for(let n=0;n<100;n++)if(!p.includes(n)&&p.some(a=>n%10<=a%10&&Math.floor(n/10)<=Math.floor(a/10)))spawn.push(n);
 const units=canonical.map(u=>({...u,square:coord(99-u.rel),position:99-u.rel,take:Math.min(getUnitDefinition(u.definitionId).mining,map[u.rel]),terrain:zone(u.rel)}));
 const income=units.reduce((s,u)=>s+u.take,0),next=units.reduce((s,u)=>s+Math.min(getUnitDefinition(u.definitionId).mining,map[u.rel]-u.take),0),second=units.reduce((s,u)=>s+Math.min(getUnitDefinition(u.definitionId).mining,Math.max(0,map[u.rel]-u.take-getUnitDefinition(u.definitionId).mining)),0);
 const rent=units.reduce((s,u)=>s+getUnitDefinition(u.definitionId).tier-1,0);
 const reach=Math.max(...p.map(n=>n%10+Math.floor(n/10))),outside=p.filter(n=>zone(n)!=='home').length;
 const gk=f.id+':'+d+':'+reach+':'+outside;if(!genus.has(gk))genus.set(gk,genus.size+1);
 const band=spawn.length<=5?'small':spawn.length<=12?'medium':spawn.length<=20?'large':'wide';
 const sk=genus.get(gk)+':'+units.map(u=>u.definitionId+'@'+u.terrain).sort().join('/')+':'+income+':'+band;if(!species.has(sk))species.set(sk,species.size+1);
 return {units,income,next,second,rent,reach,outside,spawn:spawn.map(n=>99-n),spawnCount:spawn.length,spawnReserve:spawn.reduce((s,n)=>s+map[n],0),spawnBand:band,order:f.id+1,genus:genus.get(gk),species:species.get(sk)};
}
let productionEdges=0,settlements=0;const patterns:any[]=[];const familyStats:any[]=[];
for(const f of families){
 const e=enumerate(f);const initial=createInitialGameState(undefined,undefined,Math.max(3,f.minHandicap));
 let setup=applyAction(initial,{type:'END_ACTION_PHASE'});
 if(getAllSpawnPositions('black',setup.board).map(pos).join(',')!=='99')throw Error('Unexpected initial spawn');
 const orig=setup.board.units.filter(u=>u.owner==='black');
 if(f.buy)setup=applyAction(setup,{type:'BUY_UNIT',definitionId:f.buy,position:xy(99)});
 if(f.promote!==null)setup=applyAction(setup,{type:'PROMOTE_UNIT',unitId:orig[f.promote].id});
 if(setup.turn.phase==='place')setup=applyAction(setup,{type:'END_PLACE_PHASE'});
 const ids=setup.board.units.filter(u=>u.owner==='black').map(u=>u.id);
 for(const n of e.nodes)if(n.d<4){const board={...setup.board,units:setup.board.units.map(u=>u.owner==='black'?{...u,position:xy(99-n.p[ids.indexOf(u.id)])}:u)};
  for(let i=0;i<ids.length;i++){
   const expected=destinations(n.p,i,getUnitDefinition(f.defs[i]).speed).map(t=>99-t).sort((a,b)=>a-b);
   const got=getValidMoves(board.units.find(u=>u.id===ids[i])!,board).map(pos).sort((a,b)=>a-b);
   if(expected.join(',')!==got.join(','))throw Error('Production successors disagree');productionEdges+=got.length;
  }
 }
 const ordered=e.nodes.map((n,i)=>({...n,index:i})).sort((a,b)=>key(a.p,f.defs).localeCompare(key(b.p,f.defs)));
 for(const n of ordered){let i=n.index;const witness:any[]=[];while(e.nodes[i].parent>=0){const a=e.nodes[i];witness.unshift([a.unit,a.to]);i=a.parent;}
  const fs=features(n.p,f.defs,f,n.d);let s=setup;
  for(const [u,to]of witness){const act={type:'MOVE' as const,unitId:ids[u],to:xy(99-to)};if(!isLegalAction(s,act))throw Error('Bad witness');s=applyAction(s,act);}
  s=applyAction(s,{type:'END_ACTION_PHASE'});
  if(s.players.black.resources!==Math.max(3,f.minHandicap)-f.cost+fs.income||s.players.black.resourcesGained!==fs.income||s.inactivityPlies!==2)throw Error('Settlement mismatch');settlements++;
  const baseId=base.states.find((b:any)=>b.p.join(',')===n.p.slice(0,3).join(','))?.id??null;
  patterns.push({id:patterns.length+1,family:f.id,familyName:f.name,minHandicap:f.minHandicap,spent:f.cost,p:n.p,definitions:f.defs,minActions:n.d,key:key(n.p,f.defs),witness,witnessText:witness.map(([u,t])=>getUnitDefinition(f.defs[u]).name+(u===3?' (new)':'')+' '+coord(99-t)).join('; ')||'End turn',baseId,...fs});
 }
 familyStats.push({...f,patterns:ordered.length,edges:e.edges});console.log(f.name,ordered.length,'positions');
}
// Fresh searches with every White blocker placement prove all and only the
// non-overlapping Cartesian pairs are reachable, including identical-piece merges.
let freshEdges=0,joint3=0,joint4=0,collisions3=0,collisions4=0;
for(const w of base.states){const block=w.p.map((n:number)=>99-n);
 for(const f of families){const e=enumerate(f,block);freshEdges+=e.edges;const fp=patterns.filter(p=>p.family===f.id);const legal=fp.filter(p=>p.p.every((n:number)=>!block.includes(n)));
  if(e.nodes.length!==legal.length||legal.some(p=>!e.seen.has(p.key)))throw Error('Cross product audit failed');joint4+=legal.length;collisions4+=fp.length-legal.length;if(f.minHandicap<=3){joint3+=legal.length;collisions3+=fp.length-legal.length;}
 }
 if(w.id%100===0)console.log('Fresh Black searches',w.id,'/797');
}
const definitions=UNIT_DEFINITIONS.map((d,i)=>({...d,index:i}));
const result={createdAt:new Date().toISOString(),baselineHashes:base.hashes,whiteStates:base.states,initialMap:map,definitions,families:familyStats,patterns,counts:{white:797,patterns3:patterns.filter(p=>p.minHandicap<=3).length,patterns4:patterns.length,joint3,joint4,collisions3,collisions4,orders3:3,orders4:8,genera:genus.size,species:species.size},genusKeys:[...genus],speciesKeys:[...species],validation:{productionEdges,settlements,freshEdges},modifier:definitions.map(d=>definitions.map(t=>getAttackModifier(d.element,t.element)))};
fs.writeFileSync(path.join(OUT,'census.json'),JSON.stringify(result));
console.log(JSON.stringify({counts:result.counts,validation:result.validation}));
