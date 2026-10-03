import { useState } from 'react';
import { MusicButton } from '../music/MusicPlayer';
import { ArcIcon } from './ArcIcon';
import { ARCS, PARTS, PUZZLES, PUZZLE_COUNT } from './catalog';
import { nextUnsolved, resetProgress, solvedCount, type LearnProgress } from './progress';
import './learn.css';

interface LearnScreenProps {
  progress: LearnProgress;
  onOpen: (id: string) => void;
  onBack: () => void;
  onProgressChange: (progress: LearnProgress) => void;
}

/**
 * The course map: every part, every arc, every puzzle as a numbered tile.
 * Nothing is locked; the pulsing tile is only the recommended next step.
 */
export function LearnScreen({ progress, onOpen, onBack, onProgressChange }: LearnScreenProps) {
  const ids = PUZZLES.map(e => e.puzzle.id);
  const solved = solvedCount(progress, ids);
  const next = nextUnsolved(progress, ids);
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <main className="learn-screen mode-select min-h-screen bg-gray-900 text-white flex items-start justify-center p-4 pt-6 sm:pt-10" aria-label="Learn to Play">
      <div className="max-w-md w-full space-y-5">
        <div className="music-lobby-nav"><button type="button" className="learn-back text-sm text-cyan-300" onClick={onBack}>← Modes</button><MusicButton /></div>
        <header className="learn-heading">
          <h1 className="text-3xl font-bold">Learn to Play</h1>
          <span className="learn-total" data-testid="learn-total">{solved} / {PUZZLE_COUNT}</span>
        </header>

        {next && <button type="button" className="learn-continue" data-testid="learn-continue" onClick={() => onOpen(next)}>
          <span>{solved === 0 ? 'Start' : solved >= PUZZLE_COUNT ? 'Play again' : 'Continue'}</span>
          <span aria-hidden="true" className="learn-continue-arrow">→</span>
        </button>}

        {PARTS.map(part => {
          const arcs = ARCS.filter(arc => arc.part === part.id);
          if (!arcs.length) return null;
          return <section key={part.id} className="learn-part" aria-labelledby={`learn-part-${part.id}`}>
            <h2 id={`learn-part-${part.id}`} className="learn-part-title">{part.title}</h2>
            {arcs.map(arc => {
              const done = solvedCount(progress, arc.puzzles.map(p => p.id));
              return <article key={arc.id} className={`learn-arc${done === arc.puzzles.length ? ' is-complete' : ''}`} data-testid={`learn-arc-${arc.id}`}>
                <div className="learn-arc-row">
                  <ArcIcon icon={arc.icon} />
                  <h3 className="learn-arc-title">{arc.title}</h3>
                  <span className="learn-arc-count">{done} / {arc.puzzles.length}</span>
                </div>
                <ol className="learn-tiles" aria-label={`${arc.title} puzzles`}>
                  {arc.puzzles.map((puzzle, i) => {
                    const isSolved = !!progress.solved[puzzle.id];
                    const isNext = puzzle.id === next && !isSolved;
                    return <li key={puzzle.id}>
                      <button type="button" data-testid={`learn-tile-${puzzle.id}`}
                        className={`learn-tile${isSolved ? ' is-solved' : ''}${isNext ? ' is-next' : ''}`}
                        aria-label={`${arc.title} ${i + 1}${isSolved ? ', solved' : isNext ? ', up next' : ''}`}
                        onClick={() => onOpen(puzzle.id)}>
                        {isSolved ? <span aria-hidden="true">✓</span> : i + 1}
                      </button>
                    </li>;
                  })}
                </ol>
              </article>;
            })}
          </section>;
        })}

        <footer className="learn-footer">
          {confirmingReset
            ? <div className="learn-reset-confirm" role="group" aria-label="Reset progress">
                <span>Reset all progress?</span>
                <button type="button" className="learn-reset-yes" onClick={() => { resetProgress(); onProgressChange({ version: 1, solved: {} }); setConfirmingReset(false); }}>Reset</button>
                <button type="button" onClick={() => setConfirmingReset(false)}>Cancel</button>
              </div>
            : <button type="button" className="learn-reset" onClick={() => setConfirmingReset(true)}>Reset progress</button>}
        </footer>
      </div>
    </main>
  );
}
