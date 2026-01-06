import type { Card } from '../game/types';

interface CounterBidModalProps {
  card: Card;
  onCounter: () => void;
  onDecline: () => void;
}

export function CounterBidModal({ card, onCounter, onDecline }: CounterBidModalProps) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="glass-panel p-8 rounded-xl max-w-md w-full border-2 border-amber-600/40 shadow-2xl animate-slideIn">
        <h2
          className="text-3xl font-bold mb-6 text-center text-shadow-glow"
          style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)' }}
        >
          ⚔ Counter-Bid! ⚔
        </h2>

        <div className="mb-6 p-4 rounded-lg bg-amber-950/30 border border-amber-800/30">
          <div className="card-title text-amber-100 text-lg mb-3">{card.name}</div>
          <div className="text-amber-300/90 text-sm mb-3 leading-relaxed">
            Your opponent wants this card. Seize the opportunity to counter-bid and claim it for yourself!
          </div>
          <div className="text-amber-400 text-sm font-bold flex items-center gap-2">
            <span className="text-lg">★</span>
            Counter-bid cost: {card.symbols} + 1 any symbol
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onDecline}
            className="flex-1 glass-panel px-6 py-3 rounded-lg font-bold border-2 border-amber-900/30 hover:border-amber-700 transition-all"
            style={{ fontFamily: 'Cinzel, serif', color: 'var(--bronze)' }}
          >
            Decline
          </button>
          <button
            onClick={onCounter}
            className="flex-1 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 px-6 py-3 rounded-lg font-bold shadow-lg hover:shadow-amber-500/50 transition-all border-2 border-amber-500 animate-glow"
            style={{ fontFamily: 'Cinzel, serif' }}
          >
            Counter!
          </button>
        </div>
      </div>
    </div>
  );
}
