import type { PlayerId } from '../game/types';

interface PassDeviceOverlayProps {
  nextPlayer: PlayerId;
  onContinue: () => void;
}

export function PassDeviceOverlay({ nextPlayer, onContinue }: PassDeviceOverlayProps) {
  const playerName = nextPlayer === 'player' ? 'Player 1' : 'Player 2';
  const playerColor = nextPlayer === 'player' ? 'text-blue-400' : 'text-red-400';

  return (
    <div
      className="fixed inset-0 bg-gray-900/95 flex items-center justify-center z-50"
      onClick={onContinue}
    >
      <div className="text-center space-y-6 p-8">
        <div className="text-2xl text-gray-400">Pass device to</div>
        <div className={`text-5xl font-bold ${playerColor}`}>{playerName}</div>
        <div className="text-gray-500 text-sm">Tap anywhere to continue</div>
      </div>
    </div>
  );
}
