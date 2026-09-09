import './historical-experiment';
/** Small actual-search tests: removal must precede the invader's next turn. */
import {createInitialGameState,createUnit} from '../../src/game/board';
import {getHomeOccupier} from '../../src/game/victory';
import {createEngineBot} from '../harness/bots/engine';
import {applyAction} from '../../src/ai/simulate';
import {isLegalAction} from '../../src/game/legality';
import {writeFileSync} from 'node:fs';
const rows=[];
for(const player of ['white','black'] as const)for(const scenario of ['lightning','metal'] as const){
 const opp=player==='white'?'black':'white',k=player==='white'?0:9,inside=k===0?1:-1;
 let s=createInitialGameState();s.turn.currentPlayer=player;
 s.board.units=[createUnit(scenario==='metal'?'metal_4':'lightning_1',opp,{x:k,y:k}),createUnit('plant_1',opp,{x:9-k,y:9-k}),createUnit(scenario==='metal'?'fire_2':'water_1',player,{x:k+inside,y:k}),createUnit('fire_2',player,{x:k,y:k+inside})];
 const bot=createEngineBot({difficulty:'easy',speed:'fast',resign:false});bot.onGameStart(player,9071326);const actions=[];const started=Date.now();
 for(let i=0;i<10&&s.turn.currentPlayer===player&&s.phase==='playing'&&getHomeOccupier(s.board,opp);i++){
  const action=await bot.nextAction(s,player);if(!action)break;if(!isLegalAction(s,action))throw Error('Illegal engine action');actions.push(action.type);s=applyAction(s,action);
 }
 const row={player,scenario,cleared:!getHomeOccupier(s.board,opp),actions,elapsedMs:Date.now()-started};rows.push(row);console.log(row);
}
writeFileSync('lab/results/home-victory-2026-09-07/engine-probes.json',JSON.stringify(rows,null,2)+'\n');
