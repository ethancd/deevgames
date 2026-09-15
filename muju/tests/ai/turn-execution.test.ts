import {getAllSpawnPositions} from '../../src/game/spawning';
import { beforeEach, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import type { GameState, PlayerId, Position } from '../../src/game/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
import { TURN_BUDGET_MS } from '../../src/ai/engine-v2';
const { choose, timeSpent, turnGate } = vi.hoisted(()=>({choose:vi.fn(),timeSpent:vi.fn((_allowance:number)=>0),turnGate:vi.fn()}));
// `findBestTurn` (M3, the default path) and `findBestAction` (the per-action
// fallback) share the same `choose`/`timeSpent` mocks — `findBestTurn` just
// exposes the chosen actions directly as `.actions` instead of nested under
// `.plan.actions`, matching `AIWorkerClient`'s real `FindTurnResult` shape.
// `turnGate` runs first inside `findBestTurn` and does nothing by default; a
// test makes it throw to exercise the per-action fallback (§6.4 layer 3).
vi.mock('../../src/ai/worker/client',()=>({AIWorkerClient:class {
 restart(){} cancel(){}
 async findBestAction(s:GameState,_difficulty:AIDifficulty,allowance:number){return {plan:{actions:await choose(s,allowance),score:0},timeMs:timeSpent(allowance)};}
 async findBestTurn(s:GameState,_difficulty:AIDifficulty,decisionMs:number){turnGate();return {actions:await choose(s,decisionMs),timeMs:timeSpent(decisionMs),source:'v2'};}
},SearchCancelled:class extends Error {}}));
import { useAI } from '../../src/hooks/useAI';
beforeEach(()=>{choose.mockReset();timeSpent.mockReset();timeSpent.mockReturnValue(0);turnGate.mockReset();});
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

// Pre-M3 the per-action loop re-searched before every single action — this
// suite pinned that a search spending its whole allowance on early actions
// still left the final capture (of a home-defense combination) a funded,
// separate decision. M3's whole-turn path removes that per-action re-search
// entirely: one funded search up front returns the complete turn plan,
// including its final capture, and every action in it dispatches from that
// one round — the scenario the old test guarded against no longer arises by
// construction. This is the turn-path's equivalent regression pin: the whole
// planned combination (final capture included) dispatches from a single
// `findBestTurn` call funded by the whole-turn allowance, not four.
for (const player of ['white', 'black'] as const) for (const homeUnderAttack of [false, true]) {
 it(`dispatches ${player}'s whole home-defense combination${homeUnderAttack ? ' when defending home' : ''} from one whole-turn search`, async () => {
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
   {type: 'END_ACTION_PHASE'},
  ];
  const seen: AIAction[] = [], allowances: number[] = [];
  timeSpent.mockImplementation(() => 0);
  choose.mockImplementation((s: GameState, allowance: number) => {
   expect(s).toEqual(real);
   allowances.push(allowance);
   return planned;
  });
  const {result, unmount} = renderHook(() => useAI({difficulty: 'hard', thinkingDelay: 0}));
  await act(async () => {
   await result.current.executeAITurn(real, action => {
    seen.push(action);
    real = gameReducer(real, {type: 'APPLY_AI_ACTION', aiAction: action});
   }, player);
  });
  expect(result.current.error).toBeNull();
  // One whole-turn search, funded by the whole-turn allowance — not one per action.
  expect(allowances).toEqual([TURN_BUDGET_MS.hard]);
  expect(seen).toEqual(planned);
  expect(real.board.units.some(unit => unit.id === target.id)).toBe(false);
  expect(real.turn.currentPlayer).toBe(opponent);
  unmount();
 });
}

// The per-action loop survives M3 as the fallback (DESIGN §6.4 layer 3,
// reached whenever `findBestTurn` rejects or its plan stops replaying against
// the live state), and its budget split — `remainingCPU / decisionsRemaining`,
// debited by what each search actually spent — is what the deleted "reserves
// time for the final capture" cases used to pin. The turn-path cases above
// cannot reach it, so it is pinned here directly: after one rejected whole-turn
// search, every action of the same home-defense combination is still a funded
// decision of its own, and the four of them together never overspend the turn.
it('funds every action of the fallback loop and never overspends the turn budget', async () => {
 let real = createInitialGameState();
 const mover = createUnit('fire_1', 'white', {x: 1, y: 3});
 const target = createUnit('fire_1', 'black', {x: 0, y: 0});
 real.board.units = [mover, target, createUnit('water_1', 'black', {x: 9, y: 9})];
 const planned: AIAction[] = [
  ...[2, 1, 0].map(y => ({type: 'MOVE' as const, unitId: mover.id, to: {x: 1, y}})),
  {type: 'ATTACK', unitId: mover.id, targetPosition: target.position},
  {type: 'END_ACTION_PHASE'},
 ];
 // Exactly one whole-turn attempt, and it fails: the rest of the turn runs on
 // the legacy loop.
 turnGate.mockImplementation(() => { throw new Error('worker rejected the turn request'); });
 // Each search consumes its whole allowance — the worst case for the split,
 // and the only one under which "no overspend" says anything.
 timeSpent.mockImplementation((allowance: number) => allowance);
 const seen: AIAction[] = [], allowances: number[] = [];
 choose.mockImplementation((s: GameState, allowance: number) => {
  expect(s).toEqual(real);
  allowances.push(allowance);
  return [planned[seen.length]];
 });
 const {result, unmount} = renderHook(() => useAI({difficulty: 'hard', thinkingDelay: 0}));
 await act(async () => {
  await result.current.executeAITurn(real, action => {
   seen.push(action);
   real = gameReducer(real, {type: 'APPLY_AI_ACTION', aiAction: action});
  }, 'white');
 });
 expect(result.current.error).toBeNull();
 expect(turnGate).toHaveBeenCalledTimes(1);
 expect(seen).toEqual(planned);
 // One funded findBestAction per real action, the closing capture included —
 // the invariant the deleted per-action cases guarded.
 expect(allowances).toHaveLength(planned.length);
 for (const allowance of allowances.slice(0, 4)) expect(allowance).toBeGreaterThan(0);
 expect(allowances.reduce((sum, a) => sum + a, 0)).toBeLessThanOrEqual(TURN_BUDGET_MS.hard);
 expect(real.board.units.some(unit => unit.id === target.id)).toBe(false);
 expect(real.turn.currentPlayer).toBe('black');
 unmount();
});
