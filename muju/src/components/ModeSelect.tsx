import { useState } from 'react';
import { BlackCrystalHandicap } from './BlackCrystalHandicap';
import { MusicButton } from '../music/MusicPlayer';
import type { GameMode, GameConfig, PlayerId } from '../game/types';
import type { AIDifficulty } from '../ai/types';
import { AI_PACES, AI_PACE_LABEL, AI_TURN_SECONDS, formatTurnSeconds, type AIPace } from '../ai/turnTime';
import { getActionsPerTurn } from '../game/rules';
import { INACTIVITY_LIMIT } from '../game/inactivity';
import { loadAIPace, loadGameState, loadRetiredSave } from '../utils/persistence';

const PREFERRED_SIDE_KEY = 'muju:preferred-player-side';
/** Remembers whether "Other ways to play" was left open. */
const OTHER_MODES_KEY = 'muju:other-modes-open:v1';
function loadOtherModesOpen(): boolean {
  try { return localStorage.getItem(OTHER_MODES_KEY) === '1'; } catch { return false; }
}

/** "Quick · 10 s", "Deep · 1 min" — the allowance depends on the difficulty. */
const paceOptionLabel = (difficulty: AIDifficulty, pace: AIPace): string =>
  `${AI_PACE_LABEL[pace]} · ${formatTurnSeconds(AI_TURN_SECONDS[difficulty][pace])}`;

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
  onPuzzles?: () => void;
  onReplayTutorial?: () => void;
  /** Fade in from the tutorial's title. */
  welcome?: boolean;
}

export function ModeSelect({ onStartGame, onOnline, onPuzzles, onReplayTutorial, welcome = false }: ModeSelectProps) {
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [otherOpen, setOtherOpen] = useState(loadOtherModesOpen);
  const toggleOther = () => {
    const next = !otherOpen;
    setOtherOpen(next);
    try { localStorage.setItem(OTHER_MODES_KEY, next ? '1' : '0'); } catch { /* Still toggles for this visit. */ }
  };
  const [playerSide, setPlayerSide] = useState<PlayerId>(loadPreferredSide);
  const [playerDifficulty, setPlayerDifficulty] = useState<AIDifficulty>('medium');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');
  // Resuming a saved game keeps the thinking time it was played at; a pace the
  // save never mentioned reads back as `DEFAULT_AI_PACE`.
  const [savedPace] = useState(loadAIPace);
  const [playerPace, setPlayerPace] = useState<AIPace>(savedPace.white);
  const [aiPace, setAiPace] = useState<AIPace>(savedPace[playerSide === 'white' ? 'black' : 'white']);
  const [savedGame] = useState(loadGameState);
  // Read AFTER `loadGameState`, which is what moves a retired-rules save into
  // the archive. A game played under the rules retired on 2026-09-21 is never
  // resumed, but it is still the player's game: offer it for review.
  const [retiredSave] = useState(loadRetiredSave);
  const [blackCrystalHandicap, setBlackCrystalHandicap] = useState(0.5);
  /** Which modes put an engine in a seat, for the difficulty/pace copy. */
  const aiMode = selectedMode === 'vs-ai' || selectedMode === 'ai-vs-ai';

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
          // Only the AI seat's pace is ever read; the human's carries the same
          // choice so that switching sides mid-menu cannot lose it.
          aiPace: { white: aiPace, black: aiPace },
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
          aiPace: { white: playerPace, black: aiPace },
        };
        break;
    }

    // ONE RULESET. Phasing has been the only offered rules since 2026-09-21, in
    // every mode and for both a new game and a resumed one: a save that is not
    // Phasing is archived by `loadGameState` and never handed back here
    // (`src/utils/persistence.ts`), so there is nothing else this can be.
    onStartGame({ ...config, ruleset: 'phasing', blackCrystalHandicap, newGame });
  };

  return (
    <div className={`mode-select${welcome ? ' mode-select-welcome' : ''} min-h-screen bg-gray-900 text-white flex items-start justify-center p-4 pt-6 sm:pt-10`}>
      <div className="max-w-md w-full space-y-6">
        <div className="music-lobby-nav"><a href="https://deevgames.pages.dev/" className="text-sm text-cyan-300">← Deev Games</a><MusicButton /></div>
        <h1 className="mode-title text-3xl font-bold text-center">Muju Hono Irumbu</h1>

        {/* Three headline choices first; every other way to play stays one tap away below. */}
        <div className="mode-primary space-y-3">
          <button
            onClick={() => setSelectedMode('vs-ai')}
            aria-pressed={selectedMode === 'vs-ai'}
            className={`mode-primary-button w-full p-5 rounded-xl border-2 transition-all text-left ${
              selectedMode === 'vs-ai'
                ? 'border-blue-500 bg-blue-500/20'
                : 'border-gray-600 hover:border-gray-400'
            }`}
          >
            <div className="text-lg font-semibold">Play vs AI</div>
            <div className="text-sm text-gray-400">Play against the computer</div>
          </button>
          {onOnline && <button onClick={onOnline} className="mode-primary-button w-full p-5 rounded-xl border-2 border-cyan-700 hover:border-cyan-400 text-left">
            <div className="text-lg font-semibold">Play online</div>
            <div className="text-sm text-gray-400">Host, join, or watch a live game</div>
          </button>}
          {onPuzzles && <button onClick={onPuzzles} className="mode-primary-button w-full p-5 rounded-xl border-2 border-amber-700 hover:border-amber-400 text-left">
            <div className="text-lg font-semibold">Puzzles</div>
            <div className="text-sm text-gray-400">Short positions to solve, one turn each</div>
          </button>}
        </div>

        <button type="button" onClick={toggleOther} aria-expanded={otherOpen} aria-controls="other-ways-to-play"
          className="mode-other-toggle w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-300 hover:text-white">
          Other ways to play <span aria-hidden="true" className={`mode-chevron${otherOpen ? ' is-open' : ''}`}>⌄</span>
        </button>
        {otherOpen && <div id="other-ways-to-play" className="mode-secondary grid grid-cols-2 gap-2">
          <button
            onClick={() => setSelectedMode('pass-play')}
            aria-pressed={selectedMode === 'pass-play'}
            className={`p-3 rounded-lg border transition-all text-left ${
              selectedMode === 'pass-play'
                ? 'border-green-500 bg-green-500/20'
                : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="text-sm font-semibold">Pass & Play</div>
            <div className="text-xs text-gray-400">Two players, one device</div>
          </button>

          <button
            onClick={() => setSelectedMode('ai-vs-ai')}
            aria-pressed={selectedMode === 'ai-vs-ai'}
            className={`p-3 rounded-lg border transition-all text-left ${
              selectedMode === 'ai-vs-ai'
                ? 'border-purple-500 bg-purple-500/20'
                : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            <div className="text-sm font-semibold">Watch AI</div>
            <div className="text-xs text-gray-400">Spectate AI vs AI match</div>
          </button>
          <a href="/muju/analysis" className="block p-3 rounded-lg border border-gray-700 hover:border-cyan-400 text-left">
            <div className="text-sm font-semibold">Analysis board</div>
            <div className="text-xs text-gray-400">Control both sides, explore moves, or review a room</div>
          </a>
          <a href="/muju/micro/" className="block p-3 rounded-lg border border-amber-800 hover:border-amber-400 text-left">
            <div className="text-sm font-semibold">MICRO MUJU</div>
            <div className="text-xs text-gray-400">6×6 pass &amp; play · three pieces, two actions, no clock</div>
          </a>
          {onReplayTutorial && <button type="button" onClick={onReplayTutorial} className="col-span-2 p-2 rounded-lg border border-gray-700 hover:border-cyan-400 text-sm text-cyan-300">Replay tutorial</button>}
        </div>}

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
            <div className="space-y-2">
              <label htmlFor="vs-ai-pace" className="block text-sm text-gray-400">Thinking time</label>
              <select
                id="vs-ai-pace"
                value={aiPace}
                onChange={(e) => setAiPace(e.target.value as AIPace)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              >
                {AI_PACES.map((pace) => <option key={pace} value={pace}>{paceOptionLabel(aiDifficulty, pace)}</option>)}
              </select>
            </div>
          </div>
        )}

        {selectedMode === 'ai-vs-ai' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="ai-vs-ai-difficulty-1" className="block text-sm text-gray-400">Player 1 AI</label>
              <select
                id="ai-vs-ai-difficulty-1"
                value={playerDifficulty}
                onChange={(e) => setPlayerDifficulty(e.target.value as AIDifficulty)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <label htmlFor="ai-vs-ai-pace-1" className="block text-sm text-gray-400">Player 1 thinking time</label>
              <select
                id="ai-vs-ai-pace-1"
                value={playerPace}
                onChange={(e) => setPlayerPace(e.target.value as AIPace)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              >
                {AI_PACES.map((pace) => <option key={pace} value={pace}>{paceOptionLabel(playerDifficulty, pace)}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="ai-vs-ai-difficulty-2" className="block text-sm text-gray-400">Player 2 AI</label>
              <select
                id="ai-vs-ai-difficulty-2"
                value={aiDifficulty}
                onChange={(e) => setAiDifficulty(e.target.value as AIDifficulty)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <label htmlFor="ai-vs-ai-pace-2" className="block text-sm text-gray-400">Player 2 thinking time</label>
              <select
                id="ai-vs-ai-pace-2"
                value={aiPace}
                onChange={(e) => setAiPace(e.target.value as AIPace)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-2"
              >
                {AI_PACES.map((pace) => <option key={pace} value={pace}>{paceOptionLabel(aiDifficulty, pace)}</option>)}
              </select>
            </div>
          </div>
        )}

        {aiMode && <p className="text-sm text-gray-400">Difficulty is how well the AI understands the game; thinking time is how long it looks before moving. It plays as soon as it is ready.</p>}
        {selectedMode && <BlackCrystalHandicap value={blackCrystalHandicap} onChange={setBlackCrystalHandicap} />}

        {/* Start button */}
        {selectedMode && <p className="text-sm text-gray-400">4 shared actions per turn · After {INACTIVITY_LIMIT} consecutive turns without a kill, higher mined crystals wins (a tie draws).</p>}
        {selectedMode && <button
          onClick={() => handleStart()}
          disabled={!selectedMode}
          className={`w-full p-3 rounded-lg font-semibold transition-all ${
            selectedMode
              ? 'bg-blue-600 hover:bg-blue-500'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Start Game
        </button>}
        {savedGame && <button disabled={!selectedMode} onClick={() => handleStart(false)}
          className="w-full p-3 rounded-lg border border-gray-600 disabled:text-gray-500">
          Continue saved game · {getActionsPerTurn(savedGame)} actions
        </button>}
        {retiredSave && <a href="/muju/analysis?local=1&retired=1"
          className="block w-full p-3 rounded-lg border border-gray-700 text-center text-sm text-gray-400">
          Review your saved Standard game →
        </a>}
      </div>
    </div>
  );
}
