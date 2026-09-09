import {expect,it} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {AIEngineV2} from '../../src/ai/engine-v2';
import {applyAction} from '../../src/ai/simulate';
import {referenceTactics} from '../../src/ai/tactics/home';
import {SearchBudget} from '../../src/ai/runtime';
import {startTurn} from '../../src/game/turn';
import {playGame} from '../../lab/harness/runner';
import type {ScriptedBot} from '../../lab/harness/types';
it('Medium resets an imminent draw with a mine while ahead',async()=>{
 let s=createInitialGameState();s.inactivityPlies=9;s.players.white.resources=12;s.players.white.resourcesGained=12;
 s.board.units=[createUnit('plant_3','white',{x:4,y:4}),createUnit('metal_3','white',{x:3,y:4}),createUnit('plant_1','black',{x:8,y:8})];
 const engine=new AIEngineV2('medium');let remaining=4000;
 for(let i=0;i<8&&s.turn.currentPlayer==='white'&&!s.progressThisTurn&&s.phase==='playing';i++){
  const r=await engine.findBestAction(s,remaining);remaining=Math.max(0,remaining-r.timeMs);s=applyAction(s,r.plan.actions[0]);
 }
 expect(s.victoryReason).not.toBe('inactivity');expect(s.progressThisTurn).toBe(true);
},10000);
it('pending rent has no tactical proof; the paid board can prove the rescue',()=>{
 let s=createInitialGameState();s.board.units=[createUnit('fire_2','white',{x:1,y:0}),createUnit('plant_1','white',{x:1,y:1}),createUnit('fire_1','black',{x:0,y:0})];s.players.white.resources=1;s.players.white.resourcesGained=1;s.reviewUpkeep={white:true};s=startTurn(s,'white');const target=s.board.units[2].id;
 expect(referenceTactics(s,target,3000,new SearchBudget()).status).toBe('unknown');s=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:s.board.units.filter(u=>u.owner==='white').map(u=>u.id)});expect(referenceTactics(s,target,3000,new SearchBudget()).status).toBe('proved');
});
it('harness records a real inactivity draw separately from its safety cap',async()=>{
 const pass:ScriptedBot={kind:'scripted',name:'Pass',chooseAction:()=>null};const {record}=await playGame({bots:{white:pass,black:pass},seed:1,engineHash:'test',runId:'clock',options:{maxTurns:120}});
 expect(record.winType).toBe('inactivity');expect(record.inactivityDraw).toBe(true);expect(record.maxInactivityPlies).toBe(10);expect(record.turns).toBe(5);expect(record.invariantViolation).toBeNull();expect(record.anomalies).toEqual([]);expect(record.players.white.upkeepPaid).toBe(0);
});
