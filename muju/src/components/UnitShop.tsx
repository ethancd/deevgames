import { upkeepForTier } from '../game/upkeep';
import { ElementIcon } from './ElementGlyph';
import { UnitArtwork } from './UnitArtwork';
import type { Element, BoardState, PlayerId } from '../game/types';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../game/units';
import { MICRO_CATALOGUE } from '../game/micro';
export const ELEMENT_SYMBOLS: Record<Element, string> = { fire: '🔥', lightning: '⚡', water: '💧', shadow: '🌑', plant: '🌿', metal: '⚙' };
interface UnitShopProps {
  resources: number; player: PlayerId; board: BoardState;
  selectedId: string | null; onSelectId: (id: string | null) => void;
  inspectOnly?: boolean; phasing?: boolean;
  /** MICRO MUJU: only its three tier-1 pieces, no promotion or rent. */
  micro?: boolean;
}
export function UnitShop({ resources, player, selectedId, onSelectId, inspectOnly = false, phasing = false, micro = false }: UnitShopProps) {
  const def = selectedId ? getUnitDefinition(selectedId) : getUnitDefinition('fire_1');
  const tier = inspectOnly ? def.tier : 1;
  return <div className={`unit-shop ${inspectOnly ? '' : 'purchase-shop'}`}>
    <div className="element-picker" role="group" aria-label={inspectOnly ? 'Unit element' : micro ? 'Summon a piece' : 'Buy tier 1'}>
      {UNIT_DEFINITIONS.filter(d => d.tier === tier && (!micro || MICRO_CATALOGUE.includes(d.id))).map(d => <button key={d.id}
        aria-label={`${inspectOnly ? 'Inspect' : phasing ? 'Summon' : 'Buy'} ${d.name}${inspectOnly ? '' : ` · ${d.cost} crystals`}`}
        disabled={!inspectOnly && resources < d.cost} aria-pressed={selectedId === d.id} onClick={() => onSelectId(d.id)}>
        <ElementIcon element={d.element} />{d.name}{!inspectOnly && <small>◆ {d.cost}</small>}
      </button>)}
    </div>
    {inspectOnly && micro ? <>
      <div className="shop-detail"><strong><span className="shop-piece-name"><UnitArtwork element={def.element} owner={player} tier={1} />{def.name}</span><small>◆ {def.cost}</small></strong>
        <div className="unit-stats"><span>Attack <b>{def.attack}</b></span><span>Defense <b>{def.defense}</b></span><span>Speed <b>{def.speed}</b></span><span>Mining <b>{def.mining}</b></span></div>
      </div><p>MICRO MUJU uses only Hi, Sjór and Muju. No promotions, no upkeep.</p>
    </> : inspectOnly ? <>
      <div className="tier-picker" role="group" aria-label="Unit tier">{UNIT_DEFINITIONS.filter(d => d.element === def.element).map(d => <button key={d.id} aria-pressed={def.id === d.id} onClick={() => onSelectId(d.id)}>Tier {d.tier}</button>)}</div>
      <div className="shop-detail"><strong><span className="shop-piece-name"><UnitArtwork element={def.element} owner={player} tier={def.tier} />{def.name}</span><small>◆ {def.cost} total · rent {upkeepForTier(def.tier)}</small></strong>
        <div className="unit-stats"><span>Attack <b>{def.attack}</b></span><span>Defense <b>{def.defense}</b></span><span>Speed <b>{def.speed}</b></span><span>Mining <b>{def.mining}</b></span></div>
      </div><p>Buy tier 1. Promote in place on later turns; pay the cost difference.</p>
    </> : <p role="status">{selectedId ? `${def.name} · ATK ${def.attack} / DEF ${def.defense} / SPD ${def.speed} / Mining ${def.mining}. ${phasing ? 'Choose a square: pay now, arrive next turn if still legal; otherwise full refund.' : 'Tap a highlighted square to buy.'}` : micro ? 'Choose Hi, Sjór or Muju, then a highlighted square. Pay now; it arrives next turn if still legal, otherwise full refund.' : phasing ? 'Choose a tier-1 piece and commit its square. Or select a materialized piece to promote.' : 'Tap a unit to buy, then an empty square. Or select a piece to promote.'}</p>}
  </div>;
}
