import { useState } from 'react';
import type { Card, SymbolPool, SymbolCost } from '../game/types';
import { validatePayment } from '../game/payment';

interface BidModalProps {
  card: Card;
  availableSymbols: SymbolPool;
  requiredCost: SymbolCost;
  onConfirm: (payment: SymbolPool) => void;
  onCancel: () => void;
  title?: string;
}

export function BidModal({
  card,
  availableSymbols,
  requiredCost,
  onConfirm,
  onCancel,
  title = 'Buy Card',
}: BidModalProps) {
  const [payment, setPayment] = useState<SymbolPool>({
    mars: requiredCost.mars,
    venus: requiredCost.venus,
    mercury: requiredCost.mercury,
    moon: requiredCost.moon,
  });

  const isValid = validatePayment(payment, availableSymbols, requiredCost);

  const adjust = (symbol: keyof SymbolPool, delta: number) => {
    setPayment(prev => ({
      ...prev,
      [symbol]: Math.max(0, Math.min(availableSymbols[symbol], prev[symbol] + delta)),
    }));
  };

  const symbolIcons: Record<keyof SymbolPool, string> = {
    mars: '♂',
    venus: '♀',
    mercury: '☿',
    moon: '☽',
  };

  const symbolColors: Record<keyof SymbolPool, string> = {
    mars: 'var(--mars)',
    venus: 'var(--venus)',
    mercury: 'var(--mercury)',
    moon: 'var(--moon)',
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
      <div className="glass-panel p-8 rounded-xl max-w-md w-full border-2 border-amber-600/30 shadow-2xl animate-slideIn">
        <h2
          className="text-3xl font-bold mb-6 text-center"
          style={{ fontFamily: 'Cinzel, serif', color: 'var(--gold)' }}
        >
          {title}
        </h2>
        <div className="mb-6 p-4 rounded-lg bg-amber-950/30 border border-amber-800/30">
          <div className="card-title text-amber-100 text-lg mb-2">{card.name}</div>
          <div className="text-amber-300/90 text-sm mb-1">Required: {card.symbols}</div>
          <div className="text-amber-400/80 text-sm">
            Total:{' '}
            {requiredCost.mars + requiredCost.venus + requiredCost.mercury + requiredCost.moon + requiredCost.any}{' '}
            symbols
          </div>
        </div>

        <div className="mb-6">
          <div
            className="font-bold mb-3 text-lg"
            style={{ fontFamily: 'Cinzel, serif', color: 'var(--bronze)' }}
          >
            Pay with:
          </div>

          {(['mars', 'venus', 'mercury', 'moon'] as const).map(symbol => (
            <div key={symbol} className="flex items-center justify-between mb-3">
              <span className="font-medium flex items-center gap-2" style={{ color: symbolColors[symbol] }}>
                <span className="text-xl">{symbolIcons[symbol]}</span>
                {symbol.charAt(0).toUpperCase() + symbol.slice(1)}:
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => adjust(symbol, -1)}
                  className="glass-panel px-3 py-1 rounded border border-amber-800/30 hover:border-amber-600 transition-colors font-bold"
                  style={{ color: 'var(--bronze)' }}
                >
                  −
                </button>
                <span className="w-10 text-center font-bold text-lg" style={{ color: 'var(--gold)' }}>
                  {payment[symbol]}
                </span>
                <button
                  onClick={() => adjust(symbol, 1)}
                  className="glass-panel px-3 py-1 rounded border border-amber-800/30 hover:border-amber-600 transition-colors font-bold"
                  style={{ color: 'var(--bronze)' }}
                >
                  +
                </button>
                <span className="text-amber-700 text-sm min-w-[3rem]">/ {availableSymbols[symbol]}</span>
              </div>
            </div>
          ))}

          <div className="mt-5 text-center text-sm font-bold">
            {isValid ? (
              <span className="text-emerald-400">✓ Valid payment</span>
            ) : (
              <span className="text-red-400">✗ Invalid payment</span>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 glass-panel px-6 py-3 rounded-lg font-bold border-2 border-amber-900/30 hover:border-amber-700 transition-all"
            style={{ fontFamily: 'Cinzel, serif', color: 'var(--bronze)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(payment)}
            disabled={!isValid}
            className="flex-1 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 px-6 py-3 rounded-lg font-bold shadow-lg disabled:from-stone-800 disabled:to-stone-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all border-2 border-amber-500 disabled:border-stone-600"
            style={{ fontFamily: 'Cinzel, serif' }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
