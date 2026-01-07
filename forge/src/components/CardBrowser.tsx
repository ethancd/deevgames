import { useMemo } from 'react';
import { loadCards } from '../game/cardLoader';
import { FACTION_EMOJIS } from '../constants/emojis';
import type { Card as CardType, Faction } from '../game/types';

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const FACTION_ORDER: Faction[] = [
  'Crimson Covenant',
  'Iron Tide',
  'Void Legion',
  'Silk Network',
  'Dream Garden',
  'Ghost Protocol',
  'General',
];

const factionColors: Record<Faction, string> = {
  'Crimson Covenant': 'border-red-700 bg-red-950/30',
  'Iron Tide': 'border-slate-500 bg-slate-800/30',
  'Void Legion': 'border-purple-600 bg-purple-950/30',
  'Silk Network': 'border-amber-600 bg-amber-900/30',
  'Dream Garden': 'border-teal-600 bg-teal-950/30',
  'Ghost Protocol': 'border-slate-500 bg-slate-900/30',
  'General': 'border-stone-500 bg-stone-800/30',
};

interface CardsByFaction {
  faction: Faction;
  cards: CardType[];
}

export function CardBrowser() {
  const cardsByFaction = useMemo(() => {
    const allCards = loadCards();

    const grouped: CardsByFaction[] = FACTION_ORDER.map(faction => ({
      faction,
      cards: allCards
        .filter(c => c.faction === faction)
        .sort((a, b) => a.cost - b.cost),
    }));

    return grouped;
  }, []);

  return (
    <div className="min-h-screen p-8 animate-fadeIn">
      <div className="container mx-auto max-w-[1800px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1
            className="text-5xl font-bold tracking-wider text-shadow-glow"
            style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)' }}
          >
            Card Gallery
          </h1>
          <a
            href="#/"
            className="glass-panel px-6 py-3 rounded-lg font-bold hover:border-amber-500 border-2 border-amber-900/30 transition-all duration-200 shadow-lg hover:shadow-amber-500/30"
            style={{ fontFamily: 'Cinzel, serif', color: 'var(--bronze)' }}
          >
            Back to Game
          </a>
        </div>

        {/* Factions */}
        {cardsByFaction.map(({ faction, cards }) => (
          <div key={faction} className="mb-12">
            {/* Faction Header */}
            <div className={`glass-panel p-4 rounded-t-xl border-2 ${factionColors[faction]}`}>
              <h2
                className="text-3xl font-bold flex items-center gap-3"
                style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)' }}
              >
                <span className="text-4xl">{FACTION_EMOJIS[faction]}</span>
                {faction}
                <span className="text-lg text-amber-600/60 ml-2">({cards.length} cards)</span>
              </h2>
            </div>

            {/* Cards Grid */}
            <div className={`glass-panel p-6 rounded-b-xl border-2 border-t-0 ${factionColors[faction]}`}>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                {cards.map(card => (
                  <CardBrowserItem key={card.id} card={card} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardBrowserItem({ card }: { card: CardType }) {
  const imagePath = `/images/${toKebabCase(card.name)}.png`;

  return (
    <div className="glass-panel p-2 rounded-lg border border-amber-900/30 hover:border-amber-600/50 transition-all">
      {/* Card Image */}
      <div className="mb-2 rounded overflow-hidden border border-amber-900/30">
        <img
          src={imagePath}
          alt={card.name}
          className="w-full h-auto aspect-square object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      {/* Card Details */}
      <div className="text-center">
        <h3
          className="text-xs font-bold leading-tight mb-1 line-clamp-2"
          style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)' }}
        >
          {card.name}
        </h3>
        <div className="text-[0.65rem] text-amber-600/80">
          Cost {card.cost} | {card.baseVP} VP
        </div>
      </div>
    </div>
  );
}
