import {afterEach,describe,expect,it} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {startTurn} from '../../src/game/turn';
import {applyAction} from '../../src/ai/simulate';
import {isLegalAction} from '../../src/game/legality';
import {upkeepForTier,setUpkeepVariant,upkeepActions,upkeepDue} from '../../src/game/upkeep';
import {getGameResult} from '../../src/game/victory';
import {evaluatePosition,quickEvaluate} from '../../src/ai/evaluation';
import {saveGameState,loadGameState} from '../../src/utils/persistence';
import {AIEngineV2} from '../../src/ai/engine-v2';
import {getAttackCount} from '../../src/game/combat';
import {getUnitDefinition} from '../../src/game/units';
import {INACTIVITY_LIMIT,INACTIVITY_WARNING,LEGACY_INACTIVITY_LIMIT,resolveInactivityDraw,minedTotal} from '../../src/game/inactivity';
/**
 * Phasing is the only ruleset since 2026-09-21, and it moves upkeep: a seat heals
 * and acts first, `END_ACTION_PHASE` ("Mine & prepare") mines and then charges
 * upkeep, and `END_PLACE_PHASE` hands over. The arena is deliberately barren so
 * that mining moves no cash and upkeep is the only thing these cases measure.
 */
const phasing=(layout?:readonly number[])=>createInitialGameState(layout??undefined,4,0,'phasing');
function arena(cash=0){
 const s=createInitialGameState(Array(100).fill(0),4,0,'phasing');s.players.white.resources=cash;s.players.white.resourcesGained=cash;
 s.board.units=[createUnit('fire_2','white',{x:4,y:4}),createUnit('metal_3','white',{x:5,y:4}),createUnit('plant_1','white',{x:3,y:4}),createUnit('metal_3','black',{x:4,y:5})];return s;
}
/** Start a seat's turn and take it straight to Mine & prepare, where upkeep falls due. */
const mineAndPrepare=(s:ReturnType<typeof arena>,player:'white'|'black'='white')=>applyAction(startTurn(s,player),{type:'END_ACTION_PHASE'});
/** One whole Phasing turn from the action phase: mine and prepare, then hand over. */
const passTurn=(s:ReturnType<typeof arena>)=>applyAction(applyAction(s,{type:'END_ACTION_PHASE'}),{type:'END_PLACE_PHASE'});
const ids=(s:ReturnType<typeof arena>)=>s.board.units.filter(u=>u.owner==='white').map(u=>u.id);
afterEach(()=>{setUpkeepVariant('shipped');localStorage.clear();});
describe('upkeep boundary',()=>{
 it('supports all four historical tiers, ships 0/1/2/3, and isolates steep/off variants',()=>{
  expect([1,2,3,4].map(upkeepForTier)).toEqual([0,1,2,3]);setUpkeepVariant('steep');expect([1,2,3,4].map(upkeepForTier)).toEqual([0,1,3,5]);setUpkeepVariant('off');expect([1,2,3,4].map(upkeepForTier)).toEqual([0,0,0,0]);
 });
 it('starting free units need no upkeep or choice',()=>{const s=mineAndPrepare(phasing());expect(s.upkeepPending).toBe(false);expect(s.lastUpkeep?.paid).toBe(0);expect(s.board.units).toHaveLength(6);});
 it('heals at the start of the turn and charges upkeep at Mine & prepare, without action cost',()=>{
  const s=arena(3);s.board.units[0].damageTaken=1;
  // Phasing heals the seat's units when its turn begins; upkeep is settled after
  // the action phase and still costs no action from that phase's budget.
  const ready=startTurn(s,'white');expect(ready.board.units[0].damageTaken).toBe(0);expect(ready.turn).toMatchObject({phase:'action',actionsRemaining:4});
  expect(ready.players.white.resources).toBe(3);
  const paid=applyAction(ready,{type:'END_ACTION_PHASE'});expect(paid.players.white.resources).toBe(0);expect(paid.players.white.resourcesUpkeep).toBe(3);
  expect(paid.turn).toMatchObject({phase:'place',actionsRemaining:0});expect(paid.board.units[0].damageTaken).toBe(0);
 });
 it('pauses preparation and the handover until an affordable choice is confirmed',()=>{
  const s=arena(1);s.board.units[0].damageTaken=1;s.board.units[0].attackedThisTurn=['target'];
  const ready=startTurn(s,'white');expect(ready.board.units[0].damageTaken).toBe(0);expect(getAttackCount(ready.board.units[0])).toBe(0);
  const pending=applyAction(ready,{type:'END_ACTION_PHASE'});expect(pending.upkeepPending).toBe(true);
  // Nothing else in Prepare — not the handover, not a promotion, not a second
  // helping of mining — moves until the release choice is made.
  for(const a of [{type:'END_PLACE_PHASE'},{type:'PROMOTE_UNIT',unitId:s.board.units[0].id},{type:'END_ACTION_PHASE'}] as const)expect(applyAction(pending,a)).toBe(pending);
  const keep=[s.board.units[0].id,s.board.units[2].id];const done=applyAction(pending,{type:'PAY_UPKEEP',keepUnitIds:keep});expect(done.board.units.some(u=>u.id===s.board.units[1].id)).toBe(false);expect(done.board.units[0].damageTaken).toBe(0);expect(getAttackCount(done.board.units[0])).toBe(0);
  expect(done.turn).toMatchObject({phase:'place',actionsRemaining:0});
  expect(applyAction(done,{type:'END_PLACE_PHASE'}).turn).toMatchObject({currentPlayer:'black',phase:'action',actionsRemaining:4});
 });
 it('rejects foreign, missing, duplicated and unaffordable keep IDs',()=>{
  const s=mineAndPrepare(arena(1));for(const keepUnitIds of [['missing'],[s.board.units[3].id],[s.board.units[0].id,s.board.units[0].id],[s.board.units[1].id]]){const a={type:'PAY_UPKEEP' as const,keepUnitIds};expect(isLegalAction(s,a)).toBe(false);expect(applyAction(s,a)).toBe(s);}
  expect(isLegalAction(mineAndPrepare(arena(9)),{type:'PAY_UPKEEP',keepUnitIds:[]})).toBe(false);
 });
 it('names elimination by upkeep when an all-higher-tier army is released',()=>{
  const base=arena(10);base.board.units=base.board.units.filter(u=>u.definitionId!=='plant_1');base.reviewUpkeep={white:true};const s=mineAndPrepare(base);expect(s.upkeepPending).toBe(true);const next=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:[]});expect(next.winner).toBe('black');expect(next.victoryReason).toBe('upkeep-elimination');expect(next.players.white.resources).toBe(10);expect(next.lastUpkeep?.released).toHaveLength(2);
 });
 it('requires every T1 unit in forced and voluntary upkeep choices',()=>{
  for(const cash of [0,1,10]){
   const base=arena(cash);base.reviewUpkeep={white:true};const s=mineAndPrepare(base);
   const free=s.board.units[2];
   for(const keepUnitIds of [[],[s.board.units[0].id]]){
    const action={type:'PAY_UPKEEP' as const,keepUnitIds};expect(isLegalAction(s,action)).toBe(false);expect(applyAction(s,action)).toBe(s);
   }
   const next=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:[free.id]});
   expect(next.board.units.filter(u=>u.owner==='white')).toEqual([expect.objectContaining({id:free.id})]);
   expect(next.lastUpkeep?.released).toHaveLength(2);expect(next.winner).toBeNull();expect(next.players.white.resources).toBe(cash);
  }
 });
 it('enumerates every affordable paid keep-set and retains free units by default',()=>{
  const s=mineAndPrepare(arena(2)),choices=upkeepActions(s);expect(choices).toHaveLength(3);expect(choices.every(a=>isLegalAction(s,a))).toBe(true);for(const a of choices)if(a.type==='PAY_UPKEEP')expect(a.keepUnitIds).toContain(s.board.units[2].id);
 });
 it('saves a pending choice and its public clock',()=>{const s=mineAndPrepare({...arena(1),inactivityPlies:INACTIVITY_WARNING});expect(s.upkeepPending).toBe(true);saveGameState(s);expect(loadGameState()).toEqual(s);});
 it('makes a deterministic AI upkeep decision and preserves affordable army value',async()=>{
  const s=mineAndPrepare(arena(2));const a=await new AIEngineV2('medium').findBestAction(s),b=await new AIEngineV2('medium').findBestAction(s);expect(a.plan.actions).toEqual(b.plan.actions);expect(a.plan.actions[0].type).toBe('PAY_UPKEEP');expect(isLegalAction(s,a.plan.actions[0])).toBe(true);expect(applyAction(s,a.plan.actions[0]).lastUpkeep?.paid).toBeGreaterThan(0);
 });
});
describe('10 completed kill-free turns (kill clock)',()=>{
 it('only a kill resets the clock through income settlement, save/resume and undo',()=>{
  const s=phasing();s.inactivityPlies=INACTIVITY_LIMIT-1;
  const attacker=createUnit('fire_1','white',{x:3,y:3});
  s.board.units=[attacker,createUnit('plant_1','black',{x:4,y:3}),createUnit('plant_1','black',{x:8,y:8})];
  const killed=applyAction(s,{type:'ATTACK',unitId:attacker.id,targetPosition:{x:4,y:3}});
  expect(killed).toMatchObject({inactivityPlies:0,progressThisTurn:true});
  saveGameState(killed);const resumed=loadGameState()!;
  // Mining alone is not a ply; the clock advances only when the turn is handed over.
  const mined=applyAction(resumed,{type:'END_ACTION_PHASE'});
  expect(mined.inactivityPlies).toBe(0);expect(mined.lastIncome!.total).toBeGreaterThan(0);
  const next=applyAction(mined,{type:'END_PLACE_PHASE'});
  expect(next.inactivityPlies).toBe(0);
  expect(passTurn(next).inactivityPlies).toBe(1);
  // Restoring the pre-attack state (undo) restores its clock as well. Only
  // White has taken a turn, so White is ahead on mined totals.
  const undone=passTurn(s);expect(undone.victoryReason).toBe('kill-clock');expect(undone.winner).toBe('white');
  expect(undone.lastIncome!.total).toBeGreaterThan(0);
 });
 // Spec §5(a): a kill on ply 9 resets the clock and play continues.
 it('(a) a kill on the ninth kill-free ply resets the clock and play continues',()=>{
  const s=phasing();s.inactivityPlies=INACTIVITY_LIMIT-2; // one quiet turn from the terminal
  const attacker=createUnit('fire_1','white',{x:3,y:3});
  s.board.units=[attacker,createUnit('plant_1','black',{x:4,y:3}),createUnit('plant_1','black',{x:8,y:8})];
  const killed=applyAction(s,{type:'ATTACK',unitId:attacker.id,targetPosition:{x:4,y:3}});
  expect(killed.progressThisTurn).toBe(true);
  const next=applyAction(applyAction(killed,{type:'END_ACTION_PHASE'}),{type:'END_PLACE_PHASE'});
  expect(next.phase).toBe('playing');expect(next.inactivityPlies).toBe(0);
 });
 // Spec §5(b)/(c): the tenth kill-free ply ends the game on mined totals,
 // including Black's handicap; an equal total is a draw.
 it('(b) the tenth kill-free ply ends the game on mined totals, including Black\'s handicap',()=>{
  let s=phasing(Array(100).fill(0));
  s.players.white.resourcesGained=5;s.players.black.resourcesGained=2;s.blackCrystalHandicap=4;
  // Black's mined total (2 + 4 handicap = 6) exceeds White's (5).
  expect(minedTotal(s,'black')).toBe(6);expect(minedTotal(s,'white')).toBe(5);
  for(let i=1;i<=INACTIVITY_LIMIT;i++){s=passTurn(s);expect(s.inactivityPlies).toBe(i);expect(s.phase).toBe(i===INACTIVITY_LIMIT?'victory':'playing');}
  expect(s).toMatchObject({phase:'victory',winner:'black',victoryReason:'kill-clock'});
  for(const p of ['white','black'] as const)expect(evaluatePosition(s,p)).toBe(p==='black'?100000:-100000);
  saveGameState(s);expect(loadGameState()).toMatchObject({victoryReason:'kill-clock',winner:'black'});
 });
 it('(c) a tie on mined totals at the tenth kill-free ply is a draw',()=>{
  let s=phasing(Array(100).fill(0));for(let i=1;i<=INACTIVITY_LIMIT;i++)s=passTurn(s);
  expect(s.winner).toBeNull();expect(getGameResult(s)).toEqual({status:'draw',reason:'kill-clock'});
  for(const p of ['white','black'] as const){expect(evaluatePosition(s,p)).toBe(0);expect(quickEvaluate(s,p)).toBe(0);}
  saveGameState(s);expect(loadGameState()?.victoryReason).toBe('kill-clock');expect(loadGameState()?.winner).toBeNull();
 });
 it('ends before the next home win, healing or upkeep',()=>{
  const s=arena(0);s.inactivityPlies=INACTIVITY_LIMIT-1;s.turn.currentPlayer='black';s.board.units[0].position={x:9,y:9};
  s.board.units[0].damageTaken=1;s.players.black.resources=2;
  // The mover's own mining and upkeep come first in Phasing; the kill clock is
  // read at the handover, before the opponent's turn start would heal, award the
  // home occupation, or (spec §5(f)) let an occupier win by occupation.
  const prepared=applyAction(s,{type:'END_ACTION_PHASE'});expect(prepared.upkeepPending).toBe(false);
  const ended=applyAction(prepared,{type:'END_PLACE_PHASE'});expect(ended.winner).toBeNull();expect(ended.victoryReason).toBe('kill-clock');
  expect(ended.turn).toEqual(prepared.turn);expect(ended.board).toEqual(prepared.board);expect(ended.players).toEqual(prepared.players);
  expect(startTurn(ended,'white')).toBe(ended);
  s.inactivityPlies=INACTIVITY_LIMIT-2;expect(passTurn(s).victoryReason).toBe('home-occupation');
 });
 it('an attack eliminating the last enemy still wins during the last allowed turn',()=>{
  const s=arena(0);s.inactivityPlies=INACTIVITY_LIMIT-1;s.board.units[3].definitionId='fire_1';
  const win=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:s.board.units[3].position});
  expect(win.winner).toBe('white');expect(win.victoryReason).toBe('elimination');expect(passTurn(win)).toBe(win);
 });
 it('keeps the clock optional for lab games',()=>{
  let s=phasing(Array(100).fill(0));s.inactivityRule='off';for(let i=0;i<INACTIVITY_LIMIT+2;i++)s=passTurn(s);
  expect(s.phase).toBe('playing');expect(s.inactivityPlies).toBe(INACTIVITY_LIMIT+2);
 });
 it('migrates expired unfinished saves without losing the board or changing completed wins',()=>{
  const s=arena(1);s.inactivityPlies=INACTIVITY_LIMIT+2;saveGameState(s);const loaded=loadGameState()!;
  expect(loaded.victoryReason).toBe('kill-clock');expect(loaded.board).toEqual(s.board);expect(loaded.players).toEqual(s.players);
  s.phase='victory';s.winner='white';s.victoryReason='home-occupation';saveGameState(s);expect(loadGameState()).toEqual(s);
 });
 it('chip damage does not reset; a lethal enemy attack does',()=>{
  const s=arena(0);s.inactivityPlies=7;const chip=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:s.board.units[3].position});expect(chip.inactivityPlies).toBe(7);expect(chip.progressThisTurn).not.toBe(true);
  s.board.units[3].definitionId='fire_1';const kill=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:s.board.units[3].position});expect(kill.inactivityPlies).toBe(0);expect(kill.progressThisTurn).toBe(true);
 });
 it('upkeep removal, promotion and placement do not reset progress',()=>{
  let s=mineAndPrepare({...arena(1),inactivityPlies:7});s=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:[s.board.units[2].id]});expect(s.inactivityPlies).toBe(7);expect(s.progressThisTurn).not.toBe(true);
  s.turn.phase='place';s.players.white.resources=30;const u=s.board.units.find(u=>u.owner==='white')!;s=applyAction(s,{type:'PROMOTE_UNIT',unitId:u.id});expect(s.inactivityPlies).toBe(7);
  s.turn.phase='place';const placed=applyAction(s,{type:'BUY_UNIT',definitionId:'plant_1',position:{x:2,y:4}});expect(placed).not.toBe(s);expect(placed.inactivityPlies).toBe(7);expect(placed.progressThisTurn).not.toBe(true);
 });
});
/** Rules revision muju-phasing-3 (2026-09-22). The owner replaced the twenty-ply
 * draw with a ten-ply kill clock that decides on mined totals; the warning keeps
 * its three-ply margin, now at 7. What resets the clock is deliberately
 * unchanged, and stays pinned by the tests above. */
describe('muju-phasing-3 kill clock',()=>{
 it('is ten plies, warns three plies before, and keeps the muju-phasing-2 legacy limit for archives only',()=>{
  expect(INACTIVITY_LIMIT).toBe(10);expect(INACTIVITY_WARNING).toBe(7);
  expect(INACTIVITY_LIMIT-INACTIVITY_WARNING).toBe(3);
  expect(LEGACY_INACTIVITY_LIMIT).toBe(20);
 });
 it('decides on mined totals at the new ten-ply limit rather than drawing at the old twenty',()=>{
  let s=phasing(Array(100).fill(0));
  s.players.white.resourcesGained=9;s.players.black.resourcesGained=1;
  for(let i=1;i<INACTIVITY_LIMIT;i++){s=passTurn(s);expect(s.inactivityPlies).toBe(i);expect(s.phase).toBe('playing');}
  expect(passTurn(s)).toMatchObject({phase:'victory',winner:'white',victoryReason:'kill-clock',inactivityPlies:INACTIVITY_LIMIT});
 });
 it('holds the verdict open through the whole warning band',()=>{
  const s=phasing(Array(100).fill(0));
  for(const plies of [INACTIVITY_WARNING,INACTIVITY_WARNING+1,INACTIVITY_LIMIT-1])
   expect(resolveInactivityDraw({...s,inactivityPlies:plies}).phase,`${plies} plies`).toBe('playing');
  expect(resolveInactivityDraw({...s,inactivityPlies:INACTIVITY_LIMIT}).victoryReason).toBe('kill-clock');
 });
 it('adjudicates an archived muju-phasing-2 position only when the legacy limit and draw verdict are pinned explicitly',()=>{
  const s=phasing(Array(100).fill(0));
  // Below the live ten-ply limit, the position is simply still playing.
  expect(resolveInactivityDraw({...s,inactivityPlies:INACTIVITY_LIMIT-1}).phase).toBe('playing');
  // At the archived muju-phasing-2 limit (20), the live default ALSO already
  // ends the game, since 20 >= the live ten-ply limit — but only the pinned
  // legacy call reproduces that archive's own draw verdict; the unpinned
  // default uses the live mined-total verdict instead.
  const archived={...s,inactivityPlies:LEGACY_INACTIVITY_LIMIT};
  expect(resolveInactivityDraw(archived,LEGACY_INACTIVITY_LIMIT,'draw')).toMatchObject({victoryReason:'inactivity',winner:null});
  expect(resolveInactivityDraw(archived).victoryReason).toBe('kill-clock');
 });
});
