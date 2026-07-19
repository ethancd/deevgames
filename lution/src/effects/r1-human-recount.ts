// Recount (r1-human-recount) -- designed by: human
//
// Effect text: "When you play this card, draw 1 card, then your opponent
// discards 1 card from their hand."

import type { PlayerId } from '../../shared/types';
import type { CardEffect, ChoiceOption } from '../engine/types';

function opponentOf(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

const cardEffect: CardEffect = {
  cardId: 'r1-human-recount',
  cardType: 'action',
  baseValue: 0,

  hooks: {
    onPlay: {
      scope: 'inHand',
      side: 'owner',
      handler: async (ctx) => {
        await ctx.api.draw(ctx.owner, 1);

        const opponent = opponentOf(ctx.owner);
        const opponentHand = ctx.api.getPlayer(opponent).hand;
        // Nothing to discard if the opponent's hand is already empty --
        // don't call requestChoice/moveToDiscard with zero options.
        if (opponentHand.length === 0) return;

        const options: ChoiceOption[] = opponentHand.map((instance) => ({
          id: instance.instanceId,
          cardId: instance.cardId,
        }));

        const chosen = await ctx.api.requestChoice(opponent, {
          cardId: ctx.cardId,
          prompt: `${ctx.owner} played Recount -- choose 1 card from your hand to discard.`,
          options,
        });

        await ctx.api.moveToDiscard(opponent, chosen.id, 'hand');
      },
    },
  },

  strategy: {
    // A card that nets a draw and strips one opponent card is comfortably
    // above a vanilla 1-point keeper -- prioritize playing it.
    playValue: 2,
    // This is an action, not a keeper, so it's never itself a keep/steal
    // target -- baseValue (0) is a fine fallback.
    stealTargetValue: 0,
    // The choosing side is whoever is being forced to discard (the
    // opponent of whoever played this card). Prefer discarding a card that
    // has a duplicate elsewhere in hand, since losing one copy of a card
    // you hold multiple of is cheaper than losing your only copy of
    // something unique.
    choose: (view, options) => {
      const hand = view.state.players[view.self].hand;
      const counts = new Map<string, number>();
      for (const instance of hand) {
        counts.set(instance.cardId, (counts.get(instance.cardId) ?? 0) + 1);
      }
      const duplicate = options.find((option) => (counts.get(option.cardId as string) ?? 0) > 1);
      return duplicate ?? options[0];
    },
  },
};

export default cardEffect;
