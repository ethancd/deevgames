import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAction, transitionWithoutCheckmate } from '../ai/simulate';
import type { AIAction } from '../ai/types';
import { phaseEndAction } from '../game/legality';
import { generateAllActions } from '../ai/moves';
import type { GameState } from '../game/types';
import { useGameState } from '../hooks/useGameState';
import { getStartCorner } from '../game/board';
import { evaluate, heroTurnsDone, type PuzzleContext } from './goals';
import { playLine } from './notation';
import { stateKey } from './solver';
import type { Goal } from './types';
import { LearnSolverClient } from './worker/client';

/**
 * One attempt at a puzzle, on the real game state. The hook judges every state
 * change with `evaluate`, asks the solver (off the main thread) whether your
 * final turn can still win after each of your actions, plays the enemy's
 * reply through `applyAIAction` at the AI's cadence, and finds what a hint
 * should point at. Restarts and rewinds are a remount: the screen keys the
 * component that calls this on `attempt`.
 */
export type RunPhase = 'playing' | 'enemy' | 'solved' | 'failed' | 'demo';
export type Failure = 'stuck' | 'deadline' | 'lost';
export type HintTarget = { piece: string } | { control: 'end' | 'shop' | 'upkeep' };

/** The AI pauses this long before each action it plays. */
export const PUZZLE_CADENCE_MS = 450;
/** "Show me" plays at most this many of your turns (with the replies between them). */
export const DEMO_TURN_CAP = 4;
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
  /**
   * A home checkmate ends a real game at once. In a home puzzle the defender
   * still takes its turn, so you see it fail: the screen restarts the attempt
   * from this position (the defender to move) and the win is judged at your
   * next turn start.
   */
  onContinue?: (from: GameState) => void;
  /** "Show me" reached the goal: celebrate, without recording a solve. */
  onDemoSolved?: (state: GameState) => void;
  onDemoDone?: () => void;
}

const leaves = (goal: Goal): Goal[] => goal.kind === 'all' ? goal.goals.flatMap(leaves) : [goal];
/**
 * The live "can you still win?" check runs only on your final turn, and never
 * for goals judged after the enemy's reply. Earlier, a hopeless line is allowed
 * to run on: the enemy's refuting reply is the wordless explanation (the heal,
 * the kill, the win), and the failure comes after it.
 */
export function judgesLive(ctx: PuzzleContext, state: GameState): boolean {
  return ctx.timing !== 'reply' && heroTurnsDone(ctx, state) + 1 >= ctx.turns;
}

/** A failed home goal still shows the defender removing the invader before the card. */
const showsRefutation = (goal: Goal) => leaves(goal).some(g => g.kind === 'home');
/** An invader already on the enemy home: let the turn end so the defense is seen, rather than failing early. */
function invading(ctx: PuzzleContext, state: GameState): boolean {
  const home = getStartCorner(ctx.enemy, state.board.cells.length);
  return state.board.units.some(u => u.owner === ctx.hero && u.position.x === home.x && u.position.y === home.y);
}

/**
 * The defender's turn that a home checkmate (`#`) skips: your turn handed over
 * exactly as if the game had gone on. `#` proves the defender cannot remove the
 * invader, so this always ends with you occupying the enemy home at your next
 * turn start. Only for puzzles whose goal is the home itself; any other goal
 * that happens to end by `#` keeps the real rule (the game is over).
 */
export function checkmateContinuation(ctx: PuzzleContext, state: GameState): GameState | null {
  if (ctx.spec.goal.kind !== 'home' || state.phase !== 'victory' || state.winner !== ctx.hero || state.victoryReason !== 'home-checkmate') return null;
  const prepared: GameState = { ...state, phase: 'playing', winner: null, victoryReason: undefined };
  const handed = transitionWithoutCheckmate(prepared, { type: 'END_PLACE_PHASE' });
  return handed !== prepared && handed.phase === 'playing' && handed.turn.currentPlayer === ctx.enemy ? handed : null;
}

/**
 * True when Mine & prepare would leave nothing to choose in Prepare: no keep
 * choice, nothing affordable to promote, and no shop (or nothing affordable in
 * it). The puzzle's button then reads "End turn" and hands over in one press, so
 * the Prepare step only appears once it has something to offer.
 */
export function prepareIsIdle(ctx: PuzzleContext, state: GameState): boolean {
  if (state.phase !== 'playing' || state.turn.currentPlayer !== ctx.hero || state.turn.phase !== 'action') return false;
  const mined = applyAction(state, { type: 'END_ACTION_PHASE' });
  if (mined === state) return false;
  if (mined.phase !== 'playing' || mined.turn.currentPlayer !== ctx.hero) return true;
  if (mined.upkeepPending) return false;
  // Before the economy arcs (homes hidden) there is no shop and no promotion on screen.
  const economy = !!ctx.spec.homes;
  return generateAllActions(mined, ctx.hero).every(a => a.type === 'END_PLACE_PHASE' || (!economy && (a.type === 'BUY_UNIT' || a.type === 'PROMOTE_UNIT')));
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

export function usePuzzleRun({ ctx, start, solver, demo = null, cadence = PUZZLE_CADENCE_MS, onSolved, onContinue, onDemoSolved, onDemoDone }: RunOptions) {
  const game = useGameState({ initialState: start, persist: false });
  const { state } = game;
  const spec = ctx.spec;
  const [phase, setPhase] = useState<RunPhase>(demo ? 'demo' : 'playing');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [cardShown, setCardShown] = useState(false);
  const [hint, setHint] = useState<HintTarget | null>(null);
  const [demoSolved, setDemoSolved] = useState(false);
  const [checkpoints, setCheckpoints] = useState<GameState[]>([start]);
  const latest = useRef(state); latest.current = state;
  const previous = useRef<GameState | null>(null);
  const solved = useRef(false);
  const alive = useRef(true);
  /** The failure follows the enemy's turn: give its last blow time to land before the card. */
  const failedAfterReply = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const callbacks = useRef({ onSolved, onContinue, onDemoSolved, onDemoDone }); callbacks.current = { onSolved, onContinue, onDemoSolved, onDemoDone };

  // === Judge every state change ===
  useEffect(() => {
    if (demo || solved.current) return;
    const before = previous.current; previous.current = state;
    const heroToMove = state.phase === 'playing' && state.turn.currentPlayer === ctx.hero;
    // Selecting a piece changes the state object but not the game: no new search, no lost pulse.
    if (before && samePlay(before, state)) return;
    const afterReply = !!before && before.turn.currentPlayer !== ctx.hero;
    if (afterReply && heroToMove) setCheckpoints(list => [...list, state]);
    if (before) setHint(null);
    // Whatever is still being searched (a hint, a verdict) is about an earlier position.
    if (before && heroToMove) solver.cancel();
    const status = evaluate(ctx, state);
    // `#` in a home puzzle: let the move land, then play the defender's turn instead of stopping here.
    const continuation = status === 'solved' && callbacks.current.onContinue ? checkmateContinuation(ctx, state) : null;
    if (continuation) {
      setPhase('enemy'); setFailure(null);
      setTimeout(() => { if (alive.current) callbacks.current.onContinue?.(continuation); }, cadence * 2);
      return;
    }
    if (status === 'solved') {
      solved.current = true;
      setPhase('solved'); setFailure(null);
      callbacks.current.onSolved?.(state);
      return;
    }
    const enemyToMove = state.phase === 'playing' && state.turn.currentPlayer === ctx.enemy;
    if (status === 'failed') {
      if (enemyToMove && showsRefutation(spec.goal)) { setPhase('enemy'); return; }
      failedAfterReply.current = afterReply;
      setPhase('failed'); setFailure(state.phase === 'victory' && state.winner !== ctx.hero ? 'lost' : 'deadline');
      return;
    }
    if (enemyToMove) { setPhase('enemy'); return; }
    setPhase('playing'); setFailure(null);
    // Early failure on your final turn: a position from which the goal can no
    // longer be reached is flagged at once, while Undo can still fix it. The
    // starting position is proved solvable, so it is never asked.
    if (heroToMove && state !== start && judgesLive(ctx, state) && !(showsRefutation(spec.goal) && invading(ctx, state))) {
      solver.canStillWin(spec, state).then(verdict => {
        // A selection made while the solver thought is not a move: the verdict still stands.
        if (!alive.current || !samePlay(latest.current, state) || solved.current) return;
        if (verdict === 'no') { failedAfterReply.current = afterReply; setPhase('failed'); setFailure('stuck'); }
      }).catch(() => { /* superseded or cancelled: the next state asks again */ });
    }
  }, [state, ctx, spec, start, solver, demo, cadence]);

  // === "End turn" when Prepare has nothing to offer: Mine & prepare, then hand over ===
  const autoEnd = useRef(false);
  const endTurn = useCallback(() => { autoEnd.current = true; game.endActionPhase(); }, [game]);
  useEffect(() => {
    if (!autoEnd.current) return;
    const inPrepare = state.phase === 'playing' && state.turn.currentPlayer === ctx.hero && state.turn.phase === 'place' && !state.upkeepPending;
    if (state.turn.phase === 'action' && state.turn.currentPlayer === ctx.hero && state.phase === 'playing') return; // not yet mined
    autoEnd.current = false;
    if (inPrepare && !solved.current && evaluate(ctx, state) === 'pending') game.endPlacePhase();
  }, [state, ctx, game]);

  // === Cards ===
  useEffect(() => {
    if (phase !== 'solved' && phase !== 'failed') { setCardShown(false); return; }
    const delay = phase === 'solved' ? SUCCESS_CARD_DELAY_MS : failure === 'lost' || failedAfterReply.current ? FAILURE_CARD_DELAY_MS : 150;
    const timer = setTimeout(() => setCardShown(true), delay);
    return () => clearTimeout(timer);
  }, [phase, failure]);

  /**
   * The enemy's turn from `from` (enemy to move), through the same path the AI
   * uses, one action per beat. Resolves with the position handed back.
   */
  const playReply = useCallback(async (from: GameState, cancelled: () => boolean): Promise<GameState> => {
    let line: AIAction[] = [];
    // Searches from your turn are stale now; the reply must not wait behind them.
    solver.cancel();
    try { ({ line } = await solver.chooseReply(spec, from)); } catch { line = []; }
    let current = from;
    if (cancelled()) return current;
    const step = async (action: AIAction) => {
      await sleep(cadence);
      if (cancelled()) return false;
      const next = applyAction(current, action);
      if (next === current) return false;
      game.applyAIAction(action);
      current = next;
      return true;
    };
    for (const action of line) if (!(await step(action))) break;
    // However the search ended, the turn is handed back.
    for (let i = 0; i < 8 && !cancelled() && current.phase === 'playing' && current.turn.currentPlayer === ctx.enemy; i++) {
      if (!(await step(phaseEndAction(current)))) break;
    }
    return current;
  }, [ctx, spec, solver, cadence, game.applyAIAction]);

  // === The enemy's reply ===
  useEffect(() => {
    if (phase !== 'enemy') return;
    const from = latest.current;
    if (!(from.phase === 'playing' && from.turn.currentPlayer === ctx.enemy)) return;
    let cancelled = false;
    void playReply(from, () => cancelled);
    return () => { cancelled = true; };
  }, [phase, ctx, playReply]);

  // === "Show me": the whole solution, one action at a time, with the acting piece lit ===
  // Your first turn is the author's line; each enemy reply plays as it would
  // in your own attempt; every later turn is the solver's line from the live
  // position. It ends at the goal (with the celebration), a failure, or the cap.
  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    (async () => {
      let current = latest.current;
      let line: readonly AIAction[] | null = demo;
      for (let turn = 0; turn < DEMO_TURN_CAP && line?.length; turn++) {
        for (const action of line) {
          setHint(hintTargetOf(action));
          await sleep(cadence * 1.4);
          if (cancelled) return;
          const next = applyAction(current, action);
          if (next === current) break;
          game.applyAIAction(action);
          current = next;
          if (evaluate(ctx, current) !== 'pending') break;
        }
        setHint(null);
        if (evaluate(ctx, current) !== 'pending') break;
        if (current.phase === 'playing' && current.turn.currentPlayer === ctx.enemy) current = await playReply(current, isCancelled);
        if (cancelled) return;
        if (evaluate(ctx, current) !== 'pending' || current.phase !== 'playing' || current.turn.currentPlayer !== ctx.hero) break;
        try { line = await solver.solutionLine(spec, current); } catch { line = null; }
        if (cancelled) return;
      }
      setHint(null);
      const won = evaluate(ctx, current) === 'solved';
      if (won) { setDemoSolved(true); callbacks.current.onDemoSolved?.(current); }
      await sleep(won ? cadence * 3.5 : cadence * 2);
      if (!cancelled) callbacks.current.onDemoDone?.();
    })();
    return () => { cancelled = true; };
  }, [demo, ctx, spec, solver, cadence, playReply, game.applyAIAction]);

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

  return { game, phase, failure, cardShown, hint, demoSolved, requestHint, rewindState, endTurn, locked: phase !== 'playing' };
}

export type PuzzleRun = ReturnType<typeof usePuzzleRun>;
