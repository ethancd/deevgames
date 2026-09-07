import { it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import type { GameState } from '../../src/game/types';
import type { AIAction } from '../../src/ai/types';
const { choose } = vi.hoisted(()=>({choose:vi.fn()}));
vi.mock('../../src/ai/engine',()=>({AIEngine:class {
 setDifficulty(){} getMinThinkingTime(){return 0;}
 async findBestAction(s:GameState){return {plan:{actions:choose(s),score:0}};}
}}));
import { useAI } from '../../src/hooks/useAI';
it('executes more than 20 legal dispatches and keeps reducer state synchronized',async()=>{
 let real=createInitialGameState();real.turn.phase='queue';real.players.white.resources=30;real.players.white.resourcesGained=30;
 const seen:AIAction[]=[];
 choose.mockImplementation((s:GameState)=>{expect(s).toEqual(real);return [{type:'QUEUE_UNIT',definitionId:'fire_1'}];});
 const {result,unmount}=renderHook(()=>useAI({thinkingDelay:0}));
 await act(async()=>{await result.current.executeAITurn(real,a=>{seen.push(a);real=gameReducer(real,{type:'APPLY_AI_ACTION',aiAction:a});},'white');});
 expect(seen).toHaveLength(30);expect(real.players.white.buildQueue).toHaveLength(30);expect(real.turn.currentPlayer).toBe('black');expect(result.current.isThinking).toBe(false);unmount();
});
it('dispatches placement skip to the real reducer and safely advances after an invalid proposal',async()=>{
 let real=createInitialGameState();real.turn.phase='place';const seen:AIAction[]=[];
 choose.mockImplementation((s:GameState)=>{expect(s).toEqual(real);return s.turn.phase==='place'?[]:[{type:'ATTACK',unitId:'gone',targetPosition:{x:9,y:9}}];});
 const {result,unmount}=renderHook(()=>useAI({thinkingDelay:0}));
 await act(async()=>{await result.current.executeAITurn(real,a=>{seen.push(a);real=gameReducer(real,{type:'APPLY_AI_ACTION',aiAction:a});},'white');});
 expect(seen.map(a=>a.type)).toEqual(['END_PLACE_PHASE','END_ACTION_PHASE']);expect(real.turn.currentPlayer).toBe('black');unmount();
});
