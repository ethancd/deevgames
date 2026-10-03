import { Explorer } from './explorer/Explorer';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
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
import { PUZZLE_IDS } from './learn/count';
import { loadProgress, solvedCount } from './learn/progress';
import { learnUrl, parseLearnRoute, type LearnRoute } from './learn/routing';

/** Learn to Play (map, puzzles, solver, fixtures) is its own chunk, loaded when a Learn route opens. */
const LearnRoot = lazy(() => import('./learn/LearnRoot'));

type MenuScreen = 'tutorial' | 'menu' | 'welcome' | 'learn';
/** First visit to the plain mode screen only: never over a deep link, a room, a saved game or a Learn link. */
function firstScreen(online: boolean, learn: LearnRoute | null): MenuScreen {
  if (learn) return 'learn';
  if (online || !/^\/muju\/?$/.test(window.location.pathname)) return 'menu';
  if (tutorialRequested()) return 'tutorial';
  return hasCompletedOnboarding() || loadGameState() ? 'menu' : 'tutorial';
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
  // A Learn page the app pushed is marked, so its own back button can step back
  // through history instead of stacking a copy of the page it returns to.
  const navigateLearn = useCallback((route: LearnRoute | null, replace = false) => {
    const url = learnUrl(route);
    try {
      if (replace) window.history.replaceState(window.history.state, '', url);
      else window.history.pushState(route ? { mujuLearnBack: true } : null, '', url);
    } catch { /* A sandboxed frame still navigates in memory. */ }
    setLearnRoute(route);
    setScreen(route ? 'learn' : 'menu');
    if (route) setProgress(loadProgress());
  }, []);
  const leaveLearn = useCallback((to: LearnRoute | null) => {
    if ((window.history.state as { mujuLearnBack?: boolean } | null)?.mujuLearnBack) window.history.back();
    else navigateLearn(to, to !== null);
  }, [navigateLearn]);
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
    return <Suspense fallback={<main className="learn-loading min-h-screen bg-gray-900" aria-busy="true" aria-label="Learn to Play" />}>
      <LearnRoot route={learnRoute} progress={progress} onProgressChange={setProgress} onNavigate={navigateLearn} onLeave={leaveLearn} />
    </Suspense>;
  }
  if (!gameConfig) {
    return <ModeSelect welcome={screen === 'welcome'} onLearn={() => navigateLearn({ kind: 'map' })} learnSolved={solvedCount(progress, PUZZLE_IDS)}
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
