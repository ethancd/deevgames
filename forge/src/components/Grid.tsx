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
            className="w-32 h-44 m-1 flex items-center justify-center text-gray-700 text-xs"
          >
            {/* Empty space */}
          </div>
        );
      } else if (cell.type === 'empty') {
        cells.push(
          <div
            key={key}
            className="w-32 h-44 m-1 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center text-gray-500"
          >
            Empty
          </div>
        );
      } else if (cell.type === 'ruins') {
        cells.push(
          <div
            key={key}
            className="w-32 h-44 m-1 bg-gray-900 border-4 border-gray-800 rounded-lg flex items-center justify-center text-gray-600 font-bold"
          >
            RUINS
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
    <div className="bg-gray-950 p-4 rounded-lg overflow-auto max-h-[600px]">
      <div className="inline-block">{rows}</div>
    </div>
  );
}
