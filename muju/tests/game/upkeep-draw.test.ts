import {afterEach,describe,expect,it} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {startTurn,endTurn} from '../../src/game/turn';
import {applyAction} from '../../src/ai/simulate';
import {isLegalAction} from '../../src/game/legality';
import {upkeepForTier,setUpkeepVariant,upkeepActions,upkeepDue} from '../../src/game/upkeep';
import {getGameResult} from '../../src/game/victory';
import {evaluatePosition,quickEvaluate} from '../../src/ai/evaluation';
import {saveGameState,loadGameState} from '../../src/utils/persistence';
import {AIEngineV2} from '../../src/ai/engine-v2';
import {getAttackCount} from '../../src/game/combat';
import {getUnitDefinition} from '../../src/game/units';
import {INACTIVITY_LIMIT,INACTIVITY_WARNING,LEGACY_INACTIVITY_LIMIT,resolveInactivityDraw} from '../../src/game/inactivity';
function arena(cash=0){
 const s=createInitialGameState();s.players.white.resources=cash;s.players.white.resourcesGained=cash;
 s.board.units=[createUnit('fire_2','white',{x:4,y:4}),createUnit('metal_3','white',{x:5,y:4}),createUnit('plant_1','white',{x:3,y:4}),createUnit('metal_3','black',{x:4,y:5})];return s;
}
const ids=(s:ReturnType<typeof arena>)=>s.board.units.filter(u=>u.owner==='white').map(u=>u.id);
afterEach(()=>setUpkeepVariant('shipped'));
describe('upkeep boundary',()=>{
 it('supports all four historical tiers, ships 0/1/2/3, and isolates steep/off variants',()=>{
  expect([1,2,3,4].map(upkeepForTier)).toEqual([0,1,2,3]);setUpkeepVariant('steep');expect([1,2,3,4].map(upkeepForTier)).toEqual([0,1,3,5]);setUpkeepVariant('off');expect([1,2,3,4].map(upkeepForTier)).toEqual([0,0,0,0]);
 });
 it('starting free units need no upkeep or choice',()=>{const s=startTurn(createInitialGameState(),'white');expect(s.upkeepPending).toBe(false);expect(s.lastUpkeep?.paid).toBe(0);expect(s.board.units).toHaveLength(6);});
 it('pays before healing, without action cost',()=>{
  const s=arena(3);s.board.units[0].damageTaken=1;
  const paid=startTurn(s,'white');expect(paid.players.white.resources).toBe(0);expect(paid.players.white.resourcesUpkeep).toBe(3);expect(paid.turn.actionsRemaining).toBe(4);expect(paid.board.units[0].damageTaken).toBe(0);
 });
 it('pauses healing and flags until an affordable choice is confirmed',()=>{
  const s=arena(1);s.board.units[0].damageTaken=1;s.board.units[0].attackedThisTurn=['target'];
  const pending=startTurn(s,'white');expect(pending.upkeepPending).toBe(true);expect(pending.board.units[0].damageTaken).toBe(1);
  for(const a of [{type:'END_PLACE_PHASE'},{type:'PROMOTE_UNIT',unitId:s.board.units[0].id},{type:'END_ACTION_PHASE'}] as const)expect(applyAction(pending,a)).toBe(pending);
  const keep=[s.board.units[0].id,s.board.units[2].id];const done=applyAction(pending,{type:'PAY_UPKEEP',keepUnitIds:keep});expect(done.board.units.some(u=>u.id===s.board.units[1].id)).toBe(false);expect(done.board.units[0].damageTaken).toBe(0);expect(getAttackCount(done.board.units[0])).toBe(0);expect(done.turn.actionsRemaining).toBe(4);
 });
 it('rejects foreign, missing, duplicated and unaffordable keep IDs',()=>{
  const s=startTurn(arena(1),'white');for(const keepUnitIds of [['missing'],[s.board.units[3].id],[s.board.units[0].id,s.board.units[0].id],[s.board.units[1].id]]){const a={type:'PAY_UPKEEP' as const,keepUnitIds};expect(isLegalAction(s,a)).toBe(false);expect(applyAction(s,a)).toBe(s);}
  expect(isLegalAction(arena(9),{type:'PAY_UPKEEP',keepUnitIds:[]})).toBe(false);
 });
 it('names elimination by upkeep when an all-higher-tier army is released',()=>{
  const base=arena(10);base.board.units=base.board.units.filter(u=>u.definitionId!=='plant_1');base.reviewUpkeep={white:true};const s=startTurn(base,'white');expect(s.upkeepPending).toBe(true);const next=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:[]});expect(next.winner).toBe('black');expect(next.victoryReason).toBe('upkeep-elimination');expect(next.players.white.resources).toBe(10);expect(next.lastUpkeep?.released).toHaveLength(2);
 });
 it('requires every T1 unit in forced and voluntary upkeep choices',()=>{
  for(const cash of [0,1,10]){
   const base=arena(cash);base.reviewUpkeep={white:true};const s=startTurn(base,'white');
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
  const s=startTurn(arena(2),'white'),choices=upkeepActions(s);expect(choices).toHaveLength(3);expect(choices.every(a=>isLegalAction(s,a))).toBe(true);for(const a of choices)if(a.type==='PAY_UPKEEP')expect(a.keepUnitIds).toContain(s.board.units[2].id);
 });
 it('saves a pending choice and its public clock',()=>{const s=startTurn({...arena(1),inactivityPlies:INACTIVITY_WARNING},'white');saveGameState(s);expect(loadGameState()).toEqual(s);});
 it('makes a deterministic AI upkeep decision and preserves affordable army value',async()=>{
  const s=startTurn(arena(2),'white');const a=await new AIEngineV2('medium').findBestAction(s),b=await new AIEngineV2('medium').findBestAction(s);expect(a.plan.actions).toEqual(b.plan.actions);expect(a.plan.actions[0].type).toBe('PAY_UPKEEP');expect(isLegalAction(s,a.plan.actions[0])).toBe(true);expect(applyAction(s,a.plan.actions[0]).lastUpkeep?.paid).toBeGreaterThan(0);
 });
});
describe('20 completed quiet turns',()=>{
 it('only a kill resets the clock through income settlement, save/resume and undo',()=>{
  const s=createInitialGameState();s.inactivityPlies=INACTIVITY_LIMIT-1;
  const attacker=createUnit('fire_1','white',{x:3,y:3});
  s.board.units=[attacker,createUnit('plant_1','black',{x:4,y:3}),createUnit('plant_1','black',{x:8,y:8})];
  const killed=applyAction(s,{type:'ATTACK',unitId:attacker.id,targetPosition:{x:4,y:3}});
  expect(killed).toMatchObject({inactivityPlies:0,progressThisTurn:true});
  saveGameState(killed);const resumed=loadGameState()!;
  const next=endTurn(resumed);
  expect(next.inactivityPlies).toBe(0);expect(next.lastIncome!.total).toBeGreaterThan(0);
  expect(endTurn(next).inactivityPlies).toBe(1);
  // Restoring the pre-attack state (undo) restores its clock as well.
  const undone=endTurn(s);expect(undone.victoryReason).toBe('inactivity');
  expect(undone.lastIncome!.total).toBeGreaterThan(0);
 });
 it('draws exactly at 20 and evaluates the saved terminal result as zero both ways',()=>{
  let s=createInitialGameState(Array(100).fill(0));for(let i=1;i<=INACTIVITY_LIMIT;i++){s=endTurn(s);expect(s.inactivityPlies).toBe(i);expect(s.phase).toBe(i===INACTIVITY_LIMIT?'victory':'playing');}expect(s.winner).toBeNull();expect(getGameResult(s)).toEqual({status:'draw',reason:'inactivity'});for(const p of ['white','black'] as const){expect(evaluatePosition(s,p)).toBe(0);expect(quickEvaluate(s,p)).toBe(0);}saveGameState(s);expect(loadGameState()?.victoryReason).toBe('inactivity');
 });
 it('draws before the next home win, healing or upkeep',()=>{
  const s=arena(0);s.inactivityPlies=INACTIVITY_LIMIT-1;s.turn.currentPlayer='black';s.board.units[0].position={x:9,y:9};
  s.board.units[0].damageTaken=1;for(const c of s.board.cells.flat())c.resourceLayers=0;
  const draw=endTurn(s);expect(draw.winner).toBeNull();expect(draw.victoryReason).toBe('inactivity');expect(draw.lastUpkeep).toBeUndefined();
  expect(draw.turn).toEqual(s.turn);expect(draw.board).toEqual(s.board);expect(draw.players).toEqual(s.players);
  expect(startTurn(draw,'white')).toBe(draw);
  s.inactivityPlies=INACTIVITY_LIMIT-2;expect(endTurn(s).victoryReason).toBe('home-occupation');
 });
 it('an attack eliminating the last enemy still wins during the last allowed turn',()=>{
  const s=arena(0);s.inactivityPlies=INACTIVITY_LIMIT-1;s.board.units[3].definitionId='fire_1';
  const win=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:s.board.units[3].position});
  expect(win.winner).toBe('white');expect(win.victoryReason).toBe('elimination');expect(endTurn(win)).toBe(win);
 });
 it('keeps the clock optional for lab games',()=>{
  let s=createInitialGameState(Array(100).fill(0));s.inactivityRule='off';for(let i=0;i<INACTIVITY_LIMIT+2;i++)s=endTurn(s);
  expect(s.phase).toBe('playing');expect(s.inactivityPlies).toBe(INACTIVITY_LIMIT+2);
 });
 it('migrates expired unfinished saves without losing the board or changing completed wins',()=>{
  const s=arena(1);s.inactivityPlies=INACTIVITY_LIMIT+2;saveGameState(s);const loaded=loadGameState()!;
  expect(loaded.victoryReason).toBe('inactivity');expect(loaded.board).toEqual(s.board);expect(loaded.players).toEqual(s.players);
  s.phase='victory';s.winner='white';s.victoryReason='home-occupation';saveGameState(s);expect(loadGameState()).toEqual(s);
 });
 it('chip damage does not reset; a lethal enemy attack does',()=>{
  const s=arena(0);s.inactivityPlies=7;const chip=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:s.board.units[3].position});expect(chip.inactivityPlies).toBe(7);expect(chip.progressThisTurn).not.toBe(true);
  s.board.units[3].definitionId='fire_1';const kill=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:s.board.units[3].position});expect(kill.inactivityPlies).toBe(0);expect(kill.progressThisTurn).toBe(true);
 });
 it('upkeep removal, promotion and placement do not reset progress',()=>{
  let s=startTurn({...arena(1),inactivityPlies:7},'white');s=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:[s.board.units[2].id]});expect(s.inactivityPlies).toBe(7);expect(s.progressThisTurn).not.toBe(true);
  s.turn.phase='place';s.players.white.resources=30;const u=s.board.units.find(u=>u.owner==='white')!;s=applyAction(s,{type:'PROMOTE_UNIT',unitId:u.id});expect(s.inactivityPlies).toBe(7);
  s.turn.phase='place';const placed=applyAction(s,{type:'BUY_UNIT',definitionId:'plant_1',position:{x:2,y:4}});expect(placed).not.toBe(s);expect(placed.inactivityPlies).toBe(7);expect(placed.progressThisTurn).not.toBe(true);
 });
});
/** Rules revision muju-phasing-2 (2026-09-19). The owner moved the clock from ten
 * plies to twenty; the warning keeps its three-ply margin. What resets the clock is
 * deliberately unchanged, and stays pinned by the tests above. */
describe('muju-phasing-2 quiet clock',()=>{
 it('is twenty plies, warns three plies before, and keeps the legacy limit for archives only',()=>{
  expect(INACTIVITY_LIMIT).toBe(20);expect(INACTIVITY_WARNING).toBe(17);
  expect(INACTIVITY_LIMIT-INACTIVITY_WARNING).toBe(3);
  expect(LEGACY_INACTIVITY_LIMIT).toBe(10);
 });
 it('no longer draws at the old ten-ply threshold, and plays on to twenty',()=>{
  let s=createInitialGameState(Array(100).fill(0));
  for(let i=1;i<=LEGACY_INACTIVITY_LIMIT;i++)s=endTurn(s);
  expect(s.inactivityPlies).toBe(LEGACY_INACTIVITY_LIMIT);expect(s.phase).toBe('playing');expect(s.victoryReason).toBeUndefined();
  for(let i=LEGACY_INACTIVITY_LIMIT+1;i<INACTIVITY_LIMIT;i++){s=endTurn(s);expect(s.inactivityPlies).toBe(i);expect(s.phase).toBe('playing');}
  expect(endTurn(s)).toMatchObject({phase:'victory',winner:null,victoryReason:'inactivity',inactivityPlies:INACTIVITY_LIMIT});
 });
 it('holds the draw open through the whole warning band',()=>{
  const s=createInitialGameState(Array(100).fill(0));
  for(const plies of [INACTIVITY_WARNING,INACTIVITY_WARNING+1,INACTIVITY_LIMIT-1])
   expect(resolveInactivityDraw({...s,inactivityPlies:plies}).phase,`${plies} plies`).toBe('playing');
  expect(resolveInactivityDraw({...s,inactivityPlies:INACTIVITY_LIMIT}).victoryReason).toBe('inactivity');
 });
 it('adjudicates an archived muju-phasing-1 position only when the legacy limit is pinned explicitly',()=>{
  const archived={...createInitialGameState(Array(100).fill(0)),inactivityPlies:LEGACY_INACTIVITY_LIMIT};
  expect(resolveInactivityDraw(archived).phase).toBe('playing');
  expect(resolveInactivityDraw(archived,LEGACY_INACTIVITY_LIMIT).victoryReason).toBe('inactivity');
 });
});
