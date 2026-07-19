// Frost Pact (r5-human-frost-pact) -- designed by: human
//
// Effect text: "Keeper. On enter, freeze a chosen card in your hand and a
// random card in your opponent's hand; they are revealed and can't be
// played. This card is worth the base point values of each card frozen in
// any players hand, or 1 pt per card in cases where there isn't a base
// value."
//
// "Freeze ... in your hand ... can't be played" is a NEW kind of freeze --
// every existing freeze card (Bone-Chilling Breeze, Subzero Serpent) only
// ever flattens an IN-PLAY keeper's score via EngineAPI.setScoreOverride.
// Nothing lets a card render a HAND card unplayable, so this needed a
// minimal additive primitive: EngineAPI.freezeHandCard/isHandCardFrozen
// (see src/engine/types.ts), enforced by resolvePlay (src/engine/engine.ts)
// and mirrored by the AI's chooseCardToPlay filter (src/ai/player.ts) so
// the built-in opponent never even attempts an illegal play.
//
// "Revealed" has no separate concealed-hand mechanic to reveal against (see
// r2-human-audit-the-auditors's "look at your opponent's hand" for the same
// call), so it's represented purely as a flavor log entry naming the frozen
// card.
//
// "The base point value" of a frozen HAND card is that card's registered
// baseValue -- a hand card never sits in play, so no modifyScore hook of
// its own ever runs for it; baseValue is the only "base point value" a hand
// card has. "Cases where there isn't a base value" reads as ACTION cards
// (which score 0 points while in play by convention -- they don't have a
// points concept at all, they resolve once and discard) or any
// unregistered/not-yet-implemented cardId, as opposed to a KEEPER whose
// baseValue genuinely happens to be 0 (e.g. r2-human-crystalline-vampire,
// whose value is entirely dynamic but which still conceptually "has" a base
// point value). Distinguishing those two needed EngineAPI.getCardType
// (also added this job, alongside getCardBaseValue/getCardName).
//
// This card's own worth is computed once, right when both freezes land, via
// EngineAPI.setScoreOverride on ITS OWN instance -- exactly the same
// primitive Subzero Serpent/Bone-Chilling Breeze use to flatten OTHER
// keepers, just pointed at this card's own instanceId instead. A hand card
// never changes its base value while sitting in hand, so a one-time
// computation at onEnterPlay stays correct for as long as this card remains
// in play (there is deliberately no "thaw" for either the hand freeze or
// this card's own override -- nothing in the card text calls for one).

import type { CardId, CardInstance, PlayerId } from '../../shared/types';
import type { AIGameView, CardEffect, ChoiceOption, EngineAPI } from '../engine/types';

function opponentOf(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

// A frozen hand card's contribution to Frost Pact's own score: its real
// base point value if it's a KEEPER (even if that happens to be 0), or 1
// flat point if it's an action / has no registered effect module at all
// ("there isn't a base value" -- see file header).
function contribution(api: EngineAPI, cardId: CardId): number {
  return api.getCardType(cardId) === 'keeper' ? api.getCardBaseValue(cardId) : 1;
}

const cardEffect: CardEffect = {
  cardId: 'r5-human-frost-pact',
  cardType: 'keeper',
  // Entirely dynamic -- see file header. 0 keeps score()'s flat base-value
  // sum from double-counting once onEnterPlay's setScoreOverride lands
  // (same convention as r2-human-crystalline-vampire/r2-human-omnistr-m
  // -the-uniter for a keeper with no separate flat baseline).
  baseValue: 0,

  hooks: {
    onEnterPlay: {
      scope: 'inPlay',
      side: 'owner',
      handler: async (ctx) => {
        const owner = ctx.owner;
        const opponent = opponentOf(owner);
        const ownerHand = ctx.api.getPlayer(owner).hand;
        const opponentHand = ctx.api.getPlayer(opponent).hand;

        let ownerFrozen: CardInstance | undefined;
        if (ownerHand.length === 0) {
          ctx.api.log({
            player: owner,
            type: 'flavor',
            message: `${owner}'s Frost Pact finds no card in ${owner}'s own hand to freeze.`,
          });
        } else {
          let target = ownerHand[0];
          if (ownerHand.length > 1) {
            const options: ChoiceOption[] = ownerHand.map((instance) => ({
              id: instance.instanceId,
              cardId: instance.cardId,
              // Human-facing label: the card's NAME, never the raw
              // instance id.
              label: ctx.api.getCardName(instance.cardId),
              // AI-only hint (arbitrary ChoiceOption field, ignored by the
              // human UI): what freezing this exact card would contribute
              // to Frost Pact's own score -- see strategy.choose below.
              value: contribution(ctx.api, instance.cardId),
            }));
            const chosen = await ctx.api.requestChoice(owner, {
              cardId: ctx.cardId,
              prompt: `${owner}'s Frost Pact needs 1 card from your own hand to freeze -- choose 1.`,
              options,
            });
            target = ownerHand.find((instance) => instance.instanceId === chosen.id) ?? ownerHand[0];
          }
          ctx.api.freezeHandCard(target.instanceId);
          ownerFrozen = target;
          ctx.api.log({
            player: owner,
            type: 'flavor',
            message: `${owner}'s Frost Pact freezes ${owner}'s own ${ctx.api.getCardName(
              target.cardId
            )} -- it's revealed and can't be played.`,
          });
        }

        let opponentFrozen: CardInstance | undefined;
        if (opponentHand.length === 0) {
          ctx.api.log({
            player: owner,
            type: 'flavor',
            message: `${owner}'s Frost Pact finds no card in ${opponent}'s hand to freeze.`,
          });
        } else {
          // "A random card in your opponent's hand" -- ctx.api.rng is the
          // same seeded/deterministic RNG source used for deck shuffling
          // (same call shape as r2-human-audit-the-auditors's random
          // discard), so this stays reproducible given a fixed seed.
          const index = ctx.api.rng.int(opponentHand.length);
          const target = opponentHand[index];
          ctx.api.freezeHandCard(target.instanceId);
          opponentFrozen = target;
          ctx.api.log({
            player: owner,
            type: 'flavor',
            message: `${owner}'s Frost Pact freezes a random card from ${opponent}'s hand: ${ctx.api.getCardName(
              target.cardId
            )} -- it's revealed and can't be played.`,
          });
        }

        let total = 0;
        if (ownerFrozen) total += contribution(ctx.api, ownerFrozen.cardId);
        if (opponentFrozen) total += contribution(ctx.api, opponentFrozen.cardId);
        ctx.api.setScoreOverride(ctx.instance.instanceId, total);
      },
    },
  },

  strategy: {
    // Rough pre-play estimate: a guaranteed point or so just for entering
    // play, plus roughly 1 more for each side that actually has a card left
    // to freeze once this one leaves the owner's hand. AIGameView exposes
    // no per-card base-value lookup (see r2-human-crystalline-vampire's
    // countFrozenFromView comment for the same limitation), so this can
    // only gauge "is there anything to freeze at all," not how valuable it
    // is.
    playValue: (view) => {
      const ownerHandCount = view.state.players[view.self].hand.length;
      const opponentHandCount = view.state.players[view.opponent].hand.length;
      let estimate = 1;
      if (ownerHandCount > 1) estimate += 1; // more than just this card itself
      if (opponentHandCount > 0) estimate += 1;
      return estimate;
    },
    // Once in play, its real worth is exactly the score override
    // onEnterPlay computed -- read directly off the raw effectState
    // snapshot using the same `__scoreOverride__:<instanceId>` key format
    // EngineAPI.setScoreOverride writes under (same direct-read convention
    // r2-human-crystalline-vampire's stealTargetValue already relies on).
    stealTargetValue: (view, instance) => {
      const override = view.state.effectState[`__scoreOverride__:${instance.instanceId}`];
      return typeof override === 'number' ? override : 1;
    },
    // Resolves which of the OWNER's own hand cards to sacrifice to the
    // freeze. Freezing a card contributes the SAME point value to this
    // card's own score regardless of which candidate is chosen (see
    // contribution() above) -- but it also permanently denies the owner
    // ever playing that exact card normally (no un-freeze exists). Since
    // the raw point payoff is a wash either way (a frozen keeper's value
    // converts 1:1 into Frost Pact's own score, same as if it had simply
    // been played as itself), the only real cost is opportunity: prefer
    // sacrificing whichever candidate contributes the LEAST, so anything
    // with more (potential, non-scoring) upside stays playable.
    choose: (_view: AIGameView, options: ChoiceOption[]) => {
      let best = options[0];
      for (const option of options) {
        const bestValue = typeof best.value === 'number' ? best.value : 0;
        const optionValue = typeof option.value === 'number' ? option.value : 0;
        if (optionValue < bestValue) best = option;
      }
      return best;
    },
  },
};

export default cardEffect;
