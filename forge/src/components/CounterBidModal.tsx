import type { Card } from '../game/types';

interface CounterBidModalProps {
  card: Card;
  onCounter: () => void;
  onDecline: () => void;
}

export function CounterBidModal({ card, onCounter, onDecline }: CounterBidModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full">
        <h2 className="text-2xl font-bold text-white mb-4">Counter-Bid Opportunity!</h2>

        <div className="text-white mb-4">
          <div className="font-bold mb-2">{card.name}</div>
          <div className="text-sm text-gray-400 mb-2">
            Your opponent wants this card. You can counter-bid to steal it!
          </div>
          <div className="text-sm text-yellow-400">
            Counter-bid cost: Original cost + 1 any symbol
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onDecline}
            className="flex-1 bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Let Them Have It
          </button>
          <button
            onClick={onCounter}
            className="flex-1 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-500"
          >
            Counter-Bid!
          </button>
        </div>
      </div>
    </div>
  );
}
