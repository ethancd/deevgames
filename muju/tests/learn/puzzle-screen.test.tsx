import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PuzzleScreen } from '../../src/learn/PuzzleScreen';
import { fixtureById } from '../../src/learn/fixtures';
import { loadProgress } from '../../src/learn/progress';
import type { Arc } from '../../src/learn/types';

/**
 * The puzzle screen on the real game view: the goal line and its live mining
 * count, the board marks, the locked board and success card after a solve,
 * progress written under muju:learn:v1, Next, and the failure card with Undo.
 */
afterEach(() => { cleanup(); localStorage.clear(); });

const arc: Arc = { id: 'fx', title: 'Fixtures', part: 'basics', icon: 'review', puzzles: [fixtureById('fx-mine')!, fixtureById('fx-capture')!] };
const mount = (id: string, index: number, props: Partial<Parameters<typeof PuzzleScreen>[0]> = {}) =>
  render(<PuzzleScreen spec={fixtureById(id)!} arc={arc} index={index} onExit={() => {}} onNext={null} cadence={5} {...props} />);

describe('PuzzleScreen', () => {
  it('shows the arc, the goal with live mining progress, and solves at Mine & prepare', async () => {
    const onProgressChange = vi.fn();
    mount('fx-mine', 0, { onProgressChange });
    expect(screen.getByRole('heading', { name: /Fixtures/ })).toHaveTextContent('1 / 2');
    expect(screen.getByTestId('puzzle-goal')).toHaveTextContent('Mine 3 crystals this turn');
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent('0 / 3');
    expect(screen.getByTestId('puzzle-narration')).toHaveTextContent('Mine 3 crystals this turn');
    // No kill clock, no victory screen furniture, "You / Opponent".
    expect(document.querySelector('.progress-clock')).toBeNull();
    expect(screen.queryByRole('button', { name: 'How to play' })).toBeNull();
    expect(document.querySelector('.score-strip')).toHaveTextContent('Opponent');
    // Homes hidden on a puzzle without them.
    expect(document.querySelector('.home-marker')).toBeNull();
    fireEvent.click(screen.getByTestId('cell-0-0'));
    fireEvent.click(screen.getByTestId('cell-0-1'));
    fireEvent.click(screen.getByTestId('cell-1-1'));
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent('3 / 3');
    fireEvent.click(screen.getByRole('button', { name: /Mine & prepare/ }));
    await waitFor(() => expect(screen.getByTestId('puzzle-success')).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByTestId('puzzle-narration')).toHaveTextContent('Solved');
    expect(loadProgress().solved['fx-mine']).toMatchObject({ clean: true });
    expect(onProgressChange).toHaveBeenCalled();
    expect(localStorage.getItem('elemental-tactics-save')).toBeNull();
    // Locked: the action bar is inert and the end-of-turn button disabled.
    expect(screen.getByRole('button', { name: /End turn/ })).toBeDisabled();
    // Last in the arc? No: this is 1 / 2, so no arc-complete block; "All puzzles →" since onNext is null.
    expect(document.querySelector('.learn-card-arc')).toBeNull();
    expect(screen.getByRole('button', { name: 'All puzzles →' })).toBeInTheDocument();
  });

  it('marks capture targets with a ring, fails early with Undo, and Retry remounts from the start', async () => {
    const onNext = vi.fn();
    mount('fx-capture', 1, { onNext });
    expect(document.querySelectorAll('.board-square.learn-target')).toHaveLength(1);
    expect(document.querySelector('.board-square.learn-target [data-testid="cell-1-0"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('cell-0-0'));
    fireEvent.click(screen.getByTestId('cell-2-1'));
    fireEvent.click(screen.getByTestId('cell-2-2'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm attack' }));
    const failure = await screen.findByTestId('puzzle-failure', {}, { timeout: 3000 });
    expect(failure).toHaveAttribute('data-failure', 'stuck');
    expect(screen.getByTestId('puzzle-narration')).toHaveTextContent('Not solved');
    fireEvent.click(within(failure).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByTestId('puzzle-failure')).toBeNull());
    expect(screen.getByTestId('cell-2-2')).toHaveAttribute('aria-label', expect.stringContaining('black Poṉ'));
    fireEvent.click(within(document.querySelector('.learn-controls') as HTMLElement).getByRole('button', { name: 'Retry' }));
    expect(screen.getByTestId('cell-0-0')).toHaveAttribute('aria-label', expect.stringContaining('white Hi'));
    // Solve: the last puzzle of the arc shows the arc-complete block and Next.
    fireEvent.click(screen.getByTestId('cell-0-0'));
    fireEvent.click(screen.getByTestId('cell-1-0'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm attack' }));
    await screen.findByTestId('puzzle-success', {}, { timeout: 3000 });
    expect(document.querySelector('.learn-card-arc')).toHaveTextContent('Fixtures');
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(loadProgress().solved['fx-capture']).toMatchObject({ clean: true });
  });

  it('a hint pulses the piece, arms Show me, and a later solve is recorded as helped', async () => {
    mount('fx-mine', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    await waitFor(() => expect(document.querySelector('.unit-wrap.learn-hint-piece')).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Show me' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cell-0-0'));
    fireEvent.click(screen.getByTestId('cell-0-1'));
    fireEvent.click(screen.getByTestId('cell-1-1'));
    fireEvent.click(screen.getByRole('button', { name: /Mine & prepare/ }));
    await screen.findByTestId('puzzle-success', {}, { timeout: 3000 });
    expect(loadProgress().solved['fx-mine']).toMatchObject({ clean: false });
    expect(within(screen.getByTestId('puzzle-success')).getByRole('img', { name: 'Solved with a hint' })).toBeInTheDocument();
  });

  it('Show me restarts, plays the authored line, then restarts again for the player', async () => {
    mount('fx-reach', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    await screen.findByRole('button', { name: 'Show me' });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show me' })); });
    await waitFor(() => expect(screen.getByTestId('cell-1-0')).toHaveAttribute('aria-label', expect.stringContaining('white Muju')), { timeout: 3000 });
    await waitFor(() => expect(screen.getByTestId('cell-0-0')).toHaveAttribute('aria-label', expect.stringContaining('white Muju')), { timeout: 3000 });
    expect(screen.queryByTestId('puzzle-success')).toBeNull();
    expect(loadProgress().solved['fx-reach']).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Hint' })).toBeInTheDocument();
  });
});
