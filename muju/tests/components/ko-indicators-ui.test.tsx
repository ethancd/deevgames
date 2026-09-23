import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { saveGameState } from '../../src/utils/persistence';

afterEach(() => { cleanup(); localStorage.clear(); });

const config = { mode: 'pass-play' as const, controls: { white: 'human' as const, black: 'human' as const }, aiDifficulty: { white: 'medium' as const, black: 'medium' as const } };

it('marks an eliminable enemy with the KO badge and aria text when the own unit is selected', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  // fire beats metal (+1): fire_2 attack 3 + 1 = 4 >= metal_1 defense 3, a lethal hit.
  state.board.units = [
    createUnit('fire_2', 'white', { x: 3, y: 3 }),
    createUnit('metal_1', 'black', { x: 4, y: 3 }),
  ];
  saveGameState(state);
  render(<GameScreen config={config} onBackToMenu={vi.fn()} />);

  fireEvent.click(screen.getByTestId('cell-3-3'));

  const target = screen.getByTestId('cell-4-3');
  expect(target).toHaveClass('ko-target');
  expect(target).toHaveAccessibleName(/eliminates/);
});

it('marks a unit the inspected enemy could eliminate next turn with the reverse KO badge and aria text', () => {
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  // fire beats metal (+1): fire_2 attack 3 + 1 = 4 >= metal_1 defense 3, a lethal hit.
  state.board.units = [
    createUnit('fire_2', 'black', { x: 6, y: 6 }),
    createUnit('metal_1', 'white', { x: 7, y: 6 }),
  ];
  saveGameState(state);
  render(<GameScreen config={config} onBackToMenu={vi.fn()} />);

  // No own selection: clicking the enemy inspects it (viewedEnemyUnitId).
  fireEvent.click(screen.getByTestId('cell-6-6'));

  const threatened = screen.getByTestId('cell-7-6');
  expect(threatened).toHaveClass('ko-threat');
  expect(threatened).toHaveAccessibleName(/can be eliminated by selected enemy/);
});
