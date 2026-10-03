import { Explorer } from './explorer/Explorer';
import { useCallback, useEffect, useState } from 'react';
import { GameScreen } from './components/GameScreen';
import { ModeSelect } from './components/ModeSelect';
import type { GameConfig } from './game/types';
import { OnlineLobby } from './online/OnlineLobby';
import { MapPainter } from './components/MapPainter';
import { AnalysisScreen } from './components/AnalysisScreen';
import { MicroMuju } from './components/MicroMuju';
import { invitationCodeFromPath, watchCodeFromPath } from './online/invitations';
import { MusicProvider } from './music/MusicPlayer';
import { SoundProvider } from './sound/SoundProvider';
import { Onboarding } from './onboarding/Onboarding';
import { hasCompletedOnboarding, tutorialRequested } from './onboarding/storage';
import { loadGameState } from './utils/persistence';
import { EffectsGallery } from './effects/EffectsGallery';
import { LearnScreen } from './learn/LearnScreen';
import { PuzzleScreen } from './learn/PuzzleScreen';
import { nextPuzzle, PUZZLES, puzzleById, type CatalogEntry } from './learn/catalog';
import { FIXTURES } from './learn/fixtures';
import { loadProgress, solvedCount } from './learn/progress';
import { learnUrl, parseLearnRoute, type LearnRoute } from './learn/routing';
import type { Arc } from './learn/types';

type MenuScreen = 'tutorial' | 'menu' | 'welcome' | 'learn';
/** First visit to the plain mode screen only: never over a deep link, a room, a saved game or a Learn link. */
function firstScreen(online: boolean, learn: LearnRoute | null): MenuScreen {
  if (learn) return 'learn';
  if (online || !/^\/muju\/?$/.test(window.location.pathname)) return 'menu';
  if (tutorialRequested()) return 'tutorial';
  return hasCompletedOnboarding() || loadGameState() ? 'menu' : 'tutorial';
}

/** Test fixtures stand in for the catalog behind `?fixture=1`; they are never on the map. */
const FIXTURE_ARC: Arc = { id: 'fixtures', title: 'Fixtures', part: 'basics', icon: 'review', puzzles: [...FIXTURES] };
function resolvePuzzle(route: Extract<LearnRoute, { kind: 'puzzle' }>): { entry: CatalogEntry; next: LearnRoute | null } | null {
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

function GameApp() {
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [online, setOnline] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return !!invitationCodeFromPath(window.location.pathname) || !!watchCodeFromPath(window.location.pathname) || query.has('room') || query.get('online') === '1';
  });
  const [learnRoute, setLearnRoute] = useState<LearnRoute | null>(() => parseLearnRoute(window.location.search));
  const [screen, setScreen] = useState<MenuScreen>(() => firstScreen(online, learnRoute));
  const [progress, setProgress] = useState(loadProgress);

  // Learn to Play lives in the URL (`?learn=1`, `?learn=<id>`), so the browser's Back works.
  const navigateLearn = useCallback((route: LearnRoute | null, replace = false) => {
    const url = learnUrl(route);
    try { window.history[replace ? 'replaceState' : 'pushState'](null, '', url); } catch { /* A sandboxed frame still navigates in memory. */ }
    setLearnRoute(route);
    setScreen(route ? 'learn' : 'menu');
    if (route) setProgress(loadProgress());
  }, []);
  useEffect(() => {
    const onPop = () => {
      if (gameConfig) return;
      const route = parseLearnRoute(window.location.search);
      setLearnRoute(route);
      setScreen(route ? 'learn' : 'menu');
      if (route) setProgress(loadProgress());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [gameConfig]);

  const handleStartGame = (config: GameConfig) => {
    setGameConfig(config);
  };

  const handleBackToMenu = () => {
    setGameConfig(null);
  };

  if (/^\/muju\/explorer\/?$/.test(window.location.pathname)) return <Explorer />;
  if (/^\/muju\/painter\/?$/.test(window.location.pathname)) return <MapPainter />;
  if (/^\/muju\/micro\/?$/.test(window.location.pathname)) return <MicroMuju />;
  if (/^\/muju\/analysis\/?$/.test(window.location.pathname)) return <AnalysisScreen />;
  if (new URLSearchParams(window.location.search).get('effects') === '1') return <EffectsGallery />;
  if (online) return <OnlineLobby onBack={() => { window.history.replaceState(null, '', '/muju/'); setOnline(false); }} />;
  if (!gameConfig && screen === 'tutorial') {
    return <Onboarding onComplete={() => {
      const url = new URL(window.location.href);
      if (url.searchParams.has('tutorial')) { url.searchParams.delete('tutorial'); window.history.replaceState(null, '', url); }
      setScreen('welcome');
    }} />;
  }
  if (!gameConfig && screen === 'learn' && learnRoute) {
    const resolved = learnRoute.kind === 'puzzle' ? resolvePuzzle(learnRoute) : null;
    if (learnRoute.kind === 'map' || !resolved) {
      return <LearnScreen progress={progress} onProgressChange={setProgress} onBack={() => navigateLearn(null)}
        onOpen={id => navigateLearn({ kind: 'puzzle', id })} />;
    }
    const { entry, next } = resolved;
    return <PuzzleScreen key={entry.puzzle.id} spec={entry.puzzle} arc={entry.arc} index={entry.index} onProgressChange={setProgress}
      onExit={() => navigateLearn({ kind: 'map' }, true)}
      onNext={next ? () => navigateLearn(next, true) : null} />;
  }
  if (!gameConfig) {
    return <ModeSelect welcome={screen === 'welcome'} onLearn={() => navigateLearn({ kind: 'map' })} learnSolved={solvedCount(progress, PUZZLES.map(e => e.puzzle.id))}
      onReplayTutorial={() => setScreen('tutorial')} onStartGame={handleStartGame} onOnline={() => {
      const url = new URL(window.location.href);
      url.searchParams.set('online', '1');
      window.history.replaceState(null, '', url);
      setOnline(true);
    }} />;
  }

  return <GameScreen config={gameConfig} onBackToMenu={handleBackToMenu} />;
}

function App() {
  return <SoundProvider><MusicProvider><GameApp /></MusicProvider></SoundProvider>;
}

export default App;
