import { describe, expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { canAttack, getAttackCount, resolveCombat, resolveCombinedCombat } from '../../src/game/combat';
import { applyAction } from '../../src/ai/simulate';
import { startTurn } from '../../src/game/turn';
import { afterEach } from 'vitest';
import { isLegalAction } from '../../src/game/legality';
import { loadGameState, saveGameState } from '../../src/utils/persistence';
import type { GameState, Unit } from '../../src/game/types';

/** Phasing is the only ruleset since 2026-09-21. */
function arena(tier: number) {
  const s = createInitialGameState(undefined, 4, 0, 'phasing');
  s.players.white.resources=20;s.players.white.resourcesGained=20;
  const attacker = createUnit(`fire_${tier}`, 'white', { x: 5, y: 5 });
  s.board.units = [attacker, ...[{x:5,y:4},{x:6,y:5},{x:5,y:6},{x:4,y:5}].map(p=>createUnit('fire_1','black',p)),createUnit('water_3','black',{x:9,y:8})];
  return { s, attacker };
}
function attack(s: GameState, a: Unit, target: Unit) {
  return applyAction(s,{type:'ATTACK',unitId:a.id,targetPosition:target.position});
}
function current(s: GameState, a: Unit) { return s.board.units.find(u=>u.id===a.id)!; }

afterEach(() => localStorage.clear());

describe('Cleave', () => {
  // muju-phasing-4 (SPEC v3.4, 2026-09-23): no tier cap. Every tier chains four
  // lethal attacks, one per shared action; only the empty action pool stops it.
  for (const tier of [1,2,3]) it(`Tier ${tier} chains four paid lethal attacks, bounded only by actions`,()=>{
    let {s,attacker}=arena(tier); const victims=s.board.units.slice(1,5);
    for(let i=0;i<4;i++) {
      expect(canAttack(current(s,attacker))).toBe(true);
      s=attack(s,attacker,victims[i]);
      expect(s.board.units.some(u=>u.id===victims[i].id)).toBe(false);
      expect(getAttackCount(current(s,attacker))).toBe(i+1);
      expect(s.turn.actionsRemaining).toBe(3-i);
    }
    // The chain is still live, but there is no action left to spend on it.
    expect(canAttack(current(s,attacker))).toBe(true);
    expect(isLegalAction(s,{type:'ATTACK',unitId:attacker.id,targetPosition:{x:9,y:8}})).toBe(false);
    const restored=startTurn(s,'white');
    expect(getAttackCount(current(restored,attacker))).toBe(0);
    expect(current(restored,attacker).lastAttackKilled).toBe(false);
    expect(canAttack(current(restored,attacker))).toBe(true);
  });
  it('the owner example: a Hi beside four Muju kills all four in one turn',()=>{
    let s=createInitialGameState(undefined,4,0,'phasing');
    const hi=createUnit('fire_1','white',{x:5,y:5});
    const muju=[[5,4],[6,5],[5,6],[4,5]].map(([x,y])=>createUnit('plant_1','black',{x,y}));
    s.board.units=[hi,...muju,createUnit('water_3','black',{x:9,y:8})];
    for(const [i,target] of muju.entries()) {
      expect(isLegalAction(s,{type:'ATTACK',unitId:hi.id,targetPosition:target.position})).toBe(true);
      s=attack(s,hi,target);
      expect(s.board.units.some(u=>u.id===target.id)).toBe(false);
      expect(s.turn.actionsRemaining).toBe(3-i);
    }
    expect(s.board.units.filter(u=>u.definitionId==='plant_1')).toEqual([]);
    expect(getAttackCount(current(s,hi))).toBe(4);
  });
  it('summons a Tier I that arrives next turn and sweeps three adjacent enemies',()=>{
    let s=createInitialGameState(undefined,4,0,'phasing');s.turn.phase='place';
    s.board.units=[createUnit('plant_1','white',{x:4,y:4}),...[[5,2],[6,3],[5,4]].map(([x,y])=>createUnit('fire_1','black',{x,y})),createUnit('water_3','black',{x:9,y:8})];
    s.players.white.resources=3;s.players.white.resourcesGained=3;
    const place={type:'BUY_UNIT' as const,definitionId:'fire_1',position:{x:4,y:3}};
    expect(isLegalAction(s,place)).toBe(true);s=applyAction(s,place);
    // A purchase is a public commitment, not a placement: nothing is on the board yet.
    expect(s.board.units.some(u=>u.position.x===4&&u.position.y===3)).toBe(false);
    expect(s.pendingSummons).toMatchObject([{owner:'white',definitionId:'fire_1',position:{x:4,y:3}}]);
    // Hand over, let black pass a whole turn, and take delivery at the next own start.
    s=applyAction(s,{type:'END_PLACE_PHASE'});
    expect(s.turn.currentPlayer).toBe('black');
    s=applyAction(applyAction(s,{type:'END_ACTION_PHASE'}),{type:'END_PLACE_PHASE'});
    expect(s.turn).toMatchObject({currentPlayer:'white',phase:'action'});
    expect(s.pendingSummons).toEqual([]);
    // Move the arrived unit one step to the square beside all three enemies.
    const fresh=s.board.units.find(u=>u.owner==='white'&&u.position.x===4&&u.position.y===3)!;
    expect(fresh.placedThisTurn).toBe(false);
    s=applyAction(s,{type:'MOVE',unitId:fresh.id,to:{x:5,y:3}});
    expect(s.turn.actionsRemaining).toBe(3);
    const victims=s.board.units.filter(u=>u.owner==='black'&&u.definitionId==='fire_1');
    for(const victim of victims) {
      s=attack(s,fresh,victim);expect(s.board.units.some(u=>u.id===victim.id)).toBe(false);
    }
    expect(s.turn.actionsRemaining).toBe(0);
    expect(s.board.units.filter(u=>u.owner==='black')).toHaveLength(1);
  });
  it('a nonlethal second hit closes a Tier III chain, even if another unit finishes that target',()=>{
    let {s,attacker}=arena(3);const first=s.board.units[1], tough=s.board.units[2], third=s.board.units[3];
    tough.definitionId='water_3';const helper=createUnit('fire_2','white',{x:6,y:4});s.board.units.push(helper);
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
    expect(after.turn.actionsRemaining).toBe(3);
    expect(canAttack(current(after,attacker))).toBe(false);
    expect(current(after,s.board.units[1]).damageTaken).toBe(0);
  });
  it('paid movement preserves a live chain; exhausted actions still block it',()=>{
    let {s,attacker}=arena(2);const first=s.board.units[1], next=s.board.units[2];
    const third=createUnit('fire_1','black',{x:7,y:4});s.board.units.push(third);
    s=attack(s,attacker,first);
    s=applyAction(s,{type:'MOVE',unitId:attacker.id,to:first.position});
    expect(s.turn.actionsRemaining).toBe(2);expect(canAttack(current(s,attacker))).toBe(true);
    s=applyAction(s,{type:'MOVE',unitId:attacker.id,to:{x:6,y:4}});
    s=attack(s,attacker,next);expect(s.turn.actionsRemaining).toBe(0);
    // Two kills keep the chain live (no tier cap), but no action is left to use it.
    expect(canAttack(current(s,attacker))).toBe(true);
    expect(isLegalAction(s,{type:'ATTACK',unitId:attacker.id,targetPosition:third.position})).toBe(false);
    expect(isLegalAction({...s,turn:{...s.turn,actionsRemaining:1}},{type:'ATTACK',unitId:attacker.id,targetPosition:third.position})).toBe(true);
  });
  it('round-trips live and spent chains through persistence without restoring attacks',()=>{
    let {s,attacker}=arena(1);s.board.units[2].definitionId='water_3';
    s=attack(s,attacker,s.board.units[1]);
    saveGameState(s);s=loadGameState()!;expect(canAttack(current(s,attacker))).toBe(true);
    // The Ægirinn survives the Hi's hit, which closes the chain.
    s=attack(s,attacker,s.board.units[1]);expect(s.board.units[1].definitionId).toBe('water_3');
    saveGameState(s);s=loadGameState()!;
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
