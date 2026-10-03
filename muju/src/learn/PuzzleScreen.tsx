import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AIAction } from '../ai/types';
import { GameView } from '../components/GameScreen';
import { useBoardEffects } from '../effects/BoardEffects';
import { projectedIncome } from '../game/mining';
import type { GameConfig, GameState, Position, Unit } from '../game/types';
import { useSoundEffects } from '../sound/SoundProvider';
import { ArcIcon } from './ArcIcon';
import { goalMarks, goalText, makeContext, mineProgress, type PuzzleContext } from './goals';
import { playLine } from './notation';
import { loadProgress, markSolved, saveProgress, type LearnProgress } from './progress';
import type { Arc, PuzzleSpec } from './types';
import { usePuzzleRun, type Failure, type HintTarget } from './usePuzzle';
import { LearnSolverClient } from './worker/client';
import './learn.css';

export interface PuzzleScreenProps {
  spec: PuzzleSpec;
  arc: Arc;
  /** Position within the arc, from 0. */
  index: number;
  onExit: () => void;
  /** Open the next puzzle in course order; null after the last one. */
  onNext: (() => void) | null;
  onProgressChange?: (progress: LearnProgress) => void;
  /** Tests: play actions faster. */
  cadence?: number;
}

/**
 * One puzzle on the real game screen. This component owns the attempt
 * lifecycle (retry, rewind to a turn start, "Show me") and progress; each
 * attempt is a `PuzzleRun`, remounted through its key.
 */
export function PuzzleScreen({ spec, arc, index, onExit, onNext, onProgressChange, cadence }: PuzzleScreenProps) {
  const ctx = useMemo(() => makeContext(spec), [spec]);
  const solver = useMemo(() => new LearnSolverClient(), []);
  useEffect(() => () => solver.dispose(), [solver]);
  const [attempt, setAttempt] = useState(0);
  const [start, setStart] = useState<GameState>(ctx.start);
  const [demo, setDemo] = useState<AIAction[] | null>(null);
  const [usedHint, setUsedHint] = useState(false);
  const [hintArmed, setHintArmed] = useState(false);

  const restart = useCallback((from: GameState = ctx.start, show: AIAction[] | null = null) => {
    solver.cancel();
    setStart(from); setDemo(show); setHintArmed(false);
    setAttempt(a => a + 1);
  }, [ctx.start, solver]);
  const showMe = useCallback(() => { setUsedHint(true); restart(ctx.start, playLine(ctx.start, spec.solution).actions); }, [ctx.start, spec.solution, restart]);
  const onDemoDone = useCallback(() => restart(), [restart]);
  const onSolved = useCallback(() => {
    const next = markSolved(loadProgress(), spec.id, !usedHint);
    saveProgress(next);
    onProgressChange?.(next);
  }, [spec.id, usedHint, onProgressChange]);

  return <PuzzleRun key={`${spec.id}:${attempt}`} ctx={ctx} arc={arc} index={index} start={start} demo={demo} solver={solver} cadence={cadence}
    usedHint={usedHint} hintArmed={hintArmed} onArmHint={() => { setUsedHint(true); setHintArmed(true); }} onShowMe={showMe}
    onRetry={() => restart()} onRewind={state => restart(state)} onDemoDone={onDemoDone} onSolved={onSolved} onExit={onExit} onNext={onNext} />;
}

interface RunProps {
  ctx: PuzzleContext; arc: Arc; index: number; start: GameState; demo: AIAction[] | null; solver: LearnSolverClient; cadence?: number;
  usedHint: boolean; hintArmed: boolean; onArmHint: () => void; onShowMe: () => void;
  onRetry: () => void; onRewind: (state: GameState) => void; onDemoDone: () => void; onSolved: () => void;
  onExit: () => void; onNext: (() => void) | null;
}

function PuzzleRun({ ctx, arc, index, start, demo, solver, cadence, usedHint, hintArmed, onArmHint, onShowMe, onRetry, onRewind, onDemoDone, onSolved, onExit, onNext }: RunProps) {
  const { spec, hero } = ctx;
  const boardEffects = useBoardEffects();
  const play = useSoundEffects();
  const celebrate = useCallback((state: GameState) => {
    play(['reveal']);
    const squares = [...marks.flags, ...state.board.units.filter(u => u.owner === hero).map(u => u.position)];
    for (const [i, p] of squares.entries()) setTimeout(() => boardEffects.emit({ kind: 'reveal', x: p.x, y: p.y }), i * 90);
    onSolved();
  }, [play, boardEffects, hero, onSolved]); // eslint-disable-line react-hooks/exhaustive-deps -- marks is derived from ctx
  const run = usePuzzleRun({ ctx, start, solver, demo, cadence, onSolved: celebrate, onDemoDone });
  const { game, phase, failure, cardShown, hint } = run;
  const { state } = game;
  // `?probe=1` exposes the live position to end-to-end tests that play every puzzle.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('probe')) {
      (window as unknown as { __mujuLearn?: unknown }).__mujuLearn = { id: spec.id, phase, state };
    }
  }, [spec.id, phase, state]);
  const marks = useMemo(() => goalMarks(ctx), [ctx]);

  // Crystals leaving the squares your pieces mined, the moment Mine & prepare lands.
  const seenIncome = useRef(state.lastIncome);
  useEffect(() => {
    const income = state.lastIncome;
    if (income === seenIncome.current) return;
    seenIncome.current = income;
    if (!income || income.player !== hero) return;
    for (const take of income.takes) if (take.amount > 0) boardEffects.emit({ kind: 'collect', x: take.position.x, y: take.position.y, count: take.amount });
    for (let i = 0; i < Math.min(income.total, 6); i++) setTimeout(() => play(['collect']), 160 * i + 120);
  }, [state.lastIncome, hero, boardEffects, play]);

  const config = useMemo((): GameConfig => ({
    mode: 'vs-ai', ruleset: 'phasing',
    controls: { white: hero === 'white' ? 'human' : 'remote', black: hero === 'black' ? 'human' : 'remote' },
    aiDifficulty: { white: 'easy', black: 'easy' },
  }), [hero]);

  // === Board marks: flags, prey rings, protection rings, the enemy home ===
  const cellClasses = useMemo(() => {
    const map = new Map<string, string>();
    const add = (p: Position, c: string) => { const k = `${p.x},${p.y}`; map.set(k, map.has(k) ? `${map.get(k)} ${c}` : c); };
    const heroAt = (p: Position) => state.board.units.some(u => u.owner === hero && u.position.x === p.x && u.position.y === p.y);
    for (const flag of marks.flags) add(flag, heroAt(flag) ? 'learn-flag is-reached' : 'learn-flag');
    if (marks.enemyHome) add(marks.enemyHome, 'learn-home-goal');
    for (const unit of state.board.units) {
      if (marks.targets.includes(unit.id)) add(unit.position, 'learn-target');
      if (marks.protect.includes(unit.id)) add(unit.position, 'learn-protect');
    }
    return map;
  }, [marks, state.board, hero]);
  const cellClassName = useCallback((p: Position) => cellClasses.get(`${p.x},${p.y}`), [cellClasses]);
  const hintPiece = hint && 'piece' in hint ? hint.piece : null;
  const unitClassName = useCallback((unit: Unit) => unit.id === hintPiece ? 'learn-hint-piece' : undefined, [hintPiece]);

  // === Goal line with live mining progress ===
  const text = goalText(spec);
  const mine = mineProgress(ctx, state);
  const projected = mine && state.phase === 'playing' && state.turn.currentPlayer === hero && state.turn.phase === 'action' ? projectedIncome(state, hero) : 0;
  const goal = <>
    <span className="learn-goal-text">{text}</span>
    {mine && <span className="learn-goal-progress" data-testid="puzzle-progress"><b>{mine.have + projected}</b> / {mine.need}</span>}
  </>;

  const requestHint = async () => {
    if (hintArmed) { onShowMe(); return; }
    onArmHint();
    await run.requestHint();
  };
  const canUndo = game.canUndo || !!run.rewindState;
  const undo = () => { if (game.canUndo) game.undo(); else if (run.rewindState) onRewind(run.rewindState); };

  const narration = phase === 'solved' ? `Solved. ${text}.`
    : phase === 'failed' ? `Not solved. ${failureText(failure)}`
    : phase === 'enemy' ? 'Opponent’s turn.'
    : phase === 'demo' ? 'Showing the solution.'
    : `${text}.${hint ? hintText(hint) : ''}`;

  const bar = <div className="learn-controls">
    <button type="button" className="learn-retry" aria-label="Retry" title="Retry" onClick={onRetry}><span aria-hidden="true">↻</span></button>
    <button type="button" className={`learn-hint${hintArmed ? ' is-armed' : ''}`} aria-label={hintArmed ? 'Show me' : 'Hint'} title={hintArmed ? 'Show me' : 'Hint'}
      disabled={phase !== 'playing'} onClick={requestHint}>
      {hintArmed ? <><span aria-hidden="true">▶</span><span className="learn-hint-label">Show me</span></> : <span aria-hidden="true">💡</span>}
    </button>
  </div>;

  const lastInArc = index === arc.puzzles.length - 1;
  const overlay = cardShown && phase === 'solved' ? <SuccessCard arc={lastInArc ? arc : null} usedHint={usedHint} onNext={onNext} onRetry={onRetry} onExit={onExit} />
    : cardShown && phase === 'failed' ? <FailureCard failure={failure} canUndo={canUndo} onUndo={undo} onRetry={onRetry} />
    : null;

  return <GameView config={config} game={game} onBackToMenu={onExit} puzzle={{
    title: <>{arc.title} <small className="puzzle-number">{index + 1} / {arc.puzzles.length}</small></>,
    goal, bar, overlay, narration,
    locked: run.locked, hideHomes: !spec.homes,
    shellClassName: `${hint && 'control' in hint ? `learn-hint-${hint.control}` : ''} learn-phase-${phase}`.trim(),
    onExit, onRestart: onRetry, boardEffects, cellClassName, unitClassName,
  }} />;
}

const failureText = (failure: Failure | null) => failure === 'stuck' ? 'This line can no longer win. Undo or retry.'
  : failure === 'lost' ? 'The opponent won. Retry.' : 'The deadline passed. Undo or retry.';
const hintText = (hint: HintTarget) => 'piece' in hint ? ' Hint: the lit piece moves first.'
  : hint.control === 'end' ? ' Hint: end the phase.' : hint.control === 'shop' ? ' Hint: summon a piece.' : ' Hint: pay upkeep.';

function SuccessCard({ arc, usedHint, onNext, onRetry, onExit }: { arc: Arc | null; usedHint: boolean; onNext: (() => void) | null; onRetry: () => void; onExit: () => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { primary.current?.focus({ preventScroll: true }); }, []);
  return <div className={`learn-card learn-card-success${arc ? ' is-arc-complete' : ''}`} role="dialog" aria-label="Solved" data-testid="puzzle-success">
    <div className="learn-card-mark" aria-hidden="true">✓</div>
    {usedHint && <span className="learn-card-hinted" aria-label="Solved with a hint">💡</span>}
    {arc && <div className="learn-card-arc"><ArcIcon icon={arc.icon} /><strong>{arc.title}</strong><span>{arc.puzzles.length} / {arc.puzzles.length}</span></div>}
    <button ref={primary} type="button" className="learn-card-next" onClick={onNext ?? onExit}>{onNext ? 'Next →' : 'All puzzles →'}</button>
    <div className="learn-card-row">
      <button type="button" aria-label="Retry" title="Retry" onClick={onRetry}><span aria-hidden="true">↻</span></button>
      {onNext && <button type="button" onClick={onExit}>All puzzles</button>}
    </div>
  </div>;
}

function FailureCard({ failure, canUndo, onUndo, onRetry }: { failure: Failure | null; canUndo: boolean; onUndo: () => void; onRetry: () => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { primary.current?.focus({ preventScroll: true }); }, []);
  return <div className="learn-card learn-card-failure" role="dialog" aria-label="Not solved" data-testid="puzzle-failure" data-failure={failure ?? undefined}>
    <div className="learn-card-mark" aria-hidden="true">✕</div>
    <div className="learn-card-row">
      {canUndo && <button ref={primary} type="button" className="learn-card-undo" onClick={onUndo}><span aria-hidden="true">↶</span> Undo</button>}
      <button ref={canUndo ? undefined : primary} type="button" className="learn-card-retry" onClick={onRetry}><span aria-hidden="true">↻</span> Retry</button>
    </div>
  </div>;
}
