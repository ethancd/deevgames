// Factory for the 20 seed keepers: a pure points-while-in-play Keeper with
// no hooks. Files starting with "_" are excluded from effect discovery
// (see src/engine/effectsLoader.ts), so this module itself is never treated
// as a card.

import type { CardId } from '../../shared/types';
import type { CardEffect } from '../engine/types';

export function makeStarterKeeper(cardId: CardId, points: number): CardEffect {
  return {
    cardId,
    cardType: 'keeper',
    baseValue: points,
    strategy: {
      playValue: points,
      stealTargetValue: points,
    },
  };
}
