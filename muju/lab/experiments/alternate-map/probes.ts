import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {maps,coord,at,centralRich} from './maps';
import {createInitialGameState,createUnit} from '../../../src/game/board';
import {getUnitDefinition} from '../../../src/game/units';
import {getValidMoves,getMoveCost} from '../../../src/game/movement';
import {getAllSpawnPositions} from '../../../src/game/spawning';
import {projectedIncome} from '../../../src/game/mining';
import {isLegalAction,phaseEndAction} from '../../../src/game/legality';
import {applyAction} from '../../../src/ai/simulate';
import {checkInvariants} from '../../harness/invariants';
import type {GameState} from '../../../src/game/types';
import type {AIAction} from '../../../src/ai/types';
const OUT=new URL('../../results/alternate-map-2026-09-12/',import.meta.url);
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
const geometry=Object.fromEntries(Object.entries(maps).map(([id,cells])=>[id,{
 total:sum(cells),histogram:Object.fromEntries([0,4,8,10].map(n=>[n,cells.filter(x=>x===n).length])),
 homeRadii:Object.fromEntries([2,3,4,5,6].map(radius=>[radius,sum(cells.filter((_,i)=>i%10+Math.floor(i/10)<=radius))])),
 centerPatch:sum(centralRich.map(i=>cells[i])),
 deltas:cells.flatMap((n,i)=>n!==maps.current[i]?[{cell:coord(i),from:maps.current[i],to:n}]:[]),
}]));
const residence=[2,3,4,5].flatMap(mining=>[4,8,10].map(reserve=>({mining,reserve,fullTurns:Math.floor(reserve/mining),totalVisits:Math.ceil(reserve/mining),takes:Array.from({length:5},(_,i)=>Math.min(mining,Math.max(0,reserve-i*mining)))})));
// All initial movement costs identical: only reserves differ.
const starts=Object.values(maps).map(c=>createInitialGameState(c));
const ranges=starts.map(s=>s.board.units.map(u=>Array.from({length:100},(_,i)=>getMoveCost(u.position,{x:i%10,y:Math.floor(i/10)},getUnitDefinition(u.definitionId).speed,s.board))));
for(const r of ranges.slice(1))assert.deepEqual(r,ranges[0]);
const anchors=['C3','B4','D5','E5','F5','H2'].map(label=>{
 const p=at(label),s=createInitialGameState(),fire=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
 const position={x:p%10,y:Math.floor(p/10)};
 const muju=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='plant_1')!;
 const costs={hi:getMoveCost(fire.position,position,2,s.board),muju:getMoveCost(muju.position,position,1,s.board)};
 const board={...s.board,units:s.board.units.map(u=>u.id===fire.id?{...u,position}:u)};
 const blocked={...board,units:[...board.units,createUnit('lightning_1','black',{x:2,y:2})]};
 return {label,costs,spawnSquares:getAllSpawnPositions('white',board).length,spawnSquaresWithEnemyC3:label==='C3'?null:getAllSpawnPositions('white',blocked).length,emptyCentralRich:getAllSpawnPositions('white',board).filter(q=>centralRich.includes(q.y*10+q.x)).map(q=>coord(q.y*10+q.x)),
   richStock:Object.fromEntries(Object.entries(maps).map(([id,cells])=>[id,sum(getAllSpawnPositions('white',board).map(q=>cells[q.y*10+q.x]))]))};
});
type Node={s:GameState,path:AIAction[],income:number[]};
const key=(s:GameState)=>JSON.stringify([s.board.units.filter(u=>u.owner==='white').map(u=>[u.definitionId,u.position]),s.board.cells.flat().map(c=>c.resourceLayers),s.players.white.resources]);
function checked(s:GameState,a:AIAction):GameState{assert(isLegalAction(s,a));const next=applyAction(s,a);assert.notStrictEqual(next,s);return next;}
function score(s:GameState){return s.players.white.resourcesGained+projectedIncome(s,'white')+s.board.units.filter(u=>u.owner==='white').reduce((n,u)=>n+Math.min(3*getUnitDefinition(u.definitionId).mining,s.board.cells[u.position.y][u.position.x].resourceLayers)*0.08,0);}
function trim(nodes:Node[],width:number,rank=score){const unique=new Map<string,Node>();for(const n of nodes){const k=key(n.s);if(!unique.has(k))unique.set(k,n);}return [...unique.values()].sort((a,b)=>rank(b.s)-rank(a.s)).slice(0,width);}
function economicProbe(map:keyof typeof maps,radius:number,width:number){
 let initial=createInitialGameState(maps[map]);
 initial={...initial,board:{...initial.board,units:initial.board.units.map((u,i)=>({...u,id:`start-${i}`}))}};
 let beam:Node[]=[{s:initial,path:[],income:[]}];const horizons=[];
 for(let turn=1;turn<=5;turn++){
  // Fixed wide economy: buy one additional Muju at turns 2 and 3, if affordable.
  let placed:Node[]=[];
  for(const n of beam){
   let nodes=[n];
   if(n.s.turn.phase==='place'&&(turn===2||turn===3)){
    const buys=getAllSpawnPositions('white',n.s.board).filter(p=>p.x+p.y<=radius).map(position=>({type:'BUY_UNIT',definitionId:'plant_1',position}) as AIAction).filter(a=>isLegalAction(n.s,a));
    if(buys.length)nodes=buys.map(a=>{const s=checked(n.s,a);const bought=s.board.units.at(-1)!;s.board={...s.board,units:s.board.units.map(u=>u.id===bought.id?{...u,id:`extra-${turn}`} :u)};return {s,path:[...n.path,a],income:n.income};});
   }
   for(let x of nodes){if(x.s.turn.phase==='place'){const a={type:'END_PLACE_PHASE'} as AIAction;x={...x,s:checked(x.s,a),path:[...x.path,a]};}placed.push(x);}
  }
  let active=trim(placed,width),ends:Node[]=[];
  for(let step=0;step<=4;step++){
   const next:Node[]=[];
   for(const n of active){
    const a={type:'END_ACTION_PHASE'} as AIAction;
    const income=projectedIncome(n.s,'white');
    ends.push({s:checked(n.s,a),path:[...n.path,a],income:[...n.income,income]});
    if(step===4||n.s.turn.actionsRemaining===0)continue;
    for(const u of n.s.board.units.filter(u=>u.owner==='white'))for(const to of getValidMoves(u,n.s.board)){
     if(to.x+to.y>radius)continue;
     const move={type:'MOVE',unitId:u.id,to} as AIAction;
     next.push({s:checked(n.s,move),path:[...n.path,move],income:n.income});
    }
   }
   active=trim(next,width);
  }
  ends=trim(ends,width,s=>s.players.white.resourcesGained+s.board.units.filter(u=>u.owner==='white').reduce((n,u)=>n+Math.min(3*getUnitDefinition(u.definitionId).mining,s.board.cells[u.position.y][u.position.x].resourceLayers)*0.08,0));
  const best=[...ends].sort((a,b)=>b.s.players.white.resourcesGained-a.s.players.white.resourcesGained)[0];
  horizons.push({turn,total:best.s.players.white.resourcesGained,bank:best.s.players.white.resources,income:best.income,positions:best.s.board.units.filter(u=>u.owner==='white').map(u=>({unit:u.id,square:coord(u.position.y*10+u.position.x)})),path:best.path});
  beam=ends.filter(n=>n.s.phase==='playing').map(n=>{let s=n.s,path=[...n.path];while(s.phase==='playing'&&s.turn.currentPlayer==='black'){const a=phaseEndAction(s);s=checked(s,a);path.push(a);}return {...n,s,path};});
  if(!beam.length)break;
 }
 // Replay every selected witness independently, normalizing purchased ids.
 for(const h of horizons){let s=initial;let extra=2;for(const a of h.path){s=checked(s,a);if(a.type==='BUY_UNIT'){const id=s.board.units.at(-1)!.id;s={...s,board:{...s.board,units:s.board.units.map(u=>u.id===id?{...u,id:`extra-${extra++}`} :u)}};}checkInvariants(s,'economic replay');}assert.equal(s.players.white.resourcesGained,h.total);}
 return {map,radius,width,horizons};
}
const probes=[];
for(const map of ['current','alternate'] as const)for(const radius of [2,3,6])for(const width of [64,256]){
 const result=economicProbe(map,radius,width);probes.push(result);console.log('PROBE',map,radius,width,result.horizons.map(x=>x.total));
 writeFileSync(new URL('probes.json',OUT),JSON.stringify({geometry,residence,anchors,identicalInitialMovement:true,probes},null,2));
}
