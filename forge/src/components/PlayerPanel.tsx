import type { Player } from '../game/types';
import { calculateVP } from '../game/scoring';
import type { GameState } from '../game/types';

interface PlayerPanelProps {
  player: Player;
  isCurrentPlayer: boolean;
  gameState: GameState;
}

export function PlayerPanel({ player, isCurrentPlayer, gameState }: PlayerPanelProps) {
  const vp = calculateVP(player, gameState);

  return (
    <div
      className={`glass-panel p-5 rounded-xl border-2 transition-all duration-300 shadow-lg ${
        isCurrentPlayer
          ? 'border-amber-500 shadow-amber-500/20 animate-slideIn'
          : 'border-amber-900/30'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold" style={{ fontFamily: 'Cinzel, serif', color: '#eee8d5' }}>
          {player.name}
        </h3>
        {isCurrentPlayer && (
          <span className="text-amber-400 text-sm font-bold tracking-wider animate-pulse">
            ★ YOUR TURN
          </span>
        )}
      </div>

      <div className="flex gap-4 mb-3 text-lg font-medium">
        <span style={{ color: 'var(--mars)' }}>♂ {player.symbols.mars}</span>
        <span style={{ color: 'var(--venus)' }}>♀ {player.symbols.venus}</span>
        <span style={{ color: 'var(--mercury)' }}>☿ {player.symbols.mercury}</span>
        <span style={{ color: 'var(--moon)' }}>☽ {player.symbols.moon}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-amber-400 text-2xl font-bold" style={{ fontFamily: 'Cinzel, serif' }}>
          {vp} <span className="text-sm text-amber-500">VP</span>
        </div>
        <div className="text-amber-700 text-sm">
          {player.tableau.length} {player.tableau.length === 1 ? 'card' : 'cards'}
        </div>
      </div>
    </div>
  );
}
