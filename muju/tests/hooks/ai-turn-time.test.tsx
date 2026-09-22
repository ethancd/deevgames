import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { createInitialGameState } from '../../src/game/board';
import { gameReducer } from '../../src/hooks/useGameState';
import { AI_TURN_SECONDS, DEFAULT_AI_PACE, type AIPace } from '../../src/ai/turnTime';
import { loadAIPace, loadGameState, saveGameState, SCHEMA_VERSION } from '../../src/utils/persistence';
import { HARD_AI_MS_QUERY_PARAM } from '../../src/ai/hardOptIn';
import { ModeSelect } from '../../src/components/ModeSelect';
import { GameScreen } from '../../src/components/GameScreen';
import type { GameConfig, GameState } from '../../src/game/types';
import type { AIAction, AIDifficulty } from '../../src/ai/types';
import type { FindTurnOptions, FindTurnResult } from '../../src/ai/worker/client';

/**
 * The player's choice of THINKING TIME, end to end: what a turn is funded
 * with, what the save remembers, and what the mode screen emits. The engines
 * themselves are mocked — this is about the allowance reaching them, which is
 * the only thing the pace changes (`src/ai/turnTime.ts`).
 */
const { turnSearch } = vi.hoisted(() => ({ turnSearch: vi.fn() }));
vi.mock('../../src/ai/worker/client', () => ({
  AIWorkerClient: class {
    warning: string | undefined;
    restart() {} cancel() {}
    async findBestTurn(state: GameState, _d: AIDifficulty, decisionMs: number, _r: number, options?: FindTurnOptions) {
      return turnSearch(state, decisionMs, options) as Promise<FindTurnResult>;
    }
    async findBestAction() { return { plan: { actions: [END_ACTION], score: 0 }, nodesSearched: 0, timeMs: 0, depth: 0 }; }
  },
  SearchCancelled: class extends Error {},
}));
import { useAI } from '../../src/hooks/useAI';

const END_ACTION: AIAction = { type: 'END_ACTION_PHASE' };

/** Runs one whole AI turn and reports what each search was funded with. */
async function turnAllowances(difficulty: AIDifficulty, pace?: AIPace): Promise<number[]> {
  let real = createInitialGameState();
  const allowances: number[] = [];
  turnSearch.mockImplementation((_state: GameState, decisionMs: number) => {
    allowances.push(decisionMs);
    return { actions: [END_ACTION], scoreCc: 0, depth: 1, work: 0, source: 'search', timeMs: 0 };
  });
  const { result, unmount } = renderHook(() => useAI({ difficulty, pace, thinkingDelay: 0 }));
  await act(async () => {
    await result.current.executeAITurn(real, action => { real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action }); }, 'white');
  });
  unmount();
  return allowances;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/muju/');
  turnSearch.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it('funds the turn with the chosen pace on every difficulty', async () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (const pace of ['quick', 'normal', 'deep'] as const) {
      expect([difficulty, pace, await turnAllowances(difficulty, pace)]).toEqual([difficulty, pace, [AI_TURN_SECONDS[difficulty][pace] * 1000]]);
    }
  }
});

it('treats an omitted pace as the default one', async () => {
  expect(await turnAllowances('medium')).toEqual([AI_TURN_SECONDS.medium[DEFAULT_AI_PACE] * 1000]);
});

/**
 * WHAT THE STOPWATCH IS ALLOWED TO COUNT. The allowance is SEARCH time —
 * `useAI` debits only what a search reported spending — so the hook hands the
 * dial that debit (`turnSpentMs`) and a `turnSearchingSince` that is non-null
 * ONLY while a request is in flight. The 400 ms per-action dispatch animation,
 * the worker round trip and React's own commits are outside the budget, and the
 * dial has to stand still through them instead of emptying mid-turn.
 */
it('counts the dial in search time and pauses it while the plan is dispatched', async () => {
  let real = createInitialGameState();
  let release!: (result: FindTurnResult) => void;
  turnSearch.mockImplementation(() => new Promise<FindTurnResult>(resolve => { release = resolve; }));
  const { result, unmount } = renderHook(() => useAI({ difficulty: 'hard', pace: 'normal', thinkingDelay: 200 }));
  let turn!: Promise<void>;
  await act(async () => {
    turn = result.current.executeAITurn(real, action => { real = gameReducer(real, { type: 'APPLY_AI_ACTION', aiAction: action }); }, 'white');
  });
  // A search is in flight: the whole allowance is unspent and the dial runs.
  expect(result.current.turnBudgetMs).toBe(AI_TURN_SECONDS.hard.normal * 1000);
  expect(result.current.turnSpentMs).toBe(0);
  expect(typeof result.current.turnSearchingSince).toBe('number');

  await act(async () => { release({ actions: [END_ACTION], scoreCc: 0, depth: 1, work: 0, source: 'search', timeMs: 12_000 } as unknown as FindTurnResult); });
  // The search is over and its 12 s are debited from the turn; the dispatch
  // that follows is not, so the dial is frozen rather than running.
  expect(result.current.turnSpentMs).toBe(12_000);
  expect(result.current.turnSearchingSince).toBeNull();

  await act(async () => { await turn; });
  expect(result.current.turnBudgetMs).toBeNull();
  expect(result.current.turnSpentMs).toBeNull();
  expect(result.current.turnSearchingSince).toBeNull();
  unmount();
});

// `?hardMs` is the page-URL override for demos and measurement. It funds the
// HARD SEAT ONLY, and it still wins over the chosen pace.
it('lets ?hardMs outrank the hard seat’s pace, and leaves the other seats alone', async () => {
  window.history.replaceState({}, '', `/muju/?${HARD_AI_MS_QUERY_PARAM}=3000`);
  expect(await turnAllowances('hard', 'deep')).toEqual([3000]);
  expect(await turnAllowances('medium', 'deep')).toEqual([AI_TURN_SECONDS.medium.deep * 1000]);
});

it('keeps the pace with the saved game, defaulting anything missing or invalid', () => {
  // A PHASING state, explicitly: since the Standard retirement `loadGameState`
  // moves a non-Phasing payload to the retired key and answers null, so a save
  // built from `board.ts`'s historical default would be archived here and this
  // test would be asserting the archive path instead of the pace it is about.
  const state = createInitialGameState(undefined, undefined, 0, 'phasing');
  saveGameState(state, undefined, { white: 'deep', black: 'normal' });
  expect(loadAIPace()).toEqual({ white: 'deep', black: 'normal' });
  expect(loadGameState()).toEqual(state);

  // A save written without a pace argument keeps the stored one rather than
  // silently dropping the player's choice.
  saveGameState(state);
  expect(loadAIPace()).toEqual({ white: 'deep', black: 'normal' });

  // A save from before paces existed loads as the default, and stays valid.
  localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion: SCHEMA_VERSION, timestamp: Date.now(), state }));
  expect(loadAIPace()).toEqual({ white: DEFAULT_AI_PACE, black: DEFAULT_AI_PACE });
  expect(loadGameState()).toEqual(state);

  // So does a save carrying a pace no version of the game ever wrote.
  localStorage.setItem('elemental-tactics-save', JSON.stringify({ schemaVersion: SCHEMA_VERSION, timestamp: Date.now(), state, aiPace: { white: 'turbo', black: 'deep' } }));
  expect(loadAIPace()).toEqual({ white: DEFAULT_AI_PACE, black: 'deep' });
  expect(loadGameState()).toEqual(state);
});

/**
 * THE DECISION PANEL WHILE AN AI SEAT THINKS. Two rules, both about honesty
 * rather than decoration:
 *
 *   - the dial is for an allowance a player can watch count down. Easy at
 *     `quick` is one second, where a dial would mount, sweep a full revolution
 *     and unmount every turn, so below `AI_TIMER_MIN_BUDGET_MS` the panel keeps
 *     the static thinking copy it always had;
 *   - whatever the allowance, the line under the heading says what the clock
 *     means — the engines move as soon as they are ready, and a wedge with time
 *     left in it is that, not a stall — in place of a third rephrasing of
 *     "thinking" that the phase hint would otherwise give.
 */
function renderThinkingSeat(difficulty: AIDifficulty, pace: AIPace): void {
  // A search that never returns: the seat stays mid-turn for the assertions.
  turnSearch.mockImplementation(() => new Promise<FindTurnResult>(() => {}));
  render(<GameScreen config={{
    mode: 'vs-ai', newGame: true,
    controls: { white: 'ai', black: 'human' },
    aiDifficulty: { white: difficulty, black: difficulty },
    aiPace: { white: pace, black: pace },
  }} onBackToMenu={() => {}} />);
}

it('says what the turn clock means, and shows a dial only when it is worth watching', async () => {
  renderThinkingSeat('hard', 'quick');
  // Hard at `quick` is ten seconds: dial, and the line that explains it.
  expect(await screen.findByRole('timer')).toHaveAttribute('aria-label', expect.stringContaining('left of 10'));
  expect(screen.getByText('Up to 10 s · moves as soon as it\'s ready')).toBeInTheDocument();
  cleanup();

  // A minute reads as "1 min", and still fits the one line.
  renderThinkingSeat('hard', 'deep');
  expect(await screen.findByText('Up to 1 min · moves as soon as it\'s ready')).toBeInTheDocument();
  expect(screen.getByRole('timer')).toBeInTheDocument();
  cleanup();

  // Easy at `quick` is one second: the line, and deliberately no dial.
  renderThinkingSeat('easy', 'quick');
  expect(await screen.findByText('Up to 1 s · moves as soon as it\'s ready')).toBeInTheDocument();
  expect(screen.queryByRole('timer')).toBeNull();
  cleanup();

  // Three seconds is the shortest allowance that gets one.
  renderThinkingSeat('easy', 'normal');
  expect(await screen.findByRole('timer')).toHaveAttribute('aria-label', expect.stringContaining('left of 3'));
});

it('records the running game’s pace on its save', () => {
  const config: GameConfig = {
    mode: 'vs-ai', newGame: true,
    controls: { white: 'human', black: 'ai' },
    aiDifficulty: { white: 'medium', black: 'hard' },
    aiPace: { white: 'deep', black: 'deep' },
  };
  render(<GameScreen config={config} onBackToMenu={() => {}} />);
  expect(loadAIPace()).toEqual({ white: 'deep', black: 'deep' });
});

it('offers a thinking time per difficulty and starts the game with it', () => {
  const started = vi.fn();
  render(<ModeSelect onStartGame={started} />);
  fireEvent.click(screen.getByRole('button', { name: /^vs AI/ }));
  const pace = screen.getByLabelText('Thinking time');
  // Medium is the default difficulty: 3 / 10 / 30 seconds.
  expect([...pace.querySelectorAll('option')].map(o => o.textContent)).toEqual(['Quick · 3 s', 'Normal · 10 s', 'Deep · 30 s']);
  fireEvent.change(pace, { target: { value: 'deep' } });
  // Changing the difficulty keeps the pace and restates its allowance.
  fireEvent.change(screen.getByLabelText('AI Difficulty'), { target: { value: 'hard' } });
  expect([...pace.querySelectorAll('option')].map(o => o.textContent)).toEqual(['Quick · 10 s', 'Normal · 30 s', 'Deep · 1 min']);
  expect((pace as HTMLSelectElement).value).toBe('deep');
  fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
  expect(started).toHaveBeenCalledWith(expect.objectContaining({
    aiDifficulty: { white: 'medium', black: 'hard' }, aiPace: { white: 'deep', black: 'deep' },
  }));
});

it('gives each watched AI its own thinking time', () => {
  const started = vi.fn();
  render(<ModeSelect onStartGame={started} />);
  fireEvent.click(screen.getByRole('button', { name: /^Watch AI/ }));
  fireEvent.change(screen.getByLabelText('Player 1 AI'), { target: { value: 'easy' } });
  fireEvent.change(screen.getByLabelText('Player 1 thinking time'), { target: { value: 'deep' } });
  fireEvent.change(screen.getByLabelText('Player 2 thinking time'), { target: { value: 'normal' } });
  expect([...screen.getByLabelText('Player 1 thinking time').querySelectorAll('option')].map(o => o.textContent))
    .toEqual(['Quick · 1 s', 'Normal · 3 s', 'Deep · 10 s']);
  fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
  expect(started).toHaveBeenCalledWith(expect.objectContaining({
    aiDifficulty: { white: 'easy', black: 'medium' }, aiPace: { white: 'deep', black: 'normal' },
  }));
});
