import type {GameState,PlayerId} from './.sandbox/src/game/types';
import type {AIAction} from './.sandbox/src/ai/types';
import {getUnitDefinition as def} from './.sandbox/src/game/units';
import {layerValue} from './.sandbox/src/game/economy';
import {summaryState,seats,pos} from './common';

export function instrument(initial?:GameState){
 const events:any[]=[],curve:any[]=[],promotions:any[]=[],mines:any[]=[],arrivals:Record<string,any>={white:{},black:{}};
 const unitLedger:Record<string,any>={};let final:GameState|undefined=initial,firstAttack:number|null=null;
 const init=(s:GameState)=>{for(const u of s.board.units){const d=def(u.definitionId);arrivals[u.owner][d.tier]??=s.turn.turnNumber;unitLedger[u.id]??={owner:u.owner,definition:u.definitionId,income:0,mineActions:0,moveActions:0,armyActions:0,paidRent:0,arrived:s.turn.turnNumber,alive:true};}};
 if(initial){init(initial);curve.push(summaryState(initial));}
 const onAction=(before:GameState,after:GameState,action:AIAction,player:PlayerId)=>{
  if(!curve.length){init(before);curve.push(summaryState(before));}init(after);final=after;
  const u='unitId' in action?before.board.units.find(u=>u.id===action.unitId):undefined;
  const e:any={ply:events.length+1,turn:before.turn.turnNumber,player,phase:before.turn.phase,action,applied:before!==after,quietBefore:before.inactivityPlies??0,quietAfter:after.inactivityPlies??0};
  if(u){e.unit=u.definitionId;e.at=pos(u);}
  e.income=after.players[player].resourcesGained-before.players[player].resourcesGained;
  e.spent=after.players[player].resourcesSpent-before.players[player].resourcesSpent;
  const actionPoints=before.turn.currentPlayer===after.turn.currentPlayer&&before.turn.phase==='action'?before.turn.actionsRemaining-after.turn.actionsRemaining:0;
  e.actionPoints=Math.max(0,actionPoints);
  if(u&&action.type==='MINE'&&e.income>0){const c=before.board.cells[u.position.y][u.position.x],n=after.board.cells[u.position.y][u.position.x];
   e.depthFrom=c.minedDepth+1;e.layers=n.minedDepth-c.minedDepth;e.fifth=e.depthFrom<=5&&n.minedDepth===5?layerValue(5):0;
   mines.push(e);unitLedger[u.id].income+=e.income;unitLedger[u.id].mineActions++;
  }
  if(u&&action.type==='MOVE')unitLedger[u.id].moveActions+=e.actionPoints;
  if(u&&action.type==='ATTACK'){firstAttack??=before.turn.turnNumber;unitLedger[u.id].armyActions+=e.actionPoints;}
  if(action.type==='PROMOTE_UNIT'&&u&&before!==after){const n=after.board.units.find(v=>v.id===u.id)!;const promotion={id:u.id,owner:player,from:u.definitionId,to:n.definitionId,turn:before.turn.turnNumber,at:pos(u),cost:e.spent};promotions.push(promotion);unitLedger[u.id].definition=n.definitionId;}
  if(after.lastUpkeep&&after.lastUpkeep!==before.lastUpkeep){e.upkeep=after.lastUpkeep;const ids=new Set(after.lastUpkeep.released.map(u=>u.id));for(const kept of before.board.units.filter(u=>u.owner===after.lastUpkeep!.player&&!ids.has(u.id)))unitLedger[kept.id].paidRent+=def(kept.definitionId).tier-1;}
  const removed=before.board.units.filter(v=>!after.board.units.some(w=>w.id===v.id));
  if(removed.length){e.removed=removed.map(v=>({id:v.id,owner:v.owner,definition:v.definitionId,at:pos(v)}));for(const v of removed){unitLedger[v.id].alive=false;unitLedger[v.id].removedTurn=before.turn.turnNumber;unitLedger[v.id].removedBy=action.type;}}
  events.push(e);if(before.turn.currentPlayer!==after.turn.currentPlayer||after.phase==='victory')curve.push(summaryState(after));
 };
 return {onAction,results(){return {events,curve,promotions,mines,arrivals,unitLedger,firstAttack,final:final?summaryState(final):null};},getState(){return final;}};
}
