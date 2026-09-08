import {mkdirSync,writeFileSync} from 'node:fs';
import {createEngineBot} from '../harness/bots/engine';
import {createBot} from '../harness/bots';
import {makeHomeBot} from './home-policies';
import {playGame} from '../harness/runner';
const out='lab/results/upkeep-draw-2026-09-08/ai';mkdirSync(out,{recursive:true});
const names=['Rush','Tier1Spam','AntiRush','Balanced','HomeT3','InvestT3'];
const rows=[];
for(const name of names)for(const seat of ['white','black'] as const){
 const ai=createEngineBot({difficulty:'medium',speed:'ui',resign:false});
 const rival=['HomeT3','InvestT3'].includes(name)?makeHomeBot(name):createBot(name);
 const result=await playGame({bots:seat==='white'?{white:ai,black:rival}:{white:rival,black:ai},seed:20260908,engineHash:'upkeep-final18',runId:`upkeep-ai-${name}-${seat}`,options:{maxTurns:120,legality:'strict',upkeep:'shipped',inactivityRule:'on',recordReplay:false}});
 rows.push({name,seat,...result.record});writeFileSync(`${out}/games.json`,JSON.stringify(rows));
 console.log(name,seat,result.record.winType,result.record.turns,Date.now());
}
