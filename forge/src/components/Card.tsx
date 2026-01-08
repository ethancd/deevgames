import type { Card as CardType } from '../game/types';
import type { OriginalFaction } from '../skins/types';
import { useSkin } from '../skins/SkinContext';
import { emojifyConditionalVP, formatSymbolCost } from '../constants/emojis';

interface CardProps {
  card?: CardType;
  faceUp: boolean;
  isAvailable?: boolean;
  onClick?: () => void;
}

export function Card({ card, faceUp, isAvailable, onClick }: CardProps) {
  const { skin } = useSkin();

  if (!card) {
    return (
      <div className="w-24 h-24 min-w-[6rem] min-h-[6rem] border-2 border-dashed border-amber-900/30 rounded-lg flex items-center justify-center text-amber-800/50 font-serif animate-fadeIn">
        Empty
      </div>
    );
  }

  const factionTheme = skin.factions[card.faction as OriginalFaction];
  const factionEmoji = factionTheme?.emoji || '❓';
  const displayName = skin.cardNames?.[card.name] ?? card.name;
  const formattedCost = formatSymbolCost(card.symbols, skin.symbols);
  const formattedConditionalVP = emojifyConditionalVP(card.conditionalVP, skin);

  const availableGlow = isAvailable ? 'animate-glow ring-2 ring-amber-500' : '';
  const baseOpacity = onClick && isAvailable ? 'opacity-80' : '';
  const clickable = onClick
    ? 'cursor-pointer hover:opacity-100 transition-opacity duration-200'
    : '';

  if (!faceUp) {
    return (
      <div
        className={`w-24 h-24 min-w-[6rem] min-h-[6rem] ${factionTheme.faceDownBg} ${factionTheme.border} rounded-lg border-2 flex items-center justify-center shadow-lg ${factionTheme.glow} ${clickable} ${baseOpacity} animate-fadeIn relative overflow-hidden`}
        onClick={onClick}
      >
        {/* Faction emoji only */}
        <div className="text-5xl">{factionEmoji}</div>
      </div>
    );
  }

  return (
    <div
      className={`w-24 h-24 min-w-[6rem] min-h-[6rem] ${factionTheme.faceUpBg} ${factionTheme.border} rounded-lg border-2 p-1.5 flex flex-col shadow-lg ${factionTheme.glow} ${clickable} ${baseOpacity} ${availableGlow} animate-fadeIn relative overflow-hidden`}
      onClick={onClick}
      title={card.game3Effect || undefined}
    >
      {/* Top row: Name (truncated) + Faction emoji */}
      <div className="flex items-start justify-between mb-0.5">
        <div className="card-title text-[0.5rem] leading-tight font-bold flex-1 overflow-hidden line-clamp-2">
          {displayName}
        </div>
        <div className="text-base ml-0.5">{factionEmoji}</div>
      </div>

      {/* Cost - bigger and bolder with circumpunct */}
      <div className="text-xs font-black mb-0.5" style={{ color: 'var(--cosmic-star)' }}>
        {formattedCost}
      </div>

      {/* Conditional VP - emojified */}
      {formattedConditionalVP && (
        <div className="text-[0.45rem] leading-tight mb-0.5 flex-1 overflow-hidden" style={{ opacity: 0.8 }}>
          {formattedConditionalVP}
        </div>
      )}

      {/* Spacer to push VP to bottom */}
      {!formattedConditionalVP && <div className="flex-1"></div>}

      {/* VP in text box at bottom - "N ★" format */}
      {card.baseVP > 0 && (
        <div className="bg-stone-900/80 border border-stone-700 rounded px-1 py-0.5 text-center">
          <div className="text-amber-400 text-[0.5rem] font-black" style={{ fontFamily: 'var(--font-display)' }}>
            {card.baseVP} ★
          </div>
        </div>
      )}
    </div>
  );
}
