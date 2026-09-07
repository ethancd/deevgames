/** Run AFTER production verification. n seed blocks, shard index, shard count, mode.
 * node --import tsx lab/experiments/e12-map-d-topology.ts 40 0 4 scripted
 */
import {readFileSync,readdirSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {playGame} from '../harness/runner';
import {makeBot} from './map-d-investment-policies';
import {deriveSeed,mulberry32} from '../harness/rng';
import {UNEQUAL_ROUTES_MAP} from '../../src/game/resourceMap';
import {UNIT_DEFINITIONS} from '../../src/game/units';
import type {PlayerId} from '../../src/game/types';
// One fixed shuffled control: preserve histogram, rotational symmetry and 2×2 home wells.
const control=[...UNEQUAL_ROUTES_MAP],orbit=Array.from({length:50},(_,i)=>i).filter(i=>![0,1,10,11].includes(i)),values=orbit.map(i=>control[i]),rng=mulberry32(20260907);
for(let i=values.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
orbit.forEach((i,k)=>{control[i]=values[k];control[99-i]=values[k];});
const n=Number(process.argv[2]??40),shard=Number(process.argv[3]??0),shards=Number(process.argv[4]??1),mode=process.argv[5]??'topology';
const pairs=[['InvestT3','Rush'],['InvestT3','LightningRush'],['InvestT3','MiningDenial'],['InvestT3','InvestT1'],['InvestT2','InvestT1'],['InvestT4','InvestT3'],['InvestT3','HomeT3'],['InvestT3','Balanced']];
if(!Number.isInteger(n)||n<1||!Number.isInteger(shard)||shard<0||shard>=shards)throw Error('Invalid arguments');
const h=createHash('sha256');function hashDir(d:string){for(const e of readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=join(d,e.name);if(e.isDirectory())hashDir(f);else if(f.endsWith('.ts'))h.update(f).update(readFileSync(f));}}
hashDir('src');hashDir('lab/harness');hashDir('lab/experiments');
const sourceHash=h.digest('hex'),unitHash=createHash('sha256').update(JSON.stringify(UNIT_DEFINITIONS)).digest('hex');
const out='lab/results/map-d-playtests-2026-09-07';mkdirSync(out,{recursive:true});
const file=`${out}/${mode}-${shard}.jsonl`;writeFileSync(file,'');
const maxTurns=mode==='engine'?20:120,started=new Date().toISOString();
writeFileSync(`${out}/topology-control.json`,JSON.stringify({description:'One fixed shuffled D, exact stock and histogram, rotated, preserved 2x2 starting homes',cells:control},null,2));
writeFileSync(`${out}/${mode}-${shard}-manifest.json`,JSON.stringify({started,releaseCommit:'326f04386ff11a0bfc6b6a36c33fc40e8bcf2acb',productionVerifiedBeforeRun:true,sourceHash,unitHash,n,shard,shards,mode,maxTurns,pairs,seedBase:91092026},null,2));
const empty=()=>({mineActions:0,mineYield:0,moveActions:0,moveBudget:0,awayYield:0,fourthFifth:0,byDefinition:{} as Record<string,{actions:number,yield:number}>,incomeAt:{} as Record<string,number>,maxHomeDistance:0,minedCells:new Set<string>()});
let count=0;
for(let cell=0;cell<pairs.length;cell++){
 if(cell%shards!==shard)continue;
 const [a,b]=pairs[cell];
 for(let i=0;i<n;i++)for(const swapped of [false,true])for(const map of ['S','D']){
  const seed=deriveSeed(91092026+cell,i),aSeat:PlayerId=swapped?'black':'white',telemetry={white:empty(),black:empty()};
  const {record:r,replay}=await playGame({bots:{white:makeBot(swapped?b:a),black:makeBot(swapped?a:b)},seed,engineHash:sourceHash,runId:`e12-${mode}`,experiment:`map-${map}`,options:{resourceLayout:map==='S'?control:UNEQUAL_ROUTES_MAP,legality:'strict',checkInvariants:true,maxTurns,maxPlies:8000,recordReplay:cell===0&&i===0},
   onAction(before,after,action,p){const t=telemetry[p];
    if(before===after)return;
    if(action.type==='MINE'){
     const u=before.board.units.find(u=>u.id===action.unitId)!,c=before.board.cells[u.position.y][u.position.x],yieldNow=after.players[p].resourcesGained-before.players[p].resourcesGained;
     const home=before.players[p].startCorner,dist=Math.abs(u.position.x-home.x)+Math.abs(u.position.y-home.y);
     t.mineActions++;t.mineYield+=yieldNow;t.awayYield+=dist>6?yieldNow:0;t.maxHomeDistance=Math.max(t.maxHomeDistance,dist);t.minedCells.add(`${u.position.x},${u.position.y}`);
     t.fourthFifth+=Math.max(0,c.minedDepth+yieldNow-Math.max(3,c.minedDepth));
     const v=t.byDefinition[u.definitionId]??={actions:0,yield:0};v.actions++;v.yield+=yieldNow;
    }
    if(action.type==='MOVE'){t.moveActions++;t.moveBudget+=before.turn.actionsRemaining-after.turn.actionsRemaining;}
    if(before.turn.currentPlayer!==after.turn.currentPlayer||after.phase==='victory'){
     if([1,2,3,5,10,20].includes(before.turn.turnNumber))t.incomeAt[before.turn.turnNumber]=after.players[p].resourcesGained;
    }
   }});
  const cap=r.turns>maxTurns||r.plies>=8000;
  appendFileSync(file,JSON.stringify({cell,a,b,i,swapped,map,aSeat,cap,...r,telemetry:{white:{...telemetry.white,minedCells:telemetry.white.minedCells.size},black:{...telemetry.black,minedCells:telemetry.black.minedCells.size}}})+'\n');
  if(replay)writeFileSync(`${out}/replay-${mode}-${map}-${swapped?'black':'white'}.json`,JSON.stringify(replay));
  count++;if(count%40===0||mode==='engine')console.log(new Date().toISOString(),mode,shard,count,a,b,map,r.winType,r.turns);
 }
 console.log('CELL DONE',shard,a,b,count);
}
console.log('DONE',mode,shard,count,started,new Date().toISOString());
