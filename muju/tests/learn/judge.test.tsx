import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { AIAction } from '../../src/ai/types';
import type { GameState } from '../../src/game/types';
import { FIXTURES, fixtureById } from '../../src/learn/fixtures';
import { goalText, makeContext, type PuzzleContext } from '../../src/learn/goals';
import { parseMove, playLine } from '../../src/learn/notation';
import { solutionLine } from '../../src/learn/solver';
import { hintTargetOf, judgesLive, usePuzzleRun, type PuzzleRun } from '../../src/learn/usePuzzle';
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
function mount(ctx: PuzzleContext, options: { demo?: AIAction[] | null; onSolved?: () => void; onDemoSolved?: () => void; onDemoDone?: () => void; start?: GameState; solver?: LearnSolverClient } = {}) {
  const solver = options.solver ?? inline();
  return renderHook(() => usePuzzleRun({ ctx, start: options.start ?? ctx.start, solver, cadence: 5, demo: options.demo,
    onSolved: options.onSolved, onDemoSolved: options.onDemoSolved, onDemoDone: options.onDemoDone }));
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
    // Turn 1 of 2 is never judged live: a move asks nothing.
    play(hook, ['a1-a2']);
    expect(workers).toHaveLength(0);
    // A hint search is stopped by the next move rather than left running.
    act(() => { void hook.result.current.requestHint(); });
    expect(workers[0].received.map(r => r.kind)).toEqual(['line']);
    play(hook, ['a2-a3']);
    expect(workers[0].terminated).toBe(true);
    // A hint search still running when the turn is handed over is stopped too.
    play(hook, ['mine']);
    act(() => { void hook.result.current.requestHint(); });
    const busy = workers.at(-1)!;
    expect(busy.received.map(r => r.kind)).toEqual(['line']);
    play(hook, ['end']);
    await waitFor(() => expect(workers.at(-1)!.received.map(r => r.kind)).toEqual(['reply']));
    expect(busy.terminated).toBe(true);
    const replier = workers.at(-1)!;
    act(() => replier.answer(replier.received[0]));
    await waitFor(() => expect(hook.result.current.game.state.turn.turnNumber).toBe(2), { timeout: 3000 });
    // The final turn is judged live: the next move asks "can you still win?".
    await settled(hook);
    play(hook, ['a3-a4']);
    await waitFor(() => expect(workers.at(-1)!.received.map(r => r.kind)).toContain('win'));
  });

  it('judges live only on your final turn, and never for goals judged after the reply', () => {
    const two = makeContext(fx('fx-two-turns'));
    expect(judgesLive(two, two.start)).toBe(false);
    const turnTwo = playLine(two.start, ['a1-a5', 'mine', 'end']).state;
    const handedBack = { ...turnTwo, turn: { ...turnTwo.turn, currentPlayer: 'white' as const, turnNumber: 2 } };
    expect(judgesLive(two, handedBack)).toBe(true);
    const capture = makeContext(fx('fx-capture'));
    expect(judgesLive(capture, capture.start)).toBe(true);
    for (const id of ['fx-survive', 'fx-hold', 'fx-arrive']) {
      const ctx = makeContext(fx(id));
      expect(judgesLive(ctx, ctx.start), id).toBe(false);
    }
  });

  it('a hopeless first turn of two plays on: the enemy replies, then the final turn fails at its start', async () => {
    const ctx = makeContext(fx('fx-two-turns'));
    const hook = mount(ctx);
    // Not moving at all leaves four actions for five squares: hopeless, but not flagged yet.
    play(hook, ['mine']);
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(hook.result.current.phase).toBe('playing');
    play(hook, ['end']);
    await waitFor(() => expect(hook.result.current.phase).toBe('enemy'));
    await waitFor(() => expect(hook.result.current.phase).toBe('failed'), { timeout: 4000 });
    expect(hook.result.current.failure).toBe('stuck');
    // The enemy's turn was played before the card.
    expect(hook.result.current.game.state.turn.turnNumber).toBe(2);
    expect(hook.result.current.game.lastTurnReplay?.player).toBe('black');
    // Undo from the turn start goes back to the turn before it.
    expect(hook.result.current.rewindState).toBe(ctx.start);
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
    const { workers, factory } = heldWorkers();
    const hook = mount(ctx, { solver: new LearnSolverClient(factory) });
    // Standing still is already lost, but a goal judged after the reply is never flagged early:
    // the turn may end, and the enemy's kill is the explanation.
    play(hook, ['mine']);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(hook.result.current.phase).toBe('playing');
    expect(workers.flatMap(w => w.received.map(r => r.kind))).not.toContain('win');
    play(hook, ['end']);
    await waitFor(() => expect(workers.at(-1)?.received.map(r => r.kind)).toEqual(['reply']));
    act(() => workers.at(-1)!.answer(workers.at(-1)!.received[0]));
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

  it('"Show me" plays the authored line with the acting piece lit, celebrates, and records nothing', async () => {
    const ctx = makeContext(fx('fx-reach'));
    const onSolved = vi.fn(), onDemoSolved = vi.fn(), onDemoDone = vi.fn();
    const demo = playLine(ctx.start, ctx.spec.solution).actions;
    const hook = mount(ctx, { demo, onSolved, onDemoSolved, onDemoDone });
    expect(hook.result.current.phase).toBe('demo');
    expect(hook.result.current.locked).toBe(true);
    await waitFor(() => expect(hook.result.current.hint).toEqual({ piece: 'p-white-a1' }));
    await waitFor(() => expect(onDemoDone).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(hook.result.current.game.state.board.units[0].position).toEqual({ x: 1, y: 0 });
    expect(onDemoSolved).toHaveBeenCalledTimes(1);
    expect(hook.result.current.demoSolved).toBe(true);
    expect(onSolved).not.toHaveBeenCalled();
    expect(hook.result.current.phase).toBe('demo');
  });

  it('"Show me" plays the whole solution: the authored turn, the enemy’s reply, then the solver’s next turn', async () => {
    const ctx = makeContext(fx('fx-two-turns'));
    const onSolved = vi.fn(), onDemoSolved = vi.fn(), onDemoDone = vi.fn();
    const demo = playLine(ctx.start, ctx.spec.solution).actions;
    const hook = mount(ctx, { demo, onSolved, onDemoSolved, onDemoDone });
    await waitFor(() => expect(onDemoDone).toHaveBeenCalledTimes(1), { timeout: 6000 });
    const { state } = hook.result.current.game;
    expect(state.turn.turnNumber).toBe(2);
    expect(hook.result.current.game.lastTurnReplay?.player).toBe('black');
    // The Muju finished on the flag (a6) in the second turn.
    expect(state.board.units.find(u => u.id === 'p-white-a1')?.position).toEqual({ x: 0, y: 5 });
    expect(onDemoSolved).toHaveBeenCalledTimes(1);
    expect(onSolved).not.toHaveBeenCalled();
  }, 10_000);

  it('"Show me" for a goal judged after the reply shows the enemy’s harmless reply before it ends', async () => {
    const ctx = makeContext(fx('fx-survive'));
    const onDemoSolved = vi.fn(), onDemoDone = vi.fn();
    const demo = playLine(ctx.start, ctx.spec.solution).actions;
    const hook = mount(ctx, { demo, onDemoSolved, onDemoDone });
    await waitFor(() => expect(onDemoDone).toHaveBeenCalledTimes(1), { timeout: 6000 });
    expect(hook.result.current.game.state.turn.turnNumber).toBe(2);
    expect(hook.result.current.game.lastTurnReplay?.player).toBe('black');
    expect(hook.result.current.game.state.board.units.some(u => u.id === 'p-white-b2')).toBe(true);
    expect(onDemoSolved).toHaveBeenCalledTimes(1);
  }, 10_000);

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
