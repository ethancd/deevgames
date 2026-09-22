import {existsSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {setEconomy,type Economy} from './.sandbox/src/game/economy';
import type {ScriptedBot} from './.sandbox/lab/harness/types';
import type {PlayerId} from './.sandbox/src/game/types';
import {playGame} from './.sandbox/lab/harness/runner';
import {deriveSeed} from './.sandbox/lab/harness/rng';
import {makeBot} from './policies';
import {instrument} from './telemetry';
import {OUT,append,sourceHash,assets,other} from './common';
const economy=process.argv[2] as Economy,label=process.argv[3]??'scripted',prefix=label==='sustain'?'sustain-':'';setEconomy(economy);
if(existsSync(`${OUT}/${prefix}counterfactual-${economy}.jsonl.gz`))throw Error('Refusing overwrite');
const origins=gunzipSync(readFileSync(`${OUT}/${prefix}origins-${economy}.jsonl.gz`)).toString().trim().split('\n').map(l=>JSON.parse(l));
const policy=(name:string)=>makeBot(label==='sustain'?`Sustain:${name}`:name);
for(const origin of origins)for(const branch of ['promote','retain','army'] as const){
 const owner=origin.aSeat as PlayerId,initial=origin.state,base=policy(branch==='promote'?'Plant3':'Plant2') as ScriptedBot;
 let first=true,armyBought=0;const bot:ScriptedBot={...base,name:`${base.name}-${branch}`,chooseAction(ctx){
  if(first){first=false;if(branch==='promote'){const a=ctx.legal.find(a=>a.type==='PROMOTE_UNIT'&&a.unitId===origin.unitId);if(!a)throw Error('Missing prescribed promotion');return a;}}
  if(branch==='army'&&ctx.view.phase==='queue'&&armyBought<3){const rent=label==='sustain'?ctx.view.board.units.filter(u=>u.owner===owner).reduce((n,u)=>n+Number(u.definitionId.at(-1))-1,0):0;const a=ctx.legal.find(a=>a.type==='QUEUE_UNIT'&&a.definitionId==='water_1'&&ctx.view.me.resources>=2+rent);if(a){armyBought++;return a;}}
  return base.chooseAction(ctx);
 }};
 const t=instrument(initial),timeline:any[]=[];
 const result=await playGame({initialState:initial,bots:{[owner]:bot,[other(owner)]:policy(origin.b)} as any,seed:deriveSeed(origin.seed,444),engineHash:sourceHash,runId:`cf-${origin.id}-${branch}`,
  options:{maxTurns:120,maxPlies:8000,legality:'strict',checkInvariants:true,upkeep:'shipped',inactivityRule:'on'},
  onAction(before,after,action,player){t.onAction(before,after,action,player);if(player===owner&&(after.turn.currentPlayer!==owner||after.phase==='victory')){
   const ledger=t.results().unitLedger[origin.unitId];timeline.push({turn:before.turn.turnNumber,elapsedOwnTurns:before.turn.turnNumber-initial.turn.turnNumber+1,
    target:{...ledger},targetNet:ledger.income-ledger.paidRent-(branch==='promote'?6:0),
    ownIncome:after.players[owner].resourcesGained-initial.players[owner].resourcesGained,ownUpkeep:(after.players[owner].resourcesUpkeep??0)-(initial.players[owner].resourcesUpkeep??0),
    ownCash:after.players[owner].resources,ownAssets:assets(after,owner),enemyAssets:assets(after,other(owner)),alive:after.board.units.some(u=>u.id===origin.unitId)});
  }} });
 const r=result.record;append(`${prefix}counterfactual-${economy}`,{economy,originId:origin.id,cell:origin.cell,opponent:origin.b,owner,branch,originRound:initial.turn.turnNumber,unitId:origin.unitId,armyBought,timeline,cap:r.turns>120||r.plies>=8000,invalid:!!r.invariantViolation||r.anomalies.length>0||r.players.white.illegalActions+r.players.black.illegalActions>0,...r,...t.results()});
 console.log(origin.id,branch,r.winType,r.turns);
}
