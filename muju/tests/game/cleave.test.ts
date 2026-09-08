import { describe, expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { canAttack, getAttackCount, resolveCombat, resolveCombinedCombat } from '../../src/game/combat';
import { applyAction } from '../../src/ai/simulate';
import { startTurn } from '../../src/game/turn';
import { isLegalAction } from '../../src/game/legality';
import { loadGameState, saveGameState } from '../../src/utils/persistence';
import type { GameState, Unit } from '../../src/game/types';

function arena(tier: number) {
  const s = createInitialGameState();
  s.players.white.resources=20;s.players.white.resourcesGained=20;
  const attacker = createUnit(`fire_${tier}`, 'white', { x: 5, y: 5 });
  s.board.units = [attacker, ...[{x:5,y:4},{x:6,y:5},{x:5,y:6},{x:4,y:5}].map(p=>createUnit('fire_1','black',p)),createUnit('water_3','black',{x:9,y:8})];
  return { s, attacker };
}
function attack(s: GameState, a: Unit, target: Unit) {
  return applyAction(s,{type:'ATTACK',unitId:a.id,targetPosition:target.position});
}
function current(s: GameState, a: Unit) { return s.board.units.find(u=>u.id===a.id)!; }

describe('Cleave', () => {
  for (const tier of [1,2,3]) it(`Tier ${tier} stops at ${tier} paid lethal attacks`,()=>{
    let {s,attacker}=arena(tier); const victims=s.board.units.slice(1,5);
    for(let i=0;i<tier;i++) {
      s=attack(s,attacker,victims[i]);
      expect(s.board.units.some(u=>u.id===victims[i].id)).toBe(false);
      expect(getAttackCount(current(s,attacker))).toBe(i+1);
      expect(s.turn.actionsRemaining).toBe(5-i);
    }
    expect(canAttack(current(s,attacker))).toBe(false);
    expect(attack(s,attacker,victims[tier])).toBe(s);
    const restored=startTurn(s,'white');
    expect(getAttackCount(current(restored,attacker))).toBe(0);
    expect(current(restored,attacker).lastAttackKilled).toBe(false);
    expect(canAttack(current(restored,attacker))).toBe(true);
  });
  it('actually places a Tier I and prevents it sweeping three adjacent enemies',()=>{
    let s=createInitialGameState();s.turn.phase='place';
    s.board.units=[createUnit('plant_1','white',{x:4,y:4}),...[[5,4],[6,5],[5,6]].map(([x,y])=>createUnit('fire_1','black',{x,y}))];
    s.players.white.buildQueue=[{id:'fresh',definitionId:'fire_1',owner:'white',turnsRemaining:0}];
    const place={type:'PLACE_UNIT' as const,queuedUnitId:'fresh',position:{x:4,y:3}};
    expect(isLegalAction(s,place)).toBe(true);s=applyAction(s,place);
    // Move the placed unit to a square beside all three enemies.
    const fresh=s.board.units.find(u=>u.id==='unit-fresh')!;
    expect(fresh.placedThisTurn).toBe(true);
    s=applyAction(s,{type:'MOVE',unitId:fresh.id,to:{x:5,y:5}});
    const victims=s.board.units.filter(u=>u.owner==='black');
    s=attack(s,fresh,victims[0]);expect(s.board.units.some(u=>u.id===victims[0].id)).toBe(false);
    expect(attack(s,fresh,victims[1])).toBe(s);
    expect(s.board.units.filter(u=>u.owner==='black')).toHaveLength(2);
  });
  it('a nonlethal second hit closes a Tier III chain, even if another unit finishes that target',()=>{
    let {s,attacker}=arena(3);const first=s.board.units[1], tough=s.board.units[2], third=s.board.units[3];
    tough.definitionId='metal_3';const helper=createUnit('fire_2','white',{x:6,y:4});s.board.units.push(helper);
    s=attack(s,attacker,first);s=attack(s,attacker,tough);
    expect(current(s,attacker).lastAttackKilled).toBe(false);
    expect(attack(s,attacker,tough)).toBe(s);expect(attack(s,attacker,third)).toBe(s);
    s=attack(s,helper,tough);expect(s.board.units.some(u=>u.id===tough.id)).toBe(false);
    expect(canAttack(current(s,helper))).toBe(true);
    expect(attack(s,attacker,third)).toBe(s);
  });
  it('a zero-damage attack closes the chain',()=>{
    const {s,attacker}=arena(2);attacker.definitionId='plant_2';
    const after=attack(s,attacker,s.board.units[1]);
    expect(after.turn.actionsRemaining).toBe(5);
    expect(canAttack(current(after,attacker))).toBe(false);
    expect(current(after,s.board.units[1]).damageTaken).toBe(0);
  });
  it('paid movement and mining preserve a live chain; exhausted actions still block it',()=>{
    let {s,attacker}=arena(2);const first=s.board.units[1], next=s.board.units[2];
    s=attack(s,attacker,first);
    s=applyAction(s,{type:'MOVE',unitId:attacker.id,to:first.position});
    s=applyAction(s,{type:'MINE',unitId:attacker.id});
    expect(s.turn.actionsRemaining).toBe(3);expect(canAttack(current(s,attacker))).toBe(true);
    s=applyAction(s,{type:'MOVE',unitId:attacker.id,to:{x:6,y:4}});
    s=attack(s,attacker,next);expect(s.turn.actionsRemaining).toBe(1);
    expect(canAttack(current(s,attacker))).toBe(false);
    const zero={...s,turn:{...s.turn,actionsRemaining:0}};
    expect(isLegalAction(zero,{type:'ATTACK',unitId:attacker.id,targetPosition:s.board.units[1].position})).toBe(false);
  });
  it('round-trips live and spent chains through persistence without restoring attacks',()=>{
    let {s,attacker}=arena(2);s=attack(s,attacker,s.board.units[1]);
    saveGameState(s);s=loadGameState()!;expect(canAttack(current(s,attacker))).toBe(true);
    s=attack(s,attacker,s.board.units[1]);saveGameState(s);s=loadGameState()!;
    expect(canAttack(current(s,attacker))).toBe(false);expect(getAttackCount(current(s,attacker))).toBe(2);
  });
  it('legacy mid-turn saves cannot infer Cleave from missing victims',()=>{
    const {s,attacker}=arena(3);attacker.hasAttacked=true;attacker.attackedThisTurn=['already-dead'];delete attacker.lastAttackKilled;
    saveGameState(s);const loaded=loadGameState()!;
    expect(canAttack(current(loaded,attacker))).toBe(false);
    expect(canAttack(current(startTurn(loaded,'white'),attacker))).toBe(true);
  });
  it('combined attacks credit only the killing blow and reject duplicate attackers',()=>{
    const {s,attacker}=arena(2);const tough=s.board.units[1];tough.definitionId='metal_3';
    const second=createUnit('fire_2','white',{x:6,y:4});s.board.units.push(second);
    const result=resolveCombinedCombat(s.board,[attacker.id,attacker.id,second.id],tough.position);
    expect(result.eliminated).toBe(true);expect(result.totalAttack).toBe(8);
    expect(canAttack(result.board.units.find(u=>u.id===attacker.id)!)).toBe(false);
    expect(canAttack(result.board.units.find(u=>u.id===second.id)!)).toBe(true);
    expect(resolveCombat(result.board,attacker.id,s.board.units[2].position).board).toBe(result.board);
  });
});
