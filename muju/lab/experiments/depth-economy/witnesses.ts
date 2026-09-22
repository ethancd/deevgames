import assert from 'node:assert/strict';
import {createInitialGameState,createUnit} from './.sandbox/src/game/board';
import {applyAction} from './.sandbox/src/ai/simulate';
import {setEconomy,depthValue} from './.sandbox/src/game/economy';
import {calculateMiningYield} from './.sandbox/src/game/mining';
import {getMoveCost} from './.sandbox/src/game/movement';
import {getUnitDefinition as def} from './.sandbox/src/game/units';
import {isLegalAction,phaseEndAction} from './.sandbox/src/game/legality';
import {defaultUpkeepAction} from './.sandbox/src/game/upkeep';
import {checkInvariants} from './.sandbox/lab/harness/invariants';
import {route,save,xy} from './common';
import type {GameState} from './.sandbox/src/game/types';
import type {AIAction} from './.sandbox/src/ai/types';

function fund(s:GameState,cash=6){
 let spent=s.board.cells.flat().reduce((n,c)=>n+depthValue(0,c.minedDepth),0);
 for(let p=99;spent<cash&&p>=70;p--){const c=s.board.cells[Math.floor(p/10)][p%10];while(c.resourceLayers>0&&spent<cash){spent+=depthValue(c.minedDepth,1);c.minedDepth++;c.resourceLayers--;}}
 s.players.white={...s.players.white,resources:cash,resourcesGained:spent,resourcesSpent:spent-cash,resourcesManifested:spent-cash};
 checkInvariants(s,'funded-authored');return s;
}
const routes=[];
for(const economy of ['A','B','C'] as const){setEconomy(economy);
 for(const district of [{name:'home',start:11,wells:[0,1,10,11]},{name:'expansion',start:26,wells:[16,17,18,26,27,28]}])for(const condition of ['fresh','skim3','skim4','depleted'])for(const branch of ['plant_2','plant_3','metal_3']){
  let s=createInitialGameState();s.turn={currentPlayer:'white',phase:'place',actionsRemaining:6,turnNumber:8};
  s.board.units=[{...createUnit(branch==='metal_3'?'metal_2':'plant_2','white',xy(district.start),true),id:'miner'}, {...createUnit('water_1','black',xy(99),true),id:'spectator'}];
  for(const c of s.board.cells.flat()){const depth=condition==='fresh'?0:condition==='depleted'?c.resourceLayers:Math.min(c.resourceLayers,condition==='skim3'?3:4);c.resourceLayers-=depth;c.minedDepth=depth;}
  s=fund(s);const startIncome=s.players.white.resourcesGained,startUpkeep=s.players.white.resourcesUpkeep??0,trace:any[]=[],timeline:any[]=[];
  const act=(a:AIAction)=>{assert.ok(isLegalAction(s,a),JSON.stringify(a));const before=s;s=applyAction(s,a);assert.notEqual(s,before);checkInvariants(s,'route-witness');trace.push({turn:before.turn.turnNumber,player:before.turn.currentPlayer,action:a,cash:s.players.white.resources,miner:s.board.units.find(u=>u.id==='miner')?.position,phase:s.turn.phase});};
  if(branch!=='plant_2')act({type:'PROMOTE_UNIT',unitId:'miner'});
  for(let turn=0;turn<3&&s.phase==='playing';turn++){
   while(s.phase==='playing'&&s.turn.currentPlayer==='white'&&s.turn.phase==='place'){act(s.upkeepPending?defaultUpkeepAction(s):{type:'END_PLACE_PHASE'});}
   if(s.phase!=='playing')break;
   const miner=s.board.units.find(u=>u.id==='miner');
   if(miner){const plan=route(s,miner,6,district.wells);for(const p of plan.wells){
    if(p!==miner.position.y*10+miner.position.x){const current=s.board.units.find(u=>u.id==='miner')!;if(current.position.y*10+current.position.x!==p)act({type:'MOVE',unitId:'miner',to:xy(p)});}
    act({type:'MINE',unitId:'miner'});
   }}
   while(s.phase==='playing'&&s.turn.currentPlayer==='white')act(s.upkeepPending?defaultUpkeepAction(s):phaseEndAction(s));
   timeline.push({ownTurn:turn+1,income:s.players.white.resourcesGained-startIncome,upkeep:(s.players.white.resourcesUpkeep??0)-startUpkeep,netCash:s.players.white.resources-6,alive:s.board.units.some(u=>u.id==='miner')});
   while(s.phase==='playing'&&s.turn.currentPlayer==='black')act(s.upkeepPending?defaultUpkeepAction(s):phaseEndAction(s));
  }
  routes.push({economy,district:district.name,condition,branch,timeline,trace,scope:'legal three-own-turn income-greedy route witness; other army spends no actions, enemy waits; not globally optimal multi-turn play'});
 }
}
// Same funded state: promotion now rescues home, saved cash/queued units arrive too late.
const home=[];setEconomy('A');
for(const branch of ['promote','retain','army']){
 let s=createInitialGameState();s.turn={currentPlayer:'white',phase:'place',actionsRemaining:6,turnNumber:8};
 s.board.units=[{...createUnit('plant_2','white',xy(1),true),id:'defender'}, {...createUnit('fire_1','black',xy(0),true),id:'invader'}];s=fund(s);
 const trace:AIAction[]=[];const act=(a:AIAction)=>{assert.ok(isLegalAction(s,a));s=applyAction(s,a);trace.push(a);checkInvariants(s,'home-witness');};
 if(branch==='promote')act({type:'PROMOTE_UNIT',unitId:'defender'});
 if(s.turn.phase==='place')act({type:'END_PLACE_PHASE'});
 act({type:'ATTACK',unitId:'defender',targetPosition:xy(0)});
 if(s.phase==='playing'){act({type:'END_ACTION_PHASE'});if(branch==='army')for(let i=0;i<3&&s.turn.currentPlayer==='white';i++)act({type:'QUEUE_UNIT',definitionId:'water_1'});
  if(s.phase==='playing'&&s.turn.currentPlayer==='white')act({type:'END_TURN'});}
 home.push({branch,winner:s.winner,reason:s.victoryReason,trace,queued:s.players.white.buildQueue});
}
assert.equal(home[0].winner,'white');assert.equal(home[1].winner,'black');assert.equal(home[2].winner,'black');
save('legal-witnesses',{routes,home});console.log({routes:routes.length,home:home.length});
