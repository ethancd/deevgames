/**
 * The one client-side hole the Standard retirement had to close.
 *
 * "Explore from here" seeds a private variation and then runs `applyAction` on
 * it, so a retired-rules position opened in the analysis screen would have been
 * re-simulated under Phasing — the reinterpretation the whole cutover exists to
 * prevent. The archived save stays fully reviewable; only exploring from it is
 * refused, and the screen says why.
 */
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AnalysisScreen } from '../../src/components/AnalysisScreen';
import { createInitialGameState } from '../../src/game/board';
import { startHistory } from '../../src/game/analysis';
import { RETIRED_STORAGE_KEY } from '../../src/utils/persistence';
import type { Ruleset } from '../../src/game/types';

beforeEach(() => {
  // jsdom has no native <dialog> behaviour; `PlayDialog` (the Game menu) needs these two.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); localStorage.clear(); });

const save = (key: string, ruleset: Ruleset, schemaVersion: number) => {
  const state = createInitialGameState(undefined, undefined, 0, ruleset);
  localStorage.setItem(key, JSON.stringify({ schemaVersion, timestamp: 0, state, history: startHistory(state, true) }));
};
const open = (search: string) => {
  window.history.replaceState(null, '', `/muju/analysis${search}`);
  render(<AnalysisScreen />);
};
const explore = () => screen.getByRole('button', { name: 'Explore from here' });
const badge = () => document.querySelector('.ruleset-badge')?.textContent;

it('reviews the archived Standard save but refuses to explore from it', () => {
  save(RETIRED_STORAGE_KEY, 'standard', 8);
  open('?local=1&retired=1');
  expect(explore()).toBeDisabled();
  expect(screen.getByRole('note')).toHaveTextContent('Retired Standard rules · review only');
  // The score itself is there to page through; only re-simulation is refused.
  expect(screen.getByLabelText('Analysis position')).toBeInTheDocument();
});

it('still explores a current Phasing save', () => {
  save('elemental-tactics-save', 'phasing', 9);
  open('?local=1');
  expect(explore()).toBeEnabled();
  expect(screen.queryByRole('note')).toBeNull();
});

it('says so plainly when nothing is archived on this device', () => {
  open('?local=1&retired=1');
  expect(screen.getByRole('alert')).toHaveTextContent('No retired-rules game is archived on this device.');
});

it('offers a fresh Phasing board, never a Standard one', () => {
  open('');
  expect(screen.queryByText(/Standard/)).toBeNull();
  expect(badge()).toBe('Phasing');
});

/**
 * The Game menu's "Reset analysis" is rendered by `GameScreen` on every analysis
 * screen, the retired review included. Seeding it from the reviewed position's
 * ruleset would hand back a fresh, fully playable Standard board — the same
 * affordance the deleted `?ruleset=standard` link was, and with the "review only"
 * note still on screen. It seeds Phasing instead.
 */
it('resets the retired review to a Phasing board, never a fresh Standard one', () => {
  save(RETIRED_STORAGE_KEY, 'standard', 8);
  open('?local=1&retired=1');
  expect(badge()).toBe('Standard');

  fireEvent.click(screen.getByRole('button', { name: 'Game menu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reset analysis' }));

  expect(badge()).toBe('Phasing');
  expect(screen.queryByRole('note')).toBeNull();
});
