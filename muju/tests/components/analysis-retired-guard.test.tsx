/**
 * The one client-side hole the Standard retirement had to close.
 *
 * "Explore from here" seeds a private variation and then runs `applyAction` on
 * it, so a retired-rules position opened in the analysis screen would have been
 * re-simulated under Phasing — the reinterpretation the whole cutover exists to
 * prevent. The archived save stays fully reviewable; only exploring from it is
 * refused, and the screen says why.
 */
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AnalysisScreen } from '../../src/components/AnalysisScreen';
import { createInitialGameState } from '../../src/game/board';
import { startHistory } from '../../src/game/analysis';
import { RETIRED_STORAGE_KEY } from '../../src/utils/persistence';
import type { Ruleset } from '../../src/game/types';

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
  expect(document.querySelector('.ruleset-badge')?.textContent).toBe('Phasing');
});
