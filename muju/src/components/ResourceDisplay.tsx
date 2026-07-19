import type { PlayerState } from '../game/types';

interface ResourceDisplayProps {
  playerState: PlayerState;
  viewerIsOwner: boolean; // Whether the viewer owns this player's resources
  label?: string; // Optional custom label to override default
}

export function ResourceDisplay({ playerState, viewerIsOwner, label }: ResourceDisplayProps) {
  const { resources, resourcesGained, resourcesSpent, resourcesManifested } = playerState;
  const isWhite = playerState.id === 'white';

  const displayLabel = label ?? (isWhite ? 'White' : 'Black');

  return (
    <div className={`
      p-3 rounded-lg
      ${isWhite ? 'bg-slate-300/20 border border-slate-400' : 'bg-slate-900/50 border border-slate-600'}
    `}>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-medium ${isWhite ? 'text-slate-200' : 'text-slate-400'}`}>
          {displayLabel}
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

        {/* Spent - only show for owner (includes queued units) */}
        {viewerIsOwner && (
          <div className="flex justify-between">
            <span className="text-gray-400">Spent:</span>
            <span className="text-orange-400">{resourcesSpent}</span>
          </div>
        )}

        {/* Manifested - visible to all (only promoted + placed units) */}
        <div className="flex justify-between">
          <span className="text-gray-400">{viewerIsOwner ? 'Manifested:' : 'Spent:'}</span>
          <span className="text-orange-400">{resourcesManifested}</span>
        </div>

        {/* Estimated range for opponent */}
        {!viewerIsOwner && (
          <div className="flex justify-between text-xs mt-1 pt-1 border-t border-gray-700">
            <span className="text-gray-500">Est. range:</span>
            <span className="text-gray-400">
              {Math.max(0, resourcesGained - resourcesManifested - 20)} - {resourcesGained - resourcesManifested}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
