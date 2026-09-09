import {afterEach,describe,expect,it} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {startTurn,endTurn} from '../../src/game/turn';
import {applyAction} from '../../src/ai/simulate';
import {isLegalAction} from '../../src/game/legality';
import {upkeepForTier,setUpkeepVariant,upkeepActions,upkeepDue} from '../../src/game/upkeep';
import {getGameResult} from '../../src/game/victory';
import {evaluatePosition,quickEvaluate} from '../../src/ai/evaluation';
import {extractPublicState} from '../../src/ai/state/observation';
import {reconcileBelief} from '../../src/ai/belief/reconcile';
import {saveGameState,loadGameState} from '../../src/utils/persistence';
import {AIEngineV2} from '../../src/ai/engine-v2';
import {getAttackCount} from '../../src/game/combat';
import {getUnitDefinition} from '../../src/game/units';
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
 it('pays before healing and queue advance, without action cost',()=>{
  const s=arena(3);s.board.units[0].damageTaken=1;s.players.white.buildQueue=[{id:'q',definitionId:'fire_3',owner:'white',turnsRemaining:1}];
  const paid=startTurn(s,'white');expect(paid.players.white.resources).toBe(0);expect(paid.players.white.resourcesSpent).toBe(3);expect(paid.players.white.resourcesManifested).toBe(3);expect(paid.players.white.resourcesUpkeep).toBe(3);expect(paid.turn.actionsRemaining).toBe(6);expect(paid.board.units[0].damageTaken).toBe(0);expect(paid.players.white.buildQueue[0].turnsRemaining).toBe(0);
 });
 it('pauses healing, flags and queue until an affordable choice is confirmed',()=>{
  const s=arena(1);s.board.units[0].damageTaken=1;s.board.units[0].attackCount=1;s.players.white.buildQueue=[{id:'q',definitionId:'fire_3',owner:'white',turnsRemaining:2}];
  const pending=startTurn(s,'white');expect(pending.upkeepPending).toBe(true);expect(pending.board.units[0].damageTaken).toBe(1);expect(pending.players.white.buildQueue[0].turnsRemaining).toBe(2);
  for(const a of [{type:'END_PLACE_PHASE'},{type:'PROMOTE_UNIT',unitId:s.board.units[0].id},{type:'END_TURN'}] as const)expect(applyAction(pending,a)).toBe(pending);
  const keep=[s.board.units[0].id,s.board.units[2].id];const done=applyAction(pending,{type:'PAY_UPKEEP',keepUnitIds:keep});expect(done.board.units.some(u=>u.id===s.board.units[1].id)).toBe(false);expect(done.board.units[0].damageTaken).toBe(0);expect(getAttackCount(done.board.units[0])).toBe(0);expect(done.players.white.buildQueue[0].turnsRemaining).toBe(1);expect(done.turn.actionsRemaining).toBe(6);
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
 it('preserves public bank plus hidden-queue conservation after payment',()=>{
  const base=arena(10);base.players.white.resourcesGained=16;base.players.white.resourcesSpent=6;base.players.white.buildQueue=[{id:'q',definitionId:'fire_3',owner:'white',turnsRemaining:2}];
  const s=startTurn(base,'white'),view=extractPublicState(s,'black');expect(view.players.white.resources).toBe(0);expect(view.players.white.resourcesSpent).toBe(3);const belief=reconcileBelief(view,'white',10,()=>0.5);for(const p of belief.particles)expect(p.resources+p.buildQueue.reduce((n,q)=>n+getUnitDefinition(q.definitionId).cost,0)).toBe(13);expect(s.players.white.resources+6).toBe(13);
 });
 it('enumerates every affordable paid keep-set and retains free units by default',()=>{
  const s=startTurn(arena(2),'white'),choices=upkeepActions(s);expect(choices).toHaveLength(3);expect(choices.every(a=>isLegalAction(s,a))).toBe(true);for(const a of choices)if(a.type==='PAY_UPKEEP')expect(a.keepUnitIds).toContain(s.board.units[2].id);
 });
 it('saves a pending choice and its public clock',()=>{const s=startTurn({...arena(1),inactivityPlies:17},'white');saveGameState(s);expect(loadGameState()).toEqual(s);});
 it('makes a deterministic AI upkeep decision and preserves affordable army value',async()=>{
  const s=startTurn(arena(2),'white');const a=await new AIEngineV2('medium').findBestAction(s),b=await new AIEngineV2('medium').findBestAction(s);expect(a.plan.actions).toEqual(b.plan.actions);expect(a.plan.actions[0].type).toBe('PAY_UPKEEP');expect(isLegalAction(s,a.plan.actions[0])).toBe(true);expect(applyAction(s,a.plan.actions[0]).lastUpkeep?.paid).toBeGreaterThan(0);
 });
});
describe('20 completed quiet turns',()=>{
 it('draws exactly at 20 and evaluates the saved terminal result as zero both ways',()=>{
  let s=createInitialGameState();for(let i=1;i<=20;i++){s=endTurn(s);expect(s.inactivityPlies).toBe(i);expect(s.phase).toBe(i===20?'victory':'playing');}expect(s.winner).toBeNull();expect(getGameResult(s)).toEqual({status:'draw',reason:'inactivity'});for(const p of ['white','black'] as const){expect(evaluatePosition(s,p)).toBe(0);expect(quickEvaluate(s,p)).toBe(0);}saveGameState(s);expect(loadGameState()?.victoryReason).toBe('inactivity');
 });
 it('gives an already-won home or elimination priority over draw and unpaid rent',()=>{
  const s=arena(0);s.inactivityPlies=19;s.turn.currentPlayer='black';s.board.units[0].position={x:9,y:9};const home=endTurn(s);expect(home.winner).toBe('white');expect(home.victoryReason).toBe('home-occupation');expect(home.lastUpkeep).toBeUndefined();
  s.board.units=s.board.units.filter(u=>u.owner==='white');s.board.units[0].position={x:3,y:3};expect(endTurn(s).victoryReason).toBe('elimination');
 });
 it('positive mining resets now and leaves the completed turn at zero; zero-yield mining is illegal',()=>{
  const s=createInitialGameState();s.inactivityPlies=19;const u=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='plant_1')!;s.board.cells[u.position.y][u.position.x].resourceLayers=5;const next=applyAction(s,{type:'MINE',unitId:u.id});expect(next.inactivityPlies).toBe(0);expect(endTurn(next).inactivityPlies).toBe(0);
  s.board.cells[u.position.y][u.position.x].resourceLayers=0;expect(applyAction(s,{type:'MINE',unitId:u.id})).toBe(s);
 });
 it('chip damage does not reset; a lethal enemy attack does',()=>{
  const s=arena(0);s.inactivityPlies=15;const chip=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:s.board.units[3].position});expect(chip.inactivityPlies).toBe(15);expect(chip.progressThisTurn).not.toBe(true);
  s.board.units[3].definitionId='fire_1';const kill=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:s.board.units[3].position});expect(kill.inactivityPlies).toBe(0);expect(kill.progressThisTurn).toBe(true);
 });
 it('upkeep removal, promotion and placement do not reset progress',()=>{
  let s=startTurn({...arena(1),inactivityPlies:15},'white');s=applyAction(s,{type:'PAY_UPKEEP',keepUnitIds:[s.board.units[2].id]});expect(s.inactivityPlies).toBe(15);expect(s.progressThisTurn).not.toBe(true);
  s.turn.phase='place';s.players.white.resources=30;const u=s.board.units.find(u=>u.owner==='white')!;s=applyAction(s,{type:'PROMOTE_UNIT',unitId:u.id});expect(s.inactivityPlies).toBe(15);
  s.turn.phase='place';s.players.white.buildQueue=[{id:'ready',definitionId:'plant_1',owner:'white',turnsRemaining:0}];const placed=applyAction(s,{type:'PLACE_UNIT',queuedUnitId:'ready',position:{x:2,y:4}});expect(placed).not.toBe(s);expect(placed.inactivityPlies).toBe(15);expect(placed.progressThisTurn).not.toBe(true);
 });
 it('newly placed units first pay at their next own turn',()=>{
  const s=arena(20);s.turn.phase='place';s.players.white.buildQueue=[{id:'ready',definitionId:'fire_2',owner:'white',turnsRemaining:0}];const p=applyAction(s,{type:'PLACE_UNIT',queuedUnitId:'ready',position:{x:3,y:3}});expect(p.players.white.resources).toBe(20);expect(upkeepDue(p,'white')).toBe(4);expect(startTurn(p,'white').players.white.resources).toBe(16);
 });
});
