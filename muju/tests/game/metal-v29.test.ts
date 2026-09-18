import { expect, it } from 'vitest';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { getUnitDefinition, getPromotionCost } from '../../src/game/units';
import { canMove, findAttackApproach, getMovementRange, getMoveCost } from '../../src/game/movement';
import { isLegalAction } from '../../src/game/legality';
import { applyAction } from '../../src/ai/simulate';
import { gameReducer } from '../../src/hooks/useGameState';
import { generateAllActions } from '../../src/ai/moves';
import { unitEndOfTurnTake } from '../../src/game/mining';
import { analyzeHomeDefense } from '../../src/game/homeCheckmate';
import { strategicValue } from '../../src/ai/planner/strategies';
import { damageUpperBound } from '../../server/analysis/tactics';
import { strikeActions, marginalValues } from '../../lab/solver/model';
import { expandReplayMoves, type TurnReplay } from '../../src/game/replay';

function position(distance = 1) {
  const s = createInitialGameState();
  s.board.units = [createUnit('metal_1', 'white', {x: 2, y: 2}), createUnit('water_1', 'black', {x: 2, y: 2 + distance}), createUnit('plant_1', 'black', {x: 8, y: 8})];
  s.turn.phase = 'action';
  return s;
}
it('uses the requested Metal ladder with unchanged IDs and prices', () => {
  expect([1,2,3].map(t => {
    const d = getUnitDefinition(`metal_${t}`);
    return [d.name, d.attack, d.defense, d.speed, d.mining, d.cost];
  })).toEqual([['Yan',1,3,0,3,5],['Mazask',1,4,1,4,9],['Tanka',2,5,2,5,17]]);
  expect([getPromotionCost('metal_1'), getPromotionCost('metal_2')]).toEqual([4,8]);
});
it('rejects stationary movement in the UI, engine and AI, but preserves adjacent attacks', () => {
  const s = position(), yan = s.board.units[0], target = s.board.units[1];
  const move = {type:'MOVE' as const,unitId:yan.id,to:{x:3,y:2}};
  expect(canMove(yan)).toBe(false);
  expect(getMovementRange(yan.position,0,4,s.board)).toEqual([]);
  expect(getMoveCost(yan.position,move.to,0,s.board)).toBeNull();
  expect(isLegalAction(s,move)).toBe(false);
  expect(applyAction(s,move)).toBe(s);
  expect(gameReducer(s,move)).toBe(s);
  expect(generateAllActions(s,'white').some(a=>a.type==='MOVE'&&a.unitId===yan.id)).toBe(false);
  expect(findAttackApproach(yan,target,s.board,4)).toEqual([]);
  const attack = {type:'ATTACK' as const,unitId:yan.id,targetPosition:target.position};
  expect(isLegalAction(s,attack)).toBe(true);
  const after=applyAction(s,attack);
  expect(after.board.units.some(u=>u.id===target.id)).toBe(false);
  expect(gameReducer(s,attack)).toEqual(after);
  expect(damageUpperBound(s,target,['existing'])).toBe(2);
  const distant=position(2);
  expect(damageUpperBound(distant,distant.board.units[1],['existing'])).toBe(0);
});
it('gains movement on promotion and caps every Metal harvest at the reserve', () => {
  const s=position();s.turn.phase='place';s.players.white.resources=4;
  const promoted=applyAction(s,{type:'PROMOTE_UNIT',unitId:s.board.units[0].id});
  expect(promoted.board.units[0].definitionId).toBe('metal_2');
  const ready=applyAction(promoted,{type:'END_PLACE_PHASE'});
  expect(isLegalAction(ready,{type:'MOVE',unitId:s.board.units[0].id,to:{x:3,y:2}})).toBe(true);
  for(const [tier,mining] of [[1,3],[2,4],[3,5]])for(const reserve of [0,2,8,16]) {
    const u=createUnit(`metal_${tier}`,'white',{x:2,y:2});
    expect(unitEndOfTurnTake(u,{position:u.position,resourceLayers:reserve})).toBe(Math.min(mining,reserve));
  }
});
it('counts a stationary adjacent home rescuer and keeps evaluation finite on home', () => {
  const s=createInitialGameState();
  s.board.units=[createUnit('water_1','white',{x:9,y:9}),createUnit('metal_1','black',{x:9,y:8})];
  s.players.black.resources=0;
  expect(analyzeHomeDefense(s,'white',applyAction)).toBe('rescue');
  s.board.units[0].definitionId='metal_1';
  expect(Number.isFinite(strategicValue(s,'white'))).toBe(true);
});
it('preserves old Metal move snapshots and labels without resimulating them', () => {
  const s=position(), yan=s.board.units[0];
  const board={...s.board,units:s.board.units.map(u=>u.id===yan.id?{...u,position:{x:3,y:2}}:u)};
  const replay:TurnReplay={player:'white',turnNumber:1,initialBoard:s.board,frames:[{board,action:{type:'MOVE',unitId:yan.id,to:{x:3,y:2}},label:'Inyan: C3 → D3'}]};
  expect(expandReplayMoves(replay)).toEqual(replay);
});
it('reports unreachable static approaches explicitly instead of NaN', () => {
  const yan=getUnitDefinition('metal_1');
  expect(strikeActions(yan,1)).toBe(1);
  expect(strikeActions(yan,2)).toBe(Infinity);
  const values=marginalValues(yan,[getUnitDefinition('water_1')]);
  expect(values.base.meanStrikeActions).toBeNull();
  expect(values.changes.speed.strikeActionsSaved).toBeNull();
});
