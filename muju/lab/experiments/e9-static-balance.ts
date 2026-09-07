/** Component screen after the static solver: node --import tsx lab/experiments/e9-static-balance.ts baseline 20
 * Paired seeds across seats/candidates. No candidate is imported by gameplay.
 */
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {UNIT_DEFINITIONS} from '../../src/game/units';
import {playGame} from '../harness/runner';
import {createBot} from '../harness/bots';
import {createRushBot,createExpandBot} from '../harness/bots/archetypes';
import {createGreedyBot} from '../harness/bots/greedy';
import type {Bot,ScriptedBot} from '../harness/types';
import type {UnitDefinition} from '../../src/game/types';
import {deriveSeed} from '../harness/rng';
type Patch=Record<string,Partial<UnitDefinition>>;
const lightning:Patch={lightning_1:{attack:2},lightning_2:{attack:3},lightning_3:{attack:3},lightning_4:{attack:4}};
const plantDepth:Patch={plant_2:{mining:4},plant_3:{mining:5},plant_4:{speed:2}};
export const candidates:Record<string,Patch>={baseline:{},radi_only:{lightning_1:{attack:2}},umeme_only:{lightning_2:{attack:3}},lightning,
plant_t2:{plant_2:{mining:4}},plant_t23:{plant_2:{mining:4},plant_3:{mining:5}},plant_t4_speed:{plant_4:{speed:2}},plant_depth:plantDepth,
proposed:{...lightning,...plantDepth},conservative:{...lightning,plant_2:{mining:4}},confirm_base:{},confirm_proposed:{...lightning,...plantDepth}};
const variant=process.argv[2]??'baseline',n=Number(process.argv[3]??40);
if(!(variant in candidates))throw new Error('Unknown candidate');
if(!Number.isInteger(n)||n<1)throw new Error('Positive integer games per seat required');
const digest=createHash('sha256');
function hashDir(dir:string){for(const e of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=join(dir,e.name);if(e.isDirectory())hashDir(f);else if(f.endsWith('.ts'))digest.update(f).update(readFileSync(f));}}
hashDir('src');hashDir('lab/harness');hashDir('lab/experiments');
const sourceHash=digest.digest('hex'),patch=candidates[variant]??{},original=UNIT_DEFINITIONS.map(d=>({...d}));
const baseline:UnitDefinition[]=JSON.parse(readFileSync('lab/solver/baseline-v1.2.json','utf8'));
for(const d of UNIT_DEFINITIONS)Object.assign(d,baseline.find(b=>b.id===d.id)!,patch[d.id]??{});
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
const out='lab/results/e9-2026-09-07';mkdirSync(out,{recursive:true});
const rows:any[]=[],games:any[]=[],start=Date.now();
try{for(let cell=0;cell<pairs.length;cell++){
 const [a,b]=pairs[cell],row={a,b,n:0,wins:0,losses:0,draws:0,naturalWins:0,naturalLosses:0,caps:0,rounds:0,illegal:0,invariants:0};
 for(let i=0;i<n;i++)for(const swapped of [false,true]){
  const seed=deriveSeed((variant.startsWith('confirm_')?39072600:29072600)+cell,i),aSeat=swapped?'black':'white';
  const {record:r}=await playGame({bots:{white:bot(swapped?b:a),black:bot(swapped?a:b)},seed,engineHash:sourceHash,runId:`e9-${variant}`,experiment:variant,options:{victoryRule:'elimination',resourceLayout:Array(100).fill(5),legality:'strict',checkInvariants:true,maxTurns:120,recordReplay:false}});
  const cap=r.turns>(120)||r.plies>=8000;
  row.n++;row.rounds+=r.turns;row.caps+=Number(cap);row.illegal+=r.players.white.illegalActions+r.players.black.illegalActions;row.invariants+=Number(!!r.invariantViolation);
  if(r.winner===null)row.draws++;else if(r.winner===aSeat){row.wins++;if(!cap)row.naturalWins++;}else{row.losses++;if(!cap)row.naturalLosses++;}
  games.push({a,b,seed,swapped,winner:r.winner,winType:r.winType,turns:r.turns,plies:r.plies,cap,illegal:r.players.white.illegalActions+r.players.black.illegalActions,invariant:r.invariantViolation,anomalies:r.anomalies});
 }
 rows.push(row);writeFileSync(`${out}/${variant}.json`,JSON.stringify({variant,patch,sourceHash,nPerSeat:n,seedBase:variant.startsWith('confirm_')?39072600:29072600,started:new Date(start).toISOString(),elapsedSeconds:(Date.now()-start)/1000,rows,games},null,2)+'\n');
 console.log(variant,a,b,JSON.stringify(row));
}}finally{UNIT_DEFINITIONS.forEach((d,i)=>Object.assign(d,original[i]));}
