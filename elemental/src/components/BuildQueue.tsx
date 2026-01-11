import type { QueuedUnit, BoardState, PlayerId } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { getElementHex } from '../utils/colors';
import { meetsTechRequirement } from '../game/building';

interface BuildQueueProps {
  queue: QueuedUnit[];
  isOwner: boolean;
  // Optional place-phase props
  isPlacePhase?: boolean;
  board?: BoardState;
  player?: PlayerId;
  selectedReadyId?: string | null;
  onSelectReady?: (id: string | null) => void;
}

export function BuildQueue({
  queue,
  isOwner,
  isPlacePhase = false,
  board,
  player = 'player',
  selectedReadyId,
  onSelectReady,
}: BuildQueueProps) {
  if (!isOwner) {
    // Opponent's queue is hidden
    return (
      <div className="p-2 bg-gray-800 rounded border border-gray-700">
        <div className="text-xs text-gray-400 mb-1">Build Queue</div>
        <div className="text-gray-500 text-sm italic">Hidden</div>
      </div>
    );
  }

  // Separate ready units from building units
  const readyUnits = queue.filter((item) => item.turnsRemaining === 0);
  const buildingUnits = queue.filter((item) => item.turnsRemaining > 0);

  const handleReadyClick = (item: QueuedUnit) => {
    if (!isPlacePhase || !onSelectReady || !board) return;

    // Check tech requirement
    const meetsTech = meetsTechRequirement(item.definitionId, player, board);
    if (!meetsTech) return;

    // Toggle selection
    if (selectedReadyId === item.id) {
      onSelectReady(null);
    } else {
      onSelectReady(item.id);
    }
  };

  if (queue.length === 0) {
    return (
      <div className="p-2 bg-gray-800 rounded border border-gray-700">
        <div className="text-xs text-gray-400 mb-1">Build Queue</div>
        <div className="text-gray-500 text-sm">Empty</div>
      </div>
    );
  }

  return (
    <div className="p-2 bg-gray-800 rounded border border-gray-700">
      <div className="text-xs text-gray-400 mb-2">Build Queue ({queue.length})</div>

      {/* Ready units section */}
      {readyUnits.length > 0 && (
        <div className="mb-2">
          <div className="text-xs text-green-400 mb-1">Ready to Place</div>
          <div className="space-y-1">
            {readyUnits.map((item) => {
              const def = getUnitDefinition(item.definitionId);
              const color = getElementHex(def.element);
              const meetsTech = board
                ? meetsTechRequirement(item.definitionId, player, board)
                : true;
              const isSelected = selectedReadyId === item.id;
              const canClick = isPlacePhase && meetsTech;

              return (
                <button
                  key={item.id}
                  onClick={() => handleReadyClick(item)}
                  disabled={!canClick}
                  className={`
                    w-full flex items-center gap-2 text-sm p-1 rounded transition-all
                    ${isSelected ? 'ring-2 ring-green-400 bg-gray-700' : ''}
                    ${canClick ? 'hover:bg-gray-700 cursor-pointer' : ''}
                    ${!meetsTech ? 'opacity-40 cursor-not-allowed' : ''}
                  `}
                >
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-bold ${
                      !meetsTech ? 'grayscale' : ''
                    }`}
                    style={{ backgroundColor: meetsTech ? color : '#374151' }}
                  >
                    {meetsTech ? def.tier : '🔒'}
                  </div>
                  <span className={`flex-1 text-left ${meetsTech ? 'text-gray-300' : 'text-gray-500'}`}>
                    {def.name}
                  </span>
                  {!meetsTech && (
                    <span className="text-xs text-red-400">No tech</span>
                  )}
                  {meetsTech && isPlacePhase && (
                    <span className="text-xs text-green-400">✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Building units section */}
      {buildingUnits.length > 0 && (
        <div className={readyUnits.length > 0 ? 'border-t border-gray-700 pt-2' : ''}>
          {readyUnits.length > 0 && (
            <div className="text-xs text-gray-500 mb-1">Building</div>
          )}
          <div className="space-y-1">
            {buildingUnits.map((item) => {
              const def = getUnitDefinition(item.definitionId);
              const color = getElementHex(def.element);

              return (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
                    style={{ backgroundColor: color }}
                  >
                    {def.tier}
                  </div>
                  <span className="text-gray-300 flex-1">{def.name}</span>
                  <span className="text-gray-500">{item.turnsRemaining}t</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
