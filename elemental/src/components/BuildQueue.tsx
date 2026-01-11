import type { QueuedUnit } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { getElementHex } from '../utils/colors';

interface BuildQueueProps {
  queue: QueuedUnit[];
  isOwner: boolean;
}

export function BuildQueue({ queue, isOwner }: BuildQueueProps) {
  if (!isOwner) {
    // Opponent's queue is hidden
    return (
      <div className="p-2 bg-gray-800 rounded border border-gray-700">
        <div className="text-xs text-gray-400 mb-1">Build Queue</div>
        <div className="text-gray-500 text-sm italic">Hidden</div>
      </div>
    );
  }

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
      <div className="space-y-1">
        {queue.map((item) => {
          const def = getUnitDefinition(item.definitionId);
          const color = getElementHex(def.element);

          return (
            <div
              key={item.id}
              className="flex items-center gap-2 text-sm"
            >
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
  );
}
