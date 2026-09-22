import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {setEconomy,type Economy,ECONOMIES} from './.sandbox/src/game/economy';
import {createInitialGameState} from './.sandbox/src/game/board';
import {playGame} from './.sandbox/lab/harness/runner';
import {deriveSeed} from './.sandbox/lab/harness/rng';
import {PAIRS,makeBot} from './policies';
import {instrument} from './telemetry';
import {OUT,append,save,sourceHash,miningOpportunity,hash} from './common';
const economy=process.argv[2] as Economy,n=Number(process.argv[3]??20),label=process.argv[4]??'scripted';
if(!(economy in ECONOMIES)||!Number.isInteger(n)||n<1)throw Error('Usage run.ts A|B|C [seeds=20] [label=scripted]');
if(existsSync(`${OUT}/${label}-${economy}.jsonl.gz`))throw Error('Refusing to overwrite prior games');
setEconomy(economy);const started=Date.now();
save(`${label}-${economy}-manifest`,{economy,values:ECONOMIES[economy],n,pairs:PAIRS,seedBase:9092026,maxTurns:120,maxPlies:8000,sourceHash,policyHash:hash(readFileSync(new URL('./policies.ts',import.meta.url),'utf8')),started:new Date().toISOString()});
const captured=new Set<string>();let count=0;
for(let cell=0;cell<PAIRS.length;cell++){
 const [a,b]=PAIRS[cell];for(let i=0;i<n;i++)for(const swapped of [false,true]){
  const seed=deriveSeed(9092026+cell,i),aSeat=swapped?'black':'white',initial=createInitialGameState(),t=instrument(initial),opportunities:any[]=[];
  const id=`${economy}-${cell}-${i}-${Number(swapped)}`;
  const result=await playGame({bots:{white:makeBot(swapped?b:a),black:makeBot(swapped?a:b)},seed,engineHash:sourceHash,runId:id,initialState:initial,
   options:{maxTurns:120,maxPlies:8000,legality:'strict',checkInvariants:true,upkeep:'shipped',inactivityRule:'on'},
   onAction(before,after,action,player){t.onAction(before,after,action,player);
    if(action.type==='PROMOTE_UNIT'&&before!==after){const u=before.board.units.find(u=>u.id===action.unitId)!;
     if(u.definitionId==='plant_2'){
      const opportunity=miningOpportunity(before,u);opportunities.push({turn:before.turn.turnNumber,player,id:u.id,...opportunity});
      const key=`${cell}-${swapped}`;
      if(label==='scripted'&&cell<8&&player===aSeat&&!captured.has(key)){captured.add(key);append(`origins-${economy}`,{id,cell,a,b,i,swapped,seed,aSeat,unitId:u.id,opportunity,state:before});}
     }
    }
   }});
  const r=result.record,cap=r.turns>120||r.plies>=8000,invalid=!!r.invariantViolation||r.players.white.illegalActions+r.players.black.illegalActions>0||r.anomalies.length>0;
  append(`${label}-${economy}`,{id,economy,cell,a,b,i,swapped,aSeat,cap,invalid,opportunities,...r,...t.results()});count++;
 }
 console.log(JSON.stringify({economy,cell,a,b,count,seconds:Math.round((Date.now()-started)/1000)}));
}
console.log('DONE',economy,count);
