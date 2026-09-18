import {appendFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {playGame} from '../../harness/runner';
import {deriveSeed} from '../../harness/rng';
import {makeHomeBot} from '../home-policies';
import {getUnitDefinition} from '../../../src/game/units';
import {maps,centralRich} from './maps';
import {makeRouteBot} from './routes';
const OUT=new URL('../../results/alternate-map-2026-09-12/',import.meta.url);
const n=Number(process.argv[2]??10), label=process.argv[3]??'main';
const selectedMaps=(process.argv[4]??'current,alternate').split(',') as (keyof typeof maps)[];
export const baselinePairs=[
 ['Aware:Rush','Aware:Expand'], ['Aware:Rush','Aware:AntiRush'],
 ['Aware:Balanced','Aware:Turtle'], ['Invade:MiningDenial','Guard:AntiRush'],
 ['Siege:3','Guard:AntiRush'], ['Siege:3','Aware:Rush'],
 ['Aware:InvestT1','Aware:InvestT3'], ['Aware:Rush','Aware:Rush'],
 ['Aware:Balanced','Aware:Balanced'],
];
export const routePairs=['Center','Shelf','Wing','Home'].flatMap(route=>
 ['Aware:Rush','Aware:Balanced','Invade:MiningDenial'].map(opponent=>[`Route:${route}`,opponent]));
const deepPairs=['CenterDeep','CenterFork'].flatMap(route=>['Aware:Rush','Aware:Balanced','Invade:MiningDenial'].map(opponent=>[`Route:${route}`,opponent]));
const pairs=label==='routes-deep'?deepPairs:label.startsWith('routes')?routePairs:baselinePairs;
const makeBot=(name:string)=>name.startsWith('Route:')?makeRouteBot(name.slice(6) as any):makeHomeBot(name);
const hash=createHash('sha256').update(readFileSync(new URL('source-manifest.json',OUT))).digest('hex');
mkdirSync(OUT,{recursive:true});
const output=new URL(`${label}.jsonl`,OUT);
if(existsSync(output))throw Error('Refusing overwrite');
writeFileSync(new URL(`${label}-manifest.json`,OUT),JSON.stringify({n,pairs,maps:selectedMaps,seedBase:9121648,hash,actions:4,cap:'unresolved',started:new Date().toISOString()},null,2));
const t0=Date.now();let count=0;
for(let cell=0;cell<pairs.length;cell++){
 const [a,b]=pairs[cell];
 for(let i=0;i<n;i++)for(const swapped of [false,true]){
  if(a===b&&swapped)continue;
  for(const map of selectedMaps){
   const id=`${label}-${cell}-${i}-${+swapped}-${map}`;
   const stats=()=>({centerIncome:0,centerUnitTurns:0,completedTurns:0,moveAP:0,attacks:0,homeEntries:0,zeroReserveTurns:0,spawnOnCenter:0,centerKills:0});
   const telemetry={white:stats(),black:stats()};
   const result=await playGame({bots:{white:makeBot(swapped?b:a),black:makeBot(swapped?a:b)},seed:deriveSeed(9121648+cell,i),engineHash:hash,runId:id,experiment:'alternate-map',
    options:{resourceLayout:maps[map],maxTurns:120,maxPlies:8000,legality:'strict',recordReplay:i===0,checkInvariants:true,upkeep:'shipped',inactivityRule:'on'},
    onAction(before,after,action,player){
     if(before===after)throw Error('Rejected action '+id);
     if(after.turn.actionsRemaining>4)throw Error('Wrong budget');
     const t=telemetry[player];
     if(action.type==='MOVE'){
      t.moveAP+=before.turn.actionsRemaining-after.turn.actionsRemaining;
      const home=before.players[player==='white'?'black':'white'].startCorner;
      if(action.to.x===home.x&&action.to.y===home.y)t.homeEntries++;
     }
     if(action.type==='ATTACK'){
      t.attacks++;
      if(centralRich.includes(action.targetPosition.y*10+action.targetPosition.x))t.centerKills+=before.board.units.length-after.board.units.length;
     }
     if(action.type==='BUY_UNIT'&&centralRich.includes(action.position.y*10+action.position.x))t.spawnOnCenter++;
     if(action.type==='END_ACTION_PHASE'){
      t.completedTurns++;
      for(const u of before.board.units.filter(u=>u.owner===player)){
       const reserve=before.board.cells[u.position.y][u.position.x].resourceLayers;
       if(reserve===0)t.zeroReserveTurns++;
       if(centralRich.includes(u.position.y*10+u.position.x)){t.centerUnitTurns++;t.centerIncome+=Math.min(getUnitDefinition(u.definitionId).mining,reserve);}
      }
     }
    }});
   const r=result.record,cap=r.turns>120||r.plies>=8000;
   const invalid=!!r.invariantViolation||r.players.white.illegalActions+r.players.black.illegalActions>0||r.anomalies.some(x=>!x.startsWith('ply-cap'));
   appendFileSync(output,JSON.stringify({id,map,cell,a,b,i,swapped,cap,invalid,telemetry,...r})+'\n');
   if(result.replay)writeFileSync(new URL(`replay-${id}.json`,OUT),JSON.stringify(result.replay));
   if(invalid)throw Error('Invalid game '+id);
   count++;
  }
 }
 console.log(JSON.stringify({label,cell,a,b,count,seconds:Math.round((Date.now()-t0)/1000)}));
}
console.log('DONE',label,count);
