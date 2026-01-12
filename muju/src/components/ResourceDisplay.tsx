import type { PlayerState } from '../game/types';

interface ResourceDisplayProps {
  playerState: PlayerState;
  viewerIsOwner: boolean; // Whether the viewer owns this player's resources
}

export function ResourceDisplay({ playerState, viewerIsOwner }: ResourceDisplayProps) {
  const { resources, resourcesGained, resourcesSpent } = playerState;
  const isPlayer = playerState.id === 'player';

  return (
    <div className={`
      p-3 rounded-lg
      ${isPlayer ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'}
    `}>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-medium ${isPlayer ? 'text-green-400' : 'text-red-400'}`}>
          {isPlayer ? 'You' : 'Opponent'}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        {/* Current resources - only show for owner */}
        {viewerIsOwner ? (
          <div className="flex justify-between">
            <span className="text-gray-400">Resources:</span>
            <span className="text-yellow-400 font-bold">{resources}</span>
          </div>
        ) : (
          <div className="flex justify-between">
            <span className="text-gray-400">Resources:</span>
            <span className="text-gray-500">???</span>
          </div>
        )}

        {/* Gained - visible to all */}
        <div className="flex justify-between">
          <span className="text-gray-400">Gained:</span>
          <span className="text-purple-400">{resourcesGained}</span>
        </div>

        {/* Spent on placed units - visible to all */}
        <div className="flex justify-between">
          <span className="text-gray-400">Spent:</span>
          <span className="text-orange-400">{resourcesSpent}</span>
        </div>

        {/* Estimated range for opponent */}
        {!viewerIsOwner && (
          <div className="flex justify-between text-xs mt-1 pt-1 border-t border-gray-700">
            <span className="text-gray-500">Est. range:</span>
            <span className="text-gray-400">
              {Math.max(0, resourcesGained - resourcesSpent - 20)} - {resourcesGained - resourcesSpent}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
