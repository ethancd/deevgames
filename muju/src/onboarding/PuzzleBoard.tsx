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
  /** The stage that holds the board; the ghost pointer is positioned inside it. */
  stage: RefObject<HTMLElement | null>;
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
export function PuzzleBoard({ scenario, emit, play, paused, stage, onSolved, onPhase }: Props) {
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

  const ghostAt = puzzle.ghost && !paused ? puzzle.phase === 'hint-piece'
    ? puzzle.state.board.units.find(u => u.id === puzzle.activeId)!.position : puzzle.goal : null;

  return <div ref={host} className={`puzzle-board puzzle-${scenario.id} phase-${puzzle.phase}`} data-phase={paused ? 'paused' : puzzle.phase}>
    <Board board={puzzle.state.board} hideHomeMarkers={scenario.hideHomeMarkers}
      selectedUnit={puzzle.phase === 'hint-target' || puzzle.phase === 'playing' ? puzzle.activeId : null}
      validMoves={puzzle.litPath} validAttacks={[]} validSpawns={[]}
      unitClassName={unit => inert.has(unit.id) ? 'tutorial-inert'
        : unit.id === puzzle.activeId ? hinting && !paused ? 'tutorial-active' : puzzle.hopping ? 'tutorial-hop' : undefined
        : puzzle.phase === 'hint-target' && same(unit.position, puzzle.goal) ? 'tutorial-prey' : undefined}
      cellClassName={pos => [
        puzzle.phase === 'hint-target' && same(pos, puzzle.goal) ? `tutorial-goal${puzzle.goalLit ? ' is-lit' : ''}` : '',
        puzzle.wrong && same(pos, puzzle.wrong.at) ? `tutorial-wrong wrong-${puzzle.wrong.key % 2}` : '',
      ].filter(Boolean).join(' ') || undefined}
      onCellClick={puzzle.onCellClick} onUnitClick={puzzle.onUnitClick} />
    {ghostAt && <GhostPointer stage={stage} board={host} at={ghostAt} />}
  </div>;
}

/** A translucent fingertip that taps the square, positioned over the live cell. */
function GhostPointer({ stage, board, at }: { stage: RefObject<HTMLElement | null>; board: RefObject<HTMLElement | null>; at: Position }) {
  const [place, setPlace] = useState<{ left: number; top: number; size: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const cell = board.current?.querySelector(`[data-testid="cell-${at.x}-${at.y}"]`)?.getBoundingClientRect();
      const origin = stage.current?.getBoundingClientRect();
      if (cell && origin) setPlace({ left: cell.left - origin.left + cell.width / 2, top: cell.top - origin.top + cell.height / 2, size: cell.width });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [stage, board, at.x, at.y]);
  if (!place) return null;
  return <span className="ghost-pointer" aria-hidden="true" data-testid="ghost-pointer"
    style={{ left: place.left, top: place.top, '--cell': `${place.size}px` } as React.CSSProperties}>
    <svg viewBox="0 0 40 48"><path d="M15 4a4 4 0 0 1 8 0v17l2-1a4 4 0 0 1 5 2l1 1a4 4 0 0 1 5 3l-1 13c-1 5-5 8-10 8h-5c-4 0-7-2-9-5L5 30a4 4 0 0 1 6-5l4 4Z" /></svg>
  </span>;
}
