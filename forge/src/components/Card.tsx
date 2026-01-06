import type { Card as CardType, Faction } from '../game/types';

interface CardProps {
  card?: CardType;
  faceUp: boolean;
  isAvailable?: boolean;
  onClick?: () => void;
}

const factionStyles: Record<Faction, { bg: string; border: string; glow: string }> = {
  'Crimson Covenant': {
    bg: 'bg-gradient-to-br from-red-950 to-red-900',
    border: 'border-red-700',
    glow: 'shadow-red-900/50',
  },
  'Iron Tide': {
    bg: 'bg-gradient-to-br from-slate-800 to-slate-700',
    border: 'border-slate-500',
    glow: 'shadow-slate-700/50',
  },
  'Void Legion': {
    bg: 'bg-gradient-to-br from-purple-950 to-purple-900',
    border: 'border-purple-600',
    glow: 'shadow-purple-900/50',
  },
  'Silk Network': {
    bg: 'bg-gradient-to-br from-amber-900 to-yellow-800',
    border: 'border-amber-600',
    glow: 'shadow-amber-800/50',
  },
  'Dream Garden': {
    bg: 'bg-gradient-to-br from-emerald-950 to-emerald-800',
    border: 'border-emerald-600',
    glow: 'shadow-emerald-900/50',
  },
  'Ghost Protocol': {
    bg: 'bg-gradient-to-br from-gray-900 to-gray-800',
    border: 'border-gray-600',
    glow: 'shadow-gray-800/50',
  },
  'General': {
    bg: 'bg-gradient-to-br from-stone-800 to-stone-700',
    border: 'border-stone-500',
    glow: 'shadow-stone-700/50',
  },
};

export function Card({ card, faceUp, isAvailable, onClick }: CardProps) {
  if (!card) {
    return (
      <div className="w-40 h-56 min-w-[10rem] min-h-[14rem] border-2 border-dashed border-amber-900/30 rounded-lg flex items-center justify-center text-amber-800/50 font-serif animate-fadeIn">
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
        className={`w-40 h-56 min-w-[10rem] min-h-[14rem] ${styles.bg} ${styles.border} rounded-lg border-2 flex flex-col items-center justify-center shadow-lg ${styles.glow} ${clickable} animate-fadeIn relative overflow-hidden`}
        onClick={onClick}
      >
        {/* Decorative corner accents */}
        <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-amber-600/50"></div>
        <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-amber-600/50"></div>
        <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-amber-600/50"></div>
        <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-amber-600/50"></div>

        <div className="text-amber-300/80 text-xs font-serif mb-3 px-2 text-center">
          {card.faction}
        </div>
        <div className="text-amber-200 text-5xl opacity-70">?</div>
      </div>
    );
  }

  return (
    <div
      className={`w-40 h-56 min-w-[10rem] min-h-[14rem] ${styles.bg} ${styles.border} rounded-lg border-2 p-3 flex flex-col shadow-lg ${styles.glow} ${clickable} ${availableGlow} animate-fadeIn relative overflow-hidden`}
      onClick={onClick}
    >
      {/* Decorative top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>

      {/* Card name - fixed height */}
      <div className="card-title text-amber-100 text-sm leading-tight mb-2 h-8 overflow-hidden">
        {card.name}
      </div>

      {/* Cost */}
      <div className="text-amber-300/90 text-xs mb-2 font-medium">
        {card.symbols || 'Free'}
      </div>

      {/* VP */}
      {card.baseVP > 0 && (
        <div className="text-amber-400 text-xs font-bold mb-2 flex items-center gap-1">
          <span className="text-amber-500">★</span> {card.baseVP} VP
        </div>
      )}

      {/* Conditional VP - fixed height with scroll */}
      {card.conditionalVP && (
        <div
          className="text-amber-200/80 text-xs leading-tight mb-2 h-12 overflow-y-auto"
          style={{ fontFamily: 'Crimson Pro, serif' }}
        >
          {card.conditionalVP}
        </div>
      )}

      {/* Game 3 Effect - fixed height, bottom aligned */}
      <div
        className="text-slate-300/70 text-xs leading-tight mt-auto h-10 overflow-y-auto"
        style={{ fontFamily: 'Crimson Pro, serif', fontSize: '0.65rem' }}
      >
        {card.game3Effect || '—'}
      </div>

      {/* Decorative bottom accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
    </div>
  );
}
