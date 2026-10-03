import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Board } from '../components/Board';
import type { BoardEffect } from '../effects/effectModel';
import type { GameState, Position } from '../game/types';
import type { SoundEffect } from '../sound/effects';
import { unitId, type Scenario } from './scenarios';
import { useScenario, type ScenarioPhase } from './useScenario';

interface Props {
  scenario: Scenario;
  emit: (effect: BoardEffect) => void;
  play: (effects: readonly SoundEffect[], options?: { rate?: number }) => void;
  paused?: boolean;
  onSolved: (final: GameState) => void;
  onPhase?: (phase: ScenarioPhase) => void;
}

const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

/** Focus follows the puzzle only for keyboard players; a focus ring would
 * compete with the gold hints for everyone tapping. */
let keyboardPlayer = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', event => { if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') keyboardPlayer = true; }, true);
  window.addEventListener('pointerdown', () => { keyboardPlayer = false; }, true);
}

/** One interactive puzzle: the real Board plus light-only guidance. */
export function PuzzleBoard({ scenario, emit, play, paused, onSolved, onPhase }: Props) {
  const puzzle = useScenario(scenario, { emit, play, paused, onSolved });
  const inert = new Set(scenario.pieces.filter(p => p.inert).map(unitId));
  const hinting = puzzle.phase === 'hint-piece' || puzzle.phase === 'hint-target';
  useEffect(() => { onPhase?.(puzzle.phase); }, [puzzle.phase, onPhase]);

  // Keyboard and screen-reader users land on the square that matters next.
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (paused || !hinting) return;
    const at = puzzle.phase === 'hint-piece' ? puzzle.state.board.units.find(u => u.id === puzzle.activeId)!.position : puzzle.goal;
    const cell = host.current?.querySelector<HTMLButtonElement>(`[data-testid="cell-${at.x}-${at.y}"]`);
    if (cell && keyboardPlayer) cell.focus({ preventScroll: true });
  }, [puzzle.phase, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Glide: the piece already sits on its destination square; slide it there from
  // the start through every square of the route, keeping the clock if a re-render
  // remounts it mid-slide.
  const glide = puzzle.glide;
  useLayoutEffect(() => {
    if (!glide || matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const root = host.current;
    const mover = root?.querySelector<HTMLElement>('.tutorial-glider')?.parentElement;
    const end = glide.cells.at(-1)!;
    const centre = (p: Position) => {
      const r = root?.querySelector(`[data-testid="cell-${p.x}-${p.y}"]`)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };
    const home = centre(end);
    if (!mover?.animate || !home) return;
    const frames = glide.cells.map((p, i) => {
      const c = centre(p) ?? home;
      return { transform: `translate(${c.x - home.x}px, ${c.y - home.y}px)`, offset: glide.cells.length > 1 ? i / (glide.cells.length - 1) : 1 };
    });
    const elapsed = performance.now() - glide.startedAt;
    if (elapsed >= glide.ms) return;
    mover.style.zIndex = '30';
    const motion = mover.animate(frames, { duration: glide.ms, easing: 'cubic-bezier(.45,0,.3,1)' });
    motion.currentTime = elapsed;
    motion.onfinish = () => { mover.style.zIndex = ''; };
    return () => { motion.cancel(); mover.style.zIndex = ''; };
  }, [glide, puzzle.state]);

  const ghostAt = puzzle.ghost && !paused ? puzzle.phase === 'hint-piece'
    ? puzzle.state.board.units.find(u => u.id === puzzle.activeId)!.position : puzzle.goal : null;

  return <div ref={host} className={`puzzle-board puzzle-${scenario.id} phase-${puzzle.phase}`} data-phase={paused ? 'paused' : puzzle.phase}>
    <Board board={puzzle.state.board} hideHomeMarkers={scenario.hideHomeMarkers}
      selectedUnit={puzzle.phase === 'hint-target' && !puzzle.gliding ? puzzle.activeId : null}
      validMoves={puzzle.litPath} validAttacks={[]} validSpawns={[]}
      unitClassName={unit => inert.has(unit.id) ? 'tutorial-inert'
        : unit.id === puzzle.activeId ? `tutorial-glider${hinting && !paused && !puzzle.gliding ? ' tutorial-active' : ''}`
        : puzzle.phase === 'hint-target' && same(unit.position, puzzle.goal) ? 'tutorial-prey' : undefined}
      cellClassName={pos => [
        puzzle.phase === 'hint-target' && same(pos, puzzle.goal) ? `tutorial-goal${puzzle.goalLit ? ' is-lit' : ''}` : '',
        puzzle.wrong && same(pos, puzzle.wrong.at) ? `tutorial-wrong wrong-${puzzle.wrong.key % 2}` : '',
      ].filter(Boolean).join(' ') || undefined}
      onCellClick={puzzle.onCellClick} onUnitClick={puzzle.onUnitClick} />
    {ghostAt && !puzzle.gliding && <GhostPointer board={host} at={ghostAt} />}
  </div>;
}

/** A translucent fingertip that taps the square. It is positioned inside the
 * puzzle board itself, so zooms and centring move it with the squares. */
function GhostPointer({ board, at }: { board: RefObject<HTMLElement | null>; at: Position }) {
  const [place, setPlace] = useState<{ left: number; top: number; size: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const cell = board.current?.querySelector(`[data-testid="cell-${at.x}-${at.y}"]`)?.getBoundingClientRect();
      const origin = board.current?.getBoundingClientRect();
      if (cell && origin) setPlace({ left: cell.left - origin.left + cell.width / 2, top: cell.top - origin.top + cell.height / 2, size: cell.width });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (board.current) observer?.observe(board.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [board, at.x, at.y]);
  if (!place) return null;
  return <span className="ghost-pointer" aria-hidden="true" data-testid="ghost-pointer"
    style={{ left: place.left, top: place.top, '--cell': `${place.size}px` } as React.CSSProperties}>
    <svg viewBox="0 0 40 48"><path d="M15 4a4 4 0 0 1 8 0v17l2-1a4 4 0 0 1 5 2l1 1a4 4 0 0 1 5 3l-1 13c-1 5-5 8-10 8h-5c-4 0-7-2-9-5L5 30a4 4 0 0 1 6-5l4 4Z" /></svg>
  </span>;
}
