import type {Bot,ScriptedBot} from './.sandbox/lab/harness/types';
import {makeHomeBot,clearHomePlan,publicSimulation} from './.sandbox/lab/experiments/home-policies';
import {createGreedyBot} from './.sandbox/lab/harness/bots/greedy';
import {getUnitDefinition as def} from './.sandbox/src/game/units';
import {getPromotionCost} from './.sandbox/src/game/promotion';
import {calculateMiningYield} from './.sandbox/src/game/mining';
import {getHomeOccupier} from './.sandbox/src/game/victory';
import {attackKills,attackPowerAt,defenderAt,unitById} from './.sandbox/lab/harness/bots/bot-utils';
import {pickBest} from './.sandbox/lab/harness/rng';
import {distance,pos} from './common';

// First eight pairings also supply counterfactual promotion states; all fixed before games.
export const PAIRS=[
 ['Plant3','Rush'],['Plant3','MiningDenial'],['Plant3','Aware:AntiRush'],['Plant3','Metal3'],
 ['Plant3','Plant2'],['Plant3','Aware:Balanced'],['Plant3','Invade:LightningRush'],['Plant3','Guard:Turtle'],
 ['Plant2','Rush'],['Plant2','MiningDenial'],['Plant2','Metal3'],['Plant2','Aware:Balanced'],
 ['Plant3','Plant3'],['Plant2','Plant2'],['Metal3','Metal3'],['Metal3','Rush'],
 ['Metal3','MiningDenial'],['Plant1','Plant2'],['Plant1','Plant3'],['Mono-plant','Mono-metal'],
 ['InvestT3','HomeT3'],['Invade:Balanced','Aware:Balanced'],['Rush','AntiRush'],['LightningRush','Expand']
] as const;

/** Fixed extension of E11/E13's route policy: one intended leader, two miners per
 * six units, mixed T1 army, same scores in every economy, actual yields throughout.
 * Target tier is deliberately unconditional so the experiment tests its vulnerability. */
export function makeBot(name:string):Bot {
 if(name.startsWith('Sustain:')){
  const base=makeBot(name.slice(8)) as ScriptedBot;
  return {...base,name,chooseAction(ctx){
   const rent=ctx.view.board.units.filter(u=>u.owner===ctx.view.player).reduce((n,u)=>n+def(u.definitionId).tier-1,0)+ctx.view.me.buildQueue.reduce((n,q)=>n+def(q.definitionId).tier-1,0);
   const legal=ctx.legal.filter(a=>{
    if(a.type==='QUEUE_UNIT'){const d=def(a.definitionId);return ctx.view.me.resources-d.cost>=rent+d.tier-1;}
    if(a.type==='PROMOTE_UNIT'){const u=ctx.view.board.units.find(u=>u.id===a.unitId)!;return ctx.view.me.resources-(getPromotionCost(u)??Infinity)>=rent+1;}
    return true;
   });
   return base.chooseAction({...ctx,legal});
  }};
 }
 const m=/^(Plant|Metal)([1-3])$/.exec(name);if(!m)return makeHomeBot(name);
 const element=m[1].toLowerCase(),tier=Number(m[2]),greedy=createGreedyBot();
 const bot:ScriptedBot={kind:'scripted',name,chooseAction(ctx){
  const v=ctx.view,own=v.board.units.filter(u=>u.owner===v.player),miners=own.filter(u=>def(u.definitionId).element===element).sort((a,b)=>def(b.definitionId).tier-def(a.definitionId).tier),lead=miners[0];
  const wants=lead&&def(lead.definitionId).tier<tier,reserve=wants?getPromotionCost(lead)??0:0;
  let legal=ctx.legal.filter(a=>a.type!=='PROMOTE_UNIT'||!!wants&&a.unitId===lead.id);
  if(getHomeOccupier(v.board,v.opponent)){const plan=clearHomePlan(publicSimulation(v));if(plan?.length&&legal.some(a=>JSON.stringify(a)===JSON.stringify(plan[0])))return plan[0];}
  if(v.phase==='place'){const upgrade=legal.find(a=>a.type==='PROMOTE_UNIT');return upgrade??greedy.chooseAction({...ctx,legal});}
  if(v.phase==='queue'){
   const want=miners.length+v.me.buildQueue.filter(q=>q.definitionId.startsWith(element)).length<Math.max(2,Math.ceil((own.length+v.me.buildQueue.length)/3));
   legal=legal.filter(a=>a.type!=='QUEUE_UNIT'||def(a.definitionId).cost<=v.me.resources-reserve&&(want?a.definitionId===`${element}_1`:['water_1','fire_1','lightning_1','metal_1'].includes(a.definitionId)));
   return greedy.chooseAction({...ctx,legal});
  }
  const held=getHomeOccupier(v.board,v.player);if(held)legal=legal.filter(a=>a.type!=='MOVE'||a.unitId!==held.id);
  const scores=new Map<object,number>();
  for(const a of legal){let score=-1;
   if(a.type==='ATTACK'){const u=unitById(v,a.unitId)!,t=defenderAt(v,a.targetPosition)!;score=attackKills(v,u,a.targetPosition)?1000+def(t.definitionId).cost*10:100+attackPowerAt(v,u,a.targetPosition)*10;}
   if(a.type==='MINE'){const u=unitById(v,a.unitId)!;score=150+40*calculateMiningYield(u,v.board.cells[u.position.y][u.position.x]);}
   if(a.type==='MOVE'){const u=unitById(v,a.unitId)!,d=def(u.definitionId),p=a.to.y*10+a.to.x,cost=Math.ceil(distance(pos(u),p)/d.speed);
    if(d.mining>=2&&calculateMiningYield(u,v.board.cells[u.position.y][u.position.x])===0){const income=calculateMiningYield(u,v.board.cells[a.to.y][a.to.x]);if(income>0)score=60+100*income/(cost+1);}
    if(d.attack>=2){const enemies=v.board.units.filter(e=>e.owner!==v.player);const cur=Math.min(...enemies.map(e=>distance(pos(u),pos(e)))),next=Math.min(...enemies.map(e=>distance(p,pos(e))));if(next<cur)score=Math.max(score,20+10*(cur-next)/cost);}
   }scores.set(a,score);
  }
  const chosen=pickBest(ctx.rng,legal,a=>scores.get(a)!);return chosen&&scores.get(chosen)!>0?chosen:null;
 }};return bot;
}
