import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { loadGameState, saveGameState } from '../../src/utils/persistence';

const config = {mode: 'pass-play', controls: {white: 'human', black: 'human'}, aiDifficulty: {white: 'medium', black: 'medium'}} as const;
afterEach(() => { cleanup(); localStorage.clear(); });
function start() {
  const state = createInitialGameState();
  state.board.units = [createUnit('fire_1', 'white', {x: 0, y: 0}), createUnit('plant_1', 'black', {x: 4, y: 0}), createUnit('water_1', 'black', {x: 9, y: 9})];
  saveGameState(state);
  const view = render(<GameScreen config={config} onBackToMenu={vi.fn()} />);
  fireEvent.click(screen.getByTestId('cell-0-0'));
  return {state, ...view};
}
const click = (x: number, y: number) => fireEvent.click(screen.getByTestId(`cell-${x}-${y}`));

it('previews the shortest approach without spending actions, cancels, then commits and undoes both actions together', () => {
  const {state, container} = start();
  click(4, 0);
  expect(screen.getByTestId('cell-3-0')).toHaveAccessibleName(/preview: Hi attack approach/);
  expect(screen.getByTestId('cell-4-0')).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelectorAll('.preview-ghost')).toHaveLength(1);
  expect(container.querySelector('.action-preview')).toHaveTextContent('3 actions · 1 left');
  expect(loadGameState()?.board).toEqual(state.board);
  fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
  expect(container.querySelector('.preview-ghost')).toBeNull();
  expect(loadGameState()?.turn.actionsRemaining).toBe(4);
  click(4, 0);
  fireEvent.click(screen.getByRole('button', {name: 'Confirm attack'}));
  expect(screen.getByTestId('cell-3-0')).toHaveAccessibleName(/white Hi/);
  expect(screen.getByTestId('cell-4-0')).not.toHaveAccessibleName(/black Muju/);
  expect(loadGameState()?.turn.actionsRemaining).toBe(1);
  fireEvent.click(screen.getByRole('button', {name: /Undo/}));
  expect(loadGameState()?.board).toEqual(state.board);
  expect(loadGameState()?.turn.actionsRemaining).toBe(4);
});

it('moves immediately to a manually chosen square, keeps selection, and previews the adjacent attack', () => {
  start(); click(4, 0); click(4, 1);
  expect(screen.queryByRole('button', {name: 'Confirm move'})).toBeNull();
  expect(screen.getByRole('button', {name: 'Confirm attack'})).toBeInTheDocument();
  expect(screen.getByTestId('cell-4-1')).toHaveAccessibleName(/white Hi/);
  expect(screen.getByTestId('cell-4-1')).toHaveAttribute('aria-pressed', 'true');
  expect(loadGameState()?.turn.actionsRemaining).toBe(1);
  expect(screen.getByText('1 action · 0 left')).toBeInTheDocument();
  // Undo still works with the attack preview open.
  fireEvent.keyDown(window, {key: 'z', ctrlKey: true});
  expect(screen.queryByRole('button', {name: 'Confirm attack'})).toBeNull();
  expect(screen.getByTestId('cell-0-0')).toHaveAccessibleName(/white Hi/);
  expect(loadGameState()?.turn.actionsRemaining).toBe(4);
});

it('does not offer a move-and-attack when movement would exhaust the action budget', () => {
  const state = createInitialGameState(); state.turn.actionsRemaining = 1;
  state.board.units = [createUnit('fire_1', 'white', {x: 0,y: 0}), createUnit('plant_1', 'black', {x: 3,y: 0})];
  saveGameState(state); render(<GameScreen config={config} onBackToMenu={vi.fn()} />);
  click(0,0); click(3,0);
  expect(screen.queryByRole('button', {name: 'Confirm attack'})).toBeNull();
  expect(loadGameState()?.board).toEqual(state.board);
});

it('shows no move dots or attack targets when selecting a unit with zero actions', () => {
  const state = createInitialGameState(); state.turn.actionsRemaining = 0;
  state.board.units = [createUnit('fire_1', 'white', {x:0,y:0}), createUnit('plant_1', 'black', {x:1,y:0})];
  saveGameState(state);
  const {container} = render(<GameScreen config={config} onBackToMenu={vi.fn()} />);
  click(0,0);
  expect(screen.getByTestId('cell-0-0')).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelectorAll('.range-marker, .attack-target')).toHaveLength(0);
});
