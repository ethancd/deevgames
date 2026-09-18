import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createInitialGameState } from '../../../src/game/board';
import { getValidMoves, executeMove } from '../../../src/game/movement';
import { endTurn } from '../../../src/game/turn';
import { UNEQUAL_ROUTES_MAP } from '../../../src/game/resourceMap';

const out = path.resolve(process.argv[2] ?? 'lab/results/opening-census-2026-09-14');
fs.mkdirSync(out,{recursive:true});
const initial=createInitialGameState();
const pos=(p:any)=>p.y*10+p.x;
const xyz=(n:number)=>({x:n%10,y:Math.floor(n/10)});
const coord=(n:number)=>String.fromCharCode(65+n%10)+(1+Math.floor(n/10));
const key=(p:number[])=>p.join(',');
const start=[1,11,10], speeds=[2,1,1];
const adjacent=Array.from({length:100},(_,n)=>[n>=10?n-10:-1,n<90?n+10:-1,n%10?n-1:-1,n%10<9?n+1:-1].filter(x=>x>=0));
function destinations(p:number[],i:number){
 const seen=new Set([p[i]]), q=[[p[i],0]],result:number[]=[];
 for(let j=0;j<q.length;j++) { const [s,d]=q[j]; if(d===speeds[i])continue;
  for(const n of adjacent[s])if(!seen.has(n)&&!p.includes(n)){seen.add(n);q.push([n,d+1]);result.push(n);}
 } return result;
}
const nodes:any[]=[{p:start,d:0,parent:-1,unit:-1,to:-1,ways:1}];
const index=new Map([[key(start),0]]);
const layerCounts:number[]=[];
let edges=0;
for(let cursor=0;cursor<nodes.length;cursor++){
 const n=nodes[cursor]; layerCounts[n.d]=(layerCounts[n.d]??0)+1;
 if(n.d===4)continue;
 for(let i=0;i<3;i++)for(const to of destinations(n.p,i)){
  edges++;const p=[...n.p];p[i]=to;const k=key(p),old=index.get(k);
  if(old===undefined){index.set(k,nodes.length);nodes.push({p,d:n.d+1,parent:cursor,unit:i,to,ways:n.ways});}
  else if(nodes[old].d===n.d+1) nodes[old].ways+=n.ways;
 }
}
let verifiedDestinations=0;
for(const n of nodes){
 const board={...initial.board,units:initial.board.units.map((u,j)=>j<3?{...u,position:xyz(n.p[j])}:u)};
 if(n.d<4)for(let i=0;i<3;i++){
  const a=destinations(n.p,i).sort((a,b)=>a-b);
  const b=getValidMoves(board.units[i],board).map(pos).sort((a,b)=>a-b);
  if(key(a)!==key(b))throw Error('Engine move disagreement '+key(n.p));
  verifiedDestinations+=a.length;
 }
}
function witness(idx:number){const moves:any[]=[];while(nodes[idx].parent>=0){const n=nodes[idx];moves.unshift([n.unit,n.to]);idx=n.parent;}return moves;}
const ordered=nodes.map((n,i)=>({...n,witness:witness(i)})).sort((a,b)=>key(a.p).localeCompare(key(b.p),undefined,{numeric:true}));
const stateRecords=ordered.map((n,i)=>({id:i+1,p:n.p,minActions:n.d,shortestSequences:n.ways,witness:n.witness,
 witnessText:n.witness.map(([u,t]:number[])=>['Hi','Sjor','Muju'][u]+' '+coord(t)).join('; ')||'End turn'}));
let collisions=0;
for(const w of stateRecords)for(const b of stateRecords)if(w.p[0]===99-b.p[0])collisions++;
// Replay every canonical witness with the production move and turn-settlement functions.
for(const n of stateRecords){let state=initial;
 for(const [i,to] of n.witness){const u=state.board.units[i];if(!getValidMoves(u,state.board).some(p=>pos(p)===to))throw Error('Invalid witness');
 state={...state,board:executeMove(state.board,u.id,xyz(to)),turn:{...state.turn,actionsRemaining:state.turn.actionsRemaining-1}};}
 state=endTurn(state);
 const expected=n.p.reduce((s,p,i)=>s+Math.min([1,2,3][i],UNEQUAL_ROUTES_MAP[p]),0);
 if(state.players.white.resources!==expected||state.turn.currentPlayer!=='black')throw Error('Settlement mismatch');
}
const sourceFiles=['SPEC.md','src/game/board.ts','src/game/movement.ts','src/game/turn.ts','src/game/resourceMap.ts','src/game/units.ts','src/game/combat.ts','src/game/spawning.ts','src/game/building.ts','src/game/promotion.ts','src/game/rules.ts'];
const hashes=Object.fromEntries(sourceFiles.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const result={createdAt:new Date().toISOString(),rules:'v2.8',handicap:0,actions:4,initialMap:UNEQUAL_ROUTES_MAP,initialState:initial,
 count:stateRecords.length,layerCounts,edges,verifiedDestinations,collisions,jointCount:stateRecords.length**2-collisions,hashes,states:stateRecords};
fs.writeFileSync(path.join(out,'census.json'),JSON.stringify(result));
console.log(JSON.stringify({...result,initialMap:undefined,initialState:undefined,states:undefined},null,2));
