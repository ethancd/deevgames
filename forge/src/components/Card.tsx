import type { Card as CardType, Faction } from '../game/types';

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
      <div className="w-32 h-44 min-w-[8rem] min-h-[11rem] border-2 border-dashed border-amber-900/30 rounded-lg flex items-center justify-center text-amber-800/50 font-serif animate-fadeIn">
        Empty
      </div>
    );
  }

  const styles = factionStyles[card.faction];
  const availableGlow = isAvailable ? 'animate-glow ring-2 ring-amber-500' : '';
  const clickable = onClick
    ? 'cursor-pointer hover:scale-105 hover:-translate-y-1 transition-all duration-200'
    : '';

  if (!faceUp) {
    return (
      <div
        className={`w-32 h-44 min-w-[8rem] min-h-[11rem] ${styles.faceDownBg} ${styles.border} rounded-lg border-2 flex flex-col items-center justify-center shadow-lg ${styles.glow} ${clickable} animate-fadeIn relative overflow-hidden`}
        onClick={onClick}
      >
        {/* Decorative corner accents */}
        <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-amber-600/50"></div>
        <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-amber-600/50"></div>
        <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-amber-600/50"></div>
        <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-amber-600/50"></div>

        <div className="text-amber-200/90 text-sm font-bold px-2 text-center" style={{ fontFamily: 'Cinzel, serif' }}>
          {card.faction}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-32 h-44 min-w-[8rem] min-h-[11rem] ${styles.faceUpBg} ${styles.border} rounded-lg border-2 p-2 flex flex-col shadow-lg ${styles.glow} ${clickable} ${availableGlow} animate-fadeIn relative overflow-hidden`}
      onClick={onClick}
      title={card.game3Effect || undefined}
    >
      {/* Decorative top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>

      {/* Card name - fixed height */}
      <div className="card-title text-stone-900 text-xs leading-tight mb-1 h-6 overflow-hidden font-bold">
        {card.name}
      </div>

      {/* Cost - bigger and bolder */}
      <div className="text-stone-800 text-base mb-2 font-black">
        {card.symbols || 'Free'}
      </div>

      {/* Conditional VP - fixed height with scroll */}
      {card.conditionalVP && (
        <div
          className="text-stone-700 text-[0.6rem] leading-tight mb-1 flex-1 overflow-y-auto"
          style={{ fontFamily: 'Crimson Pro, serif' }}
        >
          {card.conditionalVP}
        </div>
      )}

      {/* Spacer to push VP to bottom */}
      {!card.conditionalVP && <div className="flex-1"></div>}

      {/* VP in text box at bottom - centered */}
      {card.baseVP > 0 && (
        <div className="bg-stone-900/80 border border-stone-700 rounded px-2 py-1 text-center">
          <div className="text-amber-400 text-sm font-black" style={{ fontFamily: 'Cinzel, serif' }}>
            <span className="text-amber-500">★</span> {card.baseVP} VP
          </div>
        </div>
      )}

      {/* Decorative bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
    </div>
  );
}
