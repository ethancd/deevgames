import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PHASING_AI_QUERY_PARAM, PHASING_AI_STORAGE_KEY, PHASING_PREVIEW_BADGE } from '../../src/ai/phasingPreview';
import { phaseEndAction } from '../../src/game/legality';
import type { GameConfig, GameState } from '../../src/game/types';
import type { AIDifficulty } from '../../src/ai/types';
import type { FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';

/**
 * THE TWO UI GUARDS, open and shut.
 *
 * Without the opt-in the mode screen offers Phasing for Pass & Play only, and a
 * Phasing game leaves both `useAI` seats disabled — which is the shipped
 * behaviour, and the reason every "off" assertion here is really an assertion
 * that a normal build is unchanged. With it, Phasing is offered for vs-AI and
 * AI-vs-AI behind a visible "Preview · unreleased AI" badge, the seats run, and
 * the game menu grows one preview-only "Report this position" button.
 */
const { turnSearch } = vi.hoisted(() => ({ turnSearch: vi.fn() }));
vi.mock('../../src/ai/worker/client', () => ({
  AIWorkerClient: class {
    warning: string | undefined;
    restart() {} cancel() {}
    async findBestTurn(state: GameState, _d: AIDifficulty, decisionMs: number, _r: number, options?: FindTurnOptions) {
      return turnSearch(state, decisionMs, options) as Promise<FindTurnResult>;
    }
    async findBestAction(state: GameState) {
      return { plan: { actions: [phaseEndAction(state)], score: 0 }, nodesSearched: 0, timeMs: 0, depth: 0 };
    }
  },
  SearchCancelled: class extends Error {},
}));
import { ModeSelect } from '../../src/components/ModeSelect';
import { GameScreen } from '../../src/components/GameScreen';

const phasingConfig = (): GameConfig => ({
  mode: 'vs-ai', newGame: true, ruleset: 'phasing',
  controls: { white: 'ai', black: 'human' },
  aiDifficulty: { white: 'easy', black: 'easy' },
  aiPace: { white: 'quick', black: 'quick' },
});

/** The engine always proposes the canonical phase end, which is a legal turn. */
function planPhaseEnd(): void {
  turnSearch.mockImplementation((state: GameState) => ({
    actions: [phaseEndAction(state)], scoreCc: 0, depth: 1, work: 0,
    source: 'search', engineUsed: 'v2', timeMs: 1,
  } as unknown as FindTurnResult));
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  turnSearch.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // jsdom has no native <dialog> behaviour; `PlayDialog` needs these two.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

/* ------------------------------ ModeSelect ------------------------------ */

it('offers no ruleset for the AI modes without the opt-in', () => {
  const started = vi.fn();
  render(<ModeSelect onStartGame={started} />);
  for (const mode of [/^vs AI/, /^Watch AI/]) {
    fireEvent.click(screen.getByRole('button', { name: mode }));
    expect(screen.queryByRole('radio', { name: /Phasing/ })).toBeNull();
    expect(screen.getByText('AI plays Standard rules. Try Phasing in Pass & Play or online.')).toBeInTheDocument();
  }
  // Pass & Play still has it, and unbadged.
  fireEvent.click(screen.getByRole('button', { name: /^Pass & Play/ }));
  expect(screen.getByRole('radio', { name: /Phasing/ })).toBeInTheDocument();
  expect(screen.queryByText(PHASING_PREVIEW_BADGE)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Start Game', exact: true }));
  expect(started).toHaveBeenCalledWith(expect.objectContaining({ ruleset: 'standard' }));
});

it('offers badged Phasing for vs-AI and AI-vs-AI with the opt-in', () => {
  window.history.replaceState({}, '', `/muju/?${PHASING_AI_QUERY_PARAM}=1`);
  for (const [mode, label] of [[/^vs AI/, 'vs-ai'], [/^Watch AI/, 'ai-vs-ai']] as const) {
    const started = vi.fn();
    render(<ModeSelect onStartGame={started} />);
    fireEvent.click(screen.getByRole('button', { name: mode }));
    expect(screen.getByText(PHASING_PREVIEW_BADGE)).toBeInTheDocument();
    // …and the old "AI plays Standard rules" line is gone, because it is no
    // longer true for this player.
    expect(screen.queryByText(/AI plays Standard rules/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Phasing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Game', exact: true }));
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ mode: label, ruleset: 'phasing' }));
    cleanup();
  }
});

it('still refuses to start a Phasing AI game when the opt-in is cleared', () => {
  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  window.history.replaceState({}, '', `/muju/?${PHASING_AI_QUERY_PARAM}=0`);
  const started = vi.fn();
  render(<ModeSelect onStartGame={started} />);
  fireEvent.click(screen.getByRole('button', { name: /^vs AI/ }));
  expect(screen.queryByRole('radio', { name: /Phasing/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Start Game', exact: true }));
  expect(started).toHaveBeenCalledWith(expect.objectContaining({ ruleset: 'standard' }));
});

/* ------------------------------ GameScreen ------------------------------ */

it('leaves both AI seats disabled in a Phasing game without the opt-in', async () => {
  planPhaseEnd();
  render(<GameScreen config={phasingConfig()} onBackToMenu={() => {}} />);
  expect(await screen.findByText('Phasing')).toBeInTheDocument();
  // No search is ever requested, so no turn is ever played for the AI seat.
  await act(async () => { await Promise.resolve(); });
  expect(turnSearch).not.toHaveBeenCalled();
});

it('runs the AI seat through a whole Phasing turn with the opt-in', async () => {
  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  planPhaseEnd();
  render(<GameScreen config={phasingConfig()} onBackToMenu={() => {}} />);
  // White is the engine: it plays Act and Prepare and hands over to the human.
  await waitFor(() => expect(turnSearch.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 5000 });
  const phases = turnSearch.mock.calls.map(([state]: [GameState]) => state.turn.phase);
  expect(phases.slice(0, 2)).toEqual(['action', 'place']);
  // Every request the seat sent carried the preview marker; without it the
  // worker would have refused each one.
  for (const [, , options] of turnSearch.mock.calls) expect(options?.phasingPreview).toBe(true);
});

/* ------------------------- "Report this position" ------------------------ */

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Game menu' }));

/** The AI seat's turn is over, committed, and recapped — which is exactly the
 * moment `lastTurnActions` holds the turn a report would carry. */
const waitForAITurnToFinish = () => waitFor(
  () => expect(screen.getByLabelText('Element advantages and match stats')).toHaveTextContent('•'),
  { timeout: 8000 });

it('has no report affordance at all without the opt-in', async () => {
  planPhaseEnd();
  render(<GameScreen config={phasingConfig()} onBackToMenu={() => {}} />);
  expect(await screen.findByText('Phasing')).toBeInTheDocument();
  openMenu();
  expect(screen.getByRole('heading', { name: 'Game menu' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Report this position' })).toBeNull();
  cleanup();

  // Nor in a Standard game, opt-in or not: only a Phasing game is a preview.
  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  render(<GameScreen config={{ ...phasingConfig(), ruleset: 'standard' }} onBackToMenu={() => {}} />);
  openMenu();
  expect(screen.queryByRole('button', { name: 'Report this position' })).toBeNull();
});

it('copies a replayable report, with the note, in preview mode', async () => {
  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  planPhaseEnd();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.spyOn(window, 'prompt').mockReturnValue('  the summon looked pointless  ');

  render(<GameScreen config={phasingConfig()} onBackToMenu={() => {}} />);
  await waitForAITurnToFinish();
  openMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Report this position' }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());

  const report = JSON.parse(writeText.mock.calls[0][0] as string);
  expect(report.kind).toBe('muju-phasing-preview-report');
  expect(report.rulesRevision).toBe('muju-phasing-2');
  expect(report.ruleset).toBe('phasing');
  expect(report.difficulty).toBe('easy');
  expect(report.pace).toBe('quick');
  expect(report.engine).toBe('v2');
  expect(report.note).toBe('the summon looked pointless');
  expect(typeof report.turnNumber).toBe('number');
  // The AI's last turn, and a state complete enough to replay the position.
  expect(report.lastTurnActions.map((a: { type: string }) => a.type)).toEqual(['END_ACTION_PHASE', 'END_PLACE_PHASE']);
  expect(report.state.board.units.length).toBeGreaterThan(0);
  expect(report.state.turn.currentPlayer).toBe('black');
  expect(await screen.findByText('Position report copied to the clipboard.')).toBeInTheDocument();
});

it('writes nothing when the note prompt is cancelled', async () => {
  localStorage.setItem(PHASING_AI_STORAGE_KEY, '1');
  planPhaseEnd();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  vi.spyOn(window, 'prompt').mockReturnValue(null);
  render(<GameScreen config={phasingConfig()} onBackToMenu={() => {}} />);
  await waitForAITurnToFinish();
  openMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Report this position' }));
  await act(async () => { await Promise.resolve(); });
  expect(writeText).not.toHaveBeenCalled();
});
