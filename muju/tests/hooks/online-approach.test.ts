import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useOnlineGame } from '../../src/online/useOnlineGame';
import { playRoom } from '../../src/online/client';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { applyActions } from '../../src/ai/simulate';
import type { RoomSnapshot, ActionRequest } from '../../src/online/types';
import type { AIAction } from '../../src/ai/types';

vi.mock('../../src/online/client', () => ({
  playRoom: vi.fn(), readRoom: vi.fn(), waitRoom: vi.fn(() => new Promise(() => {})),
  OnlineError: class extends Error {},
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function start() {
  const state = createInitialGameState();
  state.board.units = [createUnit('fire_1','white',{x:0,y:0}), createUnit('plant_1','black',{x:4,y:0}), createUnit('water_1','black',{x:9,y:9})];
  const unit = state.board.units[0];
  let room: RoomSnapshot = {id:'test-room', revision:1, ready:true, seats:{white:'W',black:'B'}, state, updatedAt:'now', history:[]};
  vi.mocked(playRoom).mockImplementation(async (_connection, request) => {
    room = {...room, revision:room.revision+1, state:applyActions(room.state, request.actions as AIAction[])};
    return room;
  });
  return {unit, ...renderHook(() => useOnlineGame({serverUrl:'',roomId:'test-room',player:'white',token:'test-token'}, room, vi.fn()))};
}
it('sends move and attack as one request and blocks a duplicate while it is pending', async () => {
  const {unit, result} = start();
  await act(async () => {
    result.current.game.moveAndAttack(unit.id,{x:3,y:0},{x:4,y:0});
    result.current.game.moveAndAttack(unit.id,{x:3,y:0},{x:4,y:0});
  });
  expect(playRoom).toHaveBeenCalledTimes(1);
  const request: ActionRequest = vi.mocked(playRoom).mock.calls[0][1];
  expect(request.expectedRevision).toBe(1);
  expect(request.actions).toEqual([{type:'MOVE',unitId:unit.id,to:{x:3,y:0}},{type:'ATTACK',unitId:unit.id,targetPosition:{x:4,y:0}}]);
  expect(result.current.game.state.turn.actionsRemaining).toBe(1);
  expect(result.current.game.state.board.units).toHaveLength(2);
});
it('preserves selection after a shared move, and clears it at the turn handoff', async () => {
  const {unit, result} = start();
  act(() => result.current.game.selectUnit(unit.id));
  await act(async () => result.current.game.moveUnit(unit.id,{x:3,y:0}));
  expect(result.current.game.selectedUnitData?.position).toEqual({x:3,y:0});
  expect(result.current.game.state.validAttacks).toContainEqual({x:4,y:0});
  await act(async () => result.current.game.endActionPhase());
  expect(result.current.game.selectedUnitData).toBeNull();
});

it('removes move dots when the selected online unit spends its last action', async () => {
  const {unit, result} = start();
  act(() => result.current.game.selectUnit(unit.id));
  await act(async () => result.current.game.moveUnit(unit.id,{x:3,y:0}));
  await act(async () => result.current.game.moveUnit(unit.id,{x:0,y:0}));
  await act(async () => result.current.game.moveUnit(unit.id,{x:3,y:0}));
  expect(result.current.game.state.turn.actionsRemaining).toBe(0);
  expect(result.current.game.selectedUnitData?.id).toBe(unit.id);
  expect(result.current.game.state.validMoves).toEqual([]);
  expect(result.current.game.state.validAttacks).toEqual([]);
});

it('enables online undo from server history and sends it with the current revision', async () => {
  const state = createInitialGameState();
  const room: RoomSnapshot = {id:'test-room', revision:7, ready:true, canUndo:true,
    seats:{white:'W',black:'B'}, state, updatedAt:'now', history:[]};
  vi.mocked(playRoom).mockResolvedValue({...room, revision:8, canUndo:false});
  const connection = {serverUrl:'',roomId:room.id,player:'white' as const,token:'test-token'};
  const {result} = renderHook(() => useOnlineGame(connection, room, vi.fn()));
  expect(result.current.game.canUndo).toBe(true);
  await act(async () => result.current.game.undo());
  expect(playRoom).toHaveBeenCalledWith(connection, expect.objectContaining({expectedRevision:7, actions:[{type:'UNDO'}]}));
  expect(result.current.game.canUndo).toBe(false);
});
