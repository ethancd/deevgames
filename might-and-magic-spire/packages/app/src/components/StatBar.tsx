// Reusable stat readouts for the top HUD across screens. The army redesign
// retires the HP bar (the hero has no hp; the army roster IS the life total) in
// favour of mana, the four primary stats, and an army-size pip.
import type { ReactNode } from 'react';
import { GoldIcon } from '../chrome/icons';
import type { PrimaryStat, Stack } from '../engine';

export function GoldPip({ gold }: { gold: number }) {
  return (
    <div className="flex items-center gap-1 text-bone-100" aria-label={`Gold ${gold}`}>
      <GoldIcon className="text-amber-300/80" />
      <span className="font-display text-xs tabular-nums">{gold}</span>
    </div>
  );
}

// Mana — Knowledge fills the pool, Power scales spell magnitude. A cold scrying
// bar in verdigris.
export function ManaPip({ mana, maxMana }: { mana: number; maxMana: number }) {
  const pct = maxMana > 0 ? Math.max(0, Math.min(100, (mana / maxMana) * 100)) : 0;
  return (
    <div className="flex items-center gap-1.5" aria-label={`Mana ${mana} of ${maxMana}`}>
      <span className="font-display text-[0.6rem] tracking-widest text-verd-300">MANA</span>
      <div className="relative h-3 w-20 overflow-hidden rounded-sm border border-grave-600 bg-grave-900">
        <div
          className="h-full bg-gradient-to-r from-verd-700 via-verd-500 to-verd-300 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-display text-xs tabular-nums text-bone-100">
        {mana}/{maxMana}
      </span>
    </div>
  );
}

const STAT_GLYPH: Record<PrimaryStat, string> = {
  attack: 'A',
  defense: 'D',
  power: 'P',
  knowledge: 'K',
};
const STAT_LABEL: Record<PrimaryStat, string> = {
  attack: 'Attack',
  defense: 'Defense',
  power: 'Power',
  knowledge: 'Knowledge',
};
const STAT_TONE: Record<PrimaryStat, string> = {
  attack: 'border-blood-500 text-blood-400',
  defense: 'border-verd-500 text-verd-300',
  power: 'border-necro-400/60 text-necro-400',
  knowledge: 'border-bone-400/50 text-bone-100',
};

// One primary-stat chip (A/D/P/K) — a struck-bronze seal.
export function StatPip({ stat, value }: { stat: PrimaryStat; value: number }) {
  return (
    <div
      data-testid="stat-pip"
      data-stat={stat}
      aria-label={`${STAT_LABEL[stat]} ${value}`}
      className={`flex items-center gap-1 rounded-sm border bg-grave-900/70 px-1.5 py-0.5 ${STAT_TONE[stat]}`}
    >
      <span className="font-display text-[0.7rem] font-bold leading-none">{STAT_GLYPH[stat]}</span>
      <span className="font-display text-xs tabular-nums leading-none text-bone-100">{value}</span>
    </div>
  );
}

// Army size — how many living creatures stand under your banner (life total).
export function ArmyPip({ army }: { army: Stack[] }) {
  const creatures = army.reduce((sum, s) => sum + s.count, 0);
  const stacks = army.filter((s) => s.count > 0).length;
  return (
    <div
      className="flex items-center gap-1 text-bone-100"
      aria-label={`Army: ${creatures} creatures in ${stacks} stacks`}
    >
      <span className="font-display text-[0.6rem] tracking-widest text-verd-300">ARMY</span>
      <span className="font-display text-xs tabular-nums">{creatures}</span>
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
