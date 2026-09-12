import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { useGameState } from '../../src/hooks/useGameState';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { loadGameState, saveGameState } from '../../src/utils/persistence';

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  const state = createInitialGameState(undefined, 6);
  state.board.units = [createUnit('fire_1', 'white', {x:0,y:0}), createUnit('plant_1', 'black', {x:4,y:0}), createUnit('water_1', 'black', {x:9,y:9})];
  return state;
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
it('replays on the same board once per second and restores the live board without a modal', () => {
  vi.useFakeTimers(); const state=fixture(); saveGameState(state);
  const {container}=render(<GameScreen config={{mode:'pass-play',controls:{white:'human',black:'human'},aiDifficulty:{white:'medium',black:'medium'}}} onBackToMenu={()=>{}} />);
  fireEvent.click(screen.getByTestId('cell-0-0'));
  fireEvent.click(screen.getByTestId('cell-4-0'));
  fireEvent.click(screen.getByRole('button',{name:'Confirm attack'}));
  fireEvent.click(screen.getByRole('button',{name:/End turn/}));
  fireEvent.click(screen.getByText('Tap anywhere to continue'));
  const saved=loadGameState(), board=container.querySelector('.battle-board');
  fireEvent.click(screen.getByRole('button',{name:/Instant replay/}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(container.querySelectorAll('.battle-board')).toHaveLength(1);
  expect(container.querySelector('.battle-board')).toBe(board);
  expect(screen.getByTestId('cell-0-0')).toHaveAccessibleName(/white Hi/);
  act(()=>vi.advanceTimersByTime(999)); expect(screen.getByText('Start of turn')).toBeInTheDocument();
  act(()=>vi.advanceTimersByTime(1)); expect(screen.getByTestId('cell-3-0')).toHaveAccessibleName(/white Hi/);
  expect(screen.getByTestId('cell-4-0')).toHaveAccessibleName(/black Muju/);
  // Board clicks and shortcuts cannot play or select pieces during playback.
  fireEvent.click(screen.getByTestId('cell-9-9'));
  fireEvent.click(screen.getByTestId('cell-8-9'));
  fireEvent.keyDown(window,{key:'Enter'});
  expect(screen.getByRole('button',{name:/End turn/})).toBeDisabled();
  act(()=>vi.advanceTimersByTime(1000)); expect(screen.getByTestId('cell-4-0')).not.toHaveAccessibleName(/black Muju/);
  act(()=>vi.advanceTimersByTime(1000)); expect(screen.queryByRole('button',{name:/Stop replay/})).toBeNull();
  expect(container.querySelector('.battle-board')).toBe(board);
  expect(screen.getByTestId('cell-3-0')).toHaveAccessibleName(/white Hi/);
  expect(screen.getByRole('button',{name:/End turn/})).toBeEnabled();
  expect(loadGameState()).toEqual(saved);
});
it('opens from your turn, blocks gameplay shortcuts, stops early and can replay again', () => {
  vi.useFakeTimers(); const state=fixture(); saveGameState(state);
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
  expect(screen.getByTestId('cell-2-0')).toHaveAccessibleName(/white Hi/);
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
