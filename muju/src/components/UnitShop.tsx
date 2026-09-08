import { ElementIcon } from './ElementGlyph';
import { UnitArtwork } from './UnitArtwork';
import { useState } from 'react';
import type { Element, BoardState, PlayerId } from '../game/types';
import { UNIT_DEFINITIONS, getUnitDefinition } from '../game/units';
import { canBuildUnit, meetsTechRequirement } from '../game/building';
export const ELEMENT_SYMBOLS: Record<Element, string> = { fire: '🔥', lightning: '⚡', water: '💧', shadow: '🌑', plant: '🌿', metal: '⚙' };
const elements: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
interface UnitShopProps {
  resources: number; player: PlayerId; board: BoardState;
  onQueueUnit?: (id: string) => void; selectedId: string | null; onSelectId: (id: string | null) => void;
  inspectOnly?: boolean; onClose?: () => void;
}
export function UnitShop({ resources, player, board, onQueueUnit, selectedId, onSelectId, inspectOnly = false }: UnitShopProps) {
  const [lastBuilt, setLastBuilt] = useState('');
  const def = selectedId ? getUnitDefinition(selectedId) : UNIT_DEFINITIONS.find(d => d.element === 'fire' && d.tier === 1)!;
  const select = (element: Element, tier: number) => { setLastBuilt(''); onSelectId(UNIT_DEFINITIONS.find(d => d.element === element && d.tier === tier)!.id); };
  const hasTech = meetsTechRequirement(def.id, player, board);
  const buildable = canBuildUnit(def.id, player, board, { queue: [], crystals: resources });
  return <div className="unit-shop">
    <div className="element-picker" role="group" aria-label="Unit element">{elements.map(element => <button key={element} aria-pressed={def.element === element} onClick={() => select(element, def.tier)}><ElementIcon element={element} />{element}</button>)}</div>
    <div className="tier-picker" role="group" aria-label="Unit tier">{[1, 2, 3, 4].map(tier => <button key={tier} aria-pressed={def.tier === tier} onClick={() => select(def.element, tier)}>Tier {tier}{!meetsTechRequirement(UNIT_DEFINITIONS.find(d => d.element === def.element && d.tier === tier)!.id, player, board) ? ' · 🔒' : ''}</button>)}</div>
    <div className="shop-detail"><strong><span className="shop-piece-name"><UnitArtwork element={def.element} owner={player} tier={def.tier} />{def.name}</span> <small>◆ {def.cost} · {def.buildTime} turn{def.buildTime !== 1 ? 's' : ''}</small></strong><div className="unit-stats"><span>Attack <b>{def.attack}</b></span><span>Defense <b>{def.defense}</b></span><span>Speed <b>{def.speed}</b></span><span>Mining <b>{def.mining}</b></span></div></div>
    <div className="shop-action"><p role="status">{lastBuilt || (!hasTech ? `Needs ${def.element} Tier ${def.tier - 1}+ on board` : resources < def.cost && !inspectOnly ? `Need ${def.cost - resources} more crystals` : 'Build now · place on a later turn')}</p>
      {!inspectOnly && <button className="primary" disabled={!buildable} onClick={() => { onQueueUnit?.(def.id); setLastBuilt(`${def.name} queued`); }}>Build · ◆ {def.cost}</button>}
    </div>
  </div>;
}
