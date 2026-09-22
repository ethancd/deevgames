import { afterEach, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useGameState } from '../../src/hooks/useGameState';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { applyAction } from '../../src/ai/simulate';
import { automaticUpkeepUndo } from '../../src/game/turn';
import { saveGameState } from '../../src/utils/persistence';
import { INACTIVITY_LIMIT } from '../../src/game/inactivity';

/**
 * Undo around upkeep under the only ruleset there is (Phasing, 2026-09-21).
 * Upkeep no longer falls at the START of a turn — it falls at Mine & prepare,
 * inside the mover's own turn — so there is no automatic-payment checkpoint to
 * synthesise: the mine-and-upkeep transition is an ordinary undo step
 * (`automaticUpkeepUndo` returns null for every Phasing state, `turn.ts:46`).
 * The board is barren so that mining moves no cash and upkeep is the only
 * crystal movement these cases measure.
 */
afterEach(() => { cleanup(); localStorage.clear(); });
function whiteActing(cash = 5) {
  const state = createInitialGameState(Array(100).fill(0), 4, 0, 'phasing');
  state.players.white.resources = cash;
  state.board.units = [
    { ...createUnit('water_2', 'white', {x:3,y:2}), damageTaken:1, hasMoved:true, placedThisTurn:true },
    createUnit('metal_3', 'white', {x:4,y:2}),
    createUnit('fire_1', 'white', {x:2,y:2}),
    createUnit('fire_1', 'black', {x:8,y:9}),
  ];
  return state;
}

it('settles mining and upkeep in one undoable step, and undo refunds them', () => {
  const before = whiteActing(); saveGameState(before);
  const { result } = renderHook(() => useGameState());
  const unitId = before.board.units[0].id;
  act(() => result.current.moveUnit(unitId, {x:3,y:3}));
  act(() => result.current.endActionPhase());
  const paid = result.current.state;
  expect(paid).toMatchObject({upkeepPending:false,players:{white:{resources:2,resourcesUpkeep:3}},
    turn:{currentPlayer:'white',turnNumber:1,phase:'place',actionsRemaining:0}});
  expect(result.current.canUndo).toBe(true);
  // Preparation is not a second helping of actions, and the handover is a
  // separate, deliberate step.
  act(() => result.current.undo());
  const acting = result.current.state;
  expect(acting.upkeepPending).toBeFalsy();
  expect(acting.turn).toMatchObject({currentPlayer:'white',turnNumber:1,phase:'action',actionsRemaining:3});
  expect(acting.players.white).toEqual(before.players.white);
  expect(acting.board.units.find(u => u.id === unitId)?.position).toEqual({x:3,y:3});
  // And the move itself is still one more step back.
  act(() => result.current.undo());
  expect(result.current.state.board.units).toEqual(before.board.units);
  expect(result.current.state.players.white).toEqual(before.players.white);
  expect(result.current.canUndo).toBe(false);
});

it('closes the turn at the handover and does not reopen it', () => {
  const before = whiteActing(); before.turn.currentPlayer = 'black'; saveGameState(before);
  const { result } = renderHook(() => useGameState());
  const blackId = before.board.units[3].id;
  act(() => {
    result.current.applyAIAction({type:'MOVE',unitId:blackId,to:{x:6,y:9}});
    result.current.applyAIAction({type:'END_ACTION_PHASE'});
  });
  expect(result.current.state.turn).toMatchObject({currentPlayer:'black',phase:'place'});
  act(() => result.current.applyAIAction({type:'END_PLACE_PHASE'}));
  expect(result.current.state.turn.currentPlayer).toBe('white');
  expect(result.current.canUndo).toBe(false);
  expect(result.current.state.board.units.find(u => u.id === blackId)?.position).toEqual({x:6,y:9});
  act(() => result.current.undo());
  expect(result.current.state.turn.currentPlayer).toBe('white');
  expect(result.current.lastTurnReplay?.frames.map(f => f.action.type)).toEqual(['MOVE','END_ACTION_PHASE']);
});

it('never synthesises an automatic upkeep checkpoint under Phasing', () => {
  const free = createInitialGameState(Array(100).fill(0), 4, 0, 'phasing');
  const poor = whiteActing(1);
  const drawn = {...whiteActing(),inactivityPlies:INACTIVITY_LIMIT-1};
  for (const before of [free, poor, drawn]) {
    const after = applyAction(before, {type:'END_ACTION_PHASE'});
    expect(automaticUpkeepUndo(before, after)).toBeNull();
  }
  // An unaffordable bill still stops preparation until the player chooses.
  expect(applyAction(poor, {type:'END_ACTION_PHASE'}).upkeepPending).toBe(true);
});

it('does not let the upkeep choice reopen a completed game', () => {
  const before = whiteActing();
  before.board.units = before.board.units.filter(u => u.definitionId !== 'fire_1' || u.owner === 'black');
  before.reviewUpkeep = { white: true };
  saveGameState(before);
  const { result } = renderHook(() => useGameState());
  act(() => result.current.endActionPhase());
  expect(result.current.state.upkeepPending).toBe(true);
  act(() => result.current.payUpkeep([]));
  expect(result.current.state.victoryReason).toBe('upkeep-elimination');
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.undo());
  expect(result.current.state.phase).toBe('victory');
});
