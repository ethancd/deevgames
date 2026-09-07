/** Follow-up to the first batch: explicitly reserve cash for ONE lead Plant.
 * Other priorities are inherited unchanged. Tier target is fixed, not map-aware.
 */
import type { Bot, ScriptedBot } from '../harness/types';
import {makeBot as original} from './map-d-policies';
import {getUnitDefinition} from '../../src/game/units';
import {getPromotionCost} from '../../src/game/promotion';
export function makeBot(name:string):Bot {
 const match=/^(Invest|Home)T([1-4])$/.exec(name);
 if(!match)return original(name);
 const tier=Number(match[2]),base=original(match[1]==='Home'?'HomeTech':'RouteTech') as ScriptedBot;
 return {kind:'scripted',name,chooseAction(ctx){
  const plants=ctx.view.board.units.filter(u=>u.owner===ctx.view.player&&u.definitionId.startsWith('plant')).sort((a,b)=>getUnitDefinition(b.definitionId).tier-getUnitDefinition(a.definitionId).tier);
  const leader=plants[0],wanted=leader&&getUnitDefinition(leader.definitionId).tier<tier;
  const reserve=wanted?getPromotionCost(leader)??0:0;
  const legal=ctx.legal.filter(a=>{
   if(a.type==='PROMOTE_UNIT'&&plants.some(u=>u.id===a.unitId))return !!wanted&&a.unitId===leader.id;
   if(a.type==='QUEUE_UNIT')return getUnitDefinition(a.definitionId).cost<=ctx.view.me.resources-reserve;
   return true;
  });
  return base.chooseAction({...ctx,legal});
 }};
}
