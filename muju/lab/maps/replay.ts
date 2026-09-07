import assert from 'node:assert/strict';
import { createInitialGameState } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { isLegalAction, phaseEndAction } from '../../src/game/legality';
import type { AIAction } from '../../src/ai/types';
import type { MineralMap } from './maps';
import type { Opening } from './model';
/** Replay a beam witness through production rules; the opponent passes every turn. */
export function replay(map:MineralMap,point:Opening['turns'][number],rotated=false) {
 let state=createInitialGameState(map.cells);state.victoryRule='elimination';const player=rotated?'black':'white';
 state.board.cells.forEach((row,y)=>row.forEach((c,x)=>{c.resourceLayers=map.cells[y*10+x];}));
 const ids=state.board.units.filter(u=>u.owner===player).map(u=>u.id);
 const send=(action:AIAction)=>{assert(isLegalAction(state,action),`Illegal ${map.id} ${JSON.stringify(action)}`);state=applyAction(state,action);};
 if(rotated){send({type:'END_ACTION_PHASE'});assert.equal(state.turn.currentPlayer,player);}
 for(let turn=1;turn<=point.turn;turn++) {
  const steps=point.path.filter(s=>s.turn===turn);
  for(const step of steps.filter(s=>s.kind==='promote'))send({type:'PROMOTE_UNIT',unitId:ids[step.unit]});
  if(state.turn.phase==='place')send({type:'END_PLACE_PHASE'});
  assert.equal(state.turn.currentPlayer,player);
  for(const step of steps.filter(s=>s.kind!=='promote'&&s.kind!=='wait')){
   const p=rotated?99-step.at:step.at;
   if(step.kind==='move')send({type:'MOVE',unitId:ids[step.unit],to:{x:p%10,y:Math.floor(p/10)}});
   else {const before=state.players[player].resources;send({type:'MINE',unitId:ids[step.unit]});assert.equal(state.players[player].resources-before,step.amount);}
  }
  if(turn<point.turn){let crossed=false;for(let i=0;i<8;i++){
   send(phaseEndAction(state));if(state.turn.currentPlayer!==player)crossed=true;if(crossed&&state.turn.currentPlayer===player)break;
  }assert(crossed);}
 }
 assert.equal(state.players[player].resources,point.cash);
 assert.equal(state.players[player].resourcesGained,point.gross);
 assert.equal(state.board.units.find(u=>u.id===ids[2])!.definitionId,`plant_${point.tier}`);
 for(let u=0;u<3;u++){const pos=state.board.units.find(x=>x.id===ids[u])!.position;assert.equal(pos.y*10+pos.x,rotated?99-point.positions[u]:point.positions[u]);}
 return {legal:true,cash:state.players[player].resources,gross:state.players[player].resourcesGained};
}
