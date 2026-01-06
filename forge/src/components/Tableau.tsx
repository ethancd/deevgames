import type { Card as CardType } from '../game/types';
import { Card } from './Card';

interface TableauProps {
  cards: CardType[];
  playerName: string;
}

export function Tableau({ cards, playerName }: TableauProps) {
  return (
    <div className="bg-gray-800 p-4 rounded-lg">
      <h3 className="text-white font-bold mb-2">{playerName}'s Tableau</h3>
      <div className="flex gap-2 overflow-x-auto">
        {cards.length === 0 ? (
          <div className="text-gray-500">No cards yet</div>
        ) : (
          cards.map(card => (
            <div key={card.id}>
              <Card card={card} faceUp={true} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
