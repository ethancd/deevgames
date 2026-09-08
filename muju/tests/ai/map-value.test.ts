import { describe,it,expect } from 'vitest';
import { MAPS,REGIONS,distance,validateMap } from '../../lab/maps/maps';
import { mineRoute,opening,mapSummary,starterUpperBound,finance } from '../../lab/maps/model';
import { replay } from '../../lab/maps/replay';
import { getUnitDefinition } from '../../src/game/units';
import { calculateMiningYield } from '../../src/game/mining';
import { createUnit } from '../../src/game/board';

describe('map-study controls',()=>{
 it('keeps all boards 10×10, rotational, fresh at starters and budget-matched B–E',()=>{
  for(const map of MAPS){expect(()=>validateMap(map)).not.toThrow();expect(mapSummary(map).total).toBe(map.id==='A'?500:340);}
  expect(MAPS[0].cells.every(v=>v===5)).toBe(true);
  expect(MAPS.slice(2).every(m=>!mapSummary(m).reflectionX)).toBe(true);
 });
 it('changes accessible depth, not a per-action yield multiplier',()=>{
  for(const map of MAPS)for(let p=0;p<100;p++)for(const id of ['fire_1','water_1','plant_2','plant_3']){
   const u=createUnit(id,'white',{x:p%10,y:Math.floor(p/10)}),m=getUnitDefinition(id).mining;
   expect(calculateMiningYield(u,{position:u.position,minedDepth:0,resourceLayers:map.cells[p]})).toBe(Math.min(m,map.cells[p]));
  }
 });
});
// Independent primitive move/mine enumerator, on a convex 3×3 area containing all wells.
function brute(cells:number[],mining:number,speed:number,start:number,budget:number){
 const points=[0,1,2,10,11,12,20,21,22];let best=0;
 function dfs(p:number,left:number,mask:number,total:number){best=Math.max(best,total);if(!left)return;
  const i=points.indexOf(p);if(!(mask&(1<<i)))dfs(p,left-1,mask|(1<<i),total+Math.min(cells[p],mining));
  for(const q of points)if(q!==p&&distance(p,q)<=speed)dfs(q,left-1,mask,total);
 }dfs(start,budget,0,0);return best;
}
describe('exact mine-route solver',()=>{
 it('matches independent action-by-action enumeration on heterogeneous deposits',()=>{
  const m={...MAPS[0],cells:Array(100).fill(0)};[0,1,2,10,11,12,20,21,22].forEach((p,i)=>m.cells[p]=[5,0,2,4,1,3,2,5,0][i]);
  for(const mining of [1,3,5])for(const speed of [1,2])for(let budget=0;budget<=4;budget++)expect(mineRoute(m,mining,speed,0,REGIONS[0].cells,budget).income).toBe(brute(m.cells,mining,speed,0,budget));
 });
 it('keeps remaining depth distinct from shallow fresh capacity',()=>{
  const depths=Array(100).fill(3);
  expect(mineRoute(MAPS[0],3,1,0,[0],6,depths).income).toBe(0);
  expect(mineRoute(MAPS[0],5,1,0,[0],6,depths).income).toBe(2);
  const shallow={...MAPS[0],cells:Array(100).fill(2)};
  expect(mineRoute(shallow,3,1,0,[0],6).income).toBe(2);
 });
 it('never double-collects a well and accounts for relocation actions',()=>{
  expect(mineRoute(MAPS[0],5,1,0,[0],6).income).toBe(5);
  expect(mineRoute(MAPS[0],5,1,0,[0,3],4).income).toBe(5);
  expect(mineRoute(MAPS[0],5,2,0,[0,3],4).income).toBe(10);
 });
});
describe('opening witnesses',()=>{
 for(const map of MAPS)for(const policy of ['bank','plant','home','east','south','center'])it(`${map.id} ${policy}: legal five-turn route in both seats`,()=>{
  const o=opening(map,policy,64);for(const p of o.turns){expect(replay(map,p).legal).toBe(true);expect(replay(map,p,true).legal).toBe(true);}
  if(policy==='bank')for(const p of o.turns)expect(p.gross).toBeLessThanOrEqual(starterUpperBound(map,p.turn*6));
 });
 it('certifies the unchanged unopposed starter ceiling when a witness meets its bound',()=>{
  const o=opening(MAPS[0],'bank',64);expect(o.turns.map(p=>p.gross)).toEqual([11,20,29,38,47]);
  expect(o.turns.every(p=>p.gross===starterUpperBound(MAPS[0],p.turn*6))).toBe(true);
 });
 it('financing pays income after placement, respects build delays and one promotion per turn',()=>{
  expect(finance(getUnitDefinition('plant_2'),[3,3,3,3,3])).toBe(2);
  expect(finance(getUnitDefinition('metal_2'),[6,6,6,6,6])).toBe(4);
  expect(finance(getUnitDefinition('fire_3'),[100,100,100,100,100])).toBe(3);
 });
});
