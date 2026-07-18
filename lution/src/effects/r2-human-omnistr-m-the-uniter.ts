// Omniström the Uniter (r2-human-omnistr-m-the-uniter) -- designed by: human
//
// Effect text: "Keeper. Worth 1 point for every keeper in play."
//
// "Every keeper in play" counts ALL keepers currently in play across BOTH
// players (including this card itself), not just its owner's board -- this
// card rewards a crowded table regardless of who built it.

import type { AIGameView, CardEffect } from '../engine/types';
import type { CardInstance } from '../../shared/types';

function totalKeepersInPlay(view: AIGameView): number {
  return view.state.players.human.inPlay.length + view.state.players.claude.inPlay.length;
}

// Estimated point value of this specific instance: if it's already sitting
// in play, that's just the current total (it's already counted in there).
// If it's still in hand (being evaluated for chooseCardToPlay), the total
// after playing it is one higher than the current board.
function estimatedValue(view: AIGameView, instance: CardInstance): number {
  const alreadyInPlay =
    view.state.players.human.inPlay.some((i) => i.instanceId === instance.instanceId) ||
    view.state.players.claude.inPlay.some((i) => i.instanceId === instance.instanceId);
  const total = totalKeepersInPlay(view);
  return alreadyInPlay ? Math.max(total, 1) : total + 1;
}

const cardEffect: CardEffect = {
  cardId: 'r2-human-omnistr-m-the-uniter',
  cardType: 'keeper',
  // baseValue is 0 here -- its entire point value is dynamic and comes
  // from modifyScore below, so the flat base-score sum in
  // src/engine/api.ts's score() doesn't double-count it.
  baseValue: 0,

  hooks: {
    // Folded into EngineAPI.score() for the owner (side: 'owner' default)
    // whenever this card is in play. Adds 1 point for every keeper
    // currently in play on either side of the table, including itself.
    modifyScore: {
      scope: 'inPlay',
      handler: (ctx) => {
        const payload = ctx.event.payload as { score: number } | undefined;
        if (!payload) return;
        const human = ctx.api.getPlayer('human').inPlay.length;
        const claude = ctx.api.getPlayer('claude').inPlay.length;
        payload.score += human + claude;
      },
    },
  },

  strategy: {
    // Scales with total board state -- prioritize playing/keeping it once
    // the table already has a few keepers in play.
    playValue: estimatedValue,
    stealTargetValue: estimatedValue,
  },
};

export default cardEffect;
