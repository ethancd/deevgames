/** Fixed public-information probes. No parameters tuned to match results. */
import type { Bot, ScriptedBot } from '../harness/types';
import { createBot } from '../harness/bots';
import { createRushBot } from '../harness/bots/archetypes';
import { createGreedyBot } from '../harness/bots/greedy';
import { getUnitDefinition } from '../../src/game/units';
import { manhattanDistance as distance } from '../../src/game/board';
import { pickBest } from '../harness/rng';
import { unitById, miningYieldAt, attackKills, defenderAt, unitCost, attackPowerAt } from '../harness/bots/bot-utils';

export function makeBot(name:string):Bot {
 if(name==='LightningRush')return createRushBot('lightning_1');
 if(!['RouteTech','RouteBasic','HomeTech'].includes(name))return createBot(name);
 const greedy=createGreedyBot(), homeOnly=name==='HomeTech', tech=name!=='RouteBasic';
 const bot:ScriptedBot={kind:'scripted',name,chooseAction(ctx){
  const {view}=ctx, own=view.board.units.filter(u=>u.owner===view.player);
  const allowed=ctx.legal.filter(a=>a.type!=='PROMOTE_UNIT'||tech||!unitById(view,a.unitId)?.definitionId.startsWith('plant'));
  if(view.phase==='place') {
   const plant=allowed.find(a=>a.type==='PROMOTE_UNIT'&&unitById(view,a.unitId)?.definitionId.startsWith('plant'));
   return plant??greedy.chooseAction({...ctx,legal:allowed});
  }
  if(view.phase==='queue') {
   // Two miners per six own units, counting the hidden OWN queue only.
   const miners=own.filter(u=>u.definitionId.startsWith('plant')).length+view.me.buildQueue.filter(u=>u.definitionId.startsWith('plant')).length;
   const wantPlant=miners<Math.max(2,Math.ceil((own.length+view.me.buildQueue.length)/3));
   const queue=allowed.filter(a=>a.type!=='QUEUE_UNIT'||(wantPlant?a.definitionId==='plant_1':['water_1','fire_1','lightning_1','metal_1'].includes(a.definitionId)));
   return greedy.chooseAction({...ctx,legal:queue});
  }
  const scores=new Map<object,number>();
  for(const a of allowed){let score=-1;
   if(a.type==='ATTACK') {const u=unitById(view,a.unitId)!,t=defenderAt(view,a.targetPosition)!;score=attackKills(view,u,a.targetPosition)?1000+unitCost(t)*10:100+attackPowerAt(view,u,a.targetPosition)*10;}
   if(a.type==='MINE'){const u=unitById(view,a.unitId)!;score=150+miningYieldAt(view,u)*40;}
   if(a.type==='MOVE') {
    const u=unitById(view,a.unitId)!,d=getUnitDefinition(u.definitionId),cost=Math.ceil(distance(u.position,a.to)/d.speed);
    if(d.mining>=2&&miningYieldAt(view,u)===0&&(!homeOnly||distance(a.to,view.me.startCorner)<=6)) {
     const cell=view.board.cells[a.to.y][a.to.x],yieldHere=Math.max(0,Math.min(cell.resourceLayers,d.mining-cell.minedDepth));
     // Prefer actual attainable yield per move+mine action; all destinations are legal.
     if(yieldHere>0)score=60+100*yieldHere/(cost+1);
    }
    if(d.attack>=2) {
     const enemies=view.board.units.filter(e=>e.owner!==view.player);
     const cur=Math.min(...enemies.map(e=>distance(u.position,e.position)));
     const next=Math.min(...enemies.map(e=>distance(a.to,e.position)));
     if(next<cur&&(!homeOnly||distance(a.to,view.me.startCorner)<=6))score=Math.max(score,20+10*(cur-next)/cost);
    }
   }
   scores.set(a,score);
  }
  const best=pickBest(ctx.rng,allowed,a=>scores.get(a)!);
  return best&&scores.get(best)!>0?best:null;
 }};return bot;
}
