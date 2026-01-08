// Oracle of Delve - Turn Timeline Component

import type { TurnQueueEntry, Enemy } from '../game/types';

interface TurnTimelineProps {
  turnQueue: TurnQueueEntry[];
  currentTurnIndex: number;
  enemies: Enemy[];
}

export function TurnTimeline({ turnQueue, currentTurnIndex, enemies }: TurnTimelineProps) {
  const currentTurn = turnQueue[currentTurnIndex];
  const isPlayerTurn = currentTurn.entityType === 'player';

  // Get display name for entity
  const getEntityName = (entry: TurnQueueEntry): string => {
    if (entry.entityType === 'player') return 'You';
    const enemy = enemies.find(e => e.id === entry.entityId);
    return enemy ? enemy.name : 'Enemy';
  };

  // Get emoji for entity
  const getEntityEmoji = (entry: TurnQueueEntry): string => {
    if (entry.entityType === 'player') return '⚔️';
    const enemy = enemies.find(e => e.id === entry.entityId);
    if (!enemy) return '👹';
    return enemy.name === 'Goblin' ? '👺' : '👹';
  };

  // Show current turn + next 3 turns
  const upcomingTurns = [];
  for (let i = 0; i < 4; i++) {
    const index = (currentTurnIndex + i) % turnQueue.length;
    upcomingTurns.push({ ...turnQueue[index], index: i });
  }

  return (
    <div className="mb-6">
      {/* Current Turn Indicator - FIXED HEIGHT */}
      <div
        className={`
          text-center py-4 px-6 rounded-xl border-2 font-bold text-lg mb-4
          transition-colors duration-300 min-h-[4rem] flex items-center justify-center
          ${isPlayerTurn
            ? 'bg-blue-900/40 border-blue-600/60 text-blue-300'
            : 'bg-red-900/40 border-red-600/60 text-red-300'
          }
        `}
      >
        <span className="inline-block w-full">
          {isPlayerTurn ? 'YOUR TURN' : `${getEntityName(currentTurn).toUpperCase()}'S TURN`}
          {!isPlayerTurn && <span className="ml-2">⏳</span>}
        </span>
      </div>

      {/* Upcoming Turns Timeline - FIXED HEIGHT */}
      <div className="bg-stone-900/40 border border-stone-700/50 rounded-lg p-3 min-h-[5rem]">
        <div className="text-xs text-stone-500 mb-2 font-bold uppercase tracking-wider">
          Turn Order
        </div>
        <div className="flex gap-2 items-center">
          {upcomingTurns.map((turn, idx) => {
            const isCurrent = idx === 0;
            const entityName = getEntityName(turn);
            const emoji = getEntityEmoji(turn);
            const isPlayer = turn.entityType === 'player';

            return (
              <div
                key={`${turn.entityId}-${idx}`}
                className={`
                  flex-1 text-center py-2 px-2 rounded-lg border-2 transition-all duration-300
                  min-h-[3rem] flex flex-col items-center justify-center
                  ${isCurrent
                    ? isPlayer
                      ? 'bg-blue-900/60 border-blue-500 scale-105'
                      : 'bg-red-900/60 border-red-500 scale-105'
                    : isPlayer
                    ? 'bg-blue-950/20 border-blue-900/30'
                    : 'bg-red-950/20 border-red-900/30'
                  }
                `}
              >
                <div className="text-xl leading-none mb-1">{emoji}</div>
                <div className={`text-xs font-bold leading-tight ${
                  isCurrent ? 'text-white' : 'text-stone-400'
                }`}>
                  {entityName}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
