// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createInitialGameState } from '../../src/game/board';
import { createUnitFromDefinition, getAvailableBuildOptions } from '../../src/game/building';
import { applyAction, applyActions } from '../../src/ai/simulate';
import { generateAllActions, generatePlaceActions, generateQueueActions } from '../../src/ai/moves';
import { extractPublicState } from '../../src/ai/state/observation';
import { gameReducer } from '../../src/hooks/useGameState';
import { canActInPlacePhase } from '../../src/game/turn';
import type { AIAction } from '../../src/ai/types';
function fixture() {
  const s = createInitialGameState();
  s.board.units = [createUnitFromDefinition('fire_1','white',{x:2,y:2},'w'),createUnitFromDefinition('water_1','white',{x:1,y:1},'anchor'),createUnitFromDefinition('metal_4','black',{x:2,y:3},'b')].map(u=>({...u,placedThisTurn:false}));
  s.players.white = {...s.players.white,resources:20,resourcesGained:20}; return s;
}
describe('authoritative rule enforcement',()=>{
  const bad: AIAction[] = [
    {type:'MOVE',unitId:'gone',to:{x:3,y:2}}, {type:'MOVE',unitId:'b',to:{x:3,y:3}},
    {type:'MOVE',unitId:'w',to:{x:2,y:3}}, {type:'MOVE',unitId:'w',to:{x:-1,y:2}},
    {type:'MOVE',unitId:'w',to:{x:2.5,y:2}}, {type:'MOVE',unitId:'w',to:{x:2,y:2}},
    {type:'ATTACK',unitId:'w',targetPosition:{x:3,y:2}}, {type:'MINE',unitId:'b'},
    {type:'PROMOTE_UNIT',unitId:'w'}, {type:'QUEUE_UNIT',definitionId:'fire_1'},
    {type:'END_TURN'}, {type:'END_PLACE_PHASE'},
  ];
  it.each(bad)('rejects invalid action %j with no mutation or charge',a=>{
    const s=fixture(), before=structuredClone(s);
    expect(applyAction(s,a)).toBe(s); expect(gameReducer(s,a)).toBe(s);
    expect(gameReducer(s,{type:'APPLY_AI_ACTION',aiAction:a})).toBe(s); expect(s).toEqual(before);
  });
  it('charges full multi-action movement cost on both paths',()=>{
    const s=fixture(), a:AIAction={type:'MOVE',unitId:'w',to:{x:7,y:2}};
    expect(applyAction(s,a).turn.actionsRemaining).toBe(3); expect(gameReducer(s,a)).toEqual(applyAction(s,a));
    s.turn.actionsRemaining=2; expect(applyAction(s,a)).toBe(s);
  });
  it('rejects repeat attacks and attacks without actions',()=>{
    const s=fixture(),a:AIAction={type:'ATTACK',unitId:'w',targetPosition:{x:2,y:3}};
    const hit=applyAction(s,a); expect(hit.turn.actionsRemaining).toBe(5); expect(applyAction(hit,a)).toBe(hit);
    s.turn.actionsRemaining=0; expect(applyAction(s,a)).toBe(s);
  });
  it('checks technology both before queuing and after losing a prerequisite',()=>{
    const s=fixture();s.turn.phase='queue';
    for(const id of ['metal_3','missing']) expect(applyAction(s,{type:'QUEUE_UNIT',definitionId:id})).toBe(s);
    expect(generateQueueActions(s,'white')).not.toContainEqual({type:'QUEUE_UNIT',definitionId:'metal_3'});
    expect(getAvailableBuildOptions({queue:[],crystals:99},'white',s.board)).not.toContain('metal_3');
    const q=applyAction(s,{type:'QUEUE_UNIT',definitionId:'fire_2'});q.turn.phase='place';q.players.white.resources=0;
    q.players.white.buildQueue[0].turnsRemaining=0;q.board.units=q.board.units.filter(u=>u.id!=='w');
    expect(applyAction(q,{type:'PLACE_UNIT',queuedUnitId:q.players.white.buildQueue[0].id,position:{x:0,y:1}})).toBe(q);
    expect(generatePlaceActions(q,'white')).toEqual([]);expect(canActInPlacePhase(q,'white')).toBe(false);
  });
  it('validates readiness, spawn geometry and occupancy',()=>{
    const s=fixture();s.turn.phase='place';s.players.white.buildQueue=[{id:'q',definitionId:'fire_1',owner:'white',turnsRemaining:1}];
    const a:Extract<AIAction,{type:'PLACE_UNIT'}>={type:'PLACE_UNIT',queuedUnitId:'q',position:{x:0,y:1}};
    expect(applyAction(s,a)).toBe(s);s.players.white.buildQueue[0].turnsRemaining=0;
    for(const position of [{x:9,y:9},{x:2,y:2}])expect(applyAction(s,{...a,position})).toBe(s);
    expect(applyAction(s,a).board.units).toHaveLength(4);
  });
  it('preserves promotion ownership and timing',()=>{
    const s=fixture();s.turn.phase='place';expect(applyAction(s,{type:'PROMOTE_UNIT',unitId:'b'})).toBe(s);
    const a:AIAction={type:'PROMOTE_UNIT',unitId:'w'};s.board.units[0].placedThisTurn=true;expect(applyAction(s,a)).toBe(s);
    s.board.units[0].placedThisTurn=false;const q=applyAction(s,a);expect(q.board.units[0].definitionId).toBe('fire_2');expect(applyAction(q,a)).toBe(q);
  });
  it('hides committed spending and reveals it only at placement without charging twice',()=>{
    const s=fixture();s.turn.phase='queue';const q=applyAction(s,{type:'QUEUE_UNIT',definitionId:'fire_2'});
    expect(q.players.white.resourcesSpent).toBe(3);expect(extractPublicState(q,'black').players.white).toEqual(extractPublicState(s,'black').players.white);
    q.turn.phase='place';q.players.white.buildQueue[0].turnsRemaining=0;
    const a:AIAction={type:'PLACE_UNIT',queuedUnitId:q.players.white.buildQueue[0].id,position:{x:0,y:1}};
    const placed=applyAction(q,a);expect(placed.players.white.resourcesSpent).toBe(3);expect(extractPublicState(placed,'black').players.white.resourcesSpent).toBe(3);
    expect(gameReducer(q,a)).toEqual(placed);
  });
  it('keeps shadow and reducer IDs identical and ends broke turns',()=>{
    const s=fixture();s.turn.phase='queue';const a:AIAction={type:'QUEUE_UNIT',definitionId:'fire_1'};
    expect(applyAction(s,a)).toEqual(gameReducer(s,a));
    s.turn.phase='action';s.players.white.resources=0;expect(applyAction(s,{type:'END_ACTION_PHASE'}).turn.currentPlayer).toBe('black');
    s.turn.phase='place';expect(applyAction(s,{type:'END_PLACE_PHASE'}).turn.phase).toBe('action');
  });
  it('truncates stale plans and forbids crossing the turn boundary',()=>{
    const s=fixture();expect(applyActions(s,[{type:'ATTACK',unitId:'w',targetPosition:{x:9,y:9}},{type:'MINE',unitId:'w'}])).toBe(s);
    s.turn.phase='queue';expect(applyActions(s,[{type:'END_TURN'},{type:'MINE',unitId:'b'}])).toEqual(applyAction(s,{type:'END_TURN'}));
  });
  it('stops after victory and does not generate for the wrong seat',()=>{
    const s=fixture();expect(generateAllActions(s,'black')).toEqual([]);s.phase='victory';s.winner='white';
    expect(applyAction(s,{type:'RESIGN'})).toBe(s);expect(generateAllActions(s,'white')).toEqual([]);
  });
});
