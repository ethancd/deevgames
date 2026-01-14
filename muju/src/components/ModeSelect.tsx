import { useState } from 'react';
import type { GameMode, GameConfig } from '../game/types';
import type { AIDifficulty } from '../ai/types';

interface ModeSelectProps {
  onStartGame: (config: GameConfig) => void;
}

export function ModeSelect({ onStartGame }: ModeSelectProps) {
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [playerDifficulty, setPlayerDifficulty] = useState<AIDifficulty>('medium');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');

  const handleStart = () => {
    if (!selectedMode) return;

    let config: GameConfig;

    switch (selectedMode) {
      case 'vs-ai':
        config = {
          mode: 'vs-ai',
          controls: { white: 'human', black: 'ai' },
          aiDifficulty: { white: 'medium', black: aiDifficulty },
        };
        break;
      case 'pass-play':
        config = {
          mode: 'pass-play',
          controls: { white: 'human', black: 'human' },
          aiDifficulty: { white: 'medium', black: 'medium' },
        };
        break;
      case 'ai-vs-ai':
        config = {
          mode: 'ai-vs-ai',
          controls: { white: 'ai', black: 'ai' },
          aiDifficulty: { white: playerDifficulty, black: aiDifficulty },
        };
        break;
    }

    onStartGame(config);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <h1 className="text-3xl font-bold text-center">Muju Hono Tanka</h1>
        <p className="text-gray-400 text-center">Select Game Mode</p>

        {/* Mode buttons */}
        <div className="space-y-3">
          <button
            onClick={() => setSelectedMode('vs-ai')}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
              selectedMode === 'vs-ai'
                ? 'border-blue-500 bg-blue-500/20'
                : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="font-semibold">vs AI</div>
            <div className="text-sm text-gray-400">Play against the computer</div>
          </button>

          <button
            onClick={() => setSelectedMode('pass-play')}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
              selectedMode === 'pass-play'
                ? 'border-green-500 bg-green-500/20'
                : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="font-semibold">Pass & Play</div>
            <div className="text-sm text-gray-400">Two players, one device</div>
          </button>

          <button
            onClick={() => setSelectedMode('ai-vs-ai')}
            className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
              selectedMode === 'ai-vs-ai'
                ? 'border-purple-500 bg-purple-500/20'
                : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="font-semibold">Watch AI</div>
            <div className="text-sm text-gray-400">Spectate AI vs AI match</div>
          </button>
        </div>

        {/* Difficulty selectors */}
        {selectedMode === 'vs-ai' && (
          <div className="space-y-2">
            <label className="block text-sm text-gray-400">AI Difficulty</label>
            <select
              value={aiDifficulty}
              onChange={(e) => setAiDifficulty(e.target.value as AIDifficulty)}
              className="w-full bg-gray-800 border border-gray-700 rounded p-2"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        )}

        {selectedMode === 'ai-vs-ai' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Player 1 AI</label>
              <select
                value={playerDifficulty}
                onChange={(e) => setPlayerDifficulty(e.target.value as AIDifficulty)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Player 2 AI</label>
              <select
                value={aiDifficulty}
                onChange={(e) => setAiDifficulty(e.target.value as AIDifficulty)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
        )}

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!selectedMode}
          className={`w-full p-3 rounded-lg font-semibold transition-all ${
            selectedMode
              ? 'bg-blue-600 hover:bg-blue-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}
