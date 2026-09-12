import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { TurnReplay } from '../../src/components/TurnReplay';
import { GameScreen } from '../../src/components/GameScreen';
import { useGameState } from '../../src/hooks/useGameState';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { emptyRecording, recordAction } from '../../src/game/replay';
import { applyAction } from '../../src/ai/simulate';
import { loadGameState, saveGameState } from '../../src/utils/persistence';
import type { AIAction } from '../../src/ai/types';

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  const state = createInitialGameState(undefined, 6);
  state.board.units = [createUnit('fire_1', 'white', {x:0,y:0}), createUnit('plant_1', 'black', {x:4,y:0}), createUnit('water_1', 'black', {x:9,y:9})];
  return state;
}
function dialogSupport() {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable:true, value:function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable:true, value:function(this: HTMLDialogElement) { this.open = false; } });
}
it('records individual AI actions and excludes commands undone before handoff', () => {
  const state = fixture(); saveGameState(state);
  const {result} = renderHook(() => useGameState());
  const id = state.board.units[0].id;
  act(() => result.current.moveAndAttack(id, {x:3,y:0}, {x:4,y:0}));
  act(() => result.current.undo());
  act(() => result.current.applyAIAction({type:'MOVE',unitId:id,to:{x:2,y:0}}));
  act(() => result.current.applyAIAction({type:'END_ACTION_PHASE'}));
  expect(result.current.lastTurnReplay?.frames.map(f=>f.action.type)).toEqual(['MOVE']);
  expect(result.current.lastTurnReplay?.initialBoard).toEqual(state.board);
  expect(result.current.lastTurnReplay?.frames[0].board.units).toHaveLength(3);
});
it('plays one move or attack per second and leaves the saved game untouched', () => {
  vi.useFakeTimers(); dialogSupport();
  let state = fixture(), recording = emptyRecording(); const id=state.board.units[0].id;
  const actions: AIAction[] = [{type:'MOVE',unitId:id,to:{x:3,y:0}}, {type:'ATTACK',unitId:id,targetPosition:{x:4,y:0}}, {type:'END_ACTION_PHASE'}];
  for (const action of actions) { const next=applyAction(state,action); recording=recordAction(recording,state,action,next); state=next; }
  saveGameState(state); const saved=loadGameState(); const close=vi.fn();
  render(<TurnReplay replay={recording.last!} playerName="Opponent" onClose={close} />);
  const replay=within(screen.getByRole('dialog'));
  expect(replay.getByTestId('cell-0-0')).toHaveAccessibleName(/white Hi/);
  act(()=>vi.advanceTimersByTime(999)); expect(screen.getByText('Start of turn')).toBeInTheDocument();
  act(()=>vi.advanceTimersByTime(1)); expect(replay.getByTestId('cell-3-0')).toHaveAccessibleName(/white Hi/);
  expect(replay.getByTestId('cell-4-0')).toHaveAccessibleName(/black Muju/);
  act(()=>vi.advanceTimersByTime(1000)); expect(replay.getByTestId('cell-4-0')).not.toHaveAccessibleName(/black Muju/);
  expect(close).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(1000)); expect(close).toHaveBeenCalledOnce();
  expect(loadGameState()).toEqual(saved);
});
it('opens from your turn, blocks gameplay shortcuts, stops early and can replay again', () => {
  vi.useFakeTimers(); dialogSupport(); const state=fixture(); saveGameState(state);
  render(<GameScreen config={{mode:'pass-play',controls:{white:'human',black:'human'},aiDifficulty:{white:'medium',black:'medium'}}} onBackToMenu={()=>{}} />);
  fireEvent.click(screen.getByTestId('cell-0-0'));
  fireEvent.click(screen.getByTestId('cell-2-0'));
  fireEvent.click(screen.getByRole('button',{name:/End turn/}));
  fireEvent.click(screen.getByText('Tap anywhere to continue'));
  const before=loadGameState();
  fireEvent.click(screen.getByRole('button',{name:/Instant replay/}));
  fireEvent.keyDown(window,{key:'z',ctrlKey:true});
  fireEvent.keyDown(window,{key:'Enter'});
  expect(loadGameState()).toEqual(before);
  fireEvent.click(screen.getByRole('button',{name:/Stop replay/}));
  expect(screen.queryByRole('dialog')).toBeNull();
  act(()=>vi.advanceTimersByTime(2000)); expect(loadGameState()).toEqual(before);
  fireEvent.click(screen.getByRole('button',{name:/Instant replay/}));
  expect(screen.getByText('Start of turn')).toBeInTheDocument();
});

it('records placement and promotion results, omitting phase transitions', () => {
  const state=createInitialGameState(); state.turn.phase='place'; state.players.white.resources=20; saveGameState(state);
  const id=state.board.units.find(u=>u.definitionId==='fire_1'&&u.owner==='white')!.id;
  const {result}=renderHook(()=>useGameState());
  act(()=>result.current.buyUnit('fire_1',{x:0,y:0}));
  const purchased=result.current.state.board.units.at(-1)!;
  act(()=>result.current.promoteUnit(id));
  act(()=>result.current.endPlacePhase());
  act(()=>result.current.endActionPhase());
  const replay=result.current.lastTurnReplay!;
  expect(replay.frames.map(f=>f.action.type)).toEqual(['BUY_UNIT','PROMOTE_UNIT']);
  expect(replay.frames[0].unitId).toBe(purchased.id);
  expect(replay.frames[0].board.units.find(u=>u.id===id)?.definitionId).toBe('fire_1');
  expect(replay.frames[1].board.units.find(u=>u.id===id)?.definitionId).toBe('fire_2');
});
