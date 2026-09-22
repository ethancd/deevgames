import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useGameState } from '../../src/hooks/useGameState';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { loadGameHistory, loadGameState, saveGameState } from '../../src/utils/persistence';
import { INACTIVITY_LIMIT } from '../../src/game/inactivity';

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it('saves both players, individual movement steps and the result, excluding undone commands across reloads', () => {
  let hook = renderHook(() => useGameState({ newGame: true }));
  const start = hook.result.current.state;
  const white = start.board.units.find(u => u.owner === 'white' && u.definitionId === 'fire_1')!;
  const black = start.board.units.find(u => u.owner === 'black' && u.definitionId === 'fire_1')!;
  act(() => hook.result.current.moveUnit(white.id, { x: 5, y: 0 }));
  expect(loadGameHistory()!.frames.slice(1).map(f => f.state.turn.actionsRemaining)).toEqual([3, 2]);
  act(() => hook.result.current.undo());
  expect(loadGameHistory()!.frames).toHaveLength(1);
  act(() => hook.result.current.moveUnit(white.id, { x: 3, y: 0 }));
  const played = loadGameHistory();
  act(() => hook.result.current.moveUnit(white.id, { x: 9, y: 9 })); // Invalid, but still undoable by the hook.
  act(() => hook.result.current.undo());
  expect(loadGameHistory()).toEqual(played);
  act(() => hook.result.current.endActionPhase());
  act(() => hook.result.current.endPlacePhase());
  hook.unmount();
  hook = renderHook(() => useGameState());
  act(() => hook.result.current.applyAIAction({ type: 'MOVE', unitId: black.id, to: { x: 6, y: 9 } }));
  act(() => hook.result.current.applyAIAction({ type: 'RESIGN' }));
  const history = loadGameHistory()!;
  expect(history.complete).toBe(true);
  expect(history.frames[0].state).toEqual(start);
  expect(history.frames.map(f => f.label).join(' ')).not.toContain('F1');
  expect(history.frames.some(f => f.label.includes('I10→G10'))).toBe(true);
  expect(history.frames.at(-1)!.state).toMatchObject({ phase: 'victory', winner: 'white', victoryReason: 'resignation' });
  hook.unmount();
  hook = renderHook(() => useGameState());
  expect(loadGameHistory()).toEqual(history);
  expect(hook.result.current.state.phase).toBe('victory');
  act(() => hook.result.current.resetGame());
  expect(loadGameHistory()).toMatchObject({ complete: true, frames: [{ label: 'Starting position' }] });
  expect(loadGameHistory()!.frames).toHaveLength(1);
});

it('keeps the move and capture separate, and undoes the whole move-and-attack command', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.board.units = [createUnit('fire_1', 'white', { x: 0, y: 0 }),
    createUnit('plant_1', 'black', { x: 4, y: 0 }), createUnit('water_1', 'black', { x: 9, y: 9 })];
  saveGameState(state);
  const { result } = renderHook(() => useGameState());
  act(() => result.current.moveAndAttack(state.board.units[0].id, { x: 3, y: 0 }, { x: 4, y: 0 }));
  const frames = loadGameHistory()!.frames;
  expect(frames).toHaveLength(4);
  expect(frames[2].state.board.units).toHaveLength(3);
  expect(frames[3].state.board.units).toHaveLength(2);
  act(() => result.current.undo());
  expect(loadGameHistory()!.frames).toHaveLength(1);
  expect(loadGameHistory()!.frames[0].state.board).toEqual(state.board);
});

it('rewinds the mover’s mine-and-upkeep step without erasing the move it paid for', () => {
  // Standard charged the INCOMING seat at its turn start. Phasing charges the
  // mover at END_ACTION_PHASE, so the score has to hold the same shape one step
  // earlier: the mining is its own frame, the undo reverses the whole transition,
  // and the move made earlier in that turn stays in the score.
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  state.turn.currentPlayer = 'black';
  state.players.black.resources = 5;
  // Only a tier-2 unit for Black: tier-1 units may never be released, so this is
  // the shape in which releasing everything really does end the game.
  state.board.units = [createUnit('water_2', 'black', { x: 8, y: 9 }), createUnit('fire_1', 'white', { x: 0, y: 0 })];
  saveGameState(state);
  const { result } = renderHook(() => useGameState());
  act(() => result.current.moveUnit(state.board.units[0].id, { x: 6, y: 9 }));
  act(() => result.current.endActionPhase());
  const mined = loadGameHistory()!;
  expect(mined.frames.map(f => f.label).join(' ')).toContain('Mining');
  expect(mined.frames.at(-1)!.label).toContain('Upkeep');
  expect(mined.frames.at(-1)!.state).toMatchObject({ upkeepPending: false, turn: { currentPlayer: 'black', phase: 'place', turnNumber: 1 } });
  act(() => result.current.undo());
  const history = loadGameHistory()!;
  expect(history.frames.at(-1)!.state.upkeepPending).toBeFalsy();
  expect(history.frames.at(-1)!.state.turn).toMatchObject({ currentPlayer: 'black', phase: 'action' });
  expect(history.frames.map(f => f.label).join(' ')).toContain('I10→G10');
  expect(history.frames.map(f => f.label).join(' ')).not.toContain('Mining');
  // Reviewing the keep-set stops the same transition so the seat can release.
  act(() => result.current.setUpkeepReview('black', true));
  act(() => result.current.endActionPhase());
  expect(loadGameHistory()!.frames.at(-1)!.state).toMatchObject({ upkeepPending: true });
  act(() => result.current.payUpkeep([]));
  expect(loadGameHistory()!.frames.at(-1)!.state).toMatchObject({ phase: 'victory', victoryReason: 'upkeep-elimination' });
});

it('labels older saves as partial and keeps the final position when score storage is full', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing'); state.inactivityPlies = INACTIVITY_LIMIT - 1;
  saveGameState(state);
  const { result } = renderHook(() => useGameState());
  expect(loadGameHistory()).toMatchObject({ complete: false, frames: [{ label: 'First recorded position' }] });
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (JSON.parse(value).history?.frames.length > 1) throw new DOMException('Full', 'QuotaExceededError');
    setItem.call(this, key, value);
  });
  act(() => result.current.endActionPhase());
  act(() => result.current.endPlacePhase());
  expect(loadGameState()).toMatchObject({ phase: 'victory', victoryReason: 'inactivity' });
  expect(loadGameHistory()!.frames).toHaveLength(1);
  expect(loadGameHistory()!.frames[0].state.phase).toBe('victory');
});

it('Phasing saves pending summons, undoes mining without duplication, and preserves rules on resume/restart', () => {
  let hook = renderHook(() => useGameState({ newGame: true, ruleset: 'phasing' }));
  const initial = hook.result.current.state;
  act(() => hook.result.current.endActionPhase());
  expect(hook.result.current.state.turn).toMatchObject({ phase: 'place', currentPlayer: 'white' });
  act(() => hook.result.current.undo());
  expect(hook.result.current.state).toEqual(initial);
  act(() => hook.result.current.endActionPhase());
  act(() => hook.result.current.buyUnit('fire_1', { x: 0, y: 0 }));
  expect(loadGameHistory()!.frames.at(-1)!.state.pendingSummons).toHaveLength(1);
  hook.unmount();
  hook = renderHook(() => useGameState({ ruleset: 'standard' }));
  expect(hook.result.current.state.ruleset).toBe('phasing');
  expect(hook.result.current.state.pendingSummons).toHaveLength(1);
  act(() => hook.result.current.endPlacePhase());
  expect(hook.result.current.canUndo).toBe(false);
  act(() => hook.result.current.endActionPhase());
  act(() => hook.result.current.endPlacePhase());
  expect(hook.result.current.state.lastSummoning!.summoned).toHaveLength(1);
  expect(loadGameHistory()!.frames.at(-1)!.label).toContain('Arrival');
  act(() => hook.result.current.resetGame());
  expect(hook.result.current.state.ruleset).toBe('phasing');
  expect(hook.result.current.state.pendingSummons).toEqual([]);
});
