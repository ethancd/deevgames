import { useState } from 'react';
import { GameScreen } from './components/GameScreen';
import { ModeSelect } from './components/ModeSelect';
import type { GameConfig } from './game/types';

function App() {
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);

  const handleStartGame = (config: GameConfig) => {
    setGameConfig(config);
  };

  const handleBackToMenu = () => {
    setGameConfig(null);
  };

  if (!gameConfig) {
    return <ModeSelect onStartGame={handleStartGame} />;
  }

  return <GameScreen config={gameConfig} onBackToMenu={handleBackToMenu} />;
}

export default App;
