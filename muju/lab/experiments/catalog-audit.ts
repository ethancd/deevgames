import './historical-experiment';
/** Exact static diagnostics, not simulated win rates. Run from muju. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { UNIT_DEFINITIONS, getNextTierDefinition } from '../../src/game/units';
import { getAttackModifier } from '../../src/game/elements';
const rows=UNIT_DEFINITIONS.map(d=>{
 const next=getNextTierDefinition(d.id);
 const dominates=UNIT_DEFINITIONS.filter(o=>o.tier===d.tier&&o.id!==d.id&&
  UNIT_DEFINITIONS.every(t=>getAttackModifier(o.element,t.element)===getAttackModifier(d.element,t.element))&&
  o.cost<=d.cost&&o.attack>=d.attack&&o.defense>=d.defense&&o.speed>=d.speed&&o.mining>=d.mining&&
  (o.cost<d.cost||o.attack>d.attack||o.defense>d.defense||o.speed>d.speed||o.mining>d.mining)).map(o=>o.id);
 return {...d,dominatedAtSameTierIgnoringTechPathBy:dominates,promotionCost:next?next.cost-d.cost:null,
  freshCellYield:Math.min(5,d.mining),maxOpenBoardMoveThenAttackDistance:Math.min(18,5*d.speed+1),
  attackBreakpoints:UNIT_DEFINITIONS.map(t=>{const power=Math.max(0,d.attack+getAttackModifier(d.element,t.element));return {target:t.id,power,distinctAttackersRequired:power?Math.ceil(t.defense/power):null};})};
});
mkdirSync('lab/results/e8-2026-09-07',{recursive:true});
writeFileSync('lab/results/e8-2026-09-07/catalog.json',JSON.stringify({note:'Undamaged defenders; distinct attackers because same-target repeat attacks are forbidden. Reach ignores occupancy. Dominance excludes tech-path value.',rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(({id,dominatedAtSameTierIgnoringTechPathBy,promotionCost})=>({id,dominatedAtSameTierIgnoringTechPathBy,promotionCost})),null,2));
