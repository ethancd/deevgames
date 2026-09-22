import assert from 'node:assert/strict';
import {createInitialGameState,createUnit} from './.sandbox/src/game/board';
import {UNIT_DEFINITIONS} from './.sandbox/src/game/units';
import * as mining from './.sandbox/src/game/mining';
import * as original from './.reference/src/game/mining';
import {setEconomy,depthValue,ECONOMIES} from './.sandbox/src/game/economy';
import {applyAction} from './.sandbox/src/ai/simulate';
import {checkInvariants} from './.sandbox/lab/harness/invariants';
import {collectObservedEvents} from './.sandbox/src/ai/state/eventsLog';
import {playGame} from './.sandbox/lab/harness/runner';
import {playGame as referenceGame} from './.reference/lab/harness/runner';
import {makeHomeBot} from './.sandbox/lab/experiments/home-policies';
import {makeHomeBot as originalBot} from './.reference/lab/experiments/home-policies';
import {upkeepForTier} from './.sandbox/src/game/upkeep';
import {INACTIVITY_LIMIT} from './.sandbox/src/game/inactivity';
import {evaluatePosition} from './.sandbox/src/ai/evaluation';
import {evaluatePosition as originalEvaluate} from './.reference/src/ai/evaluation';
import {DEFAULT_WEIGHTS} from './.sandbox/src/ai/types';
import {hash,save,seats,sourceHash} from './common';

assert.equal(UNIT_DEFINITIONS.length,18);assert.deepEqual(UNIT_DEFINITIONS.filter(d=>d.element==='plant').map(d=>[d.mining,d.cost]),[[3,3],[4,6],[5,12]]);
assert.deepEqual(UNIT_DEFINITIONS.filter(d=>d.id==='metal_3').map(d=>[d.mining,d.speed,d.defense,d.attack]),[[4,2,6,2]]);
assert.deepEqual([1,2,3].map(upkeepForTier),[0,1,2]);assert.equal(INACTIVITY_LIMIT,10);
let assertions=0;const aiFeatureChecks=[];
for(const economy of ['A','B','C'] as const){setEconomy(economy);
 const featureState=createInitialGameState();featureState.board.units=[{...createUnit('plant_3','white',{x:0,y:0},true),id:'feature'},createUnit('lightning_1','black',{x:9,y:9},true)];
 featureState.board.cells[0][0]={position:{x:0,y:0},minedDepth:4,resourceLayers:1};
 const weights={...Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map(k=>[k,0])),miningPotential:1} as typeof DEFAULT_WEIGHTS;
 const score=evaluatePosition(featureState,'white',weights),reference=originalEvaluate(featureState,'white',weights);
 assert.equal(score,ECONOMIES[economy][4]);assert.equal(reference,5);
 aiFeatureChecks.push({economy,actualFifthPayout:score,unadaptedNominalMiningFeature:reference});
 for(const d of UNIT_DEFINITIONS)for(let capacity=0;capacity<=5;capacity++)for(let depth=0;depth<=capacity;depth++){
  const u=createUnit(d.id,'white',{x:0,y:0},true),cell={position:u.position,minedDepth:depth,resourceLayers:capacity-depth};
  const layers=Math.max(0,Math.min(d.mining,capacity)-depth),expected=ECONOMIES[economy].slice(depth,depth+layers).reduce((a,b)=>a+b,0);
  assert.equal(mining.calculateMiningLayers(u,cell),layers);assert.equal(mining.calculateMiningYield(u,cell),expected);
  const s=createInitialGameState();s.board.cells[0][0]=cell;s.board.units=[u];
  const result=mining.executeMine(s.board,u.id,17);assert.equal(result.newResources,17+expected);
  assert.equal(result.board.cells[0][0].minedDepth,depth+layers);assert.equal(result.board.cells[0][0].resourceLayers,capacity-depth-layers);
  assert.equal(mining.getTotalBoardResources(s.board)-mining.getTotalBoardResources(result.board),expected);
  if(economy==='A'){assert.equal(original.calculateMiningYield(u,cell),expected);assert.deepEqual(mining.executeMine(s.board,u.id,17),original.executeMine(s.board,u.id,17));assert.equal(mining.getReachableResources(u,s.board),original.getReachableResources(u,s.board));}
  assertions++;
 }
 // Real simulator conservation and public AI observation on one partially mined well.
 let s=createInitialGameState();s.turn.phase='action';s.board.units[0]={...s.board.units[0],definitionId:'plant_2'};
 const u=s.board.units[0],first=applyAction(s,{type:'MINE',unitId:u.id});checkInvariants(first,economy);
 assert.equal(first.players.white.resourcesGained,depthValue(0,4));
 assert.equal(collectObservedEvents(s,first,'black').find(e=>e.type==='MINE')?.amount,depthValue(0,4));
 s={...first,board:{...first.board,units:first.board.units.map(v=>v.id===u.id?{...v,definitionId:'plant_3'}:v)}};
 const last=applyAction(s,{type:'MINE',unitId:u.id});checkInvariants(last,economy);assert.equal(last.players.white.resources-first.players.white.resources,ECONOMIES[economy][4]);
 assert.equal(last.board.cells[0][1].minedDepth,5);assert.equal(mining.canMine(last.board.units[0],last.board),false);
 // Weighted payout does not grant multiple clock resets, and the tenth quiet end beats home occupation.
 const quiet={...last,progressThisTurn:false,inactivityPlies:9,turn:{...last.turn,phase:'queue' as const}};
 const draw=applyAction(quiet,{type:'END_TURN'});assert.equal(draw.victoryReason,'inactivity');
 const reset=applyAction({...s,progressThisTurn:false,inactivityPlies:9},{type:'MINE',unitId:u.id});assert.equal(reset.progressThisTurn,true);
 const resetEnd=applyAction({...reset,turn:{...reset.turn,phase:'queue'}},{type:'END_TURN'});assert.equal(resetEnd.inactivityPlies,0);
 // Corrupt physical and monetary identities independently: both must fail.
 const broken=structuredClone(last);broken.board.cells[0][1].minedDepth--;assert.throws(()=>checkInvariants(broken,'physical'));
 const money=structuredClone(last);money.players.white.resourcesGained++;assert.throws(()=>checkInvariants(money,'money'));
}
setEconomy('A');
const normalize=(v:unknown)=>JSON.parse(JSON.stringify(v).replace(/(white|black)_(fire|water|plant)_1_\d+_[a-z0-9]+/g,'start-$1-$2_1'));
const controls=[];
for(const [a,b] of [['InvestT3','Rush'],['InvestT3','MiningDenial'],['Expand','Turtle'],['Aware:Balanced','Mono-metal']])for(const swapped of [false,true]){
 const seed=20260909,options={maxTurns:120,legality:'strict' as const,recordReplay:true},args={seed,engineHash:sourceHash,runId:'baseline-control',options};
 const r=await referenceGame({...args,bots:{white:originalBot(swapped?b:a),black:originalBot(swapped?a:b)}});
 const v=await playGame({...args,bots:{white:makeHomeBot(swapped?b:a),black:makeHomeBot(swapped?a:b)}});
 assert.equal(hash(normalize(v.replay!.steps)),hash(normalize(r.replay!.steps)),`${a}/${b}/${swapped}: action trace`);for(const p of seats)assert.deepEqual(normalize(v.record.players[p]),normalize(r.record.players[p]));
 assert.equal(v.record.winType,r.record.winType);assert.equal(v.record.winner,r.record.winner);assert.equal(v.record.invariantViolation,null);
 controls.push({a,b,swapped,seed,actions:r.replay!.steps.length,traceHash:hash(normalize(r.replay!.steps)),winType:r.record.winType,winner:r.record.winner});
}
save('validation',{exhaustiveUnitWellCombinations:assertions,aiFeatureChecks,controls,baselinePhysicsAndScriptedActionsIdentical:true,notes:'AI potential term separately adapted to actual current-cell payout in all study arms; not covered by scripted equivalence.'});
console.log(JSON.stringify({exhaustiveUnitWellCombinations:assertions,baselineControlGames:controls.length,status:'passed'}));
