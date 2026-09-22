import { parseCompactReport } from '../../src/utils/compactReport';
import { PHASING_RULES_REVISION } from '../../src/ai/hard/config';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { phaseEndAction } from '../../src/game/legality';
import type { GameConfig, GameState } from '../../src/game/types';
import type { AIDifficulty } from '../../src/ai/types';
import type { FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';

/**
 * THE TWO UI GUARDS, GONE.
 *
 * Until 2026-09-21 the mode screen offered Phasing for Pass & Play only, a
 * Phasing game left both `useAI` seats disabled, and a personal `?phasingAi=1`
 * opt-in was the only thing that opened either. Standard is retired, so every
 * game is Phasing and every local game runs its seats — with no marker on the
 * wire, because the worker's Phasing refusal is gone too.
 *
 * Lifted from the deleted `phasing-preview-ui.test.tsx`, whose "with the
 * opt-in" half is now simply what the app does.
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

it('starts Phasing in every mode, with no ruleset control and no Standard copy', () => {
  for (const [mode, label] of [[/^vs AI/, 'vs-ai'], [/^Watch AI/, 'ai-vs-ai'], [/^Pass & Play/, 'pass-play']] as const) {
    const started = vi.fn();
    render(<ModeSelect onStartGame={started} />);
    fireEvent.click(screen.getByRole('button', { name: mode }));
    expect(screen.queryByRole('radio', { name: /Phasing|Standard/ })).toBeNull();
    expect(screen.queryByText(/Standard/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start Game', exact: true }));
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ mode: label, ruleset: 'phasing' }));
    cleanup();
  }
});

/* ------------------------------ GameScreen ------------------------------ */

it('runs the AI seat through a whole Phasing turn, with no preview marker', async () => {
  planPhaseEnd();
  render(<GameScreen config={phasingConfig()} onBackToMenu={() => {}} />);
  // White is the engine: it plays Act and Prepare and hands over to the human.
  await waitFor(() => expect(turnSearch.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 5000 });
  const phases = turnSearch.mock.calls.map(([state]: [GameState]) => state.turn.phase);
  expect(phases.slice(0, 2)).toEqual(['action', 'place']);
  // Nothing marks these requests any more: the worker guard they opened is gone.
  for (const [, , options] of turnSearch.mock.calls) {
    expect(options === undefined || !('phasingPreview' in options)).toBe(true);
  }
});

/* ------------------------- "Report this position" ------------------------ */

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Game menu' }));

/** The AI seat's turn is over, committed, and recapped — which is exactly the
 * moment `lastTurnActions` holds the turn a report would carry. */
const waitForAITurnToFinish = () => waitFor(
  () => expect(screen.getByLabelText('Element advantages and match stats')).toHaveTextContent('•'),
  { timeout: 8000 });

it('copies a replayable report from any local game, with no opt-in', async () => {
  planPhaseEnd();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  the summon looked pointless  ');

  render(<GameScreen config={phasingConfig()} onBackToMenu={() => {}} />);
  await waitForAITurnToFinish();
  openMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Report this position' }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  const compact = writeText.mock.calls[0][0] as string, parsed = parseCompactReport(compact);
  // Pin the literal target revision too, so a stale `PHASING_RULES_REVISION`
  // cannot silently make this test self-referential.
  expect(PHASING_RULES_REVISION).toBe('muju-phasing-3');
  expect(compact).toMatch(new RegExp(`^muju/2 phasing ${PHASING_RULES_REVISION} \\| easy quick v2 \\| T\\d+ black action `));
  expect(compact).toContain('note the summon looked pointless');
  expect(compact).toContain('last end; end');
  expect(parsed.state.turn.currentPlayer).toBe('black');
  expect(parsed.state.board.units.length).toBeGreaterThan(0);

  // Shift-click keeps the full JSON for anything that needs the exact ids.
  fireEvent.click(screen.getByRole('button', { name: 'Report this position' }), { shiftKey: true });
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  const report = JSON.parse(writeText.mock.calls[1][0] as string);
  // The wire `kind` still carries the retired preview brand. It names the report
  // FORMAT, not a feature flag, and every report already pasted into a chat
  // carries it, so it is PINNED here rather than left free to drift: renaming it
  // is a wire-format change and must move this line
  // (`src/utils/positionReport.ts`, which no Stage-1 lane owns).
  expect(report.kind).toBe('muju-phasing-preview-report');
  expect(report.rulesRevision).toBe(PHASING_RULES_REVISION);
  expect(report.rulesRevision).toBe('muju-phasing-3');
  expect(report.ruleset).toBe('phasing');
  expect(report.engine).toBe('v2');
  expect(report.lastTurnActions.map((a: { type: string }) => a.type)).toEqual(['END_ACTION_PHASE', 'END_PLACE_PHASE']);
  expect(report.state.turn.currentPlayer).toBe('black');
  expect(await screen.findByText('Position report copied to the clipboard.')).toBeInTheDocument();

  // Cancelling the note prompt writes nothing. The deleted
  // `phasing-preview-ui.test.tsx` covered this; the path is still live
  // (`GameScreen.tsx`: `if (note === null) return;`) and now reachable in every
  // local game rather than only under the retired opt-in.
  promptSpy.mockReturnValue(null);
  fireEvent.click(screen.getByRole('button', { name: 'Report this position' }));
  await waitFor(() => expect(promptSpy).toHaveBeenCalledTimes(3));
  expect(writeText).toHaveBeenCalledTimes(2);
});
