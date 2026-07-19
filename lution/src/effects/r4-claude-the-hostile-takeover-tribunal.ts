// The Hostile Takeover Tribunal (r4-claude-the-hostile-takeover-tribunal) --
// designed by: claude
//
// Effect text: "When you play this card, exchange your least valuable
// keeper for your opponent's most valuable keeper. If there's a tie for
// either, you choose which keeper is selected."

import type { PlayerId } from '../../shared/types';
import type { CardEffect, ChoiceOption, EngineAPI } from '../engine/types';

function opponentOf(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

// "Valuable" is judged the same way r2-claude-the-insolvency-clause's
// "most valuable keeper" is judged, extended with
// r2-claude-the-marginal-utility-magnate's precedent for treating a live
// score override (e.g. a frozen keeper -- see
// r1-human-bone-chilling-breeze) as authoritative over the plain registered
// baseValue, since that's what the instance is ACTUALLY contributing to
// score() right now.
function worthOf(
  api: Pick<EngineAPI, 'getScoreOverride' | 'getCardBaseValue'>,
  cardId: string,
  instanceId: string
): number {
  return api.getScoreOverride(instanceId) ?? api.getCardBaseValue(cardId);
}

const cardEffect: CardEffect = {
  cardId: 'r4-claude-the-hostile-takeover-tribunal',
  cardType: 'action',
  baseValue: 0,

  hooks: {
    onPlay: {
      scope: 'inHand',
      side: 'owner',
      handler: async (ctx) => {
        const opponent = opponentOf(ctx.owner);
        const ownKeepers = ctx.api.getPlayer(ctx.owner).inPlay;
        const opponentKeepers = ctx.api.getPlayer(opponent).inPlay;

        // An exchange needs a keeper on both sides -- nothing to give away
        // if the owner's board is empty, and nothing to take if the
        // opponent's is.
        if (ownKeepers.length === 0 || opponentKeepers.length === 0) {
          ctx.api.log({
            player: ctx.owner,
            type: 'flavor',
            message: `${ctx.owner}'s The Hostile Takeover Tribunal finds no keeper on one side of the table -- the takeover is called off.`,
          });
          return;
        }

        let minValue = Infinity;
        for (const instance of ownKeepers) {
          minValue = Math.min(minValue, worthOf(ctx.api, instance.cardId, instance.instanceId));
        }
        const leastValuable = ownKeepers.filter(
          (instance) => worthOf(ctx.api, instance.cardId, instance.instanceId) === minValue
        );

        let maxValue = -Infinity;
        for (const instance of opponentKeepers) {
          maxValue = Math.max(maxValue, worthOf(ctx.api, instance.cardId, instance.instanceId));
        }
        const mostValuable = opponentKeepers.filter(
          (instance) => worthOf(ctx.api, instance.cardId, instance.instanceId) === maxValue
        );

        // Ties are broken by the OWNER (the player who played this card)
        // for both sides, per the card text.
        let ownTarget = leastValuable[0];
        if (leastValuable.length > 1) {
          const options: ChoiceOption[] = leastValuable.map((instance) => ({
            id: instance.instanceId,
            cardId: instance.cardId,
          }));
          const chosen = await ctx.api.requestChoice(ctx.owner, {
            cardId: ctx.cardId,
            prompt: `Your Hostile Takeover Tribunal found a tie for your least valuable keeper -- choose 1 to give up.`,
            options,
          });
          ownTarget = leastValuable.find((instance) => instance.instanceId === chosen.id) ?? leastValuable[0];
        }

        let opponentTarget = mostValuable[0];
        if (mostValuable.length > 1) {
          const options: ChoiceOption[] = mostValuable.map((instance) => ({
            id: instance.instanceId,
            cardId: instance.cardId,
          }));
          const chosen = await ctx.api.requestChoice(ctx.owner, {
            cardId: ctx.cardId,
            prompt: `Your Hostile Takeover Tribunal found a tie for ${opponent}'s most valuable keeper -- choose 1 to seize.`,
            options,
          });
          opponentTarget = mostValuable.find((instance) => instance.instanceId === chosen.id) ?? mostValuable[0];
        }

        ctx.api.log({
          player: ctx.owner,
          type: 'flavor',
          message: `${ctx.owner}'s The Hostile Takeover Tribunal seizes ${opponent}'s ${opponentTarget.cardId} in exchange for ${ownTarget.cardId}.`,
        });

        // changeController moves each instance across; this is a one-for-one
        // swap so both moves happen regardless of order.
        await ctx.api.changeController(ownTarget.instanceId, ctx.owner, opponent);
        await ctx.api.changeController(opponentTarget.instanceId, opponent, ctx.owner);
      },
    },
  },

  strategy: {
    // The swap's real value is (what you seize - what you give up). Neither
    // side of AIGameView exposes a per-instance baseValue lookup (see
    // r2-claude-the-marginal-utility-magnate's estimateBonus comment), so
    // this approximates "opponent's most valuable keeper" with their whole
    // board total -- the same stand-in r2-claude-the-insolvency-clause's
    // playValue already uses for a single-target removal effect -- and
    // "your least valuable keeper" with your average keeper value, which
    // trends toward the low end without needing exact per-instance data.
    playValue: (view) => {
      const ownKeepers = view.state.players[view.self].inPlay;
      const opponentKeepers = view.state.players[view.opponent].inPlay;
      if (ownKeepers.length === 0 || opponentKeepers.length === 0) return 0.25;

      const opponentBest = view.score(view.opponent);
      const ownWorst = view.score(view.self) / ownKeepers.length;
      const net = opponentBest - ownWorst;
      return net > 0 ? 1 + net : 0.5;
    },
    // This is an action, not a keeper -- it's never itself a keep/steal
    // target, so the baseValue (0) fallback is fine.
    stealTargetValue: 0,
    // Every option offered to the owner is already tied for least/most
    // valuable by definition, so any pick costs/gains the same points --
    // take the first for determinism.
    choose: (_view, options) => options[0],
  },
};

export default cardEffect;
