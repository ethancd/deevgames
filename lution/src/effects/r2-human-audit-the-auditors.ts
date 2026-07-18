// Audit the Auditors (r2-human-audit-the-auditors) -- designed by: human
//
// Effect text: "When you play this card, look at your opponent's hand, then
// discard 1 random card from it."

import type { PlayerId } from '../../shared/types';
import type { CardEffect } from '../engine/types';

function opponentOf(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

const cardEffect: CardEffect = {
  cardId: 'r2-human-audit-the-auditors',
  cardType: 'action',
  baseValue: 0,

  hooks: {
    onPlay: {
      scope: 'inHand',
      side: 'owner',
      handler: async (ctx) => {
        const opponent = opponentOf(ctx.owner);
        const opponentHand = ctx.api.getPlayer(opponent).hand;
        // Nothing to look at or discard if the opponent's hand is empty --
        // don't call moveToDiscard with no instance to target.
        if (opponentHand.length === 0) return;

        // "Look at your opponent's hand" has no other mechanical
        // consequence here (there's no concealed-hand mechanic to reveal
        // against), so it's represented as a flavor log entry naming every
        // card seen.
        ctx.api.log({
          player: ctx.owner,
          type: 'flavor',
          message: `${ctx.owner}'s Audit the Auditors audits ${opponent}'s hand: ${opponentHand
            .map((instance) => instance.cardId)
            .join(', ')}.`,
        });

        // "Discard 1 random card from it" -- ctx.api.rng is the same
        // seeded/deterministic RNG source used for deck shuffling, so this
        // stays reproducible given a fixed seed.
        const index = ctx.api.rng.int(opponentHand.length);
        const target = opponentHand[index];
        await ctx.api.moveToDiscard(opponent, target.instanceId, 'hand');
      },
    },
  },

  strategy: {
    // A guaranteed hand-disruption effect (peek + strip a random card) is a
    // bit above a vanilla 1-point keeper -- prioritize playing it.
    playValue: 2,
    // This is an action, not a keeper -- it's never itself a keep/steal
    // target, so the baseValue (0) fallback is fine.
    stealTargetValue: 0,
  },
};

export default cardEffect;
