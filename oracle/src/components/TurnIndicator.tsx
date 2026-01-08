// Oracle of Delve - Turn Indicator Component

import type { TurnQueueEntry, Enemy } from '../game/types';

interface TurnIndicatorProps {
  currentTurn: TurnQueueEntry;
  enemies: Enemy[];
}

export function TurnIndicator({ currentTurn, enemies }: TurnIndicatorProps) {
  const isPlayerTurn = currentTurn.entityType === 'player';

  let turnText = '';
  if (isPlayerTurn) {
    turnText = 'YOUR TURN';
  } else {
    const enemy = enemies.find(e => e.id === currentTurn.entityId);
    turnText = enemy ? `${enemy.name.toUpperCase()}'S TURN` : 'ENEMY TURN';
  }

  return (
    <div className={`
      text-center py-4 px-6 rounded-xl border-2 font-bold text-lg mb-6
      transition-all duration-300
      ${isPlayerTurn
        ? 'bg-blue-900/40 border-blue-600/60 text-blue-300 animate-pulse'
        : 'bg-red-900/40 border-red-600/60 text-red-300'
      }
    `}>
      {turnText}
      {!isPlayerTurn && <span className="ml-2">⏳</span>}
    </div>
  );
}
