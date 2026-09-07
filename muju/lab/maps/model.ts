import { UNIT_DEFINITIONS, getUnitDefinition } from '../../src/game/units';
import type { UnitDefinition } from '../../src/game/types';
import { power } from '../solver/model';
import { distance, xy, REGIONS, type MineralMap } from './maps';
export interface MineSolution { income: number; actions: number; wells: number[] }
/** Exact open-board single-unit mine route; movement may cross cells outside the district.
 * Fresh well yield is min(M, capacity); each well pays at most once to this unit.
 * Exhaustive event sequences are complete: non-mining moves can be replaced by a shortest path.
 */
export function mineRoute(map: MineralMap, mining: number, speed: number, start: number, wells: number[], budget=6, depths:readonly number[]=Array(100).fill(0)): MineSolution {
 let best: MineSolution={income:0,actions:0,wells:[]};
 const yields=wells.map(p=>Math.max(0,Math.min(mining,map.cells[p])-depths[p]));
 const largest=Math.max(0,...yields), used=new Set<number>(), path:number[]=[];
 function visit(pos:number,left:number,total:number) {
  const actions=budget-left;
  if(total>best.income || total===best.income&&actions<best.actions) best={income:total,actions,wells:[...path]};
  // At most one zero-distance mine, then each further mine needs >=1 move + 1 mine.
  if(total+Math.ceil(left/2)*largest<best.income) return;
  for(let i=0;i<wells.length;i++) if(yields[i]>0&&!used.has(i)) {
   const p=wells[i], cost=Math.ceil(distance(pos,p)/speed)+1;
   if(cost>left) continue;
   used.add(i);path.push(p);visit(p,left-cost,total+yields[i]);path.pop();used.delete(i);
  }
 }
 if(mining>0) visit(start,budget,0);
 return best;
}
export function routeCurve(map:MineralMap, unit:Pick<UnitDefinition,'mining'|'speed'>,start:number,wells:number[],budget=6,depths:readonly number[]=Array(100).fill(0)) {
 return Array.from({length:budget+1},(_,a)=>mineRoute(map,unit.mining,unit.speed,start,wells,a,depths));
}
export function mapSummary(map:MineralMap) {
 const layers=Array.from({length:6},(_,m)=>map.cells.reduce((s,v)=>s+Math.min(m,v),0));
 const seen=new Set<number>(),clusters:{cells:number[];resources:number}[]=[];
 for(let p=0;p<100;p++) if(map.cells[p]>=4&&!seen.has(p)) {
  const queue=[p];seen.add(p);
  for(let i=0;i<queue.length;i++) for(const n of neighbors[queue[i]]) if(map.cells[n]>=4&&!seen.has(n)){seen.add(n);queue.push(n);}
  clusters.push({cells:queue,resources:queue.reduce((s,q)=>s+map.cells[q],0)});
 }
 let seams=0;for(let p=0;p<100;p++)for(const q of neighbors[p])if(q>p&&map.cells[p]!==map.cells[q])seams++;
 return {total:layers[5],accessibleByMining:layers,marginalLayers:layers.slice(1).map((v,i)=>v-layers[i]),
  histogram:Array.from({length:6},(_,d)=>map.cells.filter(v=>v===d).length),clusters,
  largestRichCluster:Math.max(0,...clusters.map(c=>c.resources)),seams,
  centralFour:[44,45,54,55].reduce((s,p)=>s+map.cells[p],0),
  rotational:map.cells.every((v,p)=>v===map.cells[99-p]),
  reflectionX:map.cells.every((v,p)=>v===map.cells[Math.floor(p/10)*10+9-p%10]),
 };
}
const neighbors=Array.from({length:100},(_,p)=>Array.from({length:100},(_,q)=>q).filter(q=>distance(p,q)===1));
export interface Step { turn:number; kind:'move'|'mine'|'promote'|'wait'; unit:number; at:number; amount?:number }
interface Node { positions:number[]; depths:string; gross:number; cash:number; tier:number; parent?:Node; step?:Step; score:number }
export interface Opening { policy:string;width:number;actionsPerTurn?:number;turns:{turn:number;gross:number;cash:number;tier:number;positions:number[];objectiveScore:number;searchWidth:number;path:Step[]}[] }
export const POLICIES=['bank','plant','home','east','south','center'] as const;
function moves(positions:number[],unit:number,speed:number,homeOnly:boolean) {
 const blocked=new Set([...positions.filter((_,i)=>i!==unit),88,89,98]),start=positions[unit];
 const visited=new Set([start]),queue=[{p:start,d:0}],out:number[]=[];
 for(let i=0;i<queue.length;i++) {const {p,d}=queue[i];if(d===speed)continue;
  for(const n of neighbors[p])if(!visited.has(n)&&!blocked.has(n)&&(!homeOnly||(n%10<4&&n<40))) {
   visited.add(n);queue.push({p:n,d:d+1});out.push(n);
  }
 }
 return out;
}
function history(node:Node):Step[] { const path:Step[]=[];let n:Node|undefined=node;while(n){if(n.step)path.push(n.step);n=n.parent;}return path.reverse(); }
function merit(n:Node,map:MineralMap,policy:string) {
 const powers=[1,2,getUnitDefinition(`plant_${n.tier}`).mining];
 // One-step potential breaks income ties without declaring a strategic value of position.
 let potential=0;for(let i=0;i<3;i++) {const p=n.positions[i];let best=0;
  for(const q of [p,...neighbors[p]]) best=Math.max(best,Math.max(0,Math.min(powers[i],map.cells[q])-Number(n.depths[q]))/(q===p?1:2));potential+=best; }
 const target=policy==='east'?17:policy==='south'?71:policy==='center'?44:null;
 // Separate, explicit destination-seeking probes; not pooled with income optimization.
 const progress=target===null?0:Math.max(...n.positions.map(p=>18-distance(p,target)))*0.4;
 return n.gross+potential*0.15+progress;
}
/** Beam-search FEASIBLE income witnesses: actual three starters, shared depletion,
 * six actions/own turn, blocking, and optional affordable Plant promotions.
 * Black starters stay fixed and take no actions. No purchasing, combat or protection costs.
 * Width truncation means lower bounds, never an optimality claim without a matching upper bound.
 */
export function opening(map:MineralMap,policy:string,width=256,horizon=5,actionsPerTurn=6):Opening {
 let beam:Node[]=[{positions:[1,11,10],depths:'0'.repeat(100),gross:0,cash:0,tier:1,score:0}];
 const turns:Opening['turns']=[];
 for(let turn=1;turn<=horizon;turn++) {
  if(policy==='plant'&&turn>1) beam=beam.map(n=>{
   if(n.tier===4)return n;const cost=getUnitDefinition(`plant_${n.tier+1}`).cost-getUnitDefinition(`plant_${n.tier}`).cost;
   return n.cash<cost?n:{...n,cash:n.cash-cost,tier:n.tier+1,parent:n,step:{turn,kind:'promote',unit:2,at:n.positions[2]}};
  });
  for(let action=0;action<actionsPerTurn;action++) {
   const candidates=new Map<string,Node>();
   const put=(n:Node)=>{const k=n.positions.join(',')+'/'+n.tier+'/'+n.depths;const old=candidates.get(k);
    if(!old||n.gross>old.gross){n.score=merit(n,map,policy);candidates.set(k,n);} };
   for(const n of beam) {
    put({...n,parent:n,step:{turn,kind:'wait',unit:0,at:n.positions[0]}});
    for(let u=0;u<3;u++) {
     const def=getUnitDefinition(u===0?'fire_1':u===1?'water_1':`plant_${n.tier}`),p=n.positions[u];
     const mined=Number(n.depths[p]),yieldHere=Math.max(0,Math.min(def.mining,map.cells[p])-mined);
     if(yieldHere>0) put({...n,depths:n.depths.slice(0,p)+(mined+yieldHere)+n.depths.slice(p+1),gross:n.gross+yieldHere,cash:n.cash+yieldHere,parent:n,step:{turn,kind:'mine',unit:u,at:p,amount:yieldHere}});
     for(const q of moves(n.positions,u,def.speed,policy==='home')) {const positions=[...n.positions];positions[u]=q;put({...n,positions,parent:n,step:{turn,kind:'move',unit:u,at:q}});}
    }
   }
   beam=[...candidates.values()].sort((a,b)=>b.score-a.score||b.cash-a.cash||a.positions.join(',').localeCompare(b.positions.join(','))).slice(0,width);
  }
  const incomePolicy=['bank','plant','home'].includes(policy);
  const best=beam.reduce((a,b)=>(incomePolicy ? b.gross>a.gross||b.gross===a.gross&&b.score>a.score : b.score>a.score)?b:a);
  turns.push({turn,gross:best.gross,cash:best.cash,tier:best.tier,positions:best.positions,objectiveScore:best.score,searchWidth:width,path:history(best)});
 }
 return {policy,width,actionsPerTurn,turns};
}
/** Optimistic independent starters: ignore blocking/shared depletion/travel distances.
 * Each piece mines at most ceil(actions/2) fresh wells. No new units or promotions.
 */
export function starterUpperBound(map:MineralMap,actions:number):number {
 let best=0;for(let f=0;f<=actions;f++)for(let w=0;w<=actions-f;w++) {
  const p=actions-f-w;
  const income=[f,w,p].reduce((s,a,i)=>s+map.cells.map(v=>Math.min(v,[1,2,3][i])).sort((x,y)=>y-x).slice(0,Math.ceil(a/2)).reduce((x,y)=>x+y,0),0);
  best=Math.max(best,income);
 }return best;
}
/** Conditional financing from a witnessed gross-income schedule; target upgrades do
 * not feed back into this schedule. This is neither a full opening nor earliest optimal access.
 */
export function finance(target:UnitDefinition,incomes:number[],horizon=8) {
 const line=UNIT_DEFINITIONS.filter(u=>u.element===target.element);
 let tier=['fire','water','plant'].includes(target.element)?1:0,cash=0,ready=0,previous=0;
 for(let turn=1;turn<=horizon;turn++) {
  let placed=false;if(ready===turn){tier=1;placed=true;}
  if(!placed&&turn>1&&tier>0&&tier<target.tier&&cash>=line[tier].cost-line[tier-1].cost){cash-=line[tier].cost-line[tier-1].cost;tier++;}
  if(tier>=target.tier)return turn;
  const total=incomes[turn-1]??previous;cash+=total-previous;previous=total;
  if(tier===0&&!ready&&cash>=line[0].cost){cash-=line[0].cost;ready=turn+line[0].buildTime;}
 }
 return null;
}
export function geographicRoles(map:MineralMap) {
 const cache=new Map<string,MineSolution[]>();
 const curve=(u:Pick<UnitDefinition,'mining'|'speed'>,region:typeof REGIONS[number],stripped=false,fromHome=false)=>{
  const key=[u.mining,u.speed,region.id,stripped,fromHome].join('/');if(!cache.has(key))cache.set(key,routeCurve(map,u,fromHome?11:region.start,region.cells,6,stripped?map.cells.map(v=>Math.min(3,v)):undefined));return cache.get(key)!;
 };
 const values=UNIT_DEFINITIONS.map(u=>({id:u.id,regions:REGIONS.map(r=>({id:r.id,curve:curve(u,r),
  speedPlus:curve({...u,speed:u.speed+1},r)[6].income-curve(u,r)[6].income,
  miningPlus:curve({...u,mining:Math.min(5,u.mining+1)},r)[6].income-curve(u,r)[6].income,
  strippedCurve:curve(u,r,true),
  strippedSpeedPlus:curve({...u,speed:u.speed+1},r,true)[6].income-curve(u,r,true)[6].income,
  strippedMiningPlus:curve({...u,mining:Math.min(5,u.mining+1)},r,true)[6].income-curve(u,r,true)[6].income,
  travelCurve:curve(u,r,false,true),travelSpeedPlus:curve({...u,speed:u.speed+1},r,false,true)[6].income-curve(u,r,false,true)[6].income,
  travelMiningPlus:curve({...u,mining:Math.min(5,u.mining+1)},r,false,true)[6].income-curve(u,r,false,true)[6].income,
  strippedTravelCurve:curve(u,r,true,true),strippedTravelSpeedPlus:curve({...u,speed:u.speed+1},r,true,true)[6].income-curve(u,r,true,true)[6].income,
  strippedTravelMiningPlus:curve({...u,mining:Math.min(5,u.mining+1)},r,true,true)[6].income-curve(u,r,true,true)[6].income}))}));
 const roles=Object.fromEntries(UNIT_DEFINITIONS.map(u=>[u.id,{cheapest:0,sole:0,witnesses:[] as string[]} ]));
 let missions=0;
 function mission(name:string,eligible:UnitDefinition[]) {
  missions++;if(!eligible.length)return;const price=Math.min(...eligible.map(u=>u.cost)),best=eligible.filter(u=>u.cost===price);
  for(const u of best){const r=roles[u.id];r.cheapest++;if(best.length===1){r.sole++;if(r.witnesses.length<3)r.witnesses.push(name);}}
 }
 for(const stripped of [false,true])for(const r of REGIONS)for(let budget=1;budget<=6;budget++)for(let goal=1;goal<=15;goal++)for(const guard of [null,...UNIT_DEFINITIONS]) {
  mission(`${r.name} (${stripped?'top 3 removed':'fresh'}): extract ${goal} in ${budget} actions, survive ${guard?.id??'no'} hit`,UNIT_DEFINITIONS.filter(u=>curve(u,r,stripped)[budget].income>=goal&&(!guard||u.defense>power(guard,u))));
 }
 for(const r of REGIONS)for(const target of UNIT_DEFINITIONS)for(let budget=1;budget<=6;budget++)for(let mine=0;mine<=5;mine++) {
  // Arrive at the named square from home corner, optionally mine, then hit an adjacent defender.
  mission(`Home→${r.name}: mine ${mine}, eliminate adjacent ${target.id}, ${budget} actions`,UNIT_DEFINITIONS.filter(u=>
   Math.min(map.cells[r.start],u.mining)>=mine&&Math.ceil(distance(0,r.start)/u.speed)+Number(mine>0)+1<=budget&&power(u,target)>=target.defense));
 }
 for(const r of REGIONS)for(let budget=1;budget<=6;budget++)for(const guard of UNIT_DEFINITIONS) {
  mission(`Home→${r.name}: occupy within ${budget} moves, survive ${guard.id}`,UNIT_DEFINITIONS.filter(u=>Math.ceil(distance(0,r.start)/u.speed)<=budget&&u.defense>power(guard,u)));
 }
 return {missions,values,roles};
}
export function geometry(map:MineralMap) {
 return REGIONS.map(r=>{
  const distanceWhite=Math.min(...[1,10,11].map(p=>distance(p,r.start))),distanceBlack=Math.min(...[88,89,98].map(p=>distance(p,r.start)));
  const [x,y]=xy(r.start),rect=Array.from({length:100},(_,p)=>p).filter(p=>p%10<=x&&Math.floor(p/10)<=y);
  const invasion=Math.min(...[88,89,98].flatMap(p=>rect.map(q=>distance(p,q))));
  return {id:r.id,resources:r.cells.reduce((s,p)=>s+map.cells[p],0),deepWells:r.cells.filter(p=>map.cells[p]>=4).length,
   distanceWhite,distanceBlack,spawnRectangleCells:rect.length,resourcesInSpawnRectangle:rect.reduce((s,p)=>s+map.cells[p],0),
   lightningActionsToBlock:Math.ceil(invasion/3),
   arrivals:UNIT_DEFINITIONS.map(u=>({id:u.id,whiteMoves:Math.ceil(distanceWhite/u.speed),blackMoves:Math.ceil(distanceBlack/u.speed)}))};
 });
}
