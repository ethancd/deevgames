import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../../src/App';
import { ModeSelect } from '../../src/components/ModeSelect';
import { loadGameState } from '../../src/utils/persistence';
import type { GameConfig } from '../../src/game/types';

afterEach(() => { cleanup(); localStorage.clear(); });

it.each([1, 2, 3, 20])('starts and resumes a %i-crystal game without regranting or overriding it', amount => {
  let view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /^Pass & Play/ }));
  const select = screen.getByRole('combobox', { name: 'Black crystal handicap' });
  expect(select.querySelectorAll('option')).toHaveLength(21);
  fireEvent.change(select, { target: { value: String(amount) } });
  fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
  expect(loadGameState()?.players.black.resources).toBe(amount);
  // Phasing opens BOTH seats in Act whatever the handicap: the crystals no
  // longer buy a placement phase to open in (2026-09-21). White's Act ends with
  // Mine & prepare, and only End turn hands over.
  fireEvent.click(screen.getByRole('button', { name: /Mine & prepare/ }));
  expect(loadGameState()?.turn).toMatchObject({ currentPlayer: 'white', phase: 'place' });
  fireEvent.click(screen.getByRole('button', { name: /End turn/ }));
  const saved = loadGameState();
  expect(saved?.turn).toMatchObject({ currentPlayer: 'black', phase: 'action', actionsRemaining: 4 });
  // The handicap is not regranted at the start of black's turn either.
  expect(saved?.players.black.resources).toBe(amount);
  view.unmount(); view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /^Pass & Play/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Black crystal handicap' }), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue saved game/ }));
  expect(loadGameState()).toEqual(saved);
});

it.each(['vs AI', 'Pass & Play', 'Watch AI'])('passes the handicap in %s setup', name => {
  let config: GameConfig | undefined;
  render(<ModeSelect onStartGame={value => { config = value; }} />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Black crystal handicap' }), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
  expect(config?.blackCrystalHandicap).toBe(12);
});
