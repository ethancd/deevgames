import './historical-experiment';
import {mkdirSync,writeFileSync,appendFileSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {playGame} from '../harness/runner';
import {makeHomeBot} from './home-policies';
import {deriveSeed} from '../harness/rng';
import {getHomeOccupier} from '../../src/game/victory';
import {UNIT_DEFINITIONS} from '../../src/game/units';
const n=Number(process.argv[2]??20),shard=Number(process.argv[3]??0),shards=Number(process.argv[4]??4);
const pairs=[['Rush','AntiRush'],['LightningRush','Expand'],['Balanced','Balanced'],['InvestT3','HomeT3'],['InvestT3','Rush'],['InvestT4','InvestT3'],['MiningDenial','Turtle'],['Mono-plant','Mono-shadow'],
 ['Invade:LightningRush','Aware:AntiRush'],['Invade:LightningRush','Aware:InvestT3'],['Invade:LightningRush','Aware:Balanced'],['Invade:LightningRush','Aware:Turtle'],
 ['Invade:Balanced','Aware:Balanced'],['Invade:InvestT3','Aware:HomeT3'],['Invade:InvestT3','Aware:InvestT3'],['Invade:MiningDenial','Aware:AntiRush'],
 ['Siege:2','Aware:Balanced'],['Siege:4','Aware:Balanced'],['Siege:4','Aware:InvestT3'],['Siege:4','Invade:LightningRush'],
 ['Invade:Balanced','Invade:Balanced'],['Invade:LightningRush','Invade:LightningRush'],['Aware:InvestT3','Aware:Balanced'],['Invade:InvestT3','Aware:Mono-plant']];
if(!Number.isInteger(n)||n<1||shard<0||shard>=shards)throw Error('Invalid args');
const out='lab/results/tier3-cap-2026-09-08/e13';mkdirSync(out,{recursive:true});
const digest=createHash('sha256');function hash(d:string){for(const e of readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=join(d,e.name);if(e.isDirectory())hash(f);else if(f.endsWith('.ts'))digest.update(f).update(readFileSync(f));}}
hash('src');hash('lab/harness');hash('lab/experiments');const sourceHash=digest.digest('hex');
writeFileSync(`${out}/manifest-${shard}.json`,JSON.stringify({n,shard,shards,pairs,started:new Date().toISOString(),sourceHash,unitHash:createHash('sha256').update(JSON.stringify(UNIT_DEFINITIONS)).digest('hex'),seedBase:9071326,maxTurns:120,notes:'Same policies/seeds/seats, map D, paired catalogue cut study. Legacy InvestT4/Siege:4 intent caps at highest available tier. New-objective probes use bounded public-state home defense on both rule variants.'},null,2));
const file=`${out}/games-${shard}.jsonl`;writeFileSync(file,'');let count=0;
for(let cell=0;cell<pairs.length;cell++){
 if(cell%shards!==shard)continue;const [a,b]=pairs[cell];
 for(let i=0;i<n;i++)for(const swapped of [false,true])for(const rule of ['home-or-elimination'] as const){
  let occupationEvents=0,cleared=0,firstOccupation:number|null=null,winningUnit:string|null=null;
  const {record:r,replay}=await playGame({bots:{white:makeHomeBot(swapped?b:a),black:makeHomeBot(swapped?a:b)},seed:deriveSeed(9071326+cell,i),engineHash:sourceHash,runId:'home-victory',experiment:rule,options:{victoryRule:rule,legality:'strict',maxTurns:120,checkInvariants:true,recordReplay:i===0&&[0,8,17].includes(cell)},onAction(before,after){
   for(const p of ['white','black'] as const){const b=getHomeOccupier(before.board,p),a=getHomeOccupier(after.board,p);if(!b&&a){occupationEvents++;firstOccupation??=after.turn.turnNumber;}if(b&&!a)cleared++;}
   if(after.victoryReason==='home-occupation')winningUnit=getHomeOccupier(after.board,after.winner!)!.definitionId;
  }});
  appendFileSync(file,JSON.stringify({cell,a,b,i,swapped,rule,aSeat:swapped?'black':'white',cap:r.turns>120||r.plies>=8000,occupationEvents,cleared,firstOccupation,winningUnit,...r})+'\n');
  if(replay)writeFileSync(`${out}/replay-${cell}-${rule}-${swapped}.json`,JSON.stringify(replay));
  count++;if(count%30===0)console.log(new Date().toISOString(),shard,count,a,b,rule,r.winType,r.turns);
 }
 console.log('CELL DONE',shard,cell,count);
}
console.log('DONE',shard,count);
