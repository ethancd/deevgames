import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameView } from '../../src/components/GameScreen';
import { useOnlineGame } from '../../src/online/useOnlineGame';
import { playRoom, waitRoom } from '../../src/online/client';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { applyActions } from '../../src/ai/simulate';
import type { AIAction } from '../../src/ai/types';
import type { GameConfig, PlayerId, Ruleset } from '../../src/game/types';
import type { OnlineConnection, RoomChange, RoomSnapshot } from '../../src/online/types';

vi.mock('../../src/online/client', () => ({
  playRoom: vi.fn(), readRoom: vi.fn(), waitRoom: vi.fn(() => new Promise(() => {})),
  OnlineError: class extends Error {},
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); localStorage.clear(); });

function fixture(player: PlayerId = 'white', ruleset: Ruleset = 'phasing', phase: 'action' | 'place' = 'action') {
  const opponent = player === 'white' ? 'black' : 'white';
  const state = createInitialGameState(undefined, 4, 0, ruleset);
  state.turn = { ...state.turn, currentPlayer: opponent, phase, actionsRemaining: 1 };
  state.board.units = [createUnit('water_1', opponent, { x: 3, y: 3 }), createUnit('water_1', player, { x: 7, y: 3 })];
  state.board.units[1].canActThisTurn = false;
  const room: RoomSnapshot = { id: 'inspection', revision: 1, ready: true, seats: { white: 'White', black: 'Black' }, state, history: [], updatedAt: 'now' };
  const connection: OnlineConnection = { serverUrl: '', roomId: room.id, player, token: 'test-token' };
  const config: GameConfig = { mode: 'online', controls: { [player]: 'human', [opponent]: 'remote' } as GameConfig['controls'], aiDifficulty: { white: 'medium', black: 'medium' } };
  function Harness() {
    const { game, incoming, busy } = useOnlineGame(connection, room, () => {});
    return <GameView game={game} config={config} onBackToMenu={() => {}} online={{ player, ready: true, busy,
      playingIncoming: incoming.playing, incomingFrame: incoming.frame, names: { white: 'White', black: 'Black' }, banner: null, analysisUrl: '' }} />;
  }
  return { room, Harness };
}

for (const ruleset of ['standard', 'phasing'] as const) for (const player of ['white', 'black'] as const) for (const phase of ['action', 'place'] as const) {
  it(`${ruleset}: ${player} can inspect both armies during the opponent's ${phase} phase without sending actions`, () => {
    const { room, Harness } = fixture(player, ruleset, phase);
    const before = JSON.stringify(room);
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByTestId('cell-3-3'));
    expect(container.querySelector('.unit-detail')).toHaveTextContent('Enemy');
    expect(screen.getByTestId('cell-7-3')).toHaveAccessibleName(/attack frontier/);
    expect(screen.getByTestId('cell-3-3')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Hide reach' }));
    expect(container.querySelectorAll('.attack-frontier-marker')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Show reach' }));
    expect(screen.getByTestId('cell-7-3')).toHaveAccessibleName(/attack frontier/);
    fireEvent.click(screen.getByTestId('cell-7-3'));
    expect(container.querySelector('.unit-detail')).not.toHaveTextContent('Enemy');
    expect(screen.getByTestId('cell-3-3')).toHaveAccessibleName(/attack frontier/);
    expect(screen.getByTestId('cell-7-4')).toHaveAccessibleName(/move costs 1 actions/);
    expect(screen.queryByRole('button', { name: /Promote|Confirm attack/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Undo/ })).toBeDisabled();
    for (const key of ['ArrowDown', 'Enter', 'n', 'p']) fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.click(screen.getByTestId('cell-7-4'));
    expect(container.querySelector('.unit-detail')).toBeNull();
    fireEvent.click(screen.getByTestId('cell-7-3'));
    fireEvent.click(screen.getByTestId('cell-7-3'));
    expect(container.querySelector('.unit-detail')).toBeNull();
    expect(playRoom).not.toHaveBeenCalled();
    expect(JSON.stringify(room)).toBe(before);
  });
}

it('allows inspection during incoming playback, follows the moving unit, and restores normal selection on your turn', async () => {
  vi.useFakeTimers();
  const { room, Harness } = fixture();
  room.state.turn.actionsRemaining = 4;
  room.state.pendingSummons = [{ id: 'pending', owner: 'white', definitionId: 'fire_1', position: { x: 0, y: 0 }, cost: 3 }];
  let deliver!: (change: RoomChange) => void;
  vi.mocked(waitRoom).mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; }));
  const { container } = render(<Harness />);
  const unitId = room.state.board.units[0].id;
  const actions: AIAction[] = [{ type: 'MOVE', unitId, to: { x: 3, y: 5 } }, { type: 'END_ACTION_PHASE' }, { type: 'END_PLACE_PHASE' }];
  const next = { ...room, revision: 2, state: applyActions(room.state, actions), history: [{ revision: 2, player: 'black' as const, actions }] };
  await act(async () => deliver({ changed: true, revision: next.revision, phase: next.state.phase, room: next }));
  fireEvent.click(screen.getByTestId('cell-3-3'));
  expect(container.querySelector('.unit-detail')).toHaveTextContent('Sjor');
  expect(screen.getByRole('button', { name: 'Hide reach' })).toBeVisible();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(screen.getByTestId('cell-3-4')).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.unit-detail')).toHaveTextContent('Sjor');
  fireEvent.click(screen.getByTestId('cell-0-0'));
  expect(container.querySelector('.unit-detail')).toHaveTextContent('Phasing in');
  fireEvent.click(screen.getByRole('button', { name: 'Deselect unit' }));
  expect(screen.getByText('Opponent’s move')).toBeVisible();
  for (let i = 0; i < 5; i++) await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(screen.getByRole('button', { name: /Mine & prepare/ })).toBeEnabled();
  fireEvent.click(screen.getByTestId('cell-7-3'));
  expect(screen.getByTestId('cell-7-3')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('button', { name: /Hide reach|Show reach/ })).toBeNull();
  expect(playRoom).not.toHaveBeenCalled();
});
