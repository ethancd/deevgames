import type { GameState, PlayerId, Unit } from './types';
import type { AIAction } from '../ai/types';
import { getUnitDefinition } from './units';

export const UPKEEP_BY_TIER: Readonly<Record<number, number>> = Object.freeze({1:0,2:1,3:2,4:3});
const STEEP: Readonly<Record<number, number>> = Object.freeze({1:0,2:1,3:3,4:5});
// Only the lab changes this process-local schedule; gameplay always starts shipped.
let schedule = UPKEEP_BY_TIER;
export function setUpkeepVariant(variant: 'shipped' | 'steep' | 'off'): void {
  schedule = variant === 'steep' ? STEEP : variant === 'off' ? {} : UPKEEP_BY_TIER;
}
export function upkeepForTier(tier: number): number { return schedule[tier] ?? 0; }
export function unitUpkeep(unit: Unit): number { return upkeepForTier(getUnitDefinition(unit.definitionId).tier); }
export function upkeepDue(state: GameState, player: PlayerId): number {
  return state.board.units.filter(u=>u.owner===player).reduce((n,u)=>n+unitUpkeep(u),0);
}
export function isUpkeepSelectionLegal(state: GameState, ids: string[]): boolean {
  if(!state.upkeepPending || state.turn.phase!=='place' || new Set(ids).size!==ids.length)return false;
  const owned=state.board.units.filter(u=>u.owner===state.turn.currentPlayer);
  return owned.every(u=>getUnitDefinition(u.definitionId).tier!==1 || ids.includes(u.id)) && ids.every(id=>owned.some(u=>u.id===id)) && owned.filter(u=>ids.includes(u.id)).reduce((n,u)=>n+unitUpkeep(u),0)<=state.players[state.turn.currentPlayer].resources;
}
/** Tier-1 units always stay; only higher tiers may be released. */
export function settleUpkeep(state: GameState, ids: string[]): GameState {
  const player=state.turn.currentPlayer, kept=new Set(ids), owned=state.board.units.filter(u=>u.owner===player);
  const released=owned.filter(u=>getUnitDefinition(u.definitionId).tier!==1&&!kept.has(u.id));
  const paid=owned.filter(u=>kept.has(u.id)).reduce((n,u)=>n+unitUpkeep(u),0), me=state.players[player];
  return {...state,upkeepPending:false,
    lastUpkeep:{player,paid,released:released.map(u=>({id:u.id,definitionId:u.definitionId,tier:getUnitDefinition(u.definitionId).tier})),turnNumber:state.turn.turnNumber},
    board:{...state.board,units:state.board.units.filter(u=>!released.some(r=>r.id===u.id))},
    players:{...state.players,[player]:{...me,resources:me.resources-paid,resourcesUpkeep:(me.resourcesUpkeep??0)+paid}}};
}
/** Deterministic affordable keep-set search. Exact up to 12 rent-bearing units;
 * larger armies retain deterministic cost/defense-priority candidate sets. */
export function upkeepActions(state: GameState): AIAction[] {
  if(!state.upkeepPending)return [];
  const units=state.board.units.filter(u=>u.owner===state.turn.currentPlayer&&unitUpkeep(u)>0);
  const cash=state.players[state.turn.currentPlayer].resources,sets:string[][]=[];
  if(units.length<=12){
    const visit=(i:number,left:number,ids:string[])=>{
      if(i===units.length){sets.push(ids);return;}
      const u=units[i],rent=unitUpkeep(u);
      if(rent<=left)visit(i+1,left-rent,[...ids,u.id]);
      visit(i+1,left,ids);
    };visit(0,cash,[]);
  }else{
    sets.push([]);
    for(const key of ['cost','defense','attack','mining'] as const){
      let left=cash;const ids:string[]=[];
      for(const u of [...units].sort((a,b)=>getUnitDefinition(b.definitionId)[key]-getUnitDefinition(a.definitionId)[key]||a.position.y-b.position.y||a.position.x-b.position.x))if(unitUpkeep(u)<=left){ids.push(u.id);left-=unitUpkeep(u);}
      sets.push(ids);
    }
  }
  const free=state.board.units.filter(u=>u.owner===state.turn.currentPlayer&&unitUpkeep(u)===0).map(u=>u.id);
  return sets.map(ids=>({type:'PAY_UPKEEP',keepUnitIds:[...free,...ids]}));
}
export function defaultUpkeepAction(state: GameState, homeFirst=false): AIAction {
  const player=state.turn.currentPlayer,home=state.players[player].startCorner;
  const distance=(u:Unit)=>Math.abs(u.position.x-home.x)+Math.abs(u.position.y-home.y);
  const units=state.board.units.filter(u=>u.owner===player&&unitUpkeep(u)>0).sort((a,b)=>
    (homeFirst?distance(a)-distance(b):0)||getUnitDefinition(b.definitionId).cost-getUnitDefinition(a.definitionId).cost||a.position.y-b.position.y||a.position.x-b.position.x);
  let cash=state.players[player].resources;const keepUnitIds=state.board.units.filter(u=>u.owner===player&&unitUpkeep(u)===0).map(u=>u.id);
  for(const u of units)if(unitUpkeep(u)<=cash){keepUnitIds.push(u.id);cash-=unitUpkeep(u);}
  return {type:'PAY_UPKEEP',keepUnitIds};
}
