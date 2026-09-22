import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GameScreen } from '../../src/components/GameScreen';
import type { GameConfig } from '../../src/game/types';

/**
 * Tab must cycle board cells in RANK-major order — stay within a rank
 * (A1, B1, … J1), then advance to the next rank (A2, B2, …) — not file-major
 * (A1, A2, … A10, then B1 …). White's three starting pieces sit at (1,0)
 * "Hi", (0,1) "Muju" and (1,1) "Sjor" (see `getStartingPositions`), so
 * rank-major visits Hi (rank 1) before Muju and Sjor (rank 2), while
 * file-major would visit Muju (file A) before Hi (file B).
 */
const passPlayConfig = (): GameConfig => ({
  mode: 'pass-play', newGame: true, ruleset: 'standard',
  controls: { white: 'human', black: 'human' },
  aiDifficulty: { white: 'easy', black: 'easy' },
});

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it('cycles own pieces rank by rank (1-10 outer, A-J inner), not file by file', async () => {
  render(<GameScreen config={passPlayConfig()} onBackToMenu={() => {}} />);
  await screen.findByTestId('cell-1-0');

  const focusedTestId = () => document.activeElement?.getAttribute('data-testid');

  fireEvent.keyDown(window, { key: 'Tab' });
  expect(focusedTestId()).toBe('cell-1-0'); // Hi — rank 1 (y=0), visited first
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(focusedTestId()).toBe('cell-0-1'); // Muju — rank 2 (y=1), file A
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(focusedTestId()).toBe('cell-1-1'); // Sjor — rank 2 (y=1), file B
});
