import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { saveGameState } from '../../src/utils/persistence';

afterEach(() => { cleanup(); localStorage.clear(); });

it('Show reach toggles the red frontier on empty and occupied squares, and clears on own selection', () => {
  const state = createInitialGameState();
  state.turn.actionsRemaining = 2;
  state.board.units = [
    createUnit('water_1', 'black', {x: 3, y: 3}),
    createUnit('plant_1', 'white', {x: 9, y: 3}),
  ];
  saveGameState(state);
  const {container} = render(<GameScreen config={{mode: 'pass-play', controls: {white: 'human', black: 'human'}, aiDifficulty: {white: 'medium', black: 'medium'}}} onBackToMenu={vi.fn()} />);
  fireEvent.click(screen.getByTestId('cell-3-3'));
  expect(container.querySelectorAll('.attack-frontier-marker')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', {name: 'Show reach'}));
  expect(screen.getByRole('button', {name: 'Hide reach'})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('cell-9-3')).toHaveAccessibleName(/enemy attack frontier/);
  expect(screen.getByTestId('cell-9-3').parentElement?.querySelector('.attack-frontier-marker.on-unit')).not.toBeNull();
  expect(screen.getByTestId('cell-3-9').parentElement?.querySelector('.attack-frontier-marker')).not.toBeNull();
  expect(screen.getByTestId('cell-4-4')).not.toHaveAccessibleName(/enemy attack frontier/);
  fireEvent.click(screen.getByRole('button', {name: 'Hide reach'}));
  expect(container.querySelectorAll('.attack-frontier-marker')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', {name: 'Show reach'}));
  fireEvent.click(screen.getByTestId('cell-9-3'));
  expect(container.querySelectorAll('.attack-frontier-marker')).toHaveLength(0);
});
