/** Public-state invasion probes. Fixed policies, not tuned against outcomes. */
import type {Bot,ScriptedBot,BotView} from '../harness/types';
import type {AIAction} from '../../src/ai/types';
import {makeBot as oldBot} from './map-d-investment-policies';
import {createInitialGameState,manhattanDistance as dist} from '../../src/game/board';
import {getUnitDefinition} from '../../src/game/units';
import {getPromotionCost} from '../../src/game/promotion';
import {getHomeOccupier} from '../../src/game/victory';
import {applyAction} from '../../src/ai/simulate';
import {legalActions} from '../harness/legal';
import {pickBest} from '../harness/rng';
import type {GameState} from '../../src/game/types';

export function publicSimulation(v:BotView):GameState {
 const s=createInitialGameState();s.board=v.board;s.turn={currentPlayer:v.player,phase:v.phase,actionsRemaining:v.actionsRemaining,turnNumber:v.turnNumber};
 s.players[v.player]={...s.players[v.player],...v.me,resourcesManifested:v.me.resourcesSpent};
 s.players[v.opponent]={...s.players[v.opponent],...v.enemy,resources:0,buildQueue:[],resourcesManifested:v.enemy.resourcesSpent};return s;
}
/** Bounded search for a same-turn removal, including promotion and attacker rotation.
 * This is a probe, not a proof of impossibility when no line is found. */
export function clearHomePlan(initial:GameState):AIAction[]|null {
 const player=initial.turn.currentPlayer,opp=player==='white'?'black':'white',target=initial.players[player].startCorner;
 if(!getHomeOccupier(initial.board,opp))return null;
 let beam=[{s:initial,plan:[] as AIAction[]}];const seen=new Set<string>();let expanded=0;
 for(let depth=0;depth<8&&beam.length&&expanded<1600;depth++){
  const next=[] as typeof beam;
  for(const n of beam){
   for(const a of legalActions(n.s,player)){
    if(a.type==='ATTACK'&&(a.targetPosition.x!==target.x||a.targetPosition.y!==target.y))continue;
    if(a.type==='MOVE'){
     const u=n.s.board.units.find(u=>u.id===a.unitId)!;
     if(!(dist(a.to,target)<dist(u.position,target)||(dist(u.position,target)===1&&dist(a.to,target)<=2)))continue;
    }else if(!['ATTACK','PROMOTE_UNIT','END_PLACE_PHASE'].includes(a.type))continue;
    const s=applyAction(n.s,a),plan=[...n.plan,a];expanded++;
    if(!getHomeOccupier(s.board,opp))return plan;
    if(s.turn.currentPlayer!==player||s.phase!=='playing')continue;
    const key=JSON.stringify([s.turn.phase,s.turn.actionsRemaining,s.players[player].resources,s.board.units.map(u=>[u.id,u.definitionId,u.position,u.damageTaken,u.attackedThisTurn,u.promotedThisPlacement])]);
    if(seen.has(key))continue;seen.add(key);next.push({s,plan});
   }
  }
  const value=(s:GameState)=>{const invader=getHomeOccupier(s.board,opp)!;return invader.damageTaken*100+s.turn.actionsRemaining*2+s.board.units.filter(u=>u.owner===player).reduce((sum,u)=>sum+(dist(u.position,target)===1?getUnitDefinition(u.definitionId).attack*5:0),0);};
  beam=next.sort((a,b)=>value(b.s)-value(a.s)).slice(0,48);
 }
 return null;
}
export function makeHomeBot(name:string):Bot {
 if(!name.startsWith('Aware:')&&!name.startsWith('Invade:')&&!name.startsWith('Siege:'))return oldBot(name);
 const [kind,baseName]=name.split(':'),siege=kind==='Siege',tier=Number(baseName)||4;
 const base=oldBot(siege?'InvestT3':baseName) as ScriptedBot;
 return {kind:'scripted',name,chooseAction(ctx){
  const {view:v}=ctx;
  if(getHomeOccupier(v.board,v.opponent)) {const plan=clearHomePlan(publicSimulation(v));if(plan?.length)return plan[0];}
  let legal=ctx.legal;
  if(siege){
   const metal=v.board.units.filter(u=>u.owner===v.player&&u.definitionId.startsWith('metal')).sort((a,b)=>getUnitDefinition(b.definitionId).tier-getUnitDefinition(a.definitionId).tier)[0];
   if(v.phase==='place'&&metal&&getUnitDefinition(metal.definitionId).tier<tier){const p=legal.find(a=>a.type==='PROMOTE_UNIT'&&a.unitId===metal.id);if(p)return p;}
   if(v.phase==='queue'){
    if(!metal&&!v.me.buildQueue.some(q=>q.definitionId.startsWith('metal'))){const q=legal.find(a=>a.type==='QUEUE_UNIT'&&a.definitionId==='metal_1');if(q)return q;}
    const reserve=metal&&getUnitDefinition(metal.definitionId).tier<tier?(getPromotionCost(metal)??0):0;
    legal=legal.filter(a=>a.type!=='QUEUE_UNIT'||getUnitDefinition(a.definitionId).cost<=v.me.resources-reserve);
   }
  }
  const held=getHomeOccupier(v.board,v.player);if(held)legal=legal.filter(a=>a.type!=='MOVE'||a.unitId!==held.id);
  if(kind!=='Aware'&&v.phase==='action'){
   const target=v.enemy.startCorner;
   const candidates=legal.filter(a=>a.type==='MOVE'&&(!siege||v.board.units.find(u=>u.id===a.unitId)!.definitionId.startsWith('metal'))&&dist(a.to,target)<dist(v.board.units.find(u=>u.id===a.unitId)!.position,target));
   const arrive=candidates.find(a=>a.type==='MOVE'&&dist(a.to,target)===0);if(arrive)return arrive;
   // Mine and immediate combat retain the base policy's priority. Otherwise advance toward home.
   const chosen=base.chooseAction({...ctx,legal});if(chosen&&['ATTACK','MINE'].includes(chosen.type))return chosen;
   if(candidates.length)return pickBest(ctx.rng,candidates,a=>a.type==='MOVE'?-dist(a.to,target):-Infinity)!;
   return chosen;
  }
  return base.chooseAction({...ctx,legal});
 }};
}
