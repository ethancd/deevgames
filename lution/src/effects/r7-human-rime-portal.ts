// Rime Portal (r7-human-rime-portal) -- designed by: human
//
// Effect text: "Freeze all cards in your hand; they can't be played. Then
// find a card in your deck and play it."
//
// "Freeze all cards in your hand ... can't be played" is exactly
// r5-human-frost-pact's hand-freeze primitive (EngineAPI.freezeHandCard /
// isHandCardFrozen), just applied to the WHOLE hand instead of a single
// chosen card -- no engine change needed for that half.
//
// "Find a card in your deck and play it" is new: nothing in the engine
// could search a SPECIFIC instance out of a draw pile and actually resolve
// it as a play (EngineAPI.draw only pulls randomly off the top into hand,
// without resolving anything). That needed one additive primitive,
// EngineAPI.playCardFromDeck (see src/engine/types.ts and its
// self-contained implementation in src/engine/api.ts, deliberately
// mirroring resolvePlay's own cardType branch in src/engine/engine.ts
// rather than depending on it) -- it moves the found instance into hand
// and immediately resolves it exactly as a normal play would (keeper ->
// enters play; action -> its onPlay hook runs, then it's discarded unless
// cancelled).
//
// "Find" reads as "search and choose", the same tutor-style verb Frost
// Pact's header comment discusses for hand cards -- here applied to the
// owner's own deck instead. With 0 or 1 candidates in the deck there's
// nothing to meaningfully choose between, so this only asks via
// requestChoice when there are 2+ deck cards to pick from (same "skip the
// choice when there's only 1 candidate" convention as
// r4-human-subzero-serpent / r5-human-frost-pact).
//
// The freeze happens FIRST, exactly matching the card text's sentence
// order -- including this card's own hand instance, which is harmless
// (moveToDiscard, unlike resolvePlay, never checks isHandCardFrozen, so
// this card's own imminent discard is unaffected either way).

import type { CardInstance } from '../../shared/types';
import type { AIGameView, CardEffect, ChoiceOption } from '../engine/types';

const cardEffect: CardEffect = {
  cardId: 'r7-human-rime-portal',
  cardType: 'action',
  baseValue: 0,

  hooks: {
    onPlay: {
      scope: 'inHand',
      side: 'owner',
      handler: async (ctx) => {
        const owner = ctx.owner;

        // "Freeze all cards in your hand; they can't be played." -- every
        // instance currently in hand (including this card's own, about to
        // be discarded regardless).
        const hand = ctx.api.getPlayer(owner).hand;
        for (const instance of hand) {
          ctx.api.freezeHandCard(instance.instanceId);
        }
        ctx.api.log({
          player: owner,
          type: 'flavor',
          message: `${owner}'s Rime Portal freezes every card in ${owner}'s hand -- none of them can be played.`,
        });

        // "Then find a card in your deck and play it."
        const deck = ctx.api.getPlayer(owner).drawPile;
        if (deck.length === 0) {
          ctx.api.log({
            player: owner,
            type: 'flavor',
            message: `${owner}'s Rime Portal finds an empty deck -- there's nothing to play through it.`,
          });
          return;
        }

        let target: CardInstance = deck[0];
        if (deck.length > 1) {
          const options: ChoiceOption[] = deck.map((instance) => ({
            id: instance.instanceId,
            cardId: instance.cardId,
            // Human-facing label: the card's NAME, never the raw instance
            // id.
            label: ctx.api.getCardName(instance.cardId),
            // AI-only hint (ignored by the human UI): a rough proxy for how
            // good this find is -- a keeper's real base point value, or 0
            // for an action/unknown cardId (same convention as
            // r5-human-frost-pact's contribution() helper, minus the
            // "action is worth 1" fallback since here there's no scoring
            // tied to the found card itself, just its own play value).
            value: ctx.api.getCardBaseValue(instance.cardId),
          }));
          const chosen = await ctx.api.requestChoice(owner, {
            cardId: ctx.cardId,
            prompt: `${owner}'s Rime Portal needs 1 card from your deck to find and play -- choose 1.`,
            options,
          });
          target = deck.find((instance) => instance.instanceId === chosen.id) ?? deck[0];
        }

        ctx.api.log({
          player: owner,
          type: 'flavor',
          message: `${owner}'s Rime Portal finds ${ctx.api.getCardName(target.cardId)} in ${owner}'s deck and plays it.`,
        });
        await ctx.api.playCardFromDeck(owner, target.instanceId);
      },
    },
  },

  strategy: {
    // A free extra play is good, but locking up the REST of the hand for
    // the rest of the match is a real cost -- worth less the more cards
    // are sitting in hand (besides itself) when it's played, and worth
    // nothing if the deck is already empty (a pure downside in that case:
    // hand frozen for no payoff).
    playValue: (view: AIGameView) => {
      const self = view.state.players[view.self];
      if (self.drawPile.length === 0) return 0.25;
      const otherHandCount = Math.max(0, self.hand.length - 1);
      return Math.max(0.5, 1.5 - otherHandCount * 0.25);
    },
    // An action card is never itself a keep/steal/destroy target.
    stealTargetValue: 0,
    // Resolves which deck card to find -- prefer whichever candidate has
    // the highest AI-hint `value` set above (a keeper's real base point
    // value beats an action/unknown's 0), defaulting to the first candidate
    // on a tie.
    choose: (_view: AIGameView, options: ChoiceOption[]) => {
      let best = options[0];
      for (const option of options) {
        const bestValue = typeof best.value === 'number' ? best.value : 0;
        const optionValue = typeof option.value === 'number' ? option.value : 0;
        if (optionValue > bestValue) best = option;
      }
      return best;
    },
  },
};

export default cardEffect;
