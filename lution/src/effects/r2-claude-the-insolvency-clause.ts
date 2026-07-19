// The Insolvency Clause (r2-claude-the-insolvency-clause) -- designed by: claude
//
// Effect text: "When you play this card, destroy the opponent's most
// valuable keeper in play. If there's a tie, the opponent chooses which one
// is destroyed."

import type { PlayerId } from '../../shared/types';
import type { CardEffect, ChoiceOption } from '../engine/types';

function opponentOf(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

const cardEffect: CardEffect = {
  cardId: 'r2-claude-the-insolvency-clause',
  cardType: 'action',
  baseValue: 0,

  hooks: {
    onPlay: {
      scope: 'inHand',
      side: 'owner',
      handler: async (ctx) => {
        const opponent = opponentOf(ctx.owner);
        const opponentKeepers = ctx.api.getPlayer(opponent).inPlay;
        // Nothing to destroy if the opponent has no keepers in play.
        if (opponentKeepers.length === 0) return;

        // "Most valuable" is each keeper's registered base point value --
        // the same figure EngineAPI.score() sums across a player's board.
        // ctx.api.getCardBaseValue is the minimal, additive EngineAPI
        // lookup this card needed: HookHandlerContext otherwise only
        // exposes THIS card's own effect, never another card's baseValue.
        let maxValue = -Infinity;
        for (const instance of opponentKeepers) {
          maxValue = Math.max(maxValue, ctx.api.getCardBaseValue(instance.cardId));
        }
        const mostValuable = opponentKeepers.filter(
          (instance) => ctx.api.getCardBaseValue(instance.cardId) === maxValue
        );

        let target = mostValuable[0];
        if (mostValuable.length > 1) {
          // Tie: the OPPONENT (whose keeper is being destroyed) chooses
          // which tied instance goes, per the card text.
          const options: ChoiceOption[] = mostValuable.map((instance) => ({
            id: instance.instanceId,
            cardId: instance.cardId,
          }));
          const chosen = await ctx.api.requestChoice(opponent, {
            cardId: ctx.cardId,
            prompt: `${ctx.owner} played The Insolvency Clause -- your most valuable keepers are tied. Choose 1 to destroy.`,
            options,
          });
          target = mostValuable.find((instance) => instance.instanceId === chosen.id) ?? mostValuable[0];
        }

        ctx.api.log({
          player: ctx.owner,
          type: 'flavor',
          message: `${ctx.owner}'s The Insolvency Clause forecloses on ${opponent}'s ${target.cardId}.`,
        });
        await ctx.api.destroyKeeper(opponent, target.instanceId);
      },
    },
  },

  strategy: {
    // A one-sided removal effect that always hits the single best keeper on
    // the opponent's board is stronger than a vanilla 1-point keeper, and
    // scales with how valuable the opponent's board currently is -- a dead
    // card (low value) when the opponent has no keepers to hit yet.
    playValue: (view) => {
      const opponentTotal = view.score(view.opponent);
      return opponentTotal > 0 ? 2 + opponentTotal : 0.5;
    },
    // This is an action, not a keeper -- it's never itself a keep/steal
    // target, so the baseValue (0) fallback is fine.
    stealTargetValue: 0,
    // Resolves the OPPONENT's forced tie-break choice: every offered option
    // is already tied for most valuable, so any pick costs the same points
    // -- take the first for determinism.
    choose: (_view, options) => options[0],
  },
};

export default cardEffect;
