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
      className={`p-4 rounded-lg border-2 ${
        isCurrentPlayer ? 'bg-blue-900 border-blue-500' : 'bg-gray-800 border-gray-600'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-bold text-white">{player.name}</h3>
        {isCurrentPlayer && (
          <span className="text-yellow-400 text-sm font-bold">YOUR TURN</span>
        )}
      </div>

      <div className="flex gap-4 mb-2 text-lg">
        <span className="text-red-400">♂:{player.symbols.mars}</span>
        <span className="text-pink-400">♀:{player.symbols.venus}</span>
        <span className="text-orange-400">☿:{player.symbols.mercury}</span>
        <span className="text-blue-400">☽:{player.symbols.moon}</span>
      </div>

      <div className="text-yellow-400 text-lg font-bold">VP: {vp}</div>
      <div className="text-gray-400 text-sm">Cards: {player.tableau.length}</div>
    </div>
  );
}
