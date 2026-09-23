import { afterEach, describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS, getNextTierDefinition, getUnitDefinition } from '../../src/game/units';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { canPromote, getPromotedDefinitionId } from '../../src/game/promotion';
import { applyAction } from '../../src/ai/simulate';
import { generateAllActions } from '../../src/ai/moves';
import { isLegalAction } from '../../src/game/legality';
import { loadGameState, saveGameState, SCHEMA_VERSION } from '../../src/utils/persistence';
import { canAttack } from '../../src/game/combat';
import baseline from '../../lab/solver/baseline-v1.3.json';

/** Phasing is the only ruleset since 2026-09-21. */
const phasing=()=>createInitialGameState(undefined,4,0,'phasing');
afterEach(()=>localStorage.clear());

/** Display names renamed 2026-09-22 (Muju Hono Irumbu); baseline-v1.3.json is
 * historical evidence and keeps the pre-rename spelling. See JUDGMENT_LOG.md J-023. */
const RENAMED_2026_09_22: Record<string,string> = {fire_2:'Honō',lightning_3:'Kimbunga',water_1:'Sjór',water_3:'Ægirinn',shadow_1:'Loş',plant_2:'Mallki',plant_3:"Sach'akuna",metal_1:'Poṉ',metal_2:'Veḷḷi',metal_3:'Irumbu'};

describe('current catalogue boundary', () => {
  it('preserves the 18-unit ladder with approved stats and 3/4/5 purchases plus 4/8 promotions', () => {
    expect(UNIT_DEFINITIONS).toEqual(baseline.filter(d => d.tier <= 3).map(({buildTime: _removed, ...d}) => ({...d,cost:({fire:3,lightning:3,water:4,shadow:4,plant:5,metal:5}[d.element]!+[0,4,12][d.tier-1]),...(RENAMED_2026_09_22[d.id]?{name:RENAMED_2026_09_22[d.id]}:{}),...(d.element==='metal'?{speed:d.tier===3?2:d.speed}:{}),...({lightning_1:{attack:1},lightning_2:{attack:2},lightning_3:{mining:0},plant_1:{defense:3},plant_2:{mining:5},plant_3:{mining:8},metal_1:{speed:0,mining:3},metal_2:{attack:1,mining:4},metal_3:{mining:5,defense:5}} as Record<string,object>)[d.id]})));
    expect(UNIT_DEFINITIONS).toHaveLength(18);
  });
  // muju-phasing-4 (SPEC v3.4, 2026-09-23): Cleave's former 1/2/3 cap is gone.
  it('never caps Cleave by tier: any catalogue entry whose last attack killed may attack again', () => {
    expect([...new Set(UNIT_DEFINITIONS.map(d => d.tier))]).toEqual([1,2,3]);
    for(const d of UNIT_DEFINITIONS) {
      const u=createUnit(d.id,'white',{x:1,y:1});u.lastAttackKilled=true;
      for(let count=1;count<=4;count++) {
        u.attackedThisTurn=Array.from({length:count},(_,i)=>`dead-${i}`);
        expect(canAttack(u)).toBe(true);
      }
      u.lastAttackKilled=false;expect(canAttack(u)).toBe(false);
    }
  });
  for(const element of ['fire','lightning','water','shadow','plant','metal']) {
    it(`${element}: rejects removed purchases and stops promotion at tier 3`, () => {
      const s=phasing();s.turn.phase='place';s.players.white.resources=100;
      const u=createUnit(`${element}_3`,'white',{x:1,y:0});s.board.units=[u,...s.board.units.filter(u=>u.owner==='black')];
      const funds={crystals:100,queue:[]};
      expect(getNextTierDefinition(u.definitionId)).toBeNull();
      expect(getPromotedDefinitionId(u)).toBeNull();expect(canPromote(u,funds)).toBe(false);
      expect(applyAction(s,{type:'PROMOTE_UNIT',unitId:u.id})).toBe(s);
      expect(generateAllActions(s,'white').some(a=>a.type==='PROMOTE_UNIT'&&a.unitId===u.id)).toBe(false);
      const removed=`${element}_4`;
      expect(()=>getUnitDefinition(removed)).toThrow();
      s.turn.phase='place';
      expect(isLegalAction(s,{type:'BUY_UNIT',definitionId:removed,position:{x:0,y:0}})).toBe(false);
      expect(applyAction(s,{type:'BUY_UNIT',definitionId:removed,position:{x:0,y:0}})).toBe(s);
      expect(generateAllActions(s,'white').filter(a=>a.type==='BUY_UNIT').every(a=>!a.definitionId.endsWith('_4'))).toBe(true);
    });
  }
  for(const location of ['board','queue']) it(`discards v2 saves with tier 4 in the ${location}`,()=>{
    const s=phasing();
    if(location==='board')s.board.units[0].definitionId='fire_4';
    else s.players.white.buildQueue=[{id:'old',owner:'white',definitionId:'metal_4',turnsRemaining:0}];
    localStorage.setItem('elemental-tactics-save',JSON.stringify({schemaVersion:2,timestamp:0,state:s}));
    expect(loadGameState()).toBeNull();expect(localStorage.getItem('elemental-tactics-save')).toBeNull();
  });
  it('round-trips the current schema',()=>{
    expect(SCHEMA_VERSION).toBe(11);const s=phasing();saveGameState(s);expect(loadGameState()).toEqual(s);
  });
});
