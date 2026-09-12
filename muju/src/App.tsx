import { useState } from 'react';
import { GameScreen } from './components/GameScreen';
import { ModeSelect } from './components/ModeSelect';
import type { GameConfig } from './game/types';
import { OnlineLobby } from './online/OnlineLobby';
import { MapPainter } from './components/MapPainter';

function App() {
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [online, setOnline] = useState(() => new URLSearchParams(window.location.search).has('room'));

  const handleStartGame = (config: GameConfig) => {
    setGameConfig(config);
  };

  const handleBackToMenu = () => {
    setGameConfig(null);
  };

  if (/^\/muju\/painter\/?$/.test(window.location.pathname)) return <MapPainter />;
  if (online) return <OnlineLobby onBack={() => { window.history.replaceState(null, '', window.location.pathname); setOnline(false); }} />;
  if (!gameConfig) {
    return <ModeSelect onStartGame={handleStartGame} onOnline={() => setOnline(true)} />;
  }

  return <GameScreen config={gameConfig} onBackToMenu={handleBackToMenu} />;
}

export default App;
