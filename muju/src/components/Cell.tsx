import type { Cell as CellType, Position } from '../game/types';

interface CellProps {
  cell: CellType;
  isValidMove: boolean;
  isValidAttack: boolean;
  isValidSpawn: boolean;
  isSelected: boolean;
  elementalBonus?: number; // -1, 0, or +1 for attack targets
  isInvalidSpawn?: boolean; // Show red X for invalid spawn click
  isPendingMove?: boolean; // Show pending partial movement
  onClick: (position: Position) => void;
}

export function Cell({ cell, isValidMove, isValidAttack, isValidSpawn, isSelected, elementalBonus, isInvalidSpawn, isPendingMove, onClick }: CellProps) {
  const { position, resourceLayers } = cell;

  // Resource visualization: amber coloring based on depth (0-5)
  // Colors progress from gray (depleted) to rich amber (full)
  const resourceBgColors = [
    'bg-gray-200', // 0 = depleted
    'bg-amber-100', // 1
    'bg-amber-200', // 2
    'bg-amber-300', // 3
    'bg-amber-400', // 4
    'bg-amber-500', // 5 = full
  ];

  let borderClass = 'border-gray-300';
  let bgClass = resourceBgColors[resourceLayers] || resourceBgColors[0];

  // Override background for special states
  if (isInvalidSpawn) {
    borderClass = 'border-red-500 border-2';
    bgClass = 'bg-red-200';
  } else if (isPendingMove) {
    borderClass = 'border-yellow-500 border-2';
    bgClass = 'bg-yellow-200';
  } else if (isSelected) {
    borderClass = 'border-blue-500 border-2';
    bgClass = 'bg-blue-200';
  } else if (isValidMove) {
    borderClass = 'border-blue-400 border-2';
    // Keep amber background visible but add blue tint
  } else if (isValidAttack) {
    borderClass = 'border-red-400 border-2';
    // Keep amber background visible but add red tint
  } else if (isValidSpawn) {
    borderClass = 'border-cyan-400 border-2';
    // Keep amber background visible
  }

  return (
    <div
      className={`
        w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16
        border ${borderClass} ${bgClass}
        flex items-center justify-center
        cursor-pointer hover:brightness-95
        transition-all duration-150
        relative
      `}
      onClick={() => onClick(position)}
      data-testid={`cell-${position.x}-${position.y}`}
    >
      {/* Resource indicator */}
      {resourceLayers > 0 && (
        <span className="absolute bottom-0.5 right-0.5 text-[10px] text-amber-900 font-mono font-bold">
          {resourceLayers}
        </span>
      )}

      {/* Elemental bonus indicator for attack targets */}
      {isValidAttack && elementalBonus !== undefined && elementalBonus !== 0 && (
        <span
          className={`
            absolute top-0.5 left-0.5 text-[10px] font-bold
            ${elementalBonus > 0 ? 'text-green-600' : 'text-red-600'}
          `}
        >
          ⚔️{elementalBonus > 0 ? '+1' : '-1'}
        </span>
      )}

      {/* Invalid spawn indicator */}
      {isInvalidSpawn && (
        <span className="absolute inset-0 flex items-center justify-center text-2xl text-red-600 font-bold">
          ✕
        </span>
      )}

      {/* Pending move indicator */}
      {isPendingMove && (
        <span className="absolute inset-0 flex items-center justify-center text-lg text-yellow-700 font-bold">
          ●
        </span>
      )}
    </div>
  );
}
