import {expect,it} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {INACTIVITY_LIMIT} from '../../src/game/inactivity';
import {AIEngineV2} from '../../src/ai/engine-v2';
import {applyAction} from '../../src/ai/simulate';
import {referenceTactics} from '../../src/ai/tactics/home';
import {SearchBudget} from '../../src/ai/runtime';
import {startTurn} from '../../src/game/turn';
import {evaluatePosition} from '../../src/ai/evaluation';
import {playGame} from '../../lab/harness/runner';
import type {ScriptedBot} from '../../lab/harness/types';
// Under the kill clock (`muju-phasing-3`) the clock no longer draws: it decides
// on mined totals. A side already ahead on mined totals can rationally let an
// imminent clock expire instead of risking a kill, since coasting to the
// terminal is itself a win — this is CORRECT play, not a bug (verified below:
// Medium, with White ahead here, lets the clock resolve rather than trading).
// So the "must not lose the clock" case is now built the other way round:
// White is BEHIND on mined totals, where letting the clock expire is a loss.
it('Medium coasts to a mined-total win instead of risking a kill when already ahead',async()=>{
 let s=createInitialGameState(undefined, 4, 0, 'phasing');s.inactivityPlies=INACTIVITY_LIMIT-1;s.players.white.resources=12;s.players.white.resourcesGained=12;
 s.board.units=[createUnit('plant_3','white',{x:4,y:4}),createUnit('metal_3','white',{x:3,y:4}),createUnit('plant_1','black',{x:4,y:5}),createUnit('plant_1','black',{x:8,y:8})];
 const engine=new AIEngineV2('medium');let remaining=4000;
 for(let i=0;i<8&&s.turn.currentPlayer==='white'&&s.phase==='playing';i++){
  const r=await engine.findBestAction(s,remaining);remaining=Math.max(0,remaining-r.timeMs);s=applyAction(s,r.plan.actions[0]);
 }
 expect(s).toMatchObject({phase:'victory',winner:'white',victoryReason:'kill-clock'});
});
// The evaluation itself (not full search, which is a strength question the
// spec defers) must score an imminent kill-clock LOSS far below taking an
// available kill that resets the clock. This is the rules-correctness bar:
// `evaluatePosition`/`scorePartialPlan` read the mined-total verdict through
// `getGameResult`, exactly like any other decisive terminal.
it('scores an imminent kill-clock loss far below the kill that avoids it',()=>{
 // A zero-resource board holds White's mined total fixed at the set value:
 // this turn's own passive mining cannot close the gap and flip the verdict.
 const s=createInitialGameState(Array(100).fill(0), 4, 0, 'phasing');s.inactivityPlies=INACTIVITY_LIMIT-1;
 // Bank enough to auto-pay tier-3 upkeep; the mined total (`resourcesGained`)
 // that the kill clock actually reads is the separate, low figure below.
 s.players.white.resources=10;s.players.white.resourcesGained=2;
 s.players.black.resources=12;s.players.black.resourcesGained=12;
 // fire_2's attack (3) exactly meets plant_1's defense (3): a clean one-hit kill.
 s.board.units=[createUnit('fire_2','white',{x:4,y:4}),createUnit('metal_3','white',{x:3,y:4}),createUnit('plant_1','black',{x:4,y:5}),createUnit('plant_1','black',{x:8,y:8})];
 // Passing the turn without a kill lets the clock decide on mined totals: a loss.
 const passed=applyAction(applyAction(s,{type:'END_ACTION_PHASE'}),{type:'END_PLACE_PHASE'});
 expect(passed).toMatchObject({phase:'victory',winner:'black',victoryReason:'kill-clock'});
 // Killing the adjacent weak unit resets the clock and keeps the game live.
 const attacker=s.board.units[0];
 const killed=applyAction(s,{type:'ATTACK',unitId:attacker.id,targetPosition:s.board.units[2].position});
 expect(killed.progressThisTurn).toBe(true);
 const afterKill=applyAction(applyAction(killed,{type:'END_ACTION_PHASE'}),{type:'END_PLACE_PHASE'});
 expect(afterKill.phase).toBe('playing');expect(afterKill.inactivityPlies).toBe(0);
 expect(evaluatePosition(passed,'white')).toBeLessThan(-1000);
 expect(evaluatePosition(afterKill,'white')).toBeGreaterThan(evaluatePosition(passed,'white')+1000);
});
// Phasing charges rent AFTER the action phase, so the order is the other way
// round: the kill is provable while the seat is acting, and the pending rent
// that follows makes every tactical action illegal until it is settled.
it('the acting board can prove the rescue; pending rent has no tactical proof',()=>{
 let s=createInitialGameState(undefined, 4, 0, 'phasing');s.board.units=[createUnit('fire_2','white',{x:1,y:0}),createUnit('plant_1','white',{x:1,y:1}),createUnit('fire_1','black',{x:0,y:0})];s.players.white.resources=1;s.players.white.resourcesGained=1;s.reviewUpkeep={white:true};s=startTurn(s,'white');const target=s.board.units[2].id;
 expect(referenceTactics(s,target,3000,new SearchBudget()).status).toBe('proved');
 const pending=applyAction(s,{type:'END_ACTION_PHASE'});expect(pending.upkeepPending).toBe(true);
 expect(referenceTactics(pending,target,3000,new SearchBudget()).status).toBe('unknown');
});
it('harness records a real kill-clock terminal separately from its safety cap',async()=>{
 const pass:ScriptedBot={kind:'scripted',name:'Pass',chooseAction:()=>null};const {record}=await playGame({bots:{white:pass,black:pass},seed:1,engineHash:'test',runId:'clock',options:{maxTurns:120}});
 // Two bots that never act still mine passively and symmetrically, so the
 // kill clock ends the game on the INACTIVITY_LIMIT-th quiet ply (ten hand-offs
 // each) tied on mined totals — a draw, but via `kill-clock`, not the old
 // `inactivity` verdict those revisions used.
 expect(record.winType).toBe('kill-clock');expect(record.inactivityDraw).toBe(false);expect(record.maxInactivityPlies).toBe(INACTIVITY_LIMIT);expect(record.turns).toBe(INACTIVITY_LIMIT/2);expect(record.invariantViolation).toBeNull();expect(record.anomalies).toEqual([]);expect(record.players.white.upkeepPaid).toBe(0);
});
