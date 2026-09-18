import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInitialGameState, createEmptyBoard, createUnit, MAX_ACTIONS_PER_TURN } from './.sandbox/src/game/board';
import { getUnitDefinition } from './.sandbox/src/game/units';
import { findAttackApproach, getMoveCost } from './.sandbox/src/game/movement';
import { calculateAttackPower } from './.sandbox/src/game/combat';
import { applyAction } from './.sandbox/src/ai/simulate';
import { generateActionPhaseActions } from './.sandbox/src/ai/moves';
import { instantiateTactics } from './.sandbox/src/ai/wasm/kernel';
import { SearchBudget } from './.sandbox/src/ai/runtime';
import type { GameState, PlayerId } from './.sandbox/src/game/types';
import type { AIAction } from './.sandbox/src/ai/types';

const OUT = new URL('../../results/four-actions-2026-09-12/', import.meta.url);
const solver = await instantiateTactics(readFileSync(new URL('./.sandbox/src/ai/wasm/tactics.wasm', import.meta.url)));
function unit(definitionId: string, owner: PlayerId, x: number, y: number, id: string) {
  return { ...createUnit(definitionId, owner, {x,y}), id };
}
function fixture(units: GameState['board']['units']): GameState {
  return { ...createInitialGameState(), board: { ...createEmptyBoard(), units },
    turn: { currentPlayer: 'white', phase: 'action', turnNumber: 8, actionsRemaining: MAX_ACTIONS_PER_TURN } };
}
function checked(s: GameState, a: AIAction) {
  const next = applyAction(s,a);
  assert.notStrictEqual(next,s,`Illegal witness: ${JSON.stringify(a)}`);
  return next;
}

// Corner-clearing counterexample: both attacks are essential, and their minimum
// movement costs plus two attacks total five. Promotions are unaffordable.
const corner = fixture([
  unit('metal_3','black',0,0,'tanka'), unit('fire_1','white',4,0,'hi'), unit('lightning_1','white',0,3,'radi'),
]);
const target = corner.board.units[0];
const lowerBound = corner.board.units.slice(1).reduce((sum,u) => {
  const path = findAttackApproach(u,target,corner.board,20)!;
  return sum + Math.ceil(path.length/getUnitDefinition(u.definitionId).speed) + 1;
},0);
assert.equal(lowerBound,5);
assert.equal(calculateAttackPower(corner.board.units[1],target),3);
assert.equal(calculateAttackPower(corner.board.units[2],target),2);
const cornerResult = solver(corner,'tanka',2_000_000,new SearchBudget());
assert.equal(cornerResult.status,MAX_ACTIONS_PER_TURN === 6 ? 'proved' : 'disproved');
let afterCorner = corner;
for (const a of cornerResult.actions) afterCorner = checked(afterCorner,a);
if (MAX_ACTIONS_PER_TURN === 4) {
  const loss = checked(corner,{type:'END_ACTION_PHASE'});
  assert.equal(loss.winner,'black');
  assert.equal(loss.victoryReason,'home-occupation');
}
// Bringing Hi one square closer restores the same counter in four actions.
const closeCorner = {...corner,board:{...corner.board,units:corner.board.units.map(u=>u.id==='hi'?{...u,position:{x:3,y:0}}:u)}};
const closeResult = solver(closeCorner,'tanka',2_000_000,new SearchBudget());
assert.equal(closeResult.status,'proved');

// Exact breadth-first enumeration for one Kagari against three stationary Muju.
// Generated moves all cost one AP, so the first complete kill sequence is minimal.
function cleave(clustered: boolean) {
  const initial = clustered
    ? fixture([unit('fire_3','white',4,4,'kagari'),unit('plant_1','black',5,4,'p1'),unit('plant_1','black',4,5,'p2'),unit('plant_1','black',3,4,'p3')])
    : fixture([unit('fire_3','white',0,0,'kagari'),unit('plant_1','black',2,0,'p1'),unit('plant_1','black',4,0,'p2'),unit('plant_1','black',6,0,'p3')]);
  let best = { kills:0, actions:[] as AIAction[] };
  const queue = [{ state:initial, actions:[] as AIAction[] }], seen = new Set<string>();
  let nodes = 0;
  for (let i=0;i<queue.length;i++) {
    const {state,actions} = queue[i]; nodes++;
    const kills = 3-state.board.units.filter(u=>u.owner==='black').length;
    if (kills>best.kills) best={kills,actions};
    if (kills===3 || state.turn.actionsRemaining===0) continue;
    for (const a of generateActionPhaseActions(state,'white')) {
      if (!['MOVE','ATTACK'].includes(a.type)) continue;
      const next = checked(state,a), u=next.board.units.find(u=>u.id==='kagari')!;
      const key = JSON.stringify([u.position,u.attackedThisTurn??[],next.board.units.filter(u=>u.owner==='black').map(u=>u.id)]);
      if (seen.has(key)) continue;
      seen.add(key); queue.push({state:next,actions:[...actions,a]});
    }
  }
  assert.equal(best.kills,clustered ? 3 : MAX_ACTIONS_PER_TURN===6 ? 3 : 2);
  if (best.kills===3) assert.equal(best.actions.length,clustered?3:6);
  return {initial,maxKills:best.kills,minimumAPForMaxKills:best.actions.length,actions:best.actions,nodes};
}

// Legal opening line with a stationary, passing opponent; no purchases/promotions.
function opening() {
  let s=createInitialGameState();
  const hi=s.board.units.find(u=>u.owner==='white'&&u.definitionId==='fire_1')!;
  const muju=s.board.units.find(u=>u.owner==='black'&&u.definitionId==='plant_1')!;
  const initialPath=findAttackApproach(hi,muju,s.board,20)!;
  assert.equal(initialPath.length,15);
  const log: {round:number;player:PlayerId;action:AIAction}[]=[];
  function take(a:AIAction) { log.push({round:s.turn.turnNumber,player:s.turn.currentPlayer,action:a});s=checked(s,a); }
  while(s.board.units.some(u=>u.id===muju.id)) {
    assert.ok(s.turn.turnNumber<=3);
    if (s.turn.phase==='place') {take({type:'END_PLACE_PHASE'});continue;}
    if(s.turn.currentPlayer==='black'||s.turn.actionsRemaining===0) {take({type:'END_ACTION_PHASE'});continue;}
    const u=s.board.units.find(u=>u.id===hi.id)!,t=s.board.units.find(u=>u.id===muju.id)!;
    const path=findAttackApproach(u,t,s.board,20)!;
    if(path.length===0) {take({type:'ATTACK',unitId:u.id,targetPosition:t.position});continue;}
    const destination=path[Math.min(path.length,getUnitDefinition(u.definitionId).speed*s.turn.actionsRemaining)-1];
    assert.ok(getMoveCost(u.position,destination,2,s.board)!<=s.turn.actionsRemaining);
    take({type:'MOVE',unitId:u.id,to:destination});
  }
  assert.equal(s.turn.turnNumber,MAX_ACTIONS_PER_TURN===6?2:3);
  return {pathLength:initialPath.length,totalRequiredAP:9,firstKillOwnTurn:s.turn.turnNumber,log};
}
const initial=createInitialGameState();
const idle=checked(initial,{type:'END_ACTION_PHASE'});
assert.equal(idle.players.white.resources,6);
assert.equal(idle.turn.actionsRemaining,MAX_ACTIONS_PER_TURN);
const output={actions:MAX_ACTIONS_PER_TURN,stationaryOpeningIncome:6,
  homeClear:{initial:corner,minimumAP:lowerBound,result:cornerResult,closeResult},
  spacedCleave:cleave(false),clusteredCleave:cleave(true),unopposedOpening:opening()};
writeFileSync(new URL(`probes-${MAX_ACTIONS_PER_TURN}.json`,OUT),JSON.stringify(output,null,2));
console.log(JSON.stringify({actions:MAX_ACTIONS_PER_TURN,homeClear:cornerResult.status,homeNodes:cornerResult.nodes,
  closeHomeClear:closeResult.status,spacedCleave:output.spacedCleave.maxKills,clusteredCleave:output.clusteredCleave.maxKills,
  firstOpeningKill:output.unopposedOpening.firstKillOwnTurn,openingIncome:output.stationaryOpeningIncome}));
