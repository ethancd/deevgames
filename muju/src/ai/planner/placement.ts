import type {GameState,PlayerId} from '../../game/types';
import type {TurnPlan} from './types';
import type {AIAction} from '../types';
import {generatePlaceActions,generatePromoteActions} from '../moves';
import {applyAction} from '../simulate';
import {isLegalAction} from '../../game/legality';
import {getUnitDefinition} from '../../game/units';
import {unitEndOfTurnTake} from '../../game/mining';
import {scorePartialPlan,tagPlan} from './scoring';
import type {SearchBudget} from '../runtime';

/** Bounded Prepare plans buy delayed miners and next-turn defenders.
 * Pending pieces cannot strike, block, mine or extend a spawn rectangle now. */
export function placementPlans(state:GameState,player:PlayerId,budget?:SearchBudget):TurnPlan[] {
 if(state.turn.phase!=='place'||state.upkeepPending)return [];
 const purchases=generatePlaceActions(state,player).filter(a=>a.type==='BUY_UNIT');
 const plans:TurnPlan[]=[];
 function add(actions:AIAction[]) {
  if(budget?.exhausted())return;
  let next=state;const legal:AIAction[]=[];
  for(const a of actions){if(next.turn.currentPlayer!==player||!isLegalAction(next,a))break;legal.push(a);next=applyAction(next,a);}
  if(!legal.length)return;
  const plan:TurnPlan={id:JSON.stringify(legal),actions:legal,score:0,tags:[]};
  plan.score=scorePartialPlan(plan,state,player,next);
  plans.push(tagPlan(plan,state,player,next));
 }
 const home=state.players[player].startCorner;
 for(const id of [...new Set(purchases.map(a=>a.definitionId))]) {
  const options=purchases.filter(a=>a.definitionId===id);
  const def=getUnitDefinition(id);
  const positionScore=(a:typeof options[number])=>{
   const take=Math.min(def.mining,state.board.cells[a.position.y][a.position.x].resourceLayers);
   const dist=Math.abs(a.position.x-home.x)+Math.abs(a.position.y-home.y);
   return 0.9*take*10+(def.mining>=2?-dist:dist);
  };
  options.sort((a,b)=>positionScore(b)-positionScore(a));
  for(const a of options.slice(0,2))add([a]);
 }
 // Promoting a live anchor is a separate candidate even if purchases dominate counts.
 for(const a of generatePromoteActions(state,player))add([a]);
 for(const enemy of state.board.units.filter(u=>u.owner!==player).slice(0,8)) {
  // A safe NEXT-turn blocker; enemy reach was filtered before ranking.
  for(const id of ['water_1','metal_1']) {
   const block=purchases.filter(a=>a.definitionId===id).sort((a,b)=>
    (Math.abs(a.position.x-enemy.position.x)+Math.abs(a.position.y-enemy.position.y))-(Math.abs(b.position.x-enemy.position.x)+Math.abs(b.position.y-enemy.position.y)))[0];
   if(block)add([block]);
  }
 }
 return plans;
}

/** Cheap preference used before expensive evaluation when the beam is bounded. */
export function incomeMovePriority(state:GameState,action:AIAction):number {
 if(action.type!=='MOVE')return action.type==='ATTACK'?100:0;
 const u=state.board.units.find(u=>u.id===action.unitId)!;
 return unitEndOfTurnTake(u,state.board.cells[action.to.y][action.to.x])-unitEndOfTurnTake(u,state.board.cells[u.position.y][u.position.x]);
}
