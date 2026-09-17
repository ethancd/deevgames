import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import { createInitialGameState, createUnit } from '../../src/game/board';
import { saveGameState } from '../../src/utils/persistence';

afterEach(() => { cleanup(); localStorage.clear(); });

it('uses four actions for enemy reach even with a partially spent current turn', () => {
  const state=createInitialGameState(undefined,4);state.turn.actionsRemaining=1;
  state.board.units=[createUnit('water_1','black',{x:3,y:3}),createUnit('plant_1','white',{x:9,y:3})];
  saveGameState(state);
  render(<GameScreen config={{mode:'pass-play',controls:{white:'human',black:'human'},aiDifficulty:{white:'medium',black:'medium'}}} onBackToMenu={vi.fn()} />);
  fireEvent.click(screen.getByTestId('cell-3-3'));
  expect(screen.getByTestId('cell-7-3')).toHaveAccessibleName(/attack frontier/);
  expect(screen.getByTestId('cell-9-3')).not.toHaveAccessibleName(/attack frontier/);
});

it('enemy inspection defaults reach on, permits hiding it, and resets on inspecting an unreachable enemy', () => {
  const state = createInitialGameState();
  state.turn.actionsRemaining = 2;
  state.board.units = [
    createUnit('water_1', 'black', {x: 3, y: 3}),
    createUnit('plant_1', 'white', {x: 7, y: 3}),
  ];
  saveGameState(state);
  const {container} = render(<GameScreen config={{mode: 'pass-play', controls: {white: 'human', black: 'human'}, aiDifficulty: {white: 'medium', black: 'medium'}}} onBackToMenu={vi.fn()} />);
  fireEvent.click(screen.getByTestId('cell-3-3'));
  expect(screen.getByRole('button', {name: 'Hide reach'})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('cell-7-3')).toHaveAccessibleName(/attack frontier/);
  expect(screen.getByTestId('cell-7-3').parentElement?.querySelector('.attack-frontier-marker.on-unit')).not.toBeNull();
  expect(screen.getByTestId('cell-3-7').parentElement?.querySelector('.attack-frontier-marker')).not.toBeNull();
  expect(screen.getByTestId('cell-4-4')).not.toHaveAccessibleName(/attack frontier/);
  fireEvent.click(screen.getByRole('button', {name: 'Hide reach'}));
  expect(container.querySelectorAll('.attack-frontier-marker')).toHaveLength(0);
  fireEvent.click(screen.getByTestId('cell-7-3'));
  expect(container.querySelectorAll('.attack-frontier-marker')).toHaveLength(0);
  fireEvent.click(screen.getByTestId('cell-3-3'));
  expect(screen.queryByRole('button', {name: 'Confirm attack'})).toBeNull();
  expect(screen.getByRole('button', {name: 'Hide reach'})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('cell-7-3')).toHaveAccessibleName(/attack frontier/);
});

it('inspects a phasing piece without allowing it to move, attack or promote', () => {
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  state.pendingSummons = [{id:'pending',owner:'white',definitionId:'fire_1',position:{x:3,y:3},cost:3}];
  saveGameState(state);
  const {container} = render(<GameScreen config={{mode:'pass-play',controls:{white:'human',black:'human'},aiDifficulty:{white:'medium',black:'medium'}}} onBackToMenu={()=>{}} />);
  fireEvent.click(screen.getByTestId('cell-3-3'));
  expect(container.querySelector('.unit-detail')).toHaveTextContent('Phasing in');
  expect(container.querySelectorAll('.attack-frontier-marker').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button',{name:/Promote/})).toBeNull();
  fireEvent.keyDown(window,{key:'ArrowRight'});
  fireEvent.click(screen.getByTestId('cell-4-3'));
  expect(screen.getByTestId('cell-3-3')).toHaveAccessibleName(/white Hi phasing in/);
  expect(screen.getByTestId('cell-4-3')).not.toHaveAccessibleName(/white Hi/);
});

it('keeps a materialized occupant selectable and offers a separate tap for its overlapping summon', () => {
  const state = createInitialGameState(undefined, 4, 0, 'phasing');
  state.pendingSummons = [{id:'pending',owner:'black',definitionId:'fire_1',position:{x:1,y:0},cost:3}];
  saveGameState(state);
  const {container} = render(<GameScreen config={{mode:'pass-play',controls:{white:'human',black:'human'},aiDifficulty:{white:'medium',black:'medium'}}} onBackToMenu={()=>{}} />);
  fireEvent.click(screen.getByRole('button',{name:'Inspect black Hi phasing in at B1'}));
  expect(container.querySelector('.unit-detail')).toHaveTextContent('Phasing in');
  fireEvent.click(screen.getByTestId('cell-1-0'));
  expect(container.querySelector('.unit-detail')).not.toHaveTextContent('Phasing in');
  expect(screen.getByTestId('cell-1-0')).toHaveAttribute('aria-pressed','true');
});
