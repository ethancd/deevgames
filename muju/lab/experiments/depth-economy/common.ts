import {mkdirSync,appendFileSync,writeFileSync,readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import type {GameState,PlayerId,Unit} from './.sandbox/src/game/types';
import {getUnitDefinition as def} from './.sandbox/src/game/units';
import {depthValue, type Economy} from './.sandbox/src/game/economy';
export const OUT='lab/results/depth-economy-2026-09-09';
mkdirSync(OUT,{recursive:true});
export const seats=['white','black'] as const;
export const other=(p:PlayerId):PlayerId=>p==='white'?'black':'white';
export const xy=(p:number)=>({x:p%10,y:Math.floor(p/10)});
export const pos=(u:{position:{x:number;y:number}})=>u.position.y*10+u.position.x;
export const distance=(a:number,b:number)=>Math.abs(a%10-b%10)+Math.abs(Math.floor(a/10)-Math.floor(b/10));
export const hash=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export const sourceHash=hash(readFileSync(`${OUT}/production-manifest.json`,'utf8')+readFileSync(`${OUT}/engine-patches.json`,'utf8'));
export function save(name:string,value:unknown){writeFileSync(`${OUT}/${name}.json`,JSON.stringify(value,null,2)+'\n');}
export function append(name:string,value:unknown){appendFileSync(`${OUT}/${name}.jsonl.gz`,gzipSync(JSON.stringify(value)+'\n'));}
export function assets(s:GameState,p:PlayerId){return s.players[p].resources+s.players[p].buildQueue.reduce((n,q)=>n+def(q.definitionId).cost,0)+s.board.units.filter(u=>u.owner===p).reduce((n,u)=>n+def(u.definitionId).cost,0);}
export function summaryState(s:GameState){return {turn:s.turn.turnNumber,player:s.turn.currentPlayer,phase:s.turn.phase,quiet:s.inactivityPlies??0,
  remainingLayers:s.board.cells.flat().reduce((n,c)=>n+c.resourceLayers,0),remainingValue:s.board.cells.flat().reduce((n,c)=>n+depthValue(c.minedDepth,c.resourceLayers),0),
  players:Object.fromEntries(seats.map(p=>[p,{cash:s.players[p].resources,income:s.players[p].resourcesGained,spent:s.players[p].resourcesSpent,upkeep:s.players[p].resourcesUpkeep??0,assets:assets(s,p),queue:s.players[p].buildQueue.map(q=>q.definitionId),units:s.board.units.filter(u=>u.owner===p).map(u=>({id:u.id,def:u.definitionId,at:pos(u)}))}]))};}

/** Exact finite route over a fixed occupied board; other units do not move or attack.
 * Complete mining-event enumeration with shortest physical paths. All future
 * units/contests are excluded; this is a static route opportunity, not a guarantee. */
export function route(s:GameState,u:Unit,budget=6,only?:number[]) {
 const blocked=new Set(s.board.units.filter(v=>v.id!==u.id).map(pos)),d=def(u.definitionId),cells=s.board.cells.flat();
 const targets=(only??cells.map((_,i)=>i)).filter(p=>!blocked.has(p)&&Math.min(cells[p].resourceLayers,d.mining-cells[p].minedDepth)>0);
 const yields=targets.map(p=>depthValue(cells[p].minedDepth,Math.max(0,Math.min(cells[p].resourceLayers,d.mining-cells[p].minedDepth))));
 const distances=new Map<number,number[]>();
 const from=(start:number)=>{if(distances.has(start))return distances.get(start)!;const ds=Array(100).fill(Infinity),q=[start];ds[start]=0;
  for(let i=0;i<q.length;i++){const a=q[i];for(const b of [a%10? a-1:-1,a%10<9?a+1:-1,a>=10?a-10:-1,a<90?a+10:-1])if(b>=0&&!blocked.has(b)&&ds[b]===Infinity){ds[b]=ds[a]+1;q.push(b);}}
  distances.set(start,ds);return ds;};
 let best={income:0,actions:0,wells:[] as number[]};const used=new Set<number>(),path:number[]=[];
 const visit=(p:number,left:number,income:number)=>{if(income>best.income||income===best.income&&budget-left<best.actions)best={income,actions:budget-left,wells:[...path]};
  const ds=from(p);for(let i=0;i<targets.length;i++){const q=targets[i],cost=Math.ceil(ds[q]/d.speed)+1;if(used.has(q)||cost>left)continue;used.add(q);path.push(q);visit(q,left-cost,income+yields[i]);path.pop();used.delete(q);}};
 visit(pos(u),budget,0);return best;
}
export function miningOpportunity(s:GameState,u:Unit){
 const fifth=s.board.cells.flat().filter(c=>c.minedDepth<=4&&c.minedDepth+c.resourceLayers===5);
 const occupied=new Set(s.board.units.filter(v=>v.id!==u.id).map(pos));
 const enemies=s.board.units.filter(v=>v.owner!==u.owner&&def(v.definitionId).attack>0);
 const accessible=fifth.filter(c=>!occupied.has(pos(c))&&distance(pos(c),pos(u))<=5);
 const unthreatened=accessible.filter(c=>!enemies.some(e=>distance(pos(e),pos(c))<=def(e.definitionId).speed*5+1));
 return {fifthRemaining:fifth.length,nearbyUnoccupiedFifth:accessible.length,nearbyOutsideEnemyOptimisticOneTurnReach:unthreatened.length,
  routeT2:route(s,{...u,definitionId:'plant_2'}),routeT3:route(s,{...u,definitionId:'plant_3'})};
}
export type StudyEconomy=Economy;
