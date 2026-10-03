import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAction } from '../ai/simulate';
import type { AIAction } from '../ai/types';
import { phaseEndAction } from '../game/legality';
import type { GameState } from '../game/types';
import { useGameState } from '../hooks/useGameState';
import { getStartCorner } from '../game/board';
import { evaluate, type PuzzleContext } from './goals';
import { playLine } from './notation';
import { stateKey } from './solver';
import type { Goal } from './types';
import { LearnSolverClient } from './worker/client';

/**
 * One attempt at a puzzle, on the real game state. The hook judges every state
 * change with `evaluate`, asks the solver (off the main thread) whether a
 * one-turn line can still win after each of your actions, plays the enemy's
 * reply through `applyAIAction` at the AI's cadence, and finds what a hint
 * should point at. Restarts and rewinds are a remount: the screen keys the
 * component that calls this on `attempt`.
 */
export type RunPhase = 'playing' | 'enemy' | 'solved' | 'failed' | 'demo';
export type Failure = 'stuck' | 'deadline' | 'lost';
export type HintTarget = { piece: string } | { control: 'end' | 'shop' | 'upkeep' };

/** The AI pauses this long before each action it plays. */
export const PUZZLE_CADENCE_MS = 450;
/** The success card waits for the celebration; the failure card for the last blow to land. */
export const SUCCESS_CARD_DELAY_MS = 700;
export const FAILURE_CARD_DELAY_MS = 500;

export interface RunOptions {
  ctx: PuzzleContext;
  /** The position this attempt starts from: the puzzle's start, or a turn-start checkpoint. */
  start: GameState;
  solver: LearnSolverClient;
  /** "Show me": play these actions instead of judging, then report done. */
  demo?: readonly AIAction[] | null;
  cadence?: number;
  onSolved?: (state: GameState) => void;
  onDemoDone?: () => void;
}

const leaves = (goal: Goal): Goal[] => goal.kind === 'all' ? goal.goals.flatMap(leaves) : [goal];
/** A failed home goal still shows the defender removing the invader before the card. */
const showsRefutation = (goal: Goal) => leaves(goal).some(g => g.kind === 'home');
/** An invader already on the enemy home: let the turn end so the defense is seen, rather than failing early. */
function invading(ctx: PuzzleContext, state: GameState): boolean {
  const home = getStartCorner(ctx.enemy, state.board.cells.length);
  return state.board.units.some(u => u.owner === ctx.hero && u.position.x === home.x && u.position.y === home.y);
}

/** What a hint points at for the first action of a line. */
export function hintTargetOf(action: AIAction | undefined): HintTarget | null {
  if (!action) return null;
  switch (action.type) {
    case 'MOVE': case 'ATTACK': case 'PROMOTE_UNIT': return { piece: action.unitId };
    case 'END_ACTION_PHASE': case 'END_PLACE_PHASE': return { control: 'end' };
    case 'BUY_UNIT': return { control: 'shop' };
    case 'PAY_UPKEEP': return { control: 'upkeep' };
    default: return null;
  }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
/** Selection and highlight changes are not moves: only these fields are gameplay. */
const samePlay = (a: GameState, b: GameState) => a.board === b.board && a.players === b.players && a.turn === b.turn
  && a.phase === b.phase && a.pendingSummons === b.pendingSummons && a.upkeepPending === b.upkeepPending;

export function usePuzzleRun({ ctx, start, solver, demo = null, cadence = PUZZLE_CADENCE_MS, onSolved, onDemoDone }: RunOptions) {
  const game = useGameState({ initialState: start, persist: false });
  const { state } = game;
  const spec = ctx.spec;
  const [phase, setPhase] = useState<RunPhase>(demo ? 'demo' : 'playing');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [cardShown, setCardShown] = useState(false);
  const [hint, setHint] = useState<HintTarget | null>(null);
  const [checkpoints, setCheckpoints] = useState<GameState[]>([start]);
  const latest = useRef(state); latest.current = state;
  const previous = useRef<GameState | null>(null);
  const solved = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const callbacks = useRef({ onSolved, onDemoDone }); callbacks.current = { onSolved, onDemoDone };

  // === Judge every state change ===
  useEffect(() => {
    if (demo || solved.current) return;
    const before = previous.current; previous.current = state;
    const heroToMove = state.phase === 'playing' && state.turn.currentPlayer === ctx.hero;
    // Selecting a piece changes the state object but not the game: no new search, no lost pulse.
    if (before && samePlay(before, state)) return;
    if (before && before.turn.currentPlayer !== ctx.hero && heroToMove) setCheckpoints(list => [...list, state]);
    if (before) setHint(null);
    const status = evaluate(ctx, state);
    if (status === 'solved') {
      solved.current = true;
      setPhase('solved'); setFailure(null);
      callbacks.current.onSolved?.(state);
      return;
    }
    const enemyToMove = state.phase === 'playing' && state.turn.currentPlayer === ctx.enemy;
    if (status === 'failed') {
      if (enemyToMove && showsRefutation(spec.goal)) { setPhase('enemy'); return; }
      setPhase('failed'); setFailure(state.phase === 'victory' && state.winner !== ctx.hero ? 'lost' : 'deadline');
      return;
    }
    if (enemyToMove) { setPhase('enemy'); return; }
    setPhase('playing'); setFailure(null);
    // Early failure: a position from which the goal can no longer be reached is
    // flagged at once, while Undo can still fix it. The starting position is
    // proved solvable, so it is never asked.
    if (heroToMove && state !== start && !(showsRefutation(spec.goal) && invading(ctx, state))) {
      // Whatever is still being searched is about an earlier position.
      solver.cancel();
      solver.canStillWin(spec, state).then(verdict => {
        // A selection made while the solver thought is not a move: the verdict still stands.
        if (!alive.current || !samePlay(latest.current, state) || solved.current) return;
        if (verdict === 'no') { setPhase('failed'); setFailure('stuck'); }
      }).catch(() => { /* superseded or cancelled: the next state asks again */ });
    }
  }, [state, ctx, spec, start, solver, demo]);

  // === Cards ===
  useEffect(() => {
    if (phase !== 'solved' && phase !== 'failed') { setCardShown(false); return; }
    const timer = setTimeout(() => setCardShown(true), phase === 'solved' ? SUCCESS_CARD_DELAY_MS : failure === 'lost' ? FAILURE_CARD_DELAY_MS : 150);
    return () => clearTimeout(timer);
  }, [phase, failure]);

  // === The enemy's reply, through the same path the AI uses ===
  useEffect(() => {
    if (phase !== 'enemy') return;
    const from = latest.current;
    if (!(from.phase === 'playing' && from.turn.currentPlayer === ctx.enemy)) return;
    let cancelled = false;
    (async () => {
      let line: AIAction[] = [];
      // Searches from your turn are stale now; the reply must not wait behind them.
      solver.cancel();
      try { ({ line } = await solver.chooseReply(spec, from)); } catch { line = []; }
      if (cancelled) return;
      let current = from;
      const step = async (action: AIAction) => {
        await sleep(cadence);
        if (cancelled) return false;
        const next = applyAction(current, action);
        if (next === current) return false;
        game.applyAIAction(action);
        current = next;
        return true;
      };
      for (const action of line) if (!(await step(action))) break;
      // However the search ended, the turn is handed back.
      for (let i = 0; i < 8 && !cancelled && current.phase === 'playing' && current.turn.currentPlayer === ctx.enemy; i++) {
        if (!(await step(phaseEndAction(current)))) break;
      }
    })();
    return () => { cancelled = true; };
  }, [phase, ctx, spec, solver, cadence, game.applyAIAction]);

  // === "Show me": the author's line, one action at a time, with the acting piece lit ===
  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    (async () => {
      let current = latest.current;
      for (const action of demo) {
        setHint(hintTargetOf(action));
        await sleep(cadence * 1.4);
        if (cancelled) return;
        const next = applyAction(current, action);
        if (next === current) break;
        game.applyAIAction(action);
        current = next;
      }
      setHint(null);
      await sleep(cadence * 2);
      if (!cancelled) callbacks.current.onDemoDone?.();
    })();
    return () => { cancelled = true; };
  }, [demo, cadence, game.applyAIAction]);

  /** Light the first piece (or control) of a winning line from here. */
  const requestHint = useCallback(async () => {
    const from = latest.current;
    if (phase !== 'playing') return;
    const authored = () => playLine(ctx.start, spec.solution).actions;
    let line: AIAction[] | null = null;
    if (from === ctx.start || stateKey(from) === stateKey(ctx.start)) line = authored();
    else { try { line = await solver.solutionLine(spec, from); } catch { line = null; } }
    if (!line?.length) line = authored();
    if (!alive.current || !samePlay(latest.current, from)) return;
    setHint(hintTargetOf(line[0]));
  }, [phase, ctx, spec, solver]);

  // Where "↶ Undo" after a hand-off goes: the start of this turn, or of the turn before it.
  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  const rewindState = lastCheckpoint !== state ? lastCheckpoint : checkpoints[checkpoints.length - 2] ?? null;

  return { game, phase, failure, cardShown, hint, requestHint, rewindState, locked: phase !== 'playing' };
}

export type PuzzleRun = ReturnType<typeof usePuzzleRun>;
