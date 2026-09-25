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

function GameApp() {
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [online, setOnline] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return !!invitationCodeFromPath(window.location.pathname) || !!watchCodeFromPath(window.location.pathname) || query.has('room') || query.get('online') === '1';
  });

  const handleStartGame = (config: GameConfig) => {
    setGameConfig(config);
  };

  const handleBackToMenu = () => {
    setGameConfig(null);
  };

  if (/^\/muju\/painter\/?$/.test(window.location.pathname)) return <MapPainter />;
  if (/^\/muju\/micro\/?$/.test(window.location.pathname)) return <MicroMuju />;
  if (/^\/muju\/analysis\/?$/.test(window.location.pathname)) return <AnalysisScreen />;
  if (online) return <OnlineLobby onBack={() => { window.history.replaceState(null, '', '/muju/'); setOnline(false); }} />;
  if (!gameConfig) {
    return <ModeSelect onStartGame={handleStartGame} onOnline={() => {
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
