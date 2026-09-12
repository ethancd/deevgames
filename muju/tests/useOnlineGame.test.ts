import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createInitialGameState } from '../src/game/board';
import { useOnlineGame } from '../src/online/useOnlineGame';
import { playRoom, waitRoom } from '../src/online/client';
import type { RoomChange, RoomSnapshot } from '../src/online/types';

vi.mock('../src/online/client', async importOriginal => ({ ...await importOriginal<object>(), waitRoom: vi.fn(), playRoom: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(waitRoom).mockReset(); vi.mocked(playRoom).mockReset(); });

it('pauses hidden tabs, resumes from the last revision, ignores cancelled responses and stops after victory', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const pending: ((change: RoomChange) => void)[] = [];
  vi.mocked(waitRoom).mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const initial: RoomSnapshot = { id: 'test-room', revision: 1, ready: true, seats: { white: 'A', black: 'B' },
    state: createInitialGameState(), history: [], updatedAt: new Date().toISOString() };
  const connection = { roomId: initial.id, player: 'white' as const, token: 'test-token', serverUrl: 'http://localhost' };
  const { result, unmount } = renderHook(() => useOnlineGame(connection, initial, () => {}));
  await waitFor(() => expect(waitRoom).toHaveBeenCalledTimes(1));
  const firstSignal = vi.mocked(waitRoom).mock.calls[0][2]!;
  act(() => { visibility.mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange')); });
  expect(firstSignal.aborted).toBe(true);
  await act(async () => { pending[0]({ changed: true, revision: 2, phase: 'playing', room: { ...initial, revision: 2 } }); });
  expect(result.current.room.revision).toBe(1);
  expect(waitRoom).toHaveBeenCalledTimes(1);
  act(() => { visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => expect(waitRoom).toHaveBeenCalledTimes(2));
  expect(vi.mocked(waitRoom).mock.calls[1][1]).toBe(1);
  await act(async () => { pending[1]({ changed: true, revision: 3, phase: 'victory',
    room: { ...initial, revision: 3, state: { ...initial.state, phase: 'victory', winner: 'white' } } }); });
  expect(result.current.room.state.phase).toBe('victory');
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(waitRoom).toHaveBeenCalledTimes(2);
  unmount();
});

it('blocks every observer command even if invoked outside the read-only UI', () => {
  vi.mocked(waitRoom).mockImplementation(() => new Promise(() => {}));
  const initial: RoomSnapshot = { id: 'observer-room', revision: 2, ready: true, canUndo: true,
    seats: { white: 'A', black: 'B' }, state: createInitialGameState(), history: [], updatedAt: '' };
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
