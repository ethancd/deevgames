import type { ReactElement } from 'react';
import type { NodeType } from '../engine';
import {
  SwordIcon,
  SkullIcon,
  ShopIcon,
  RestIcon,
  FlameIcon,
  DwellingIcon,
  AltarIcon,
  ShrineIcon,
} from '../chrome/icons';

export function nodeIcon(type: NodeType): ReactElement {
  switch (type) {
    case 'combat':
      return <SwordIcon />;
    case 'elite':
      return <FlameIcon />;
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
  }
}

export const NODE_LABEL: Record<NodeType, string> = {
  combat: 'Combat',
  elite: 'Elite',
  boss: 'Boss',
  dwelling: 'Dwelling',
  altar: 'Altar',
  shrine: 'Shrine',
  merchant: 'Merchant',
  rest: 'Rest',
};
