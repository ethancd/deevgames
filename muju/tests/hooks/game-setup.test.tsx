import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../../src/App';
import { createInitialGameState } from '../../src/game/board';
import { loadGameState, saveGameState } from '../../src/utils/persistence';

afterEach(()=>{cleanup();localStorage.clear();});

it('starts a new four-action game, undoes, resumes its rules and can start a standard game',()=>{
  const old=createInitialGameState();old.turn.turnNumber=9;saveGameState(old);
  let view=render(<App />);
  fireEvent.click(screen.getByRole('button',{name:/^Pass & Play/}));
  expect(screen.getByRole('combobox',{name:'Actions per turn'})).toHaveValue('6');
  fireEvent.change(screen.getByRole('combobox',{name:'Actions per turn'}),{target:{value:'4'}});
  fireEvent.click(screen.getByRole('button',{name:'Start Game'}));
  expect(loadGameState()).toMatchObject({actionsPerTurn:4,turn:{turnNumber:1,actionsRemaining:4}});
  expect(view.container.querySelectorAll('.action-budget i')).toHaveLength(4);
  fireEvent.click(screen.getByTestId('cell-1-1'));
  fireEvent.click(screen.getByTestId('cell-3-1'));
  expect(loadGameState()?.turn.actionsRemaining).toBe(2);
  fireEvent.click(screen.getByRole('button',{name:/Undo/}));
  expect(loadGameState()?.turn.actionsRemaining).toBe(4);
  view.unmount();view=render(<App />);
  fireEvent.click(screen.getByRole('button',{name:/^Pass & Play/}));
  fireEvent.click(screen.getByRole('button',{name:/Continue saved game · 4 actions/}));
  expect(view.container.querySelectorAll('.action-budget i')).toHaveLength(4);
  fireEvent.click(screen.getByRole('button',{name:/End turn/}));
  expect(loadGameState()).toMatchObject({actionsPerTurn:4,turn:{currentPlayer:'black',actionsRemaining:4}});
  view.unmount();view=render(<App />);
  fireEvent.click(screen.getByRole('button',{name:/^Pass & Play/}));
  fireEvent.click(screen.getByRole('button',{name:'Start Game'}));
  expect(loadGameState()).toMatchObject({actionsPerTurn:6,turn:{currentPlayer:'white',actionsRemaining:6}});
  expect(view.container.querySelectorAll('.action-budget i')).toHaveLength(6);
});
