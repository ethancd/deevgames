// Reusable stat readouts (HP, gold) used in the top HUD across screens.
import type { ReactNode } from 'react';
import { HeartIcon, GoldIcon } from '../chrome/icons';

export function HpPip({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div className="flex items-center gap-1.5" aria-label={`Health ${hp} of ${maxHp}`}>
      <HeartIcon className="text-blood-400" />
      <div className="relative h-3 w-20 overflow-hidden rounded-sm border border-grave-600 bg-grave-900">
        <div
          className="h-full bg-gradient-to-r from-blood-500 to-blood-400 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-display text-xs tabular-nums text-bone-100">
        {hp}/{maxHp}
      </span>
    </div>
  );
}

export function GoldPip({ gold }: { gold: number }) {
  return (
    <div className="flex items-center gap-1 text-bone-100" aria-label={`Gold ${gold}`}>
      <GoldIcon className="text-amber-300/80" />
      <span className="font-display text-xs tabular-nums">{gold}</span>
    </div>
  );
}

export function HudShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-verd-700 bg-grave-800/90 px-3 py-2 backdrop-blur">
      {children}
    </div>
  );
}
