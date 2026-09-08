import type { Unit as UnitType } from '../game/types';
import { getUnitDefinition } from '../game/units';
import { UnitArtwork } from './UnitArtwork';

export function Unit({ unit, isSelected }: { unit: UnitType; isSelected: boolean }) {
  const definition = getUnitDefinition(unit.definitionId);
  return <div className={`unit-token tier-${definition.tier} ${isSelected ? 'piece-selected' : ''} ${!unit.canActThisTurn ? 'piece-resting' : ''}`}
    title={`${unit.owner === 'white' ? 'Ivory' : 'Obsidian'} ${definition.name} · Tier ${definition.tier} · Attack ${definition.attack} · Defense ${Math.max(0, definition.defense - unit.damageTaken)}`}>
    <UnitArtwork element={definition.element} owner={unit.owner} tier={definition.tier} />
    {unit.damageTaken > 0 && <span className="piece-damage" aria-label={`${unit.damageTaken} damage`}>−{unit.damageTaken}</span>}
  </div>;
}
