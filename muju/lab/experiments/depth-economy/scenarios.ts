import {readFileSync} from 'node:fs';
import {createInitialGameState,createUnit} from './.sandbox/src/game/board';
import {getUnitDefinition as def,UNIT_DEFINITIONS} from './.sandbox/src/game/units';
import {setEconomy,depthValue} from './.sandbox/src/game/economy';
import {calculateMiningYield} from './.sandbox/src/game/mining';
import {instantiateTactics} from './.sandbox/src/ai/wasm/kernel';
import {SearchBudget} from './.sandbox/src/ai/runtime';
import {route,save,xy} from './common';
const rect=(x:number,y:number,w:number,h:number)=>Array.from({length:w*h},(_,i)=>(y+Math.floor(i/w))*10+x+i%w);
const regions=[{name:'home',cells:rect(0,0,3,3),start:11},{name:'empty-approach',cells:rect(3,0,3,3),start:13},{name:'four-layer-shelf',cells:rect(0,3,3,3),start:31},{name:'deep-expansion',cells:rect(6,1,3,3),start:26},{name:'shallow-center',cells:rect(3,3,4,4),start:44},{name:'western-pocket',cells:rect(1,6,3,3),start:62}];
const rows=[],payback=[],freshYields=[];
for(const economy of ['A','B','C'] as const){setEconomy(economy);
 const initial=createInitialGameState();freshYields.push({economy,totalValue:initial.board.cells.flat().reduce((n,c)=>n+depthValue(0,c.resourceLayers),0),layers:initial.board.cells.flat().reduce((n,c)=>n+c.resourceLayers,0),units:UNIT_DEFINITIONS.map(d=>({id:d.id,fresh5:depthValue(0,d.mining),fourth: d.mining>=4?depthValue(3,1):0,fifth:d.mining>=5?depthValue(4,1):0}))});
 for(const region of regions)for(const condition of ['fresh','skim3','skim4','depleted']){
  const s=createInitialGameState();s.board.units=[];
  for(const c of s.board.cells.flat()){const capacity=c.resourceLayers,depth=condition==='fresh'?0:condition==='depleted'?capacity:Math.min(capacity,condition==='skim3'?3:4);c.resourceLayers-=depth;c.minedDepth=depth;}
  for(const id of ['plant_1','plant_2','plant_3','metal_1','metal_2','metal_3']){
   const u=createUnit(id,'white',xy(region.start),true);s.board.units=[u];
   rows.push({economy,region:region.name,condition,id,start:region.start,route:route(s,u,6,region.cells),rent:def(id).tier-1,scope:'exact six-action route on static open board; no enemy, no purchases'});
  }
  // Restrict multi-turn witnesses to finite deep district. A common timeline is used
  // in both branches. At promotion current-turn T2 rent has already been paid.
  const wells=region.cells.filter(p=>initial.board.cells[Math.floor(p/10)][p%10].resourceLayers>=4);
  if(wells.length>0&&wells.length<=8)for(const turns of [1,2,3]){
   const r2=route(s,createUnit('plant_2','white',xy(region.start),true),6*turns,wells);
   const r3=route(s,createUnit('plant_3','white',xy(region.start),true),6*turns,wells);
   payback.push({economy,region:region.name,condition,turns,budget:6*turns,routeT2:r2,routeT3:r3,extraGross:r3.income-r2.income,extraRent:turns-1,promotionCost:6,net:r3.income-r2.income-6-(turns-1),scope:'optimistic pooled action budget across own turns; prefix affordability and turn packing not proven'});
  }
 }
}
// Exact target-removal witnesses using the production tactical kernel: mining
// payout never enters combat. Queued reinforcements cannot act this enemy turn.
const solve=await instantiateTactics(readFileSync(new URL('./.sandbox/src/ai/wasm/tactics.wasm',import.meta.url)));
const tactics=[];
for(const target of ['plant_2','plant_3','metal_3'])for(const attackers of [['fire_2'],['fire_1','fire_1'],['lightning_3']]){
 const s=createInitialGameState();s.turn={currentPlayer:'black',phase:'action',actionsRemaining:6,turnNumber:8};
 const victim=createUnit(target,'white',xy(16),true);victim.id='target';
 s.board.units=[victim,...attackers.map((id,i)=>createUnit(id,'black',xy(i?6:17),true))];
 const result=solve(s,victim.id,2000000,new SearchBudget(Infinity,Infinity));
 tactics.push({target,attackers,result,scope:'exact current enemy turn; adjacent authored attackers; no economic feasibility claim'});
}
setEconomy('A');save('scenarios',{freshYields,regions,rows,payback,tactics});console.log(JSON.stringify({routes:rows.length,multiTurnBounds:payback.length,tactics:tactics.length}));
