import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { AIAction } from '../../src/ai/types';
import type { GameState } from '../../src/game/types';
import { FIXTURES, fixtureById } from '../../src/learn/fixtures';
import { goalText, makeContext, type PuzzleContext } from '../../src/learn/goals';
import { parseMove, playLine } from '../../src/learn/notation';
import { solutionLine } from '../../src/learn/solver';
import { hintTargetOf, usePuzzleRun, type PuzzleRun } from '../../src/learn/usePuzzle';
import { LearnSolverClient } from '../../src/learn/worker/client';
import { heldWorkers } from './held-worker';

/**
 * The puzzle judging hook on the real game state, with the solver running
 * inline (no Worker in jsdom) and the enemy's reply at a 5 ms cadence. Every
 * fixture is solved by its author's line; wrong lines fail at once, at the
 * deadline, or by losing; hints point at the right piece or control.
 */
afterEach(() => { cleanup(); localStorage.clear(); });

const inline = () => new LearnSolverClient(() => null);
const fx = (id: string) => fixtureById(id)!;

type Hook = { result: { current: PuzzleRun } };
function mount(ctx: PuzzleContext, options: { demo?: AIAction[] | null; onSolved?: () => void; onDemoDone?: () => void; start?: GameState } = {}) {
  const solver = inline();
  return renderHook(() => usePuzzleRun({ ctx, start: options.start ?? ctx.start, solver, cadence: 5, demo: options.demo, onSolved: options.onSolved, onDemoDone: options.onDemoDone }));
}

/** Dispatch one action through the hook's game, as the screen would. */
function dispatch(hook: Hook, action: AIAction) {
  const { game } = hook.result.current;
  act(() => {
    switch (action.type) {
      case 'MOVE': game.moveUnit(action.unitId, action.to); break;
      case 'ATTACK': game.attackWith(action.unitId, action.targetPosition); break;
      case 'END_ACTION_PHASE': game.endActionPhase(); break;
      case 'END_PLACE_PHASE': game.endPlacePhase(); break;
      case 'BUY_UNIT': game.buyUnit(action.definitionId, action.position); break;
      case 'PROMOTE_UNIT': game.promoteUnit(action.unitId); break;
      case 'PAY_UPKEEP': game.payUpkeep(action.keepUnitIds); break;
      case 'RESIGN': game.resign(); break;
    }
  });
}
function play(hook: Hook, line: readonly string[]) {
  for (const move of line) for (const action of parseMove(hook.result.current.game.state, move)) dispatch(hook, action);
}
const settled = (hook: Hook) => waitFor(() => {
  const { phase } = hook.result.current;
  expect(['solved', 'failed', 'playing']).toContain(phase);
}, { timeout: 4000 });

describe('usePuzzleRun', () => {
  for (const spec of FIXTURES) {
    it(`${spec.id} (${goalText(spec)}): the author's line solves it, through the enemy's reply when the goal needs one`, async () => {
      const ctx = makeContext(spec);
      const onSolved = vi.fn();
      const hook = mount(ctx, { onSolved });
      play(hook, spec.solution);
      // Later turns: the solver's own line, after each reply.
      for (let round = 0; round < 3; round++) {
        await settled(hook);
        const { phase, game } = hook.result.current;
        if (phase !== 'playing' || game.state.turn.currentPlayer !== ctx.hero) break;
        const line = solutionLine(ctx, game.state);
        expect(line, `a winning line from turn ${round + 2}`).not.toBeNull();
        for (const action of line!) dispatch(hook, action);
      }
      await waitFor(() => expect(hook.result.current.phase).toBe('solved'), { timeout: 4000 });
      expect(onSolved).toHaveBeenCalledTimes(1);
      expect(hook.result.current.locked).toBe(true);
      await waitFor(() => expect(hook.result.current.cardShown).toBe(true), { timeout: 2000 });
    }, 15_000);
  }

  it('flags a one-turn line that can no longer win as soon as it is played, and Undo clears it', async () => {
    const ctx = makeContext(fx('fx-capture'));
    const hook = mount(ctx);
    expect(hook.result.current.phase).toBe('playing');
    // Two actions to reach c2 and one to kill the Poṉ leave one action, and the Radi is out of reach.
    play(hook, ['a1-c2', 'c2xc3']);
    await waitFor(() => expect(hook.result.current.phase).toBe('failed'), { timeout: 3000 });
    expect(hook.result.current.failure).toBe('stuck');
    expect(hook.result.current.game.canUndo).toBe(true);
    act(() => hook.result.current.game.undo());
    await waitFor(() => expect(hook.result.current.phase).toBe('playing'), { timeout: 3000 });
    // From c2 with two actions the Radi is reachable again (c2-b2 then b2xb1).
    play(hook, ['c2-b2', 'b2xb1']);
    await waitFor(() => expect(hook.result.current.phase).toBe('solved'), { timeout: 3000 });
  });

  it('a selection made while the solver thinks keeps its "can no longer win" verdict and its hint', async () => {
    const ctx = makeContext(fx('fx-capture'));
    let hook = mount(ctx);
    play(hook, ['a1-c2', 'c2xc3']);
    // Tapping a square before the verdict lands changes the state object, not the game.
    act(() => hook.result.current.game.deselect());
    await waitFor(() => expect(hook.result.current.phase).toBe('failed'), { timeout: 3000 });
    expect(hook.result.current.failure).toBe('stuck');
    cleanup();
    hook = mount(makeContext(fx('fx-mine')));
    play(hook, ['a1-a2']);
    let asked!: Promise<void>;
    act(() => { asked = hook.result.current.requestHint(); });
    act(() => hook.result.current.game.selectUnit('p-white-a1'));
    await act(async () => { await asked; });
    expect(hook.result.current.hint).toEqual({ piece: 'p-white-a1' });
  });

  it('a new move, and the enemy’s turn, stop searches about earlier positions instead of queueing behind them', async () => {
    const ctx = makeContext(fx('fx-two-turns'));
    const { workers, factory } = heldWorkers();
    const solver = new LearnSolverClient(factory);
    const hook = renderHook(() => usePuzzleRun({ ctx, start: ctx.start, solver, cadence: 5 }));
    play(hook, ['a1-a2']);
    expect(workers[0].received.map(r => r.kind)).toEqual(['win']);
    // The next move stops the first search rather than waiting for it.
    play(hook, ['a2-a3']);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].received.map(r => r.kind)).toEqual(['win']);
    // A hint search still running when the turn is handed over is stopped too.
    play(hook, ['mine']);
    act(() => { void hook.result.current.requestHint(); });
    const busy = workers.at(-1)!;
    expect(busy.received.map(r => r.kind)).toEqual(['win', 'line']);
    play(hook, ['end']);
    await waitFor(() => expect(workers.at(-1)!.received.map(r => r.kind)).toEqual(['reply']));
    expect(busy.terminated).toBe(true);
    const replier = workers.at(-1)!;
    act(() => replier.answer(replier.received[0]));
    await waitFor(() => expect(hook.result.current.game.state.turn.turnNumber).toBe(2), { timeout: 3000 });
  });

  it('fails at the deadline when the turn ends unsolved, with a rewind to the turn start', async () => {
    const ctx = makeContext(fx('fx-reach'));
    const hook = mount(ctx);
    play(hook, ['mine']);
    await waitFor(() => expect(hook.result.current.phase).toBe('failed'), { timeout: 3000 });
    expect(hook.result.current.failure).toBe('deadline');
    expect(hook.result.current.game.canUndo).toBe(false);
    expect(hook.result.current.rewindState).toBe(ctx.start);
  });

  it('plays the refuting reply for a survive goal and fails as lost when the enemy wins', async () => {
    const ctx = makeContext(fx('fx-survive'));
    const hook = mount(ctx);
    play(hook, ['mine', 'end']);
    await waitFor(() => expect(hook.result.current.phase).toBe('enemy'));
    await waitFor(() => expect(hook.result.current.phase).toBe('failed'), { timeout: 4000 });
    const { game, failure } = hook.result.current;
    // The Sjór walked over and removed the Hi: elimination.
    expect(failure).toBe('lost');
    expect(game.state.phase).toBe('victory');
    expect(game.state.winner).toBe('black');
    expect(game.lastTurnReplay?.player).toBe('black');
  });

  it('a home goal parked beside the home is stuck at Prepare, and one on the home is only judged after the defense', async () => {
    const ctx = makeContext(fx('fx-home'));
    let hook = mount(ctx);
    // Beside the home with no actions left: nothing in Prepare can fix it.
    play(hook, ['b2-d3', 'mine']);
    await waitFor(() => expect(hook.result.current.phase).toBe('failed'), { timeout: 3000 });
    expect(hook.result.current.failure).toBe('stuck');
    cleanup();
    // A Hi invades; the Sjór (water beats fire) can step over and remove it, and the
    // Poṉ on your own home keeps you in the game, so the failure is the deadline, not a loss.
    const spec = { ...fx('fx-home'), id: 'fx-home-defended', board: ['M1 .  .  .', '.  F1 .  .', '.  .  .  .', '.  w1 .  .'] };
    const defended = makeContext(spec);
    hook = mount(defended);
    play(hook, ['b2-d4', 'mine']);
    // On the home at Prepare: no early failure, the turn may end.
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(hook.result.current.phase).toBe('playing');
    play(hook, ['end']);
    await waitFor(() => expect(hook.result.current.phase).toBe('enemy'));
    await waitFor(() => expect(hook.result.current.phase).toBe('failed'), { timeout: 4000 });
    expect(hook.result.current.failure).toBe('deadline');
    // The defender's turn was played out and the invader is gone, not skipped past.
    const { state } = hook.result.current.game;
    expect(state.turn.turnNumber).toBeGreaterThan(1);
    expect(state.board.units.find(u => u.id === 'p-white-b2')).toBeUndefined();
    expect(hook.result.current.game.lastTurnReplay?.player).toBe('black');
  });

  it('a two-turn puzzle hands the reply over and records a checkpoint at the next turn start', async () => {
    const ctx = makeContext(fx('fx-two-turns'));
    const hook = mount(ctx);
    play(hook, ['a1-a5', 'mine', 'end']);
    await waitFor(() => expect(hook.result.current.phase).toBe('enemy'));
    await waitFor(() => expect(hook.result.current.game.state.turn.currentPlayer).toBe('white'), { timeout: 4000 });
    await settled(hook);
    const turnStart = hook.result.current.game.state;
    expect(hook.result.current.phase).toBe('playing');
    expect(turnStart.turn.turnNumber).toBe(2);
    // Walking away from the flag is hopeless from here: failure, and Undo means the turn start.
    play(hook, ['a5-a3']);
    await waitFor(() => expect(hook.result.current.phase).toBe('failed'), { timeout: 3000 });
    expect(hook.result.current.failure).toBe('stuck');
    expect(hook.result.current.game.canUndo).toBe(true);
    act(() => hook.result.current.game.undo());
    await waitFor(() => expect(hook.result.current.phase).toBe('playing'), { timeout: 3000 });
    play(hook, ['a5-a6']);
    await waitFor(() => expect(hook.result.current.phase).toBe('solved'), { timeout: 3000 });
  });

  it('hints point at the first piece of the authored line at the start, and at a winning piece later', async () => {
    const ctx = makeContext(fx('fx-mine'));
    const hook = mount(ctx);
    await act(async () => { await hook.result.current.requestHint(); });
    expect(hook.result.current.hint).toEqual({ piece: 'p-white-a1' });
    // Selecting the piece is not a move: the pulse stays.
    act(() => hook.result.current.game.selectUnit('p-white-a1'));
    expect(hook.result.current.hint).toEqual({ piece: 'p-white-a1' });
    // Acting clears the pulse; a fresh request searches from the new position.
    play(hook, ['a1-a2']);
    expect(hook.result.current.hint).toBeNull();
    await act(async () => { await hook.result.current.requestHint(); });
    expect(hook.result.current.hint).toEqual({ piece: 'p-white-a1' });
  });

  it('hints name a control when the next step is Mine & prepare or a summon', async () => {
    const ctx = makeContext(fx('fx-summon'));
    const hook = mount(ctx);
    await act(async () => { await hook.result.current.requestHint(); });
    expect(hook.result.current.hint).toEqual({ control: 'end' });
    play(hook, ['mine']);
    await act(async () => { await hook.result.current.requestHint(); });
    expect(hook.result.current.hint).toEqual({ control: 'shop' });
    expect(hintTargetOf({ type: 'PAY_UPKEEP', keepUnitIds: [] })).toEqual({ control: 'upkeep' });
    expect(hintTargetOf({ type: 'PROMOTE_UNIT', unitId: 'u' })).toEqual({ piece: 'u' });
    expect(hintTargetOf(undefined)).toBeNull();
  });

  it('"Show me" plays the authored line with the acting piece lit, without judging', async () => {
    const ctx = makeContext(fx('fx-reach'));
    const onSolved = vi.fn(), onDemoDone = vi.fn();
    const demo = playLine(ctx.start, ctx.spec.solution).actions;
    const hook = mount(ctx, { demo, onSolved, onDemoDone });
    expect(hook.result.current.phase).toBe('demo');
    expect(hook.result.current.locked).toBe(true);
    await waitFor(() => expect(hook.result.current.hint).toEqual({ piece: 'p-white-a1' }));
    await waitFor(() => expect(onDemoDone).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(hook.result.current.game.state.board.units[0].position).toEqual({ x: 1, y: 0 });
    expect(onSolved).not.toHaveBeenCalled();
    expect(hook.result.current.phase).toBe('demo');
  });

  it('a mining goal shows progress and is solved at Mine & prepare', async () => {
    const ctx = makeContext(fx('fx-mine'));
    const hook = mount(ctx);
    play(hook, ['a1-a2', 'a2-b2']);
    await settled(hook);
    expect(hook.result.current.phase).toBe('playing');
    play(hook, ['mine']);
    await waitFor(() => expect(hook.result.current.phase).toBe('solved'));
    expect(hook.result.current.game.state.players.white.resourcesGained).toBe(3);
  });
});
