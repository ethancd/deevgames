import { useState } from 'react';
import type { Card as CardType } from '../game/types';
import { Card } from './Card';

interface CardModalProps {
  card: CardType;
  position: { x: number; y: number };
  onClose: () => void;
  onBurn: (pos: { x: number; y: number }) => void;
  onBuy: (pos: { x: number; y: number }) => void;
  canBuy: boolean;
}

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function CardModal({ card, position, onClose, onBurn, onBuy, canBuy }: CardModalProps) {
  const [burnConfirmState, setBurnConfirmState] = useState<'idle' | 'confirming'>('idle');
  const [imageError, setImageError] = useState(false);

  const cardImagePath = `/images/${toKebabCase(card.name)}.png`;

  const handleBurnClick = () => {
    if (burnConfirmState === 'idle') {
      setBurnConfirmState('confirming');
    } else {
      onBurn(position);
      onClose();
    }
  };

  const handleClickOutside = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
      setBurnConfirmState('idle');
    }
  };

  const handleBuyClick = () => {
    onBuy(position);
    // Don't call onClose() - onBuy will change the modal state
  };

  return (
    <>
      {/* Mobile: Centered overlay (≤768px) */}
      <div
        className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
        onClick={handleClickOutside}
      >
        <div className="glass-panel p-8 rounded-xl border-2 border-amber-900/30 shadow-2xl animate-slideIn max-w-sm mx-4">
          {/* Card display - larger */}
          <div className="flex justify-center mb-6">
            <div className="transform scale-150">
              <Card card={card} faceUp={true} />
            </div>
          </div>

          {/* Card Image */}
          {!imageError && (
            <div className="flex justify-center mb-6">
              <img
                src={cardImagePath}
                alt={card.name}
                className="max-w-full h-auto rounded-lg border-2 border-amber-900/30 shadow-lg"
                onError={() => setImageError(true)}
                style={{ maxHeight: '300px' }}
              />
            </div>
          )}

          {/* Card details */}
          <div className="text-center mb-6">
            <h2
              className="text-2xl font-bold mb-2"
              style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)' }}
            >
              {card.name}
            </h2>
            {card.game3Effect && (
              <p className="text-sm text-amber-600/80 mb-2">
                {card.game3Effect}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            {canBuy && (
              <button
                onClick={handleBuyClick}
                className="bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 px-6 py-3 rounded-lg font-bold shadow-lg hover:shadow-amber-500/50 transition-all duration-200 border-2 border-amber-500"
                style={{ fontFamily: 'Cinzel, serif' }}
              >
                Buy Card
              </button>
            )}
            <button
              onClick={handleBurnClick}
              className={`px-6 py-3 rounded-lg font-bold shadow-lg transition-all duration-200 border-2 ${
                burnConfirmState === 'confirming'
                  ? 'bg-gradient-to-r from-red-800 to-red-700 hover:from-red-700 hover:to-red-600 border-red-600 animate-glow'
                  : 'bg-gradient-to-r from-stone-700 to-stone-600 hover:from-stone-600 hover:to-stone-500 border-stone-500'
              }`}
              style={{ fontFamily: 'Cinzel, serif' }}
            >
              {burnConfirmState === 'confirming' ? '🔥 Confirm Burn 🔥' : 'Burn Card'}
            </button>
            <button
              onClick={onClose}
              className="glass-panel px-6 py-3 rounded-lg font-bold border-2 border-amber-900/30 hover:border-amber-700 transition-all"
              style={{ fontFamily: 'Cinzel, serif', color: 'var(--bronze)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Desktop: Side panel (>768px) */}
      <div
        className="hidden md:block fixed inset-0 z-50 pointer-events-none"
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
          onClick={handleClickOutside}
        />
        <div className="absolute top-0 right-0 h-full w-96 glass-panel border-l-2 border-amber-900/30 shadow-2xl animate-slideIn pointer-events-auto p-6 overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-amber-600 hover:text-amber-400 text-2xl"
          >
            ✕
          </button>

          {/* Card display */}
          <div className="flex justify-center mb-8 mt-8">
            <div className="transform scale-150">
              <Card card={card} faceUp={true} />
            </div>
          </div>

          {/* Card Image */}
          {!imageError && (
            <div className="flex justify-center mb-6">
              <img
                src={cardImagePath}
                alt={card.name}
                className="max-w-full h-auto rounded-lg border-2 border-amber-900/30 shadow-lg"
                onError={() => setImageError(true)}
                style={{ maxHeight: '400px' }}
              />
            </div>
          )}

          {/* Card details */}
          <div className="mb-6">
            <h2
              className="text-3xl font-bold mb-4 text-center"
              style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)' }}
            >
              {card.name}
            </h2>
            {card.game3Effect && (
              <div className="glass-panel p-4 rounded-lg border border-amber-900/30 mb-4">
                <h3
                  className="text-sm font-bold mb-2"
                  style={{ fontFamily: 'Cinzel, serif', color: 'var(--bronze)' }}
                >
                  Game 3 Effect:
                </h3>
                <p className="text-sm text-amber-600/80">
                  {card.game3Effect}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            {canBuy && (
              <button
                onClick={handleBuyClick}
                className="bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 px-6 py-3 rounded-lg font-bold shadow-lg hover:shadow-amber-500/50 transition-all duration-200 border-2 border-amber-500"
                style={{ fontFamily: 'Cinzel, serif' }}
              >
                Buy Card
              </button>
            )}
            <button
              onClick={handleBurnClick}
              className={`px-6 py-3 rounded-lg font-bold shadow-lg transition-all duration-200 border-2 ${
                burnConfirmState === 'confirming'
                  ? 'bg-gradient-to-r from-red-800 to-red-700 hover:from-red-700 hover:to-red-600 border-red-600 animate-glow'
                  : 'bg-gradient-to-r from-stone-700 to-stone-600 hover:from-stone-600 hover:to-stone-500 border-stone-500'
              }`}
              style={{ fontFamily: 'Cinzel, serif' }}
            >
              {burnConfirmState === 'confirming' ? '🔥 Confirm Burn 🔥' : 'Burn Card'}
            </button>
          </div>

          {/* Spacer at bottom */}
          <div className="h-8"></div>
        </div>
      </div>
    </>
  );
}
