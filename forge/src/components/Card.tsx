import type { Card as CardType, Faction } from '../game/types';

interface CardProps {
  card?: CardType;
  faceUp: boolean;
  isAvailable?: boolean;
  onClick?: () => void;
}

const factionColors: Record<Faction, string> = {
  'Crimson Covenant': 'bg-red-900 border-red-700',
  'Iron Tide': 'bg-gray-700 border-gray-500',
  'Void Legion': 'bg-purple-900 border-purple-700',
  'Silk Network': 'bg-yellow-700 border-yellow-500',
  'Dream Garden': 'bg-green-700 border-green-500',
  'Ghost Protocol': 'bg-gray-800 border-gray-600',
  'General': 'bg-gray-600 border-gray-400',
};

export function Card({ card, faceUp, isAvailable, onClick }: CardProps) {
  if (!card) {
    return (
      <div className="w-32 h-44 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500">
        Empty
      </div>
    );
  }

  const colorClass = factionColors[card.faction];
  const availableRing = isAvailable ? 'ring-4 ring-yellow-400' : '';
  const clickable = onClick ? 'cursor-pointer hover:scale-105 transition-transform' : '';

  if (!faceUp) {
    return (
      <div
        className={`w-32 h-44 ${colorClass} rounded-lg border-4 flex flex-col items-center justify-center ${clickable}`}
        onClick={onClick}
      >
        <div className="text-white text-sm mb-2">{card.faction}</div>
        <div className="text-white text-4xl">?</div>
      </div>
    );
  }

  return (
    <div
      className={`w-32 h-44 ${colorClass} rounded-lg border-4 p-2 flex flex-col ${clickable} ${availableRing}`}
      onClick={onClick}
    >
      <div className="text-white text-xs font-bold mb-1 truncate">{card.name}</div>
      <div className="text-gray-300 text-xs mb-1">Cost: {card.symbols}</div>
      {card.baseVP > 0 && (
        <div className="text-yellow-400 text-xs mb-1">VP: {card.baseVP}</div>
      )}
      {card.conditionalVP && (
        <div className="text-yellow-300 text-xs mb-1 line-clamp-2">
          {card.conditionalVP}
        </div>
      )}
      <div className="text-gray-400 text-xs mt-auto line-clamp-2">
        {card.game3Effect}
      </div>
    </div>
  );
}
