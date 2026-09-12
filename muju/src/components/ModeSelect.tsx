import { useState } from 'react';
import type { GameMode, GameConfig, PlayerId } from '../game/types';
import type { AIDifficulty } from '../ai/types';
import { getActionsPerTurn } from '../game/rules';
import { loadGameState } from '../utils/persistence';

const PREFERRED_SIDE_KEY = 'muju:preferred-player-side';

function loadPreferredSide(): PlayerId {
  try {
    return localStorage.getItem(PREFERRED_SIDE_KEY) === 'black' ? 'black' : 'white';
  } catch {
    return 'white';
  }
}

interface ModeSelectProps {
  onStartGame: (config: GameConfig) => void;
  onOnline?: () => void;
}

export function ModeSelect({ onStartGame, onOnline }: ModeSelectProps) {
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [playerSide, setPlayerSide] = useState<PlayerId>(loadPreferredSide);
  const [playerDifficulty, setPlayerDifficulty] = useState<AIDifficulty>('medium');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');
  const [savedGame] = useState(loadGameState);

  const handleSideChange = (side: PlayerId) => {
    setPlayerSide(side);
    try {
      localStorage.setItem(PREFERRED_SIDE_KEY, side);
    } catch {
      // Keep the current selection usable when browser storage is unavailable.
    }
  };

  const handleStart = (newGame = true) => {
    if (!selectedMode) return;

    let config: GameConfig;

    switch (selectedMode) {
      case 'online': return;
      case 'vs-ai':
        config = {
          mode: 'vs-ai',
          controls: {
            white: playerSide === 'white' ? 'human' : 'ai',
            black: playerSide === 'black' ? 'human' : 'ai',
          },
          aiDifficulty: {
            white: playerSide === 'black' ? aiDifficulty : 'medium',
            black: playerSide === 'white' ? aiDifficulty : 'medium',
          },
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

    onStartGame({ ...config, newGame });
  };

  return (
    <div className="mode-select min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <a href="../" className="text-sm text-cyan-300">← Deev Games</a>
        <h1 className="text-3xl font-bold text-center">Muju Hono Tanka</h1>
        <p className="text-gray-400 text-center">Select Game Mode</p>

        {/* Mode buttons */}
        <div className="space-y-3">
          {onOnline && <button onClick={onOnline} className="w-full p-4 rounded-lg border-2 border-cyan-700 hover:border-cyan-400 text-left">
            <div className="font-semibold">Play online</div>
            <div className="text-sm text-gray-400">Invite a person or an LLM · two devices, one game</div>
          </button>}
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

        {/* Side and difficulty selectors */}
        {selectedMode === 'vs-ai' && (
          <div className="space-y-4">
            <fieldset aria-describedby="player-side-hint">
              <legend className="mb-2 text-sm text-gray-400">Play as</legend>
              <div className="grid grid-cols-2 gap-3">
                {(['white', 'black'] as const).map((side) => (
                  <label
                    key={side}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-300 ${
                      playerSide === side
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="player-side"
                      value={side}
                      checked={playerSide === side}
                      onChange={() => handleSideChange(side)}
                      className="h-4 w-4 accent-blue-500"
                    />
                    <span>{side === 'white' ? 'White' : 'Black'}</span>
                  </label>
                ))}
              </div>
              <p id="player-side-hint" className="mt-2 text-sm text-gray-400">
                {playerSide === 'white'
                  ? 'White moves first. You start.'
                  : 'White moves first, so the AI starts.'}
              </p>
            </fieldset>
            <div className="space-y-2">
              <label htmlFor="vs-ai-difficulty" className="block text-sm text-gray-400">AI Difficulty</label>
              <select
                id="vs-ai-difficulty"
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
        {selectedMode && <p className="text-sm text-gray-400">4 shared actions per turn · Draw after 10 consecutive turns without a kill.</p>}
        <button
          onClick={() => handleStart()}
          disabled={!selectedMode}
          className={`w-full p-3 rounded-lg font-semibold transition-all ${
            selectedMode
              ? 'bg-blue-600 hover:bg-blue-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Start Game
        </button>
        {savedGame && <button disabled={!selectedMode} onClick={() => handleStart(false)}
          className="w-full p-3 rounded-lg border border-gray-600 disabled:text-gray-500">
          Continue saved game · {getActionsPerTurn(savedGame)} actions
        </button>}
      </div>
    </div>
  );
}
