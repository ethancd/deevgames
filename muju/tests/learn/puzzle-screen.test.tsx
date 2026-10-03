import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PuzzleScreen, SHOW_ME_ARM_MS } from '../../src/learn/PuzzleScreen';
import { fixtureById } from '../../src/learn/fixtures';
import { loadProgress } from '../../src/learn/progress';
import type { Arc, PuzzleSpec } from '../../src/learn/types';

/**
 * The puzzle screen on the real game view: the goal line and its live mining
 * count, the board marks, the locked board and success card after a solve,
 * progress written under muju:learn:v1, Next, and the failure card with Undo.
 */
afterEach(() => { cleanup(); localStorage.clear(); });

const arc: Arc = { id: 'fx', title: 'Fixtures', part: 'basics', icon: 'review', puzzles: [fixtureById('fx-mine')!, fixtureById('fx-capture')!] };
const mount = (id: string, index: number, props: Partial<Parameters<typeof PuzzleScreen>[0]> = {}) =>
  render(<PuzzleScreen spec={fixtureById(id)!} arc={arc} index={index} onExit={() => {}} onNext={null} cadence={5} {...props} />);
const mountSpec = (spec: PuzzleSpec) =>
  render(<PuzzleScreen spec={spec} arc={{ ...arc, puzzles: [spec] }} index={0} onExit={() => {}} onNext={null} cadence={5} />);
const tap = (x: number, y: number) => fireEvent.click(screen.getByTestId(`cell-${x}-${y}`));

describe('PuzzleScreen', () => {
  it('shows the arc, the goal with live mining progress, and solves at End turn (mining happens as the turn ends)', async () => {
    const onProgressChange = vi.fn();
    mount('fx-mine', 0, { onProgressChange });
    expect(screen.getByRole('heading', { name: /Fixtures/ })).toHaveTextContent('1 / 2');
    expect(screen.getByTestId('puzzle-goal')).toHaveTextContent('Mine 3 crystals this turn');
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent('0 / 3');
    // Nothing would be mined from a1: the provisional count is hidden.
    expect(screen.getByTestId('puzzle-projected')).toHaveClass('is-empty');
    expect(screen.getByTestId('puzzle-narration')).toHaveTextContent('Mine 3 crystals this turn');
    expect(document.querySelector('.game-shell')).toHaveClass('learn-mining');
    // No kill clock, no victory screen furniture, "You / Opponent".
    expect(document.querySelector('.progress-clock')).toBeNull();
    expect(screen.queryByRole('button', { name: 'How to play' })).toBeNull();
    expect(document.querySelector('.score-strip')).toHaveTextContent('Opponent');
    // Homes hidden on a puzzle without them.
    expect(document.querySelector('.home-marker')).toBeNull();
    fireEvent.click(screen.getByTestId('cell-0-0'));
    fireEvent.click(screen.getByTestId('cell-0-1'));
    fireEvent.click(screen.getByTestId('cell-1-1'));
    // Standing on the crystals is not mining them: the count stays, the projection shows beside it.
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent('0 / 3');
    expect(screen.getByTestId('puzzle-projected')).toHaveTextContent('+3');
    expect(screen.getByTestId('puzzle-projected')).not.toHaveClass('is-empty');
    fireEvent.click(screen.getByRole('button', { name: /End turn/ }));
    expect(screen.getByTestId('puzzle-progress')).toHaveTextContent('3 / 3');
    expect(screen.queryByTestId('puzzle-projected')).toBeNull();
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
    // No mining goal: the income line has nothing to say.
    expect(document.querySelector('.game-shell')).toHaveClass('learn-no-mining');
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

  it('a hint lights the piece, clears the selection, arms Show me only after it has been seen, and a later solve is recorded as helped', async () => {
    mount('fx-mine', 0);
    // A piece selected before the hint loses its selection: the lit piece is the only one marked.
    tap(0, 0);
    expect(screen.getByTestId('cell-0-0')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    await waitFor(() => expect(document.querySelector('.unit-wrap.learn-hint-piece')).not.toBeNull());
    await waitFor(() => expect(screen.getByTestId('cell-0-0')).toHaveAttribute('aria-pressed', 'false'));
    // A second tap right away is not "Show me": the button arms only after the hint has been on screen.
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.queryByRole('button', { name: 'Show me' })).toBeNull();
    expect(screen.getByTestId('cell-0-0')).toHaveAttribute('aria-label', expect.stringContaining('white Muju'));
    expect(document.querySelector('.learn-phase-demo')).toBeNull();
    const show = await screen.findByRole('button', { name: 'Show me' }, { timeout: SHOW_ME_ARM_MS + 2000 });
    expect(show).toHaveTextContent('Show me');
    tap(0, 0); tap(0, 1); tap(1, 1);
    fireEvent.click(screen.getByRole('button', { name: /End turn/ }));
    await screen.findByTestId('puzzle-success', {}, { timeout: 3000 });
    expect(loadProgress().solved['fx-mine']).toMatchObject({ clean: false });
    expect(within(screen.getByTestId('puzzle-success')).getByRole('img', { name: 'Solved with a hint' })).toBeInTheDocument();
  });

  it('Show me restarts, plays the authored line to the goal with the celebration, then restarts again for the player', async () => {
    mount('fx-reach', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    await screen.findByRole('button', { name: 'Show me' }, { timeout: SHOW_ME_ARM_MS + 2000 });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show me' })); });
    await waitFor(() => expect(screen.getByTestId('cell-1-0')).toHaveAttribute('aria-label', expect.stringContaining('white Muju')), { timeout: 3000 });
    await screen.findByTestId('puzzle-demo-solved', {}, { timeout: 3000 });
    await waitFor(() => expect(screen.getByTestId('cell-0-0')).toHaveAttribute('aria-label', expect.stringContaining('white Muju')), { timeout: 3000 });
    expect(screen.queryByTestId('puzzle-success')).toBeNull();
    expect(screen.queryByTestId('puzzle-demo-solved')).toBeNull();
    expect(loadProgress().solved['fx-reach']).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Hint' })).toBeInTheDocument();
  });

  it('a Poṉ (Speed 0) attacking from where it stands previews one action, not NaN', () => {
    mountSpec({ id: 'fx-pon-preview', idea: 'preview', board: ['M1 l1 .', '.  .  .', '.  .  m1'], goal: { kind: 'capture', targets: ['b1'] }, solution: ['a1xb1'] });
    tap(0, 0); tap(1, 0);
    const preview = document.querySelector('.action-preview')!;
    expect(preview).not.toBeNull();
    expect(preview.querySelector('.preview-heading')).toHaveTextContent('1 action · 3 left');
    expect(preview.textContent).not.toMatch(/NaN/);
  });

  it('before the economy arcs (homes hidden) one End turn press hands over: no Prepare step, shop or promotion', () => {
    mount('fx-capture', 0);
    expect(screen.queryByRole('button', { name: /Mine & prepare/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /End turn/ }));
    expect(screen.queryByRole('button', { name: /^Start summoning / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Promote/ })).toBeNull();
  });

  it('with the economy (homes shown) the button reads Mine & prepare exactly when Prepare has something to offer', () => {
    mount('fx-promote', 0);
    // Nothing affordable from where the Muju stands: the turn simply ends.
    expect(screen.getByRole('button', { name: /End turn/ })).toBeInTheDocument();
    tap(0, 0); tap(0, 1); tap(1, 1);
    // On the 4 it will mine 3, so 1 + 3 pays for a promotion: Prepare has a choice.
    fireEvent.click(screen.getByRole('button', { name: /Mine & prepare/ }));
    expect(screen.getByRole('button', { name: /End turn/ })).toBeEnabled();
    tap(1, 1);
    expect(screen.getByRole('button', { name: /^Promote/ })).toBeInTheDocument();
  });

  it('a puzzle with homes keeps the shop in Prepare', () => {
    mount('fx-summon', 0);
    fireEvent.click(screen.getByRole('button', { name: /Mine & prepare/ }));
    expect(screen.getByRole('button', { name: 'Start summoning Hi · 3 crystals' })).toBeInTheDocument();
    expect(document.querySelector('.decision-panel')).not.toHaveClass('is-quiet');
  });

  it('the idle panel is quiet (no box) until something is selected', () => {
    mount('fx-capture', 1);
    const panel = document.querySelector('.decision-panel')!;
    expect(panel).toHaveClass('is-quiet');
    tap(0, 0);
    expect(panel).not.toHaveClass('is-quiet');
  });
});
