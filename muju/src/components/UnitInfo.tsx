import type { Unit, Cell, PlayerId } from '../game/types';
import { getUnitDefinition, getNextTierDefinition } from '../game/units';
import { getPromotionCost, canPromote } from '../game/promotion';
import { calculateMiningYield } from '../game/mining';
import { canAttack, getAttackCount } from '../game/combat';
import { UnitArtwork } from './UnitArtwork';

interface UnitInfoProps {
  unit: Unit | null; previewDefinitionId?: string | null;
  onMine?: () => void; canMine?: boolean; cellInfo?: Cell | null;
  isPlacePhase?: boolean; isActionPhase?: boolean; resources?: number;
  onPromote?: () => void; isEnemyView?: boolean; onClose?: () => void;
  currentPlayer?: PlayerId; showEnemyRange?: boolean; onToggleEnemyRange?: () => void;
}
export function UnitInfo({ unit, previewDefinitionId, onMine, canMine, cellInfo, isPlacePhase, isActionPhase, resources = 0, onPromote, isEnemyView, onClose, currentPlayer, showEnemyRange, onToggleEnemyRange }: UnitInfoProps) {
  const def = unit ? getUnitDefinition(unit.definitionId) : previewDefinitionId ? getUnitDefinition(previewDefinitionId) : null;
  if (!def) return null;
  const next = unit ? getNextTierDefinition(unit.definitionId) : null;
  const cost = unit ? getPromotionCost(unit) : null;
  const upgrade = !!unit && canPromote(unit, { queue: [], crystals: resources });
  const mine = !!unit && canMine && unit.canActThisTurn;
  const mineYield = unit && cellInfo ? calculateMiningYield(unit, cellInfo) : 0;
  return <div className="unit-detail">
    <div className="unit-heading"><strong><UnitArtwork element={def.element} owner={unit?.owner ?? currentPlayer ?? 'white'} tier={def.tier} /> {def.name} <small>{def.element} · T{def.tier}{isEnemyView ? ' · Enemy' : ''}</small></strong><button aria-label="Deselect unit" onClick={onClose}>×</button></div>
    <div className="unit-stats"><span>Attack <b>{def.attack}</b></span><span>Defense <b>{Math.max(0, def.defense - (unit?.damageTaken ?? 0))}{unit?.damageTaken ? `/${def.defense}` : ''}</b></span><span>Speed <b>{def.speed}</b></span><span>Mining <b>{def.mining}</b></span></div>
    <div className="unit-action-row">
      {!unit ? <p>Tap a highlighted square to place.</p>
      : isEnemyView ? <><p>Inspect current movement reach.</p><button aria-pressed={showEnemyRange} onClick={onToggleEnemyRange}>{showEnemyRange ? 'Hide reach' : 'Show reach'}</button></>
      : isPlacePhase && unit.owner === currentPlayer ? <>
        <p>{unit.placedThisTurn ? 'Newly placed · upgrade next turn' : unit.promotedThisPlacement ? 'Already upgraded this placement' : next ? `${next.name}: ATK ${next.attack} · DEF ${next.defense} · SPD ${next.speed} · MINE ${next.mining}` : 'Maximum tier'}</p>
        {next && <button onClick={onPromote} disabled={!upgrade}>Upgrade · ◆ {cost}</button>}
      </> : isActionPhase ? <><p><span className="cleave-status" role="status">Attacks {getAttackCount(unit)}/{def.tier} · {!unit.canActThisTurn ? 'Ready next turn' : !canAttack(unit) ? 'Attacks finished' : getAttackCount(unit) > 0 ? 'Cleave ready · 1 action' : def.tier > 1 ? 'Kill to continue' : 'One attack this turn'}</span>{!unit.canActThisTurn ? 'Ready next turn' : mine ? `${cellInfo?.resourceLayers} left · next depth ${(cellInfo?.minedDepth ?? 0) + 1}` : cellInfo?.resourceLayers ? `Too deep · need Mining ${(cellInfo?.minedDepth ?? 0) + 1}` : 'This square is depleted'}</p><button onClick={onMine} disabled={!mine}>Mine +{mineYield} ◆</button></> : <p>Ready for the next action phase.</p>}
    </div>
  </div>;
}
