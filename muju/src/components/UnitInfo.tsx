import type { Unit, Cell } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { getElementHex } from '../utils/colors';
import { getPromotionCost, getPromotedDefinitionId, isMaxTier } from '../game/promotion';

interface UnitInfoProps {
  unit: Unit | null;
  previewDefinitionId?: string | null; // For showing stats of units not yet on board
  onMine?: () => void;
  canMine?: boolean;
  cellInfo?: Cell | null; // Cell unit is standing on (for mining depth feedback)
  // Promotion props
  isPlacePhase?: boolean;
  isActionPhase?: boolean; // True when in action phase (for showing mine button)
  resources?: number;
  onPromote?: () => void;
  isEnemyView?: boolean; // True when viewing enemy unit stats
}

export function UnitInfo({
  unit,
  previewDefinitionId,
  onMine,
  canMine,
  cellInfo,
  isPlacePhase = false,
  isActionPhase = false,
  resources = 0,
  onPromote,
  isEnemyView = false,
}: UnitInfoProps) {
  // Show preview stats if no unit but have a preview definition
  if (!unit && previewDefinitionId) {
    const def = getUnitDefinition(previewDefinitionId);
    const color = getElementHex(def.element);

    return (
      <div className="p-3 bg-gray-800 rounded border border-cyan-600">
        <div className="text-xs text-cyan-400 mb-2">Ready to Place</div>
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

        <div className="grid grid-cols-2 gap-2 text-sm">
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

        <div className="mt-3 text-xs text-cyan-400">
          Click a highlighted cell to place
        </div>
      </div>
    );
  }

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
    <div className={`p-3 bg-gray-800 rounded border ${isEnemyView ? 'border-red-600' : 'border-gray-700'}`}>
      {isEnemyView && (
        <div className="text-xs text-red-400 mb-2">Enemy Unit</div>
      )}
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
          {unit.damageTaken > 0 ? (
            <span>
              <span className="text-red-400 font-medium">{Math.max(0, def.defense - unit.damageTaken)}</span>
              <span className="text-gray-500"> / {def.defense}</span>
            </span>
          ) : (
            <span className="text-blue-400 font-medium">{def.defense}</span>
          )}
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

      {/* Action status - only for own units */}
      {!isEnemyView && (
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
      )}

      {/* Mine button - only for own units during action phase */}
      {!isEnemyView && isActionPhase && (() => {
        const canMineNow = onMine && canMine && !unit.hasMined && unit.canActThisTurn;
        const hasResources = cellInfo && cellInfo.resourceLayers > 0;
        const tooDeep = hasResources && !canMine && !unit.hasMined && unit.canActThisTurn;
        const requiredMining = cellInfo ? cellInfo.minedDepth + 1 : 0;

        if (canMineNow) {
          return (
            <button
              onClick={onMine}
              className="w-full py-1 px-3 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors"
            >
              Mine Resources
            </button>
          );
        }

        if (tooDeep) {
          return (
            <div>
              <button
                disabled
                className="w-full py-1 px-3 bg-gray-700 text-gray-500 text-sm rounded cursor-not-allowed"
              >
                Mine Resources
              </button>
              <div className="text-xs text-red-400 mt-1">
                Resources too deep — need Mining {requiredMining}+
              </div>
            </div>
          );
        }

        return null;
      })()}

      {/* Promotion section - only during place phase */}
      {isPlacePhase && unit.owner === 'player' && !isMaxTier(unit) && (() => {
        const cost = getPromotionCost(unit);
        const promotedDefId = getPromotedDefinitionId(unit);
        const promotedDef = promotedDefId ? getUnitDefinition(promotedDefId) : null;
        const canAffordPromotion = cost !== null && resources >= cost;
        const promotedColor = promotedDef ? getElementHex(promotedDef.element) : color;

        return (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="text-xs text-yellow-400 mb-2">Upgrade Available</div>
            {promotedDef && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: promotedColor }}
                  >
                    {promotedDef.tier}
                  </div>
                  <div>
                    <div className="font-medium text-white">{promotedDef.name}</div>
                    <div className="text-xs text-gray-400 capitalize">{promotedDef.element} T{promotedDef.tier}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="flex justify-between">
                    <span className="text-gray-400">ATK</span>
                    <span className="text-red-400 font-medium">{promotedDef.attack}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">DEF</span>
                    <span className="text-blue-400 font-medium">{promotedDef.defense}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">SPD</span>
                    <span className="text-green-400 font-medium">{promotedDef.speed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">MINE</span>
                    <span className="text-purple-400 font-medium">{promotedDef.mining}</span>
                  </div>
                </div>
              </>
            )}
            <button
              onClick={onPromote}
              disabled={!canAffordPromotion || !onPromote}
              className={`
                w-full py-1 px-3 text-sm rounded transition-colors
                ${canAffordPromotion
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              Upgrade ({cost} 💎)
            </button>
            {!canAffordPromotion && cost !== null && (
              <div className="text-xs text-red-400 mt-1">
                Need {cost - resources} more crystals
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
