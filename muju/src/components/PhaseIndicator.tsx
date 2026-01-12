import type { TurnPhase, PlayerId } from '../game/types';

interface PhaseIndicatorProps {
  turnNumber: number;
  phase: TurnPhase;
  currentPlayer: PlayerId;
}

export function PhaseIndicator({ turnNumber, phase, currentPlayer }: PhaseIndicatorProps) {
  const phaseLabels: Record<TurnPhase, string> = {
    place: 'Place',
    action: 'Action',
    queue: 'Build',
  };

  const phaseColors: Record<TurnPhase, string> = {
    place: 'bg-purple-500',
    action: 'bg-blue-500',
    queue: 'bg-amber-500',
  };

  return (
    <div className="flex items-center gap-4 text-white">
      <div className="flex items-center gap-2">
        <span className="text-gray-400">Turn</span>
        <span className="font-bold text-xl">{turnNumber}</span>
      </div>

      <div className="w-px h-6 bg-gray-600" />

      <div className="flex items-center gap-2">
        <span className="text-gray-400">Phase:</span>
        <span className={`px-2 py-0.5 rounded text-sm font-medium ${phaseColors[phase]}`}>
          {phaseLabels[phase]}
        </span>
      </div>

      <div className="w-px h-6 bg-gray-600" />

      <div className="flex items-center gap-2">
        <span className={`
          font-medium
          ${currentPlayer === 'player' ? 'text-green-400' : 'text-red-400'}
        `}>
          {currentPlayer === 'player' ? 'Your Turn' : 'AI Turn'}
        </span>
      </div>
    </div>
  );
}
