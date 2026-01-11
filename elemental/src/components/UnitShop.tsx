import { useState } from 'react';
import type { Element, BoardState, PlayerId } from '../game/types';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../game/units';
import {
  getBuildCost,
  getBuildTime,
  meetsTechRequirement,
  canAfford,
} from '../game/building';
import { getElementHex } from '../utils/colors';

const ELEMENT_EMOJI: Record<Element, string> = {
  fire: '🔥',
  lightning: '⚡',
  water: '💧',
  wind: '💨',
  plant: '🌿',
  metal: '⚙️',
};

const ELEMENT_ORDER: Element[] = ['fire', 'lightning', 'water', 'wind', 'plant', 'metal'];

interface UnitShopProps {
  resources: number;
  player: PlayerId;
  board: BoardState;
  onQueueUnit: (definitionId: string) => void;
}

export function UnitShop({ resources, player, board, onQueueUnit }: UnitShopProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const buildState = { queue: [], crystals: resources };

  // Group units by tier
  const unitsByTier: Record<number, typeof UNIT_DEFINITIONS> = {
    1: UNIT_DEFINITIONS.filter((d) => d.tier === 1),
    2: UNIT_DEFINITIONS.filter((d) => d.tier === 2),
    3: UNIT_DEFINITIONS.filter((d) => d.tier === 3),
    4: UNIT_DEFINITIONS.filter((d) => d.tier === 4),
  };

  // Sort each tier by element order
  for (const tier of [1, 2, 3, 4]) {
    unitsByTier[tier].sort(
      (a, b) => ELEMENT_ORDER.indexOf(a.element) - ELEMENT_ORDER.indexOf(b.element)
    );
  }

  const selectedDef = selectedId ? getUnitDefinition(selectedId) : null;
  const canAffordSelected = selectedId ? canAfford(buildState, selectedId) : false;
  const meetsTechSelected = selectedId
    ? meetsTechRequirement(selectedId, player, board)
    : false;
  const canBuildSelected = canAffordSelected && meetsTechSelected;

  const handleBuild = () => {
    if (selectedId && canBuildSelected) {
      onQueueUnit(selectedId);
      setSelectedId(null);
    }
  };

  return (
    <div className="p-3 bg-gray-800 rounded border border-gray-700">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm text-gray-400">Build Units</div>
        <div className="text-sm text-yellow-400">{resources} 💎</div>
      </div>

      {/* Unit Grid */}
      <div className="space-y-2 mb-3">
        {[1, 2, 3, 4].map((tier) => (
          <div key={tier} className="flex items-center gap-1">
            <span className="text-xs text-gray-500 w-6">T{tier}</span>
            <div className="flex gap-1">
              {unitsByTier[tier].map((def) => {
                const isSelected = selectedId === def.id;
                const affordable = canAfford(buildState, def.id);
                const hasTech = meetsTechRequirement(def.id, player, board);
                const isLocked = !hasTech;

                return (
                  <button
                    key={def.id}
                    onClick={() => setSelectedId(def.id)}
                    className={`
                      w-8 h-8 rounded flex items-center justify-center text-sm
                      transition-all duration-150
                      ${isSelected ? 'ring-2 ring-white scale-110' : ''}
                      ${isLocked ? 'opacity-40 grayscale' : ''}
                      ${!isLocked && !affordable ? 'opacity-60' : ''}
                      ${!isLocked && affordable ? 'hover:scale-105' : ''}
                    `}
                    style={{
                      backgroundColor: isLocked ? '#374151' : getElementHex(def.element),
                    }}
                    title={def.name}
                  >
                    {isLocked ? '🔒' : ELEMENT_EMOJI[def.element]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Selected Unit Details */}
      {selectedDef && (
        <div className="border-t border-gray-700 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{ELEMENT_EMOJI[selectedDef.element]}</span>
            <span className="text-white font-medium">{selectedDef.name}</span>
            <span className="text-gray-500 text-sm">
              ({selectedDef.element} T{selectedDef.tier})
            </span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 text-xs mb-2">
            <div className="text-center">
              <div className="text-gray-500">ATK</div>
              <div className="text-red-400 font-bold">{selectedDef.attack}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500">DEF</div>
              <div className="text-blue-400 font-bold">{selectedDef.defense}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500">SPD</div>
              <div className="text-green-400 font-bold">{selectedDef.speed}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500">MINE</div>
              <div className="text-yellow-400 font-bold">{selectedDef.mining}</div>
            </div>
          </div>

          <div className="text-xs text-gray-500 mb-2">
            Build time: {getBuildTime(selectedDef.id)} turn{getBuildTime(selectedDef.id) > 1 ? 's' : ''}
          </div>

          {/* Tech requirement status */}
          {!meetsTechSelected && (
            <div className="text-xs text-red-400 mb-2">
              Requires: {selectedDef.element} T{selectedDef.tier - 1}+ on board
            </div>
          )}
          {meetsTechSelected && selectedDef.tier > 1 && (
            <div className="text-xs text-green-400 mb-2">
              Requires: {selectedDef.element} T{selectedDef.tier - 1}+ ✓
            </div>
          )}

          {/* Build Button */}
          <button
            onClick={handleBuild}
            disabled={!canBuildSelected}
            className={`
              w-full py-2 rounded text-sm font-medium transition-colors
              ${canBuildSelected
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            Build ({getBuildCost(selectedDef.id)} 💎)
          </button>
        </div>
      )}

      {/* Empty state */}
      {!selectedDef && (
        <div className="text-xs text-gray-500 text-center py-2">
          Select a unit to see stats
        </div>
      )}
    </div>
  );
}
