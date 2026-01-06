import React from 'react';
import type { GridState } from '../game/types';
import { getAvailableCards } from '../game/grid';
import { Card } from './Card';
import { positionToKey } from '../game/adjacency';

interface GridProps {
  grid: GridState;
  onCardClick?: (x: number, y: number) => void;
}

export function Grid({ grid, onCardClick }: GridProps) {
  const { bounds } = grid;
  const available = getAvailableCards(grid);
  const availableSet = new Set(available.map(a => `${a.x},${a.y}`));

  const rows: React.ReactElement[] = [];

  for (let y = bounds.maxY; y >= bounds.minY; y--) {
    const cells: React.ReactElement[] = [];

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const key = positionToKey({ x, y });
      const cell = grid.cells.get(key);
      const isAvailable = availableSet.has(key);

      if (!cell) {
        cells.push(
          <div
            key={key}
            className="w-32 h-44 min-w-[8rem] min-h-[11rem] m-1 flex items-center justify-center"
          >
            {/* Empty space */}
          </div>
        );
      } else if (cell.type === 'empty') {
        cells.push(
          <div
            key={key}
            className="w-32 h-44 min-w-[8rem] min-h-[11rem] m-1 border-2 border-dashed border-amber-900/20 rounded-lg flex items-center justify-center text-amber-800/40 font-serif animate-fadeIn"
          >
            Empty
          </div>
        );
      } else if (cell.type === 'ruins') {
        cells.push(
          <div
            key={key}
            className="w-32 h-44 min-w-[8rem] min-h-[11rem] m-1 bg-gradient-to-br from-stone-950 to-stone-900 border-2 border-stone-800 rounded-lg flex items-center justify-center text-stone-600 font-bold text-sm animate-fadeIn shadow-lg relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-stone-700/10 to-transparent"></div>
            <span className="relative" style={{ fontFamily: 'Cinzel, serif' }}>
              RUINS
            </span>
          </div>
        );
      } else if (cell.type === 'card' && cell.card) {
        cells.push(
          <div key={key} className="m-1">
            <Card
              card={cell.card}
              faceUp={cell.faceUp}
              isAvailable={isAvailable}
              onClick={isAvailable && onCardClick ? () => onCardClick(x, y) : undefined}
            />
          </div>
        );
      }
    }

    rows.push(
      <div key={y} className="flex justify-center">
        {cells}
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 rounded-xl overflow-auto max-h-[700px] shadow-2xl">
      <div className="inline-block">{rows}</div>
    </div>
  );
}
