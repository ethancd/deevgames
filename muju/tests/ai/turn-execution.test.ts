import {getAllSpawnPositions} from '../../src/game/spawning';
import { it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import type { GameState } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
const { choose } = vi.hoisted(()=>({choose:vi.fn()}));
vi.mock('../../src/ai/worker/client',()=>({AIWorkerClient:class {
 restart(){} cancel(){}
 async findBestAction(s:GameState){return {plan:{actions:await choose(s),score:0},timeMs:0};}
},SearchCancelled:class extends Error {}}));
import { useAI } from '../../src/hooks/useAI';
it('executes more than 20 legal dispatches and keeps reducer state synchronized',async()=>{
 let real=createInitialGameState();real.turn.phase='place';real.board.units[1].position={x:7,y:7};real.players.white.resources=30;real.players.white.resourcesGained=30;
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
