import { describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS, getNextTierDefinition, getUnitDefinition } from '../../src/game/units';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { canBuildUnit, addToBuildQueue, getAvailableBuildOptions } from '../../src/game/building';
import { canPromote, getPromotedDefinitionId } from '../../src/game/promotion';
import { applyAction } from '../../src/ai/simulate';
import { generateAllActions } from '../../src/ai/moves';
import { isLegalAction } from '../../src/game/legality';
import { loadGameState, saveGameState, SCHEMA_VERSION } from '../../src/utils/persistence';
import { canAttack } from '../../src/game/combat';
import baseline from '../../lab/solver/baseline-v1.3.json';

describe('v1.5 catalogue boundary', () => {
  it('preserves every ordered T1–T3 definition except requested Metal names and Tanka Speed 2', () => {
    expect(UNIT_DEFINITIONS).toEqual(baseline.filter(d => d.tier <= 3).map(d => d.element==='metal' ? {...d,name:['Inyan','Mazask','Tanka'][d.tier-1],speed:d.tier===3?2:d.speed} : d));
    expect(UNIT_DEFINITIONS).toHaveLength(18);
  });
  it('caps Cleave at exactly 1/2/3 for every catalogue entry', () => {
    expect([...new Set(UNIT_DEFINITIONS.map(d => d.tier))]).toEqual([1,2,3]);
    for(const d of UNIT_DEFINITIONS) {
      const u=createUnit(d.id,'white',{x:1,y:1});u.lastAttackKilled=true;
      u.attackedThisTurn=Array.from({length:d.tier-1},(_,i)=>`dead-${i}`);
      expect(canAttack(u)).toBe(true);
      u.attackedThisTurn.push('last');expect(canAttack(u)).toBe(false);
    }
  });
  for(const element of ['fire','lightning','water','shadow','plant','metal']) {
    it(`${element}: rejects removed purchases and stops promotion at tier 3`, () => {
      const s=createInitialGameState();s.turn.phase='place';s.players.white.resources=100;
      const u=createUnit(`${element}_3`,'white',{x:1,y:0});s.board.units=[u,...s.board.units.filter(u=>u.owner==='black')];
      const funds={crystals:100,queue:[]};
      expect(getNextTierDefinition(u.definitionId)).toBeNull();
      expect(getPromotedDefinitionId(u)).toBeNull();expect(canPromote(u,funds)).toBe(false);
      expect(applyAction(s,{type:'PROMOTE_UNIT',unitId:u.id})).toBe(s);
      expect(generateAllActions(s,'white').some(a=>a.type==='PROMOTE_UNIT'&&a.unitId===u.id)).toBe(false);
      const removed=`${element}_4`;
      expect(()=>getUnitDefinition(removed)).toThrow();
      expect(canBuildUnit(removed,'white',s.board,funds)).toBe(false);
      expect(()=>addToBuildQueue(funds,removed)).toThrow();
      expect(getAvailableBuildOptions(funds,'white',s.board).every(id=>!id.endsWith('_4'))).toBe(true);
      s.turn.phase='queue';
      expect(isLegalAction(s,{type:'QUEUE_UNIT',definitionId:removed})).toBe(false);
      expect(applyAction(s,{type:'QUEUE_UNIT',definitionId:removed})).toBe(s);
      expect(generateAllActions(s,'white').filter(a=>a.type==='QUEUE_UNIT').every(a=>!a.definitionId.endsWith('_4'))).toBe(true);
    });
  }
  for(const location of ['board','queue']) it(`discards v2 saves with tier 4 in the ${location}`,()=>{
    const s=createInitialGameState();
    if(location==='board')s.board.units[0].definitionId='fire_4';
    else s.players.white.buildQueue=[{id:'old',owner:'white',definitionId:'metal_4',turnsRemaining:0}];
    localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:2,timestamp:0,state:s}));
    expect(loadGameState()).toBeNull();expect(localStorage.getItem('elemental-tactics-save')).toBeNull();
  });
  it('round-trips the current schema',()=>{
    expect(SCHEMA_VERSION).toBe(4);const s=createInitialGameState();saveGameState(s);expect(loadGameState()).toEqual(s);
  });
});
