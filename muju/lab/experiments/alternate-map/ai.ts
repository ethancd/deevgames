import {appendFileSync,existsSync,writeFileSync} from 'node:fs';
import {playGame} from '../../harness/runner';
import {createEngineBot} from '../../harness/bots/engine';
import {makeHomeBot} from '../home-policies';
import {maps} from './maps';
const OUT=new URL('../../results/alternate-map-2026-09-12/',import.meta.url);
const output=new URL('ai.jsonl',OUT);if(existsSync(output))throw Error('Refusing overwrite');
writeFileSync(new URL('ai-manifest.json',OUT),JSON.stringify({difficulty:'medium',speed:'fast',mctsTimeLimit:120,mctsIterations:60,resign:false,seeds:[9122601,9122602],opponents:['Aware:Rush','Aware:Balanced'],maps:['current','alternate'],bothColors:true,note:'Production search and WASM; throughput limits, not UI strength. Time-bounded decisions are not exactly seed-reproducible.'},null,2));
for(const opponent of ['Aware:Rush','Aware:Balanced'])for(const seed of [9122601,9122602])for(const seat of ['white','black'] as const)for(const map of ['current','alternate'] as const){
 const id=`ai-${opponent.replaceAll(':','-')}-${seed}-${seat}-${map}`;
 let last=0;
 const result=await playGame({bots:{[seat]:createEngineBot({difficulty:'medium',speed:'fast',resign:false}),[seat==='white'?'black':'white']:makeHomeBot(opponent)} as any,seed,engineHash:'see-source-manifest',runId:id,experiment:'alternate-map-ai',
 options:{resourceLayout:maps[map],legality:'strict',maxTurns:80,maxPlies:8000,checkInvariants:true,recordReplay:true,upkeep:'shipped',inactivityRule:'on'},
 onAction(before,after){if(before===after)throw Error('Rejected action');if(after.turn.actionsRemaining>4)throw Error('Wrong actions');if(after.turn.turnNumber>=last+10){last=after.turn.turnNumber;console.log('PROGRESS',id,last);}}});
 const r=result.record,invalid=!!r.invariantViolation||r.players.white.illegalActions+r.players.black.illegalActions>0||r.anomalies.length>0;
 appendFileSync(output,JSON.stringify({id,map,opponent,seat,invalid,cap:r.turns>80||r.plies>=8000,...r})+'\n');
 writeFileSync(new URL(`replay-${id}.json`,OUT),JSON.stringify(result.replay));
 if(invalid)throw Error('Invalid AI game');
 console.log('AI DONE',id,r.winner,r.winType,r.turns,Math.round(r.durationMs/1000));
}
