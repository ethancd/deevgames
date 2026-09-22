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
  fireEvent.click(screen.getByRole('button', { name: /End turn/ }));
  const saved = loadGameState();
  expect(saved?.turn.phase).toBe(amount < 3 ? 'action' : 'place');
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
