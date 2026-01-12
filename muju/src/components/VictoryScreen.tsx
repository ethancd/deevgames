import type { PlayerId } from '../game/types';

interface VictoryScreenProps {
  winner: PlayerId;
  onPlayAgain: () => void;
  playerNames?: { player: string; ai: string };
}

export function VictoryScreen({ winner, onPlayAgain, playerNames }: VictoryScreenProps) {
  const isPlayerWinner = winner === 'player';
  const winnerName = playerNames
    ? playerNames[winner]
    : (isPlayerWinner ? 'You' : 'AI');

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-8 rounded-lg text-center max-w-md">
        <div className={`text-6xl mb-4 ${isPlayerWinner ? 'text-green-400' : 'text-red-400'}`}>
          {isPlayerWinner ? '🎉' : '💀'}
        </div>

        <h2 className={`text-3xl font-bold mb-2 ${isPlayerWinner ? 'text-green-400' : 'text-red-400'}`}>
          {playerNames ? `${winnerName} Wins!` : (isPlayerWinner ? 'Victory!' : 'Defeat')}
        </h2>

        <p className="text-gray-400 mb-6">
          {playerNames
            ? `${winnerName} has eliminated all enemy forces!`
            : (isPlayerWinner
                ? 'You have eliminated all enemy forces!'
                : 'Your forces have been eliminated.')}
        </p>

        <button
          onClick={onPlayAgain}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
