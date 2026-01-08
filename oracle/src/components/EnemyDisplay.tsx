// Oracle of Delve - Enemy Display Component

import type { Enemy, DamageAnimation } from '../game/types';

interface EnemyDisplayProps {
  enemy: Enemy;
  onAttack: () => void;
  isPlayerTurn: boolean;
  damageAnimation?: DamageAnimation;
}

export function EnemyDisplay({ enemy, onAttack, isPlayerTurn, damageAnimation }: EnemyDisplayProps) {
  const isDead = enemy.hp <= 0;
  const hpPercentage = (enemy.hp / enemy.maxHP) * 100;

  return (
    <div className="relative">
      <button
        onClick={onAttack}
        disabled={!isPlayerTurn || isDead}
        style={{ height: '7.5rem', minWidth: '12rem' }}
        className={`
          w-full p-6 rounded-xl border-2 transition-all duration-200
          flex flex-col justify-center
          ${isDead
            ? 'bg-stone-900/30 border-stone-800/30 opacity-40'
            : isPlayerTurn
            ? 'bg-red-950/40 border-red-900/50 hover:border-red-700 hover:bg-red-950/60 active:scale-95 cursor-pointer'
            : 'bg-red-950/20 border-red-900/30 cursor-not-allowed'
          }
        `}
      >
        {/* Name - Fixed height */}
        <div style={{ minHeight: '1.75rem' }} className="text-xl font-bold mb-3 text-red-300 flex items-center justify-center">
          {enemy.name}
        </div>

        {/* HP Bar - Fixed height with text overlay */}
        <div className="w-full bg-stone-900/60 rounded-full h-6 mb-2 overflow-hidden relative">
          <div
            className="bg-gradient-to-r from-red-600 to-red-500 h-full transition-all duration-300"
            style={{ width: `${hpPercentage}%` }}
          />
          {/* HP text positioned absolutely so it doesn't affect bar width */}
          {enemy.hp > 0 && (
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white drop-shadow-lg">
              {enemy.hp} / {enemy.maxHP}
            </span>
          )}
        </div>

        {/* Status text - Fixed height */}
        <div style={{ minHeight: '1.25rem' }} className="text-stone-500 font-bold text-sm flex items-center justify-center">
          {isDead && '☠ DEFEATED ☠'}
        </div>
      </button>

      {damageAnimation && (
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                     text-4xl font-bold text-red-500 pointer-events-none animate-damage-float"
          key={damageAnimation.id}
        >
          -{damageAnimation.damage}
        </div>
      )}
    </div>
  );
}
