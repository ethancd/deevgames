import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { useGameState } from '../../src/hooks/useGameState';
import { createInitialGameState } from '../../src/game/board';
import { saveGameState } from '../../src/utils/persistence';

beforeEach(() => localStorage.clear());

test('automatic phase skipping hands over a full turn with no previous-player undo', () => {
  const { result } = renderHook(() => useGameState());
  for (const player of ['black', 'white', 'black', 'white']) {
    act(() => result.current.endActionPhase());
    expect(result.current.state.turn.currentPlayer).toBe(player);
    expect(result.current.state.turn.actionsRemaining).toBe(6);
    expect(result.current.canUndo).toBe(false);
    const handedOff = result.current.state;
    act(() => result.current.undo());
    expect(result.current.state).toBe(handedOff);
  }
});

test('spending the last crystal hands off without allowing undo across players', () => {
  const state = createInitialGameState();
  state.players.white.resources = 1;
  state.turn.phase = 'queue';
  saveGameState(state);
  const { result } = renderHook(() => useGameState());
  act(() => result.current.queueUnit('fire_1'));
  expect(result.current.state.turn.currentPlayer).toBe('black');
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.undo());
  expect(result.current.state.turn.currentPlayer).toBe('black');
  expect(result.current.state.players.white.buildQueue).toHaveLength(1);
});

test('each player can still undo their own actions and phase changes', () => {
  const { result } = renderHook(() => useGameState());
  act(() => result.current.endActionPhase());
  const unit = result.current.state.board.units.find(u => u.owner === 'black' && u.definitionId === 'water_1')!;
  const before = result.current.state;
  act(() => result.current.mineWith(unit.id));
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.endActionPhase());
  expect(result.current.state.turn.phase).toBe('queue');
  act(() => result.current.undo());
  expect(result.current.state.turn.phase).toBe('action');
  act(() => result.current.undo());
  expect(result.current.state).toEqual(before);
  expect(result.current.canUndo).toBe(false);
});
