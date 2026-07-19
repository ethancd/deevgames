import type { ReactElement } from 'react';
import type { Difficulty, NodeType } from '../engine';
import {
  SkullIcon,
  ShopIcon,
  RestIcon,
  DwellingIcon,
  AltarIcon,
  ShrineIcon,
} from '../chrome/icons';

// Stat/economy tiles use emoji glyphs; shop/boss tiles keep the engraved SVGs.
const TILE_EMOJI: Partial<Record<NodeType, string>> = {
  attack: '⚔️',
  defense: '🛡️',
  power: '✦',
  knowledge: '📖',
  xp: '★',
  gold: '⛃',
  mana: '🔮',
};

export function nodeIcon(type: NodeType): ReactElement {
  const e = TILE_EMOJI[type];
  if (e) return <span className="text-xl leading-none">{e}</span>;
  switch (type) {
    case 'boss':
      return <SkullIcon />;
    case 'dwelling':
      return <DwellingIcon />;
    case 'altar':
      return <AltarIcon />;
    case 'shrine':
      return <ShrineIcon />;
    case 'merchant':
      return <ShopIcon />;
    case 'rest':
      return <RestIcon />;
    default:
      return <span className="text-xl leading-none">◆</span>;
  }
}

export const NODE_LABEL: Record<NodeType, string> = {
  attack: '+Atk',
  defense: '+Def',
  power: '+Pow',
  knowledge: '+Know',
  xp: 'XP',
  gold: 'Gold',
  mana: 'Mana',
  dwelling: 'Dwelling',
  altar: 'Altar',
  shrine: 'Shrine',
  merchant: 'Merchant',
  rest: 'Rest',
  boss: 'Boss',
};

/** The colored "ring" backing for a guarded tile's difficulty (§27). Solid for
 *  bronze/silver/gold; an animated rainbow gradient for diamond. */
export const DIFFICULTY_RING: Record<Difficulty, string> = {
  bronze: 'bg-amber-700',
  silver: 'bg-slate-300',
  gold: 'bg-yellow-400',
  diamond: 'bg-gradient-to-br from-fuchsia-400 via-cyan-300 to-amber-300 animate-pulse',
};
