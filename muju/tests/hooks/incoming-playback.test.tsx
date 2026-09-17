import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { incomingFrames, useIncomingPlayback } from '../../src/online/incomingPlayback';
import { useReplayPreference } from '../../src/components/TurnReplay';
import type { RoomSnapshot } from '../../src/online/types';
import type { AIAction } from '../../src/ai/types';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
function fixture(phasing = false): RoomSnapshot {
  const state = createInitialGameState(undefined, 4, 0, phasing ? 'phasing' : 'standard');
  state.board.units = [createUnit('fire_1', 'white', {x:0,y:0}), createUnit('plant_1', 'black', {x:4,y:0}), createUnit('water_1', 'black', {x:9,y:9})];
  return { id:'room', revision:1, ready:true, seats:{white:'W',black:'B'}, state, updatedAt:'now', history:[] };
}
function advance(room: RoomSnapshot, actions: AIAction[]): RoomSnapshot {
  return { ...room, revision:room.revision+1, state:actions.reduce(applyAction, room.state),
    history:[...room.history, {revision:room.revision+1,player:room.state.turn.currentPlayer,actions}] };
}
it('expands a batched move into action-sized hops followed by its attack, without changing live state', () => {
  const room = fixture(), id = room.state.board.units[0].id;
  const next = advance(room, [{type:'MOVE',unitId:id,to:{x:3,y:0}}, {type:'ATTACK',unitId:id,targetPosition:{x:4,y:0}}]);
  const saved = JSON.stringify([room,next]);
  const frames = incomingFrames(room,next,'black');
  expect(frames.map(f=>f.state.board.units[0].position)).toEqual([{x:2,y:0},{x:3,y:0},{x:3,y:0}]);
  expect(frames.map(f=>f.state.turn.actionsRemaining)).toEqual([3,2,1]);
  expect(frames.map(f=>f.state.board.units.length)).toEqual([3,3,2]);
  expect(frames.at(-1)?.state).toBe(next.state);
  expect(JSON.stringify([room,next])).toBe(saved);
  expect(incomingFrames(room,next,'white')).toEqual([]);
});
it('reconstructs missed revisions and includes mining, summoning and handoff', () => {
  const room=fixture(true); room.state=createInitialGameState(undefined,4,0,'phasing'); room.state.players.white.resources=10;
  const mined=advance(room,[{type:'END_ACTION_PHASE'}]);
  const summoned=advance(mined,[{type:'BUY_UNIT',definitionId:'fire_1',position:{x:0,y:0}}]);
  const ended=advance(summoned,[{type:'END_PLACE_PHASE'}]);
  const frames=incomingFrames(room,ended,'black');
  expect(frames.map(f=>f.label)).toEqual([expect.stringMatching(/^Mined/),expect.stringMatching(/^Started phasing/),expect.stringMatching(/^Turn complete/)]);
  expect(frames[1].state.pendingSummons).toHaveLength(1);
  expect(frames.at(-1)?.state).toBe(ended.state);
});
it('snaps to authority instead of inventing moves across missing history, undo or mismatched rules', () => {
  const room=fixture(), next=advance(room,[{type:'MOVE',unitId:room.state.board.units[0].id,to:{x:2,y:0}}]);
  expect(incomingFrames(room,{...next,history:[{...next.history[0],revision:9}]})).toEqual([]);
  expect(incomingFrames(room,{...next,history:[{...next.history[0],actions:[{type:'UNDO'}]}]})).toEqual([]);
  expect(incomingFrames(room,{...next,state:room.state})).toEqual([]);
});
it.each([['slow',1000],['fast',300],['step',1000]] as const)('queues bursts at the shared %s speed (%i ms)', (mode, delay) => {
  vi.useFakeTimers();
  const room=fixture(), id=room.state.board.units[0].id;
  const first=advance(room,[{type:'MOVE',unitId:id,to:{x:2,y:0}}]);
  const second=advance(first,[{type:'MOVE',unitId:id,to:{x:3,y:0}}]);
  const {result}=renderHook(()=>({incoming:useIncomingPlayback(),preference:useReplayPreference()}));
  act(()=>result.current.preference[1](mode));
  act(()=>result.current.incoming.present(room,first,'black'));
  act(()=>vi.advanceTimersByTime(delay-1));
  expect(result.current.incoming.frame?.state).toBe(room.state);
  act(()=>result.current.incoming.present(first,second,'black'));
  act(()=>vi.advanceTimersByTime(1));
  expect(result.current.incoming.frame?.state).toBe(first.state);
  act(()=>vi.advanceTimersByTime(delay));
  expect(result.current.incoming.frame?.state).toBe(second.state);
  act(()=>vi.advanceTimersByTime(delay));
  expect(result.current.incoming.playing).toBe(false);
});
it('pauses while hidden and picks up speed changes without skipping an action', () => {
  vi.useFakeTimers();
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(false);
  const room=fixture(), next=advance(room,[{type:'MOVE',unitId:room.state.board.units[0].id,to:{x:3,y:0}}]);
  const {result}=renderHook(()=>({incoming:useIncomingPlayback(),preference:useReplayPreference()}));
  act(()=>result.current.incoming.present(room,next,'black'));
  act(()=>{hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));});
  act(()=>vi.advanceTimersByTime(5000));expect(result.current.incoming.frame?.state).toBe(room.state);
  act(()=>{hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));result.current.preference[1]('fast');});
  act(()=>vi.advanceTimersByTime(300));expect(result.current.incoming.frame?.state.board.units[0].position).toEqual({x:2,y:0});
});

it('does not enqueue live clock samples as extra playback frames', () => {
  vi.useFakeTimers();
  const room=fixture(), next=advance(room,[{type:'MOVE',unitId:room.state.board.units[0].id,to:{x:2,y:0}}]);
  const {result}=renderHook(()=>useIncomingPlayback());
  act(()=>result.current.present(room,next,'black'));
  act(()=>result.current.present(next,{...next,updatedAt:'clock-only'},'black'));
  act(()=>vi.advanceTimersByTime(1000));expect(result.current.frame?.state).toBe(next.state);
  act(()=>vi.advanceTimersByTime(1000));expect(result.current.playing).toBe(false);
});
