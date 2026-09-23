import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../src/game/board';
import { useOnlineGame } from '../src/online/useOnlineGame';
import { playRoom, waitRoom } from '../src/online/client';
import type { RoomChange, RoomSnapshot } from '../src/online/types';

vi.mock('../src/online/client', async importOriginal => ({ ...await importOriginal<object>(), waitRoom: vi.fn(), playRoom: vi.fn() }));
const { playEffect } = vi.hoisted(() => ({ playEffect: vi.fn() }));
vi.mock('../src/sound/SoundProvider', async importOriginal => ({ ...await importOriginal<object>(), useSoundEffects: () => playEffect }));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(waitRoom).mockReset(); vi.mocked(playRoom).mockReset(); playEffect.mockReset(); });

it('keeps long-polling on a hidden tab, still accepts incoming rooms, resyncs on refocus and stops after victory', async () => {
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const pending: ((change: RoomChange) => void)[] = [];
  vi.mocked(waitRoom).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const initial: RoomSnapshot = { id: 'test-room', revision: 1, ready: true, seats: { white: 'A', black: 'B' },
    state: createInitialGameState(undefined, 4, 0, 'phasing'), history: [], updatedAt: new Date().toISOString() };
  const connection = { roomId: initial.id, player: 'white' as const, token: 'test-token', serverUrl: 'http://localhost' };
  const { result, unmount } = renderHook(() => useOnlineGame(connection, initial, () => {}));
  await waitFor(() => expect(waitRoom).toHaveBeenCalledTimes(1));
  const firstSignal = vi.mocked(waitRoom).mock.calls[0][2]!;
  // Hiding the tab must not cancel the in-flight long-poll or stop new ones from being scheduled.
  act(() => { hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); });
  expect(firstSignal.aborted).toBe(false);
  await act(async () => { pending[0]({ changed: true, revision: 2, phase: 'playing', room: { ...initial, revision: 2 } }); });
  expect(result.current.room.revision).toBe(2);
  await waitFor(() => expect(waitRoom).toHaveBeenCalledTimes(2));
  expect(vi.mocked(waitRoom).mock.calls[1][1]).toBe(2);
  // Returning to the tab forces a fresh poll instead of leaving the previous one running untouched.
  const secondSignal = vi.mocked(waitRoom).mock.calls[1][2]!;
  act(() => { hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')); });
  expect(secondSignal.aborted).toBe(true);
  await waitFor(() => expect(waitRoom).toHaveBeenCalledTimes(3));
  await act(async () => { pending[2]({ changed: true, revision: 3, phase: 'victory',
    room: { ...initial, revision: 3, state: { ...initial.state, phase: 'victory', winner: 'white' } } }); });
  expect(result.current.room.state.phase).toBe('victory');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(waitRoom).toHaveBeenCalledTimes(3);
  unmount();
});

it('sounds a hidden-tab cue for the opponent\'s mid-turn action and their hand-off into the viewer\'s turn', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  const pending: ((change: RoomChange) => void)[] = [];
  vi.mocked(waitRoom).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const opponentTurn = { ...createInitialGameState(), turn: { ...createInitialGameState().turn, currentPlayer: 'black' as const } };
  const initial: RoomSnapshot = { id: 'cue-room', revision: 1, ready: true, seats: { white: 'A', black: 'B' },
    state: opponentTurn, history: [], updatedAt: 'now' };
  const connection = { roomId: initial.id, player: 'white' as const, token: 'tok', serverUrl: 'http://localhost' };
  const { unmount } = renderHook(() => useOnlineGame(connection, initial, () => {}));
  await waitFor(() => expect(waitRoom).toHaveBeenCalledTimes(1));

  const partial: RoomSnapshot = { ...initial, revision: 2,
    history: [{ revision: 2, player: 'black', actions: [{ type: 'END_PLACE_PHASE' }] }] };
  await act(async () => { pending[0]({ changed: true, revision: 2, phase: 'playing', room: partial }); });
  expect(playEffect).toHaveBeenCalledWith(['opponentAction']); // opponent acted, but it's still their turn
  await waitFor(() => expect(waitRoom).toHaveBeenCalledTimes(2));

  const handoff: RoomSnapshot = { ...partial, revision: 3,
    state: { ...opponentTurn, turn: { ...opponentTurn.turn, currentPlayer: 'white' } },
    history: [...partial.history, { revision: 3, player: 'black', actions: [{ type: 'END_ACTION_PHASE' }] }] };
  await act(async () => { pending[1]({ changed: true, revision: 3, phase: 'playing', room: handoff }); });
  expect(playEffect).toHaveBeenCalledWith(['yourTurn']); // the opponent just ended their turn
  unmount();
});

it('never sounds the hidden-tab cue on a visible tab, leaving the ordinary turnStart/piece cues in charge', async () => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const pending: ((change: RoomChange) => void)[] = [];
  vi.mocked(waitRoom).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const opponentTurn = { ...createInitialGameState(), turn: { ...createInitialGameState().turn, currentPlayer: 'black' as const } };
  const initial: RoomSnapshot = { id: 'visible-cue-room', revision: 1, ready: true, seats: { white: 'A', black: 'B' },
    state: opponentTurn, history: [], updatedAt: 'now' };
  const connection = { roomId: initial.id, player: 'white' as const, token: 'tok', serverUrl: 'http://localhost' };
  const { unmount } = renderHook(() => useOnlineGame(connection, initial, () => {}));
  await waitFor(() => expect(waitRoom).toHaveBeenCalledTimes(1));

  const handoff: RoomSnapshot = { ...initial, revision: 2,
    state: { ...opponentTurn, turn: { ...opponentTurn.turn, currentPlayer: 'white' } },
    history: [{ revision: 2, player: 'black', actions: [{ type: 'END_ACTION_PHASE' }] }] };
  await act(async () => { pending[0]({ changed: true, revision: 2, phase: 'playing', room: handoff }); });
  expect(playEffect).not.toHaveBeenCalled();
  unmount();
});

it('blocks every observer command even if invoked outside the read-only UI', () => {
  vi.mocked(waitRoom).mockImplementation(() => new Promise(() => {}));
  const initial: RoomSnapshot = { id: 'observer-room', revision: 2, ready: true, canUndo: true,
    seats: { white: 'A', black: 'B' }, state: createInitialGameState(undefined, 4, 0, 'phasing'), history: [], updatedAt: '' };
  const connection = { roomId: initial.id, serverUrl: 'http://localhost' };
  const { result, unmount } = renderHook(() => useOnlineGame(connection, initial, () => {}));
  const game = result.current.game;
  act(() => {
    game.selectUnit(initial.state.board.units[0].id);
    game.moveUnit('unit', { x: 2, y: 0 }); game.moveAndAttack('unit', { x: 2, y: 0 }, { x: 3, y: 0 });
    game.attackWith('unit', { x: 2, y: 0 }); game.buyUnit('fire_1', { x: 0, y: 0 }); game.promoteUnit('unit');
    game.payUpkeep([]); game.setUpkeepReview('white', true); game.endPlacePhase(); game.endActionPhase();
    game.resign(); game.undo(); game.applyAIAction({ type: 'END_ACTION_PHASE' });
  });
  expect(playRoom).not.toHaveBeenCalled();
  expect(result.current.game.canUndo).toBe(false);
  expect(result.current.game.isPlayerTurn).toBe(false);
  expect(result.current.game.selectedUnitData).toBeNull();
  unmount();
});
