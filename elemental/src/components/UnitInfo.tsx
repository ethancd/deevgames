import type { Unit } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { getElementHex } from '../utils/colors';

interface UnitInfoProps {
  unit: Unit | null;
  onMine?: () => void;
  canMine?: boolean;
}

export function UnitInfo({ unit, onMine, canMine }: UnitInfoProps) {
  if (!unit) {
    return (
      <div className="p-3 bg-gray-800 rounded border border-gray-700">
        <div className="text-gray-500 text-sm">Select a unit to see details</div>
      </div>
    );
  }

  const def = getUnitDefinition(unit.definitionId);
  const color = getElementHex(def.element);

  return (
    <div className="p-3 bg-gray-800 rounded border border-gray-700">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
          style={{ backgroundColor: color }}
        >
          {def.tier}
        </div>
        <div>
          <div className="font-medium text-white">{def.name}</div>
          <div className="text-xs text-gray-400 capitalize">{def.element} T{def.tier}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div className="flex justify-between">
          <span className="text-gray-400">ATK</span>
          <span className="text-red-400 font-medium">{def.attack}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">DEF</span>
          <span className="text-blue-400 font-medium">{def.defense}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">SPD</span>
          <span className="text-green-400 font-medium">{def.speed}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">MINE</span>
          <span className="text-purple-400 font-medium">{def.mining}</span>
        </div>
      </div>

      {/* Action status */}
      <div className="flex gap-2 text-xs mb-3">
        <span className={unit.hasMoved ? 'text-gray-500' : 'text-green-400'}>
          {unit.hasMoved ? '✓ Moved' : '○ Move'}
        </span>
        <span className={unit.hasAttacked ? 'text-gray-500' : 'text-red-400'}>
          {unit.hasAttacked ? '✓ Attacked' : '○ Attack'}
        </span>
        <span className={unit.hasMined ? 'text-gray-500' : 'text-purple-400'}>
          {unit.hasMined ? '✓ Mined' : '○ Mine'}
        </span>
      </div>

      {/* Mine button */}
      {onMine && canMine && !unit.hasMined && unit.canActThisTurn && (
        <button
          onClick={onMine}
          className="w-full py-1 px-3 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors"
        >
          Mine Resources
        </button>
      )}
    </div>
  );
}
