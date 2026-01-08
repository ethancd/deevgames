// Oracle of Delve - Player Display Component

import type { Player, DamageAnimation } from '../game/types';

interface PlayerDisplayProps {
  player: Player;
  damageAnimation?: DamageAnimation;
}

export function PlayerDisplay({ player, damageAnimation }: PlayerDisplayProps) {
  const hpPercentage = (player.hp / player.maxHP) * 100;
  const isLowHP = hpPercentage < 30;

  return (
    <div style={{ height: '8rem' }} className="relative bg-blue-950/40 border-2 border-blue-900/50 rounded-xl p-6 flex flex-col justify-center">
      {/* Name - Fixed height */}
      <div style={{ minHeight: '1.75rem' }} className="text-xl font-bold mb-3 text-blue-300 flex items-center justify-center">
        ⚔ You ⚔
      </div>

      {/* HP Bar - Fixed height with text overlay */}
      <div className="w-full bg-stone-900/60 rounded-full h-8 overflow-hidden relative">
        <div
          className={`h-full transition-all duration-300 ${
            isLowHP
              ? 'bg-gradient-to-r from-orange-600 to-red-600 animate-pulse'
              : 'bg-gradient-to-r from-blue-600 to-blue-500'
          }`}
          style={{ width: `${hpPercentage}%` }}
        />
        {/* HP text positioned absolutely so it doesn't affect bar width */}
        {player.hp > 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-white drop-shadow-lg">
            {player.hp} / {player.maxHP} HP
          </span>
        )}
      </div>

      {/* Status text - Fixed height */}
      <div style={{ minHeight: '1.5rem' }} className="mt-2 text-red-500 font-bold text-center flex items-center justify-center">
        {player.hp <= 0 && '☠ DEFEATED ☠'}
      </div>

      {damageAnimation && (
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                     text-5xl font-bold text-orange-500 pointer-events-none animate-damage-float"
          key={damageAnimation.id}
        >
          -{damageAnimation.damage}
        </div>
      )}
    </div>
  );
}
