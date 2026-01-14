import type { Unit as UnitType } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { getElementHexForPlayer } from '../utils/colors';

interface UnitProps {
  unit: UnitType;
  isSelected: boolean;
  isOwned: boolean;
  onClick: () => void;
}

export function Unit({ unit, isSelected, isOwned, onClick }: UnitProps) {
  const definition = getUnitDefinition(unit.definitionId);
  const color = getElementHexForPlayer(definition.element, unit.owner);

  // Size based on tier
  const sizeClass = {
    1: 'w-6 h-6 sm:w-7 sm:h-7',
    2: 'w-7 h-7 sm:w-8 sm:h-8',
    3: 'w-8 h-8 sm:w-9 sm:h-9',
    4: 'w-9 h-9 sm:w-10 sm:h-10',
  }[definition.tier];

  const canAct = unit.canActThisTurn;
  const isDamaged = unit.damageTaken > 0;
  const effectiveDefense = Math.max(0, definition.defense - unit.damageTaken);

  return (
    <div
      className={`
        ${sizeClass}
        rounded-full
        flex items-center justify-center
        cursor-pointer
        transition-all duration-150
        relative
        ${isSelected ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''}
        ${!canAct ? 'opacity-60' : 'hover:scale-105'}
        ${isOwned ? 'ring-2 ring-white' : 'ring-2 ring-black'}
        ${isDamaged ? 'ring-2 ring-red-500' : ''}
      `}
      style={{ backgroundColor: color }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${definition.name} (T${definition.tier}) - ATK:${definition.attack} DEF:${effectiveDefense}${isDamaged ? `/${definition.defense}` : ''}`}
    >
      <span className="text-white font-bold text-xs sm:text-sm drop-shadow-md">
        {definition.tier}
      </span>

      {/* Damage indicator */}
      {isDamaged && (
        <span className="absolute -bottom-1 -right-1 bg-red-600 text-white text-[8px] px-1 rounded font-bold">
          -{unit.damageTaken}
        </span>
      )}
    </div>
  );
}
