import type { Cell as CellType, Position } from '../game/types';

interface CellProps {
  cell: CellType;
  isValidMove: boolean;
  isValidAttack: boolean;
  isValidSpawn: boolean;
  isSelected: boolean;
  onClick: (position: Position) => void;
}

export function Cell({ cell, isValidMove, isValidAttack, isValidSpawn, isSelected, onClick }: CellProps) {
  const { position, resourceLayers } = cell;

  // Resource visualization: darker = more resources
  const resourceOpacity = resourceLayers / 5;
  const resourceColor = `rgba(139, 92, 246, ${resourceOpacity * 0.3})`; // Purple tint for resources

  let borderClass = 'border-gray-200';
  let bgClass = 'bg-gray-50';

  if (isSelected) {
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
    </div>
  );
}
