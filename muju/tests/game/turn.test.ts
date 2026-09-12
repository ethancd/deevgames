import {describe,it,expect} from 'vitest';
import {createInitialGameState,createUnit} from '../../src/game/board';
import {startTurn,endTurn,useAction,startActionPhase,canActInPlacePhase} from '../../src/game/turn';
import {applyAction} from '../../src/ai/simulate';
import {getGameResult} from '../../src/game/victory';

describe('two-phase boundary order',()=>{
 it('starts with four actions, then collects for each mover before the next place phase',()=>{
  let s=createInitialGameState();expect(s.turn).toMatchObject({phase:'action',actionsRemaining:4,turnNumber:1});
  s=endTurn(s);expect(s.turn.currentPlayer).toBe('black');expect(s.players.white.resources).toBe(6);expect(s.players.black.resources).toBe(0);
  s=endTurn(s);expect(s.turn).toMatchObject({currentPlayer:'white',phase:'place',actionsRemaining:4,turnNumber:2});expect(s.players.black.resources).toBe(6);
  expect(canActInPlacePhase(s,'white')).toBe(true);expect(startActionPhase(s).turn.phase).toBe('action');
 });
 it('resets owned actions, heals owned damage and allows last-turn purchases to promote',()=>{
  const s=createInitialGameState();for(const u of s.board.units){u.hasMoved=true;u.hasAttacked=true;u.lastAttackKilled=true;u.attackedThisTurn=['dead'];u.damageTaken=1;u.placedThisTurn=true;u.promotedThisPlacement=true;}
  const next=startTurn(s,'white');
  expect(next.board.units.filter(u=>u.owner==='white').every(u=>!u.hasMoved&&!u.hasAttacked&&!u.placedThisTurn&&!u.promotedThisPlacement&&!u.lastAttackKilled&&u.damageTaken===0&&u.attackedThisTurn?.length===0)).toBe(true);
  expect(next.board.units.filter(u=>u.owner==='black')).toEqual(s.board.units.filter(u=>u.owner==='black'));
 });
 it('pays new promotion rent next own turn, after income and before healing',()=>{
  let s=createInitialGameState();s.turn.phase='place';s.players.white.resources=4;s.players.white.resourcesGained=4;
  const hi=s.board.units[0];s=applyAction(s,{type:'PROMOTE_UNIT',unitId:hi.id});expect(s.players.white.resources).toBe(0);
  s=applyAction(s,{type:'END_PLACE_PHASE'});s=endTurn(s);expect(s.players.white.resources).toBe(6);
  s=endTurn(s);expect(s.lastUpkeep).toMatchObject({player:'white',paid:1});expect(s.players.white.resources).toBe(5);
 });
 it('positive passive income still completes a quiet turn',()=>{
  const s=createInitialGameState();s.inactivityPlies=9;const before=structuredClone(s);const next=endTurn(s);
  expect(s).toEqual(before);expect(next.inactivityPlies).toBe(10);expect(next.phase).toBe('victory');expect(next.lastIncome?.total).toBe(6);
 });
 it('draws at exactly ten completed kill-free player turns',()=>{
  let s=createInitialGameState();
  for(let i=1;i<=10;i++){s=endTurn(s);expect(s.inactivityPlies).toBe(i);expect(s.phase).toBe(i===10?'victory':'playing');}
  expect(getGameResult(s)).toEqual({status:'draw',reason:'inactivity'});expect(endTurn(s)).toBe(s);
 });
 it('collects before the draw, and draws before the next home win or upkeep',()=>{
  const s=createInitialGameState(Array(100).fill(0));s.turn.currentPlayer='black';s.inactivityPlies=9;
  s.board.units[0].position={x:9,y:9};s.board.units[0].damageTaken=1;
  const draw=endTurn(s);expect(draw.victoryReason).toBe('inactivity');expect(draw.lastIncome).toMatchObject({player:'black',total:0});expect(draw.lastUpkeep).toBeUndefined();expect(draw.board.units).toEqual(s.board.units);
  s.inactivityPlies=8;expect(endTurn(s).victoryReason).toBe('home-occupation');
  s.inactivityPlies=9;s.board.cells[9][8].resourceLayers=1;expect(endTurn(s).victoryReason).toBe('inactivity');
 });
 it('does not settle income after immediate elimination or resignation',()=>{
  const s=createInitialGameState();s.board.units=[createUnit('fire_1','white',{x:1,y:1}),createUnit('plant_1','black',{x:1,y:2})];
  const win=applyAction(s,{type:'ATTACK',unitId:s.board.units[0].id,targetPosition:{x:1,y:2}});expect(win.victoryReason).toBe('elimination');expect(endTurn(win)).toBe(win);expect(win.lastIncome).toBeUndefined();
  const resigned=applyAction(s,{type:'RESIGN'});expect(endTurn(resigned)).toBe(resigned);
 });
 it('cannot bypass a pending upkeep choice and bounds the action budget',()=>{
  const s=createInitialGameState();s.upkeepPending=true;expect(startActionPhase(s)).toBe(s);expect(endTurn(s)).toBe(s);
  let next=createInitialGameState();for(let i=0;i<9;i++)next=useAction(next);expect(next.turn.actionsRemaining).toBe(0);
 });
});
