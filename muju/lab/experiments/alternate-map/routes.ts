import type {ScriptedBot} from '../../harness/types';
import {makeHomeBot} from '../home-policies';
import {getUnitDefinition} from '../../../src/game/units';
import {manhattanDistance as dist} from '../../../src/game/board';
import {pickBest} from '../../harness/rng';
// Controlled opening adaptation, not a general-purpose strong strategy.
// Same base policy, army preferences and combat for every route. Only the
// first-turn Hi anchor and first new Plant's purchase location are changed.
export function makeRouteBot(route:'Center'|'CenterDeep'|'CenterFork'|'Shelf'|'Wing'|'Home'):ScriptedBot {
 const targets={Center:{x:3,y:4},CenterDeep:{x:4,y:4},CenterFork:{x:5,y:4},Shelf:{x:1,y:3},Wing:{x:7,y:1},Home:{x:2,y:2}};
 const base=makeHomeBot('Aware:RouteBasic') as ScriptedBot;
 let planted=false;
 return {kind:'scripted',name:`Route:${route}`,onGameStart(){planted=false;},chooseAction(ctx){
  const {view:v}=ctx,p=targets[route],target=v.player==='white'?p:{x:9-p.x,y:9-p.y};
  if(v.turnNumber===1&&v.phase==='action'){
   const scout=v.board.units.find(u=>u.owner===v.player&&u.definitionId==='fire_1')!;
   if(dist(scout.position,target)===0)return null;
   const moves=ctx.legal.filter(a=>a.type==='MOVE'&&a.unitId===scout.id&&dist(a.to,target)<dist(scout.position,target));
   return pickBest(ctx.rng,moves,a=>a.type==='MOVE'?-dist(a.to,target):-Infinity)??null;
  }
  const chosen=base.chooseAction(ctx);
  if(!planted&&chosen?.type==='BUY_UNIT'&&chosen.definitionId==='plant_1'){
   planted=true;
   const options=ctx.legal.filter(a=>a.type==='BUY_UNIT'&&a.definitionId==='plant_1');
   const mining=getUnitDefinition('plant_1').mining;
   return pickBest(ctx.rng,options,a=>a.type==='BUY_UNIT'?Math.min(3*mining,v.board.cells[a.position.y][a.position.x].resourceLayers)-0.5*dist(a.position,target):-Infinity)??chosen;
  }
  return chosen;
 }};
}
