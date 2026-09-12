import {getAllSpawnPositions} from '../../src/game/spawning';
import { beforeEach, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import type { GameState, PlayerId, Position } from '../../src/game/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
const { choose, timeSpent } = vi.hoisted(()=>({choose:vi.fn(),timeSpent:vi.fn((_allowance:number)=>0)}));
vi.mock('../../src/ai/worker/client',()=>({AIWorkerClient:class {
 restart(){} cancel(){}
 async findBestAction(s:GameState,_difficulty:AIDifficulty,allowance:number){return {plan:{actions:await choose(s,allowance),score:0},timeMs:timeSpent(allowance)};}
},SearchCancelled:class extends Error {}}));
import { useAI } from '../../src/hooks/useAI';
beforeEach(()=>{choose.mockReset();timeSpent.mockReset();timeSpent.mockReturnValue(0);});
it('executes more than 20 legal dispatches and keeps reducer state synchronized',async()=>{
 let real=createInitialGameState();real.turn.phase='place';real.board.units[1].position={x:7,y:7};real.players.white.resources=90;real.players.white.resourcesGained=90;
 const seen:AIAction[]=[];
 choose.mockImplementation((s:GameState)=>{expect(s).toEqual(real);return s.turn.phase==='place'?[{type:'BUY_UNIT',definitionId:'fire_1',position:getAllSpawnPositions('white',s.board)[0]}]:[{type:'END_ACTION_PHASE'}];});
 const {result,unmount}=renderHook(()=>useAI({thinkingDelay:0}));
 await act(async()=>{await result.current.executeAITurn(real,a=>{seen.push(a);real=gameReducer(real,{type:'APPLY_AI_ACTION',aiAction:a});},'white');});
 expect(seen).toHaveLength(31);expect(real.board.units.filter(u=>u.owner==='white')).toHaveLength(33);expect(real.turn.currentPlayer).toBe('black');expect(result.current.isThinking).toBe(false);unmount();
});
it('dispatches placement skip and exposes invalid proposals as a recoverable error',async()=>{
 let real=createInitialGameState();real.turn.phase='place';const seen:AIAction[]=[];
 choose.mockImplementation((s:GameState)=>{expect(s).toEqual(real);return s.turn.phase==='place'?[]:[{type:'ATTACK',unitId:'gone',targetPosition:{x:9,y:9}}];});
 const {result,unmount}=renderHook(()=>useAI({thinkingDelay:0}));
 await act(async()=>{await result.current.executeAITurn(real,a=>{seen.push(a);real=gameReducer(real,{type:'APPLY_AI_ACTION',aiAction:a});},'white');});
 expect(seen.map(a=>a.type)).toEqual(['END_PLACE_PHASE']);expect(real.turn.currentPlayer).toBe('white');expect(result.current.error).toContain('invalid action');unmount();
});
it('cancel and unmount discard delayed search results without dispatching',async()=>{
 let resolve!: (a:AIAction[])=>void;
 choose.mockImplementation(()=>new Promise<AIAction[]>(r=>{resolve=r;}));
 // The mock returns a promise as its actions here; cancellation is tested after
 // the async search boundary below using a deferred microtask.
 const {result,unmount}=renderHook(()=>useAI({thinkingDelay:20}));
 const seen:AIAction[]=[];const s=createInitialGameState();
 let task!:Promise<void>;
 await act(async()=>{task=result.current.executeAITurn(s,a=>seen.push(a),'white');});
 act(()=>result.current.cancel());resolve([{type:'END_ACTION_PHASE'}]);await act(async()=>{await task;});
 expect(seen).toEqual([]);unmount();
});

for (const player of ['white', 'black'] as const) for (const homeUnderAttack of [false, true]) {
 it(`reserves time for ${player}'s final capture${homeUnderAttack ? ' when defending home' : ''}`, async () => {
  let real = createInitialGameState();
  real.turn.currentPlayer = player;
  const opponent: PlayerId = player === 'white' ? 'black' : 'white';
  const orient = ({x, y}: Position): Position => player === 'white' ? {x, y} : {x: 9 - x, y: 9 - y};
  const mover = createUnit('fire_1', player, orient({x: 1, y: 3}));
  const target = createUnit('fire_1', opponent, orient({x: homeUnderAttack ? 0 : 2, y: 0}));
  real.board.units = [mover, target, createUnit('water_1', opponent, orient({x: 9, y: 9}))];
  const planned: AIAction[] = [
   ...[2, 1, 0].map(y => ({type: 'MOVE' as const, unitId: mover.id, to: orient({x: 1, y})})),
   {type: 'ATTACK', unitId: mover.id, targetPosition: target.position},
  ];
  const seen: AIAction[] = [], allowances: number[] = [];
  // A search may spend its whole allowance. Only one action from its plan
  // executes, so the final capture still needs a fresh, funded decision.
  timeSpent.mockImplementation((allowance: number) => allowance);
  choose.mockImplementation((s: GameState, allowance: number) => {
   expect(s).toEqual(real);
   if (s.turn.actionsRemaining > 0) {
    allowances.push(allowance);
    if (allowance > 0) return planned.slice(4 - s.turn.actionsRemaining);
   }
   return [{type: 'END_ACTION_PHASE'}];
  });
  const {result, unmount} = renderHook(() => useAI({difficulty: 'hard', thinkingDelay: 0}));
  await act(async () => {
   await result.current.executeAITurn(real, action => {
    seen.push(action);
    real = gameReducer(real, {type: 'APPLY_AI_ACTION', aiAction: action});
   }, player);
  });
  expect(result.current.error).toBeNull();
  expect(allowances).toHaveLength(4);
  expect(allowances.every(allowance => allowance > 0)).toBe(true);
  expect(seen).toEqual([...planned, {type: 'END_ACTION_PHASE'}]);
  expect(real.board.units.some(unit => unit.id === target.id)).toBe(false);
  expect(real.turn.currentPlayer).toBe(opponent);
  unmount();
 });
}
