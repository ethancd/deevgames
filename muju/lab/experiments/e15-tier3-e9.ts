/** v1.5 paired E9 confirmation: node --import tsx lab/experiments/e15-tier3-e9.ts SHARD 4
 * Uses this checkout’s catalogue unchanged. Run the same script in the frozen v1.4 checkout.
 */
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {UNIT_DEFINITIONS,getUnitDefinition} from '../../src/game/units';
import {playGame} from '../harness/runner';
import {createBot} from '../harness/bots';
import {createRushBot,createExpandBot} from '../harness/bots/archetypes';
import {createGreedyBot} from '../harness/bots/greedy';
import type {Bot,ScriptedBot} from '../harness/types';
import {deriveSeed} from '../harness/rng';
const variant='confirm_base',n=100,shard=Number(process.argv[2]??0),shards=Number(process.argv[3]??4);
if(!Number.isInteger(n)||n<1)throw new Error('Positive integer games per seat required');
const digest=createHash('sha256');
function hashDir(dir:string){for(const e of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=join(dir,e.name);if(e.isDirectory())hashDir(f);else if(f.endsWith('.ts'))digest.update(f).update(readFileSync(f));}}
hashDir('src');hashDir('lab/harness');hashDir('lab/experiments');
const sourceHash=digest.digest('hex'),patch={},original=UNIT_DEFINITIONS.map(d=>({...d}));
// Use the unchanged catalogue in this isolated checkout; no stat patches.
/** Deliberately crude adaptation probes, using public state. Pressure promotes
 * and adds plant versus water/shadow walls. Economy defends near its home.
 * Neither represents best-response play; do not tune the game to these bots.
 */
function adaptive(name:string):ScriptedBot{
 const pressure=name==='AdaptivePressure',base=pressure?createRushBot():createExpandBot(),greedy=createGreedyBot();
 return {kind:'scripted',name,chooseAction(ctx){const {view}=ctx;
  if(!pressure){const danger=view.board.units.some(u=>u.owner!==view.player&&Math.abs(u.position.x-view.me.startCorner.x)+Math.abs(u.position.y-view.me.startCorner.y)<=5);return danger?greedy.chooseAction(ctx):base.chooseAction(ctx);}
  if(view.phase==='place')return greedy.chooseAction(ctx);
  if(view.phase==='queue'){
   const walls=view.board.units.filter(u=>u.owner!==view.player&&['water','shadow'].includes(u.definitionId.split('_')[0])).length;
   const counters=view.board.units.filter(u=>u.owner===view.player&&u.definitionId.startsWith('plant')).length;
   if(walls>=2&&counters<walls){const legal=ctx.legal.filter(a=>a.type==='QUEUE_UNIT'&&a.definitionId.startsWith('plant'));if(legal.length)return greedy.chooseAction({...ctx,legal});}
  }return base.chooseAction(ctx);
 }};
}
function bot(name:string):Bot{if(name==='LightningRush')return createRushBot('lightning_1');return name.startsWith('Adaptive')?adaptive(name):createBot(name);}
const pairs=[
 ['Rush','AntiRush'],['Rush','Expand'],['AdaptivePressure','AntiRush'],['AdaptiveEconomy','Rush'],
 ['Mono-lightning','Mono-metal'],['Mono-lightning','Mono-fire'],['Mono-shadow','Mono-water'],['Mono-plant','Mono-metal'],
 ['Mono-plant','Mono-shadow'],['Mono-fire','Mono-water'],['Balanced','Expand'],
 ['LightningRush','AntiRush'],['LightningRush','Turtle'],['LightningRush','Expand'],['AdaptiveEconomy','LightningRush'],['Balanced','LightningRush']];
const out='lab/results/tier3-cap-2026-09-08/e9';mkdirSync(out,{recursive:true});
const rows:any[]=[],games:any[]=[],start=Date.now();
try{for(let cell=0;cell<pairs.length;cell++){
 if(cell%shards!==shard)continue;
 const [a,b]=pairs[cell],row={a,b,n:0,wins:0,losses:0,draws:0,naturalWins:0,naturalLosses:0,caps:0,rounds:0,illegal:0,invariants:0};
 for(let i=0;i<n;i++)for(const swapped of [false,true]){
  const seed=deriveSeed((variant.startsWith('confirm_')?39072600:29072600)+cell,i),aSeat=swapped?'black':'white';
  const purchases={queued:{1:0,2:0,3:0,4:0},promoted:{1:0,2:0,3:0,4:0}};
  const {record:r}=await playGame({bots:{white:bot(swapped?b:a),black:bot(swapped?a:b)},seed,engineHash:sourceHash,runId:`e9-${variant}`,experiment:variant,onAction(before,after,action,_player){
    if(action.type==='QUEUE_UNIT' && after!==before)purchases.queued[getUnitDefinition(action.definitionId).tier]++;
    if(action.type==='PROMOTE_UNIT' && after!==before){const unit=after.board.units.find(u=>u.id===action.unitId)!;purchases.promoted[getUnitDefinition(unit.definitionId).tier]++;}
  },options:{victoryRule:'elimination',resourceLayout:Array(100).fill(5),legality:'strict',checkInvariants:true,maxTurns:120,recordReplay:false}});
  const cap=r.turns>(120)||r.plies>=8000;
  row.n++;row.rounds+=r.turns;row.caps+=Number(cap);row.illegal+=r.players.white.illegalActions+r.players.black.illegalActions;row.invariants+=Number(!!r.invariantViolation);
  if(r.winner===null)row.draws++;else if(r.winner===aSeat){row.wins++;if(!cap)row.naturalWins++;}else{row.losses++;if(!cap)row.naturalLosses++;}
  games.push({purchases,players:r.players,a,b,seed,swapped,winner:r.winner,winType:r.winType,turns:r.turns,plies:r.plies,cap,illegal:r.players.white.illegalActions+r.players.black.illegalActions,invariant:r.invariantViolation,anomalies:r.anomalies});
 }
 rows.push(row);writeFileSync(`${out}/${variant}-${shard}.json`,JSON.stringify({variant,patch,sourceHash,nPerSeat:n,seedBase:variant.startsWith('confirm_')?39072600:29072600,started:new Date(start).toISOString(),elapsedSeconds:(Date.now()-start)/1000,rows,games},null,2)+'\n');
 console.log(variant,a,b,JSON.stringify(row));
}}finally{UNIT_DEFINITIONS.forEach((d,i)=>Object.assign(d,original[i]));}
