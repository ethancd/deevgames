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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full">
        <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
        <div className="text-white mb-4">
          <div className="font-bold mb-2">{card.name}</div>
          <div className="text-sm text-gray-400 mb-2">Required: {card.symbols}</div>
          <div className="text-sm text-gray-400">
            Total cost: {requiredCost.mars + requiredCost.venus + requiredCost.mercury + requiredCost.moon + requiredCost.any}{' '}
            symbols
          </div>
        </div>

        <div className="mb-4">
          <div className="text-white font-bold mb-2">Pay with:</div>

          {(['mars', 'venus', 'mercury', 'moon'] as const).map(symbol => (
            <div key={symbol} className="flex items-center justify-between mb-2">
              <span className="text-white">{symbol.charAt(0).toUpperCase() + symbol.slice(1)}:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjust(symbol, -1)}
                  className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600"
                >
                  -
                </button>
                <span className="text-white w-8 text-center">{payment[symbol]}</span>
                <button
                  onClick={() => adjust(symbol, 1)}
                  className="bg-gray-700 px-3 py-1 rounded hover:bg-gray-600"
                >
                  +
                </button>
                <span className="text-gray-500 text-sm">/{availableSymbols[symbol]}</span>
              </div>
            </div>
          ))}

          <div className="mt-4 text-sm">
            {isValid ? (
              <span className="text-green-400">✓ Valid payment</span>
            ) : (
              <span className="text-red-400">✗ Invalid payment</span>
            )}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(payment)}
            disabled={!isValid}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
