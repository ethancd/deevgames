import { Explorer } from './explorer/Explorer';
import { useState } from 'react';
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
import { PuzzleList } from './onboarding/PuzzleList';
import { hasCompletedOnboarding, tutorialRequested } from './onboarding/storage';
import { loadGameState } from './utils/persistence';
import { EffectsGallery } from './effects/EffectsGallery';

type MenuScreen = 'tutorial' | 'menu' | 'welcome' | 'puzzles';
/** First visit to the plain mode screen only: never over a deep link, a room or a saved game. */
function firstScreen(online: boolean): MenuScreen {
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
  const [screen, setScreen] = useState<MenuScreen>(() => firstScreen(online));

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
  if (!gameConfig && screen === 'puzzles') return <PuzzleList onBack={() => setScreen('menu')} />;
  if (!gameConfig) {
    return <ModeSelect welcome={screen === 'welcome'} onPuzzles={() => setScreen('puzzles')} onReplayTutorial={() => setScreen('tutorial')} onStartGame={handleStartGame} onOnline={() => {
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
