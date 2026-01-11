import type { Unit as UnitType } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { getElementHex } from '../utils/colors';

interface UnitProps {
  unit: UnitType;
  isSelected: boolean;
  isOwned: boolean;
  onClick: () => void;
}

export function Unit({ unit, isSelected, isOwned, onClick }: UnitProps) {
  const definition = getUnitDefinition(unit.definitionId);
  const color = getElementHex(definition.element);

  // Size based on tier
  const sizeClass = {
    1: 'w-6 h-6 sm:w-7 sm:h-7',
    2: 'w-7 h-7 sm:w-8 sm:h-8',
    3: 'w-8 h-8 sm:w-9 sm:h-9',
    4: 'w-9 h-9 sm:w-10 sm:h-10',
  }[definition.tier];

  const canAct = unit.canActThisTurn && (!unit.hasMoved || !unit.hasAttacked || !unit.hasMined);

  return (
    <div
      className={`
        ${sizeClass}
        rounded-full
        flex items-center justify-center
        cursor-pointer
        transition-all duration-150
        ${isSelected ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''}
        ${!canAct ? 'opacity-60' : 'hover:scale-105'}
        ${isOwned ? 'ring-1 ring-white' : 'ring-1 ring-black/30'}
      `}
      style={{ backgroundColor: color }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${definition.name} (T${definition.tier}) - ATK:${definition.attack} DEF:${definition.defense}`}
    >
      <span className="text-white font-bold text-xs sm:text-sm drop-shadow-md">
        {definition.tier}
      </span>
    </div>
  );
}
