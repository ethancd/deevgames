import {existsSync} from 'node:fs';
import {setEconomy} from './.sandbox/src/game/economy';
import {createInitialGameState} from './.sandbox/src/game/board';
import {createEngineBot} from './.sandbox/lab/harness/bots/engine';
import {createEngineBot as originalEngineBot} from './.reference/lab/harness/bots/engine';
import {playGame} from './.sandbox/lab/harness/runner';
import {makeBot} from './policies';
import {instrument} from './telemetry';
import {OUT,append,save,sourceHash,seats,other} from './common';
if(existsSync(`${OUT}/real-ai.jsonl.gz`))throw Error('Refusing overwrite');
const opponents=['Plant3','Metal3','MiningDenial','Invade:LightningRush'];
save('real-ai-manifest',{opponents,seats,economies:['A','B','C'],seed:9092644,difficulty:'medium',speed:'ui',resign:true,maxTurns:120,maxPlies:8000,sourceHash,notes:'Production search/WASM/timing presets; actual-yield mining-potential adapter for all study economies. Extra two unadapted A controls. Timing means exact actions are not guaranteed by a seed alone.'});
for(const opponent of opponents)for(const seat of seats)for(const economy of ['A','B','C'] as const){
 setEconomy(economy);const initial=createInitialGameState(),t=instrument(initial),id=`ai-${economy}-${opponent}-${seat}`;
 const ai=createEngineBot({difficulty:'medium',speed:'ui',resign:true});let last=0;
 const result=await playGame({initialState:initial,bots:{[seat]:ai,[other(seat)]:makeBot(opponent)} as any,seed:9092644,engineHash:sourceHash,runId:id,
  options:{maxTurns:120,maxPlies:8000,legality:'strict',checkInvariants:true,upkeep:'shipped',inactivityRule:'on'},
  onAction(before,after,action,player){t.onAction(before,after,action,player);if(after.turn.turnNumber>last){last=after.turn.turnNumber;if(last%5===0)console.log('PROGRESS',id,last);}}});
 const r=result.record;append('real-ai',{id,economy,opponent,aiSeat:seat,adapter:true,cap:r.turns>120||r.plies>=8000,invalid:!!r.invariantViolation||r.anomalies.length>0||r.players.white.illegalActions+r.players.black.illegalActions>0,...r,...t.results()});
 console.log('DONE',id,r.winType,r.winner,r.turns,r.durationMs);
}
for(const seat of seats){setEconomy('A');const initial=createInitialGameState(),t=instrument(initial),id=`ai-original-A-Plant3-${seat}`;
 const ai=originalEngineBot({difficulty:'medium',speed:'ui',resign:true});
 const result=await playGame({initialState:initial,bots:{[seat]:ai,[other(seat)]:makeBot('Plant3')} as any,seed:9092644,engineHash:sourceHash,runId:id,options:{maxTurns:120,maxPlies:8000,legality:'strict',checkInvariants:true,upkeep:'shipped',inactivityRule:'on'},onAction:t.onAction});
 const r=result.record;append('real-ai',{id,economy:'A',opponent:'Plant3',aiSeat:seat,adapter:false,cap:r.turns>120||r.plies>=8000,invalid:!!r.invariantViolation||r.anomalies.length>0||r.players.white.illegalActions+r.players.black.illegalActions>0,...r,...t.results()});console.log('DONE',id,r.winType,r.winner,r.turns,r.durationMs);
}
