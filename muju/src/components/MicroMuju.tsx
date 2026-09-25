import { useEffect, useState } from 'react';
import { GameScreen } from './GameScreen';
import { MusicButton } from '../music/MusicPlayer';
import { MicroPieceTable, MicroRulesSummary } from './MicroRules';
import { MICRO_TITLE } from '../game/micro';
import { loadGameState } from '../utils/persistence';
import type { GameConfig } from '../game/types';

/** MICRO MUJU is two humans on one device. No AI seat is ever configured. */
const microConfig = (newGame: boolean): GameConfig => ({
  mode: 'pass-play', variant: 'micro', ruleset: 'phasing', newGame,
  controls: { white: 'human', black: 'human' },
  aiDifficulty: { white: 'medium', black: 'medium' },
});

/** `/muju/micro/`: start or continue a Micro game. Reads only Micro's save slot. */
export function MicroMuju() {
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [saved, setSaved] = useState(() => loadGameState('micro'));
  useEffect(() => { document.title = MICRO_TITLE; }, []);

  if (config) return <GameScreen config={config} onBackToMenu={() => { setSaved(loadGameState('micro')); setConfig(null); }} />;

  const resumable = saved?.phase === 'playing' ? saved : null;
  const startNew = () => {
    if (resumable && !window.confirm('Start a new MICRO MUJU game? This replaces your saved Micro match.')) return;
    setConfig(microConfig(true));
  };
  return (
    <div className="mode-select micro-landing min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-5">
        <div className="music-lobby-nav"><a href="/muju/" className="text-sm text-cyan-300">← Muju Hono Irumbu</a><MusicButton /></div>
        <header className="text-center space-y-1">
          <h1 className="text-4xl font-bold tracking-wide">{MICRO_TITLE}</h1>
          <p className="text-gray-400">Muju on a 6×6 board, with less of everything. Two players, one device.</p>
        </header>
        <div className="space-y-3">
          {resumable && <button onClick={() => setConfig(microConfig(false))}
            className="w-full p-4 rounded-lg font-semibold bg-amber-600 hover:bg-amber-500 text-left">
            Continue game
            <div className="text-sm font-normal text-amber-100">Turn {resumable.turn.turnNumber} · {resumable.turn.currentPlayer === 'white' ? 'White (Player 1)' : 'Black (Player 2)'} to move</div>
          </button>}
          <button onClick={startNew}
            className={`w-full p-4 rounded-lg font-semibold text-left ${resumable ? 'border-2 border-gray-600 hover:border-gray-400' : 'bg-amber-600 hover:bg-amber-500'}`}>
            New game
            <div className={`text-sm font-normal ${resumable ? 'text-gray-400' : 'text-amber-100'}`}>White (Player 1) moves first</div>
          </button>
        </div>
        <section aria-label="Rules" className="space-y-3 text-sm text-gray-300">
          <MicroRulesSummary />
          <MicroPieceTable />
          <p className="text-gray-500">Your Micro game is saved on this device, separately from Muju Hono Irumbu. How to play (in the game) has the full rules.</p>
        </section>
      </div>
    </div>
  );
}
