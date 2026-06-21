import type { ReactElement } from 'react';
import type { NodeType } from '../engine';
import {
  SwordIcon,
  SkullIcon,
  QuestionIcon,
  ShopIcon,
  RestIcon,
  FlameIcon,
} from '../chrome/icons';

export function nodeIcon(type: NodeType): ReactElement {
  switch (type) {
    case 'combat':
      return <SwordIcon />;
    case 'elite':
      return <FlameIcon />;
    case 'boss':
      return <SkullIcon />;
    case 'event':
      return <QuestionIcon />;
    case 'shop':
      return <ShopIcon />;
    case 'rest':
      return <RestIcon />;
  }
}

export const NODE_LABEL: Record<NodeType, string> = {
  combat: 'Combat',
  elite: 'Elite',
  boss: 'Boss',
  event: 'Event',
  shop: 'Shop',
  rest: 'Rest',
};
