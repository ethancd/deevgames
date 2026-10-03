import { LearnScreen } from './LearnScreen';
import { PuzzleScreen } from './PuzzleScreen';
import { nextPuzzle, puzzleById, type CatalogEntry } from './catalog';
import { FIXTURES } from './fixtures';
import type { LearnProgress } from './progress';
import type { LearnRoute } from './routing';
import type { Arc } from './types';

/**
 * Learn to Play behind one lazy import: the map, the puzzle screen, the
 * solver client and the test fixtures load only when a Learn route opens, so
 * the home screen and ordinary matches never download them.
 */
export interface LearnRootProps {
  route: LearnRoute;
  progress: LearnProgress;
  onProgressChange: (progress: LearnProgress) => void;
  /** Push (or, with `replace`, replace) a Learn route. */
  onNavigate: (route: LearnRoute, replace?: boolean) => void;
  /** Step back out to `to` (the map, or the modes when null). */
  onLeave: (to: LearnRoute | null) => void;
}

/** Test fixtures stand in for the catalog behind `?fixture=1`; they are never on the map. */
const FIXTURE_ARC: Arc = { id: 'fixtures', title: 'Fixtures', part: 'basics', icon: 'review', puzzles: [...FIXTURES] };

export function resolvePuzzle(route: Extract<LearnRoute, { kind: 'puzzle' }>): { entry: CatalogEntry; next: LearnRoute | null } | null {
  if (route.fixture) {
    const index = FIXTURES.findIndex(f => f.id === route.id);
    if (index < 0) return null;
    const after = FIXTURES[index + 1];
    return { entry: { puzzle: FIXTURES[index], arc: FIXTURE_ARC, index, number: index + 1 }, next: after ? { kind: 'puzzle', id: after.id, fixture: true } : null };
  }
  const entry = puzzleById(route.id);
  if (!entry) return null;
  const after = nextPuzzle(route.id);
  return { entry, next: after ? { kind: 'puzzle', id: after.puzzle.id } : null };
}

export default function LearnRoot({ route, progress, onProgressChange, onNavigate, onLeave }: LearnRootProps) {
  const resolved = route.kind === 'puzzle' ? resolvePuzzle(route) : null;
  if (!resolved) {
    return <LearnScreen progress={progress} onProgressChange={onProgressChange} onBack={() => onLeave(null)}
      onOpen={id => onNavigate({ kind: 'puzzle', id })} />;
  }
  const { entry, next } = resolved;
  return <PuzzleScreen key={entry.puzzle.id} spec={entry.puzzle} arc={entry.arc} index={entry.index} onProgressChange={onProgressChange}
    onExit={() => onLeave({ kind: 'map' })}
    onNext={next ? () => onNavigate(next, true) : null} />;
}
