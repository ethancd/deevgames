// Hunger Vortex (r5-human-hunger-vortex) -- designed by: human
//
// Effect text: "Find a card in your opponent's deck and play it as your
// own."
//
// This is r7-human-rime-portal's "find a card in your deck and play it"
// half, but searching the OPPONENT's draw pile instead of the owner's own,
// AND resolving the play under the OWNER's control rather than whichever
// player's deck it came from. Nothing in the existing atom catalog (or
// EngineAPI) can express that cross-player half: shared/atoms.ts's
// `tutorAndPlay` atom (and the EngineAPI.playCardFromDeck primitive it
// compiles to) always plays the found card as whichever SAME player's draw
// pile it was searched out of -- there's no way to hand it to a different
// player's control. That's a genuine missing engine capability, not a small
// composable primitive, so this is a bespoke module (approach 3) with one
// minimal, additive EngineAPI extension: EngineAPI.playCardFromDeckAs(
// deckOwner, controller, instanceId), which mirrors playCardFromDeck's body
// exactly except the found card is pushed into `controller`'s hand (and
// resolved as `controller`'s play) rather than `deckOwner`'s. See its doc
// comment in src/engine/types.ts / src/engine/api.ts.
// EngineAPI.playCardFromDeck itself is completely untouched -- this is a
// separate primitive, not a signature change -- so every existing
// caller/test keeps searching and playing as the same single player it
// always did.
//
// "Find" reads as "search and choose" (same tutor-style verb Rime Portal and
// Frost Pact both use). With 0 or 1 candidates in the opponent's deck
// there's nothing to meaningfully choose between, so this only asks via
// requestChoice when there are 2+ candidates (same "skip the choice when
// there's only 1 candidate" convention as r4-human-subzero-serpent /
// r5-human-frost-pact / r7-human-rime-portal). The CHOOSING side is the
// owner (they're the one doing the finding/stealing), unlike Recount/Audit
// the Auditors where the opponent chooses what they lose.

import type { CardInstance, PlayerId } from '../../shared/types';
import type { AIGameView, CardEffect, ChoiceOption } from '../engine/types';

function opponentOf(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

const cardEffect: CardEffect = {
  cardId: 'r5-human-hunger-vortex',
  cardType: 'action',
  baseValue: 0,

  hooks: {
    onPlay: {
      scope: 'inHand',
      side: 'owner',
      handler: async (ctx) => {
        const owner = ctx.owner;
        const opponent = opponentOf(owner);

        const deck = ctx.api.getPlayer(opponent).drawPile;
        if (deck.length === 0) {
          ctx.api.log({
            player: owner,
            type: 'flavor',
            message: `${owner}'s Hunger Vortex finds ${opponent}'s deck empty -- there's nothing to take.`,
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
            // good this steal is -- a keeper's real base point value, or 0
            // for an action/unknown cardId (same convention as
            // r7-human-rime-portal's own deck-search options).
            value: ctx.api.getCardBaseValue(instance.cardId),
          }));
          const chosen = await ctx.api.requestChoice(owner, {
            cardId: ctx.cardId,
            prompt: `${owner}'s Hunger Vortex can pull 1 card out of ${opponent}'s deck -- choose 1.`,
            options,
          });
          target = deck.find((instance) => instance.instanceId === chosen.id) ?? deck[0];
        }

        ctx.api.log({
          player: owner,
          type: 'flavor',
          message: `${owner}'s Hunger Vortex tears ${ctx.api.getCardName(target.cardId)} out of ${opponent}'s deck and plays it as ${owner}'s own.`,
        });
        await ctx.api.playCardFromDeckAs(opponent, owner, target.instanceId);
      },
    },
  },

  strategy: {
    // A free extra play siphoned straight off the opponent's deck, with no
    // downside to the owner at all (unlike Rime Portal's hand-freeze cost) --
    // comfortably worth playing whenever the opponent's deck isn't empty.
    // AIGameView exposes no per-card baseValue lookup for a flat "best
    // available target" estimate (see r1-human-quantum-contagion's own doc
    // comment on this same limitation), so this is a flat value gated only
    // on whether there's anything to steal at all.
    playValue: (view: AIGameView) => {
      const opponentDeck = view.state.players[view.opponent].drawPile;
      return opponentDeck.length === 0 ? 0.25 : 2;
    },
    // An action card is never itself a keep/steal/destroy target.
    stealTargetValue: 0,
    // Resolves which opponent-deck card to steal -- prefer whichever
    // candidate has the highest AI-hint `value` set above, defaulting to the
    // first candidate on a tie (same as r7-human-rime-portal's choose).
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
