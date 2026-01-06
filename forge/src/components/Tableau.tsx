import type { Card as CardType } from '../game/types';
import { Card } from './Card';

interface TableauProps {
  cards: CardType[];
  playerName: string;
}

export function Tableau({ cards, playerName }: TableauProps) {
  return (
    <div className="glass-panel p-5 rounded-xl border-2 border-amber-900/30 shadow-lg animate-fadeIn">
      <h3
        className="font-bold mb-3 text-lg"
        style={{ fontFamily: 'Cinzel, serif', color: 'var(--bronze)' }}
      >
        {playerName}'s Tableau
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.length === 0 ? (
          <div className="text-amber-800/50 italic" style={{ fontFamily: 'Crimson Pro, serif' }}>
            No cards yet
          </div>
        ) : (
          cards.map(card => (
            <div key={card.id} className="flex-shrink-0">
              <Card card={card} faceUp={true} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
