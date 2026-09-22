import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../../src/App';
import { loadGameState } from '../../src/utils/persistence';

afterEach(()=>{cleanup();localStorage.clear();});

/**
 * The mode screen offers no ruleset since 2026-09-21: every new game is
 * Phasing, and a resumed one can only be Phasing (a save that is not is
 * archived by `loadGameState`, never handed back). So this walks the one turn
 * shape there is — Act, then Mine & prepare, then End turn — through the save.
 */
it('starts a new four-action Phasing game, undoes, resumes it and hands over',()=>{
  let view=render(<App />);
  fireEvent.click(screen.getByRole('button',{name:/^Pass & Play/}));
  expect(screen.queryByRole('combobox',{name:'Actions per turn'})).toBeNull();
  // No ruleset control anywhere on the screen, for any mode.
  expect(screen.queryByRole('radio',{name:/Phasing|Standard/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Start Game'}));
  expect(loadGameState()).toMatchObject({ruleset:'phasing',actionsPerTurn:4,turn:{turnNumber:1,actionsRemaining:4,phase:'action'}});
  expect(view.container.querySelectorAll('.action-budget i')).toHaveLength(4);
  fireEvent.click(screen.getByTestId('cell-1-1'));
  fireEvent.click(screen.getByTestId('cell-3-1'));
  expect(loadGameState()?.turn.actionsRemaining).toBe(2);
  fireEvent.click(screen.getByRole('button',{name:/Undo/}));
  expect(loadGameState()?.turn.actionsRemaining).toBe(4);
  view.unmount();view=render(<App />);
  fireEvent.click(screen.getByRole('button',{name:/^Pass & Play/}));
  // The saved game carries no ruleset label any more: there is only one.
  fireEvent.click(screen.getByRole('button',{name:/Continue saved game · 4 actions/}));
  expect(view.container.querySelectorAll('.action-budget i')).toHaveLength(4);
  // Act ends with mining and upkeep, and the turn ends after preparation.
  fireEvent.click(screen.getByRole('button',{name:/Mine & prepare/}));
  expect(loadGameState()).toMatchObject({turn:{currentPlayer:'white',phase:'place'}});
  fireEvent.click(screen.getByRole('button',{name:/End turn/}));
  expect(loadGameState()).toMatchObject({ruleset:'phasing',actionsPerTurn:4,turn:{currentPlayer:'black',actionsRemaining:4}});
  view.unmount();view=render(<App />);
  fireEvent.click(screen.getByRole('button',{name:/^Pass & Play/}));
  fireEvent.click(screen.getByRole('button',{name:'Start Game'}));
  expect(loadGameState()).toMatchObject({ruleset:'phasing',actionsPerTurn:4,turn:{currentPlayer:'white',actionsRemaining:4}});
  expect(view.container.querySelectorAll('.action-budget i')).toHaveLength(4);
});
