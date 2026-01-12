import type { Cell as CellType, Position } from '../game/types';

interface CellProps {
  cell: CellType;
  isValidMove: boolean;
  isValidAttack: boolean;
  isValidSpawn: boolean;
  isSelected: boolean;
  elementalBonus?: number; // -1, 0, or +1 for attack targets
  isInvalidSpawn?: boolean; // Show red X for invalid spawn click
  onClick: (position: Position) => void;
}

export function Cell({ cell, isValidMove, isValidAttack, isValidSpawn, isSelected, elementalBonus, isInvalidSpawn, onClick }: CellProps) {
  const { position, resourceLayers } = cell;

  // Resource visualization: darker = more resources
  const resourceOpacity = resourceLayers / 5;
  const resourceColor = `rgba(139, 92, 246, ${resourceOpacity * 0.3})`; // Purple tint for resources

  let borderClass = 'border-gray-200';
  let bgClass = 'bg-gray-50';

  if (isInvalidSpawn) {
    borderClass = 'border-red-500 border-2';
    bgClass = 'bg-red-100';
  } else if (isSelected) {
    borderClass = 'border-blue-500 border-2';
    bgClass = 'bg-blue-100';
  } else if (isValidMove) {
    borderClass = 'border-green-400';
    bgClass = 'bg-green-100';
  } else if (isValidAttack) {
    borderClass = 'border-red-400';
    bgClass = 'bg-red-100';
  } else if (isValidSpawn) {
    borderClass = 'border-cyan-400';
    bgClass = 'bg-cyan-100';
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
      style={{ backgroundColor: resourceLayers > 0 ? resourceColor : undefined }}
      onClick={() => onClick(position)}
      data-testid={`cell-${position.x}-${position.y}`}
    >
      {/* Resource indicator */}
      {resourceLayers > 0 && (
        <span className="absolute bottom-0.5 right-0.5 text-[10px] text-purple-600 font-mono">
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
    </div>
  );
}
