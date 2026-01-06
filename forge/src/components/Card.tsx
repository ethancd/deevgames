import type { Card as CardType, Faction } from '../game/types';
import { FACTION_EMOJIS, emojifyConditionalVP, formatSymbolCost } from '../constants/emojis';

interface CardProps {
  card?: CardType;
  faceUp: boolean;
  isAvailable?: boolean;
  onClick?: () => void;
}

const factionStyles: Record<
  Faction,
  { faceUpBg: string; faceDownBg: string; border: string; glow: string }
> = {
  'Crimson Covenant': {
    faceUpBg: 'bg-red-950/20',
    faceDownBg: 'bg-gradient-to-br from-red-950 to-red-900',
    border: 'border-red-700',
    glow: 'shadow-red-900/50',
  },
  'Iron Tide': {
    faceUpBg: 'bg-slate-700/20',
    faceDownBg: 'bg-gradient-to-br from-slate-800 to-slate-700',
    border: 'border-slate-500',
    glow: 'shadow-slate-700/50',
  },
  'Void Legion': {
    faceUpBg: 'bg-purple-950/20',
    faceDownBg: 'bg-gradient-to-br from-black via-purple-950 to-black',
    border: 'border-purple-600',
    glow: 'shadow-purple-900/50',
  },
  'Silk Network': {
    faceUpBg: 'bg-amber-800/20',
    faceDownBg: 'bg-gradient-to-br from-amber-900 to-yellow-800',
    border: 'border-amber-600',
    glow: 'shadow-amber-800/50',
  },
  'Dream Garden': {
    faceUpBg: 'bg-teal-900/20',
    faceDownBg: 'bg-gradient-to-br from-teal-950 to-teal-800',
    border: 'border-teal-600',
    glow: 'shadow-teal-900/50',
  },
  'Ghost Protocol': {
    faceUpBg: 'bg-slate-700/20',
    faceDownBg: 'bg-gradient-to-br from-slate-900 to-slate-800',
    border: 'border-slate-500',
    glow: 'shadow-slate-800/50',
  },
  'General': {
    faceUpBg: 'bg-stone-700/20',
    faceDownBg: 'bg-gradient-to-br from-stone-800 to-stone-700',
    border: 'border-stone-500',
    glow: 'shadow-stone-700/50',
  },
};

export function Card({ card, faceUp, isAvailable, onClick }: CardProps) {
  if (!card) {
    return (
      <div className="w-24 h-24 min-w-[6rem] min-h-[6rem] border-2 border-dashed border-amber-900/30 rounded-lg flex items-center justify-center text-amber-800/50 font-serif animate-fadeIn">
        Empty
      </div>
    );
  }

  const styles = factionStyles[card.faction];
  const factionEmoji = FACTION_EMOJIS[card.faction as keyof typeof FACTION_EMOJIS] || '❓';
  const formattedCost = formatSymbolCost(card.symbols);
  const formattedConditionalVP = emojifyConditionalVP(card.conditionalVP);

  const availableGlow = isAvailable ? 'animate-glow ring-2 ring-amber-500' : '';
  const baseOpacity = onClick && isAvailable ? 'opacity-80' : '';
  const clickable = onClick
    ? 'cursor-pointer hover:opacity-100 transition-opacity duration-200'
    : '';

  if (!faceUp) {
    return (
      <div
        className={`w-24 h-24 min-w-[6rem] min-h-[6rem] ${styles.faceDownBg} ${styles.border} rounded-lg border-2 flex items-center justify-center shadow-lg ${styles.glow} ${clickable} ${baseOpacity} animate-fadeIn relative overflow-hidden`}
        onClick={onClick}
      >
        {/* Faction emoji only */}
        <div className="text-5xl">{factionEmoji}</div>
      </div>
    );
  }

  return (
    <div
      className={`w-24 h-24 min-w-[6rem] min-h-[6rem] ${styles.faceUpBg} ${styles.border} rounded-lg border-2 p-1.5 flex flex-col shadow-lg ${styles.glow} ${clickable} ${baseOpacity} ${availableGlow} animate-fadeIn relative overflow-hidden`}
      onClick={onClick}
      title={card.game3Effect || undefined}
    >
      {/* Top row: Name (truncated) + Faction emoji */}
      <div className="flex items-start justify-between mb-0.5">
        <div className="card-title text-stone-900 text-[0.5rem] leading-tight font-bold flex-1 overflow-hidden line-clamp-2">
          {card.name}
        </div>
        <div className="text-base ml-0.5">{factionEmoji}</div>
      </div>

      {/* Cost - bigger and bolder with circumpunct */}
      <div className="text-stone-800 text-xs font-black mb-0.5">
        {formattedCost}
      </div>

      {/* Conditional VP - emojified */}
      {formattedConditionalVP && (
        <div className="text-stone-700 text-[0.45rem] leading-tight mb-0.5 flex-1 overflow-hidden">
          {formattedConditionalVP}
        </div>
      )}

      {/* Spacer to push VP to bottom */}
      {!formattedConditionalVP && <div className="flex-1"></div>}

      {/* VP in text box at bottom - "N ★" format */}
      {card.baseVP > 0 && (
        <div className="bg-stone-900/80 border border-stone-700 rounded px-1 py-0.5 text-center">
          <div className="text-amber-400 text-[0.5rem] font-black" style={{ fontFamily: 'Cinzel, serif' }}>
            {card.baseVP} ★
          </div>
        </div>
      )}
    </div>
  );
}
