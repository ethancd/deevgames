import { upkeepForTier } from '../game/upkeep';
import { ElementIcon } from './ElementGlyph';
import { UnitArtwork } from './UnitArtwork';
import type { Element, BoardState, PlayerId } from '../game/types';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../game/units';
export const ELEMENT_SYMBOLS: Record<Element, string> = { fire: '🔥', lightning: '⚡', water: '💧', shadow: '🌑', plant: '🌿', metal: '⚙' };
interface UnitShopProps {
  resources: number; player: PlayerId; board: BoardState;
  selectedId: string | null; onSelectId: (id: string | null) => void;
  inspectOnly?: boolean;
}
export function UnitShop({ resources, player, selectedId, onSelectId, inspectOnly = false }: UnitShopProps) {
  const def = selectedId ? getUnitDefinition(selectedId) : getUnitDefinition('fire_1');
  const tier = inspectOnly ? def.tier : 1;
  return <div className={`unit-shop ${inspectOnly ? '' : 'purchase-shop'}`}>
    <div className="element-picker" role="group" aria-label={inspectOnly ? 'Unit element' : 'Buy tier 1'}>
      {UNIT_DEFINITIONS.filter(d => d.tier === tier).map(d => <button key={d.id}
        aria-label={`${inspectOnly ? 'Inspect' : 'Buy'} ${d.name}${inspectOnly ? '' : ` · ${d.cost} crystals`}`}
        disabled={!inspectOnly && resources < d.cost} aria-pressed={selectedId === d.id} onClick={() => onSelectId(d.id)}>
        <ElementIcon element={d.element} />{d.name}{!inspectOnly && <small>◆ {d.cost}</small>}
      </button>)}
    </div>
    {inspectOnly ? <>
      <div className="tier-picker" role="group" aria-label="Unit tier">{UNIT_DEFINITIONS.filter(d => d.element === def.element).map(d => <button key={d.id} aria-pressed={def.id === d.id} onClick={() => onSelectId(d.id)}>Tier {d.tier}</button>)}</div>
      <div className="shop-detail"><strong><span className="shop-piece-name"><UnitArtwork element={def.element} owner={player} tier={def.tier} />{def.name}</span><small>◆ {def.cost} total · rent {upkeepForTier(def.tier)}</small></strong>
        <div className="unit-stats"><span>Attack <b>{def.attack}</b></span><span>Defense <b>{def.defense}</b></span><span>Speed <b>{def.speed}</b></span><span>Mining <b>{def.mining}</b></span></div>
      </div><p>Buy tier 1. Promote in place on later turns; pay the cost difference.</p>
    </> : <p role="status">{selectedId ? `${def.name} · ATK ${def.attack} / DEF ${def.defense} / SPD ${def.speed} / Mining ${def.mining}. Tap a highlighted square to buy.` : 'Tap a unit to buy, then an empty square. Or select a piece to promote.'}</p>}
  </div>;
}
