import { afterEach, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useGameState } from '../../src/hooks/useGameState';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { automaticUpkeepUndo } from '../../src/game/turn';
import { saveGameState } from '../../src/utils/persistence';

afterEach(() => { cleanup(); localStorage.clear(); });
function beforeWhiteTurn(cash = 5) {
  const state = createInitialGameState();
  state.turn.currentPlayer = 'black';
  state.players.white.resources = cash;
  state.board.units = [
    { ...createUnit('water_2', 'white', {x:3,y:2}), damageTaken:1, hasMoved:true, placedThisTurn:true },
    createUnit('metal_3', 'white', {x:4,y:2}),
    createUnit('fire_1', 'white', {x:2,y:2}),
    createUnit('fire_1', 'black', {x:8,y:9}),
  ];
  return state;
}

it('undoes automatic upkeep after later moves, refunds it, and preserves the completed opponent turn', () => {
  const before = beforeWhiteTurn(); saveGameState(before);
  const { result } = renderHook(() => useGameState());
  act(() => result.current.endActionPhase());
  const paid = result.current.state;
  expect(paid).toMatchObject({upkeepPending:false,players:{white:{resources:2,resourcesUpkeep:3}},turn:{currentPlayer:'white',turnNumber:2,phase:'action'}});
  expect(result.current.canUndo).toBe(true);
  const unitId = before.board.units[0].id;
  expect(paid.board.units[0].damageTaken).toBe(0);
  act(() => result.current.moveUnit(unitId, {x:3,y:3}));
  act(() => result.current.undo()); expect(result.current.state).toEqual(paid);
  act(() => result.current.undo());
  const pending = result.current.state;
  expect(pending).toMatchObject({upkeepPending:true,turn:{currentPlayer:'white',turnNumber:2,phase:'place',actionsRemaining:4}});
  expect(pending.players.white).toEqual(before.players.white);
  expect(pending.board.units).toEqual(before.board.units);
  expect(pending.board.cells).toEqual(paid.board.cells);
  expect(pending.players.black).toEqual(paid.players.black);
  expect(pending.lastIncome).toEqual(paid.lastIncome);
  expect(pending.inactivityPlies).toBe(paid.inactivityPlies);
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.endPlacePhase()); expect(result.current.state).toEqual(pending);

  const keep = [before.board.units[0].id, before.board.units[2].id];
  act(() => result.current.payUpkeep(keep));
  expect(result.current.state.players.white).toMatchObject({resources:4,resourcesUpkeep:1});
  expect(result.current.state.board.units.some(u => u.id === before.board.units[1].id)).toBe(false);
  expect(result.current.state.board.units[0].damageTaken).toBe(0);
  act(() => result.current.undo()); expect(result.current.state).toEqual(pending);
  act(() => result.current.payUpkeep(before.board.units.filter(u => u.owner === 'white').map(u => u.id)));
  expect(result.current.state.players.white).toMatchObject({resources:2,resourcesUpkeep:3});
  act(() => result.current.endActionPhase());
  expect(result.current.canUndo).toBe(false);
  expect(result.current.lastTurnReplay?.frames.map(f => f.action.type)).toEqual(['PAY_UPKEEP']);
  expect(result.current.lastTurnReplay?.frames[0].label).toBe('Paid 3 crystals upkeep');
});

it('creates the checkpoint after an AI move and handoff dispatched in the same render', () => {
  const before = beforeWhiteTurn(); saveGameState(before);
  const { result } = renderHook(() => useGameState());
  const blackId = before.board.units[3].id;
  act(() => {
    result.current.applyAIAction({type:'MOVE',unitId:blackId,to:{x:6,y:9}});
    result.current.applyAIAction({type:'END_ACTION_PHASE'});
  });
  act(() => result.current.undo());
  expect(result.current.state.upkeepPending).toBe(true);
  expect(result.current.state.board.units.find(u => u.id === blackId)?.position).toEqual({x:6,y:9});
  expect(result.current.lastTurnReplay?.frames.map(f => f.action.type)).toEqual(['MOVE']);
});

it('does not add an automatic payment undo when upkeep is free, unaffordable, or the game ends', () => {
  const free = createInitialGameState();
  const poor = beforeWhiteTurn(1);
  const drawn = {...beforeWhiteTurn(),inactivityPlies:9};
  for (const before of [free, poor, drawn]) {
    const after = applyAction(before, {type:'END_ACTION_PHASE'});
    expect(automaticUpkeepUndo(before, after)).toBeNull();
  }
  expect(applyAction(poor, {type:'END_ACTION_PHASE'}).upkeepPending).toBe(true);
});

it('does not let the upkeep checkpoint reopen a completed game', () => {
  const before = beforeWhiteTurn();
  before.board.units = before.board.units.filter(u => u.definitionId !== 'fire_1' || u.owner === 'black');
  saveGameState(before);
  const { result } = renderHook(() => useGameState());
  act(() => result.current.endActionPhase());
  act(() => result.current.undo());
  act(() => result.current.payUpkeep([]));
  expect(result.current.state.victoryReason).toBe('upkeep-elimination');
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.undo());
  expect(result.current.state.phase).toBe('victory');
});
