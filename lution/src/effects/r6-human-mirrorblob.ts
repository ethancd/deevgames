// Mirrorblob (r6-human-mirrorblob) -- designed by: human
//
// Effect text: "Pick a card in your hand or your opponent's hand -- copy the
// effect of that card."
//
// Nothing in the atom catalog can express "resolve an arbitrary OTHER card's
// full effect module" -- the atoms are all fixed, small primitives (draw,
// destroy, freeze, ...), not "look up and re-run any card's registered
// effect." That's a genuine missing engine capability, so this is a bespoke
// module (approach 3) built on EngineAPI.playCopyOf(controller, cardId) --
// see its doc comment in src/engine/types.ts / src/engine/api.ts, which was
// added specifically for this card: it synthesizes a brand-new instance of
// `cardId` and resolves it exactly as if `controller` had just played it,
// WITHOUT removing the original picked card from wherever it was chosen
// (own or opponent's hand) -- matching "copy the effect of that card"
// literally (you copy it, you don't steal it).
//
// The candidate pool is every card currently in EITHER hand EXCEPT another
// Mirrorblob (any instance, including this resolving one) -- copying
// Mirrorblob's own effect would let it pick yet another Mirrorblob and
// recurse without bound (each fresh copy would itself be free to copy
// another Mirrorblob, forever), so self-copying is excluded outright rather
// than merely excluding the one resolving instance (same "excludeSelf"
// spirit shared/atoms.ts's Filter uses elsewhere, widened to the whole
// cardId since here EVERY instance of this effect is equally recursive).
// With 0 candidates there's nothing to copy (logged as a flavor no-op);
// with exactly 1 candidate there's nothing to meaningfully choose between
// (same "skip the choice when there's only 1 candidate" convention as
// r5-human-hunger-vortex / r7-human-rime-portal); with 2+ a requestChoice is
// asked of the OWNER (they're the one doing the copying), labeled with each
// candidate's real name, never a raw instance id.

import type { CardInstance, PlayerId } from '../../shared/types';
import type { AIGameView, CardEffect, ChoiceOption } from '../engine/types';

const CARD_ID = 'r6-human-mirrorblob';

function opponentOf(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

function isCopyable(instance: CardInstance): boolean {
  return instance.cardId !== CARD_ID;
}

const cardEffect: CardEffect = {
  cardId: CARD_ID,
  cardType: 'action',
  baseValue: 0,

  hooks: {
    onPlay: {
      scope: 'inHand',
      side: 'owner',
      handler: async (ctx) => {
        // dispatchHooks's 'onPlay' dispatch (src/engine/hooks.ts) broadcasts
        // to EVERY onPlay-hooked hand card matching scope+side, not just the
        // one card actually being played -- every emitter (resolvePlay,
        // playCardFromDeck(As), playCopyOf) tags the event payload with the
        // ACTUAL played card's instanceId, but a handler is otherwise free
        // to fire for a card it wasn't "about". Mirrorblob is uniquely
        // exposed to this: it stays sitting in the owner's hand for its
        // entire own resolution (scope 'inHand'), so if it copies another
        // ACTION card, that copy's own nested onPlay dispatch (fired from
        // inside ctx.api.playCopyOf below) would otherwise re-invoke THIS
        // SAME handler a second time -- and every re-invocation would spot
        // its own freshly-created copy sitting in hand as a fresh candidate
        // and copy IT too, recursing without bound. Guarding on the
        // payload's instanceId (only proceed when this event is actually
        // about THIS resolving instance) breaks that recursion; every
        // internal 'onPlay' emitter in this codebase sets payload.instanceId,
        // so this never blocks a genuine top-level play of this card.
        const payload = ctx.event.payload as { instanceId?: string } | undefined;
        if (payload?.instanceId !== ctx.instance.instanceId) return;

        const owner = ctx.owner;
        const opponent = opponentOf(owner);

        const ownHand = ctx.api.getPlayer(owner).hand.filter(isCopyable);
        const opponentHand = ctx.api.getPlayer(opponent).hand.filter(isCopyable);
        const candidates: CardInstance[] = [...ownHand, ...opponentHand];

        if (candidates.length === 0) {
          ctx.api.log({
            player: owner,
            type: 'flavor',
            message: `${owner}'s Mirrorblob finds no other card in either hand to copy.`,
          });
          return;
        }

        let target = candidates[0];
        if (candidates.length > 1) {
          const options: ChoiceOption[] = candidates.map((instance) => ({
            id: instance.instanceId,
            cardId: instance.cardId,
            // Human-facing label: the card's NAME, never the raw instance
            // id.
            label: ctx.api.getCardName(instance.cardId),
            // AI-only hint (ignored by the human UI): a rough proxy for how
            // good this copy is -- a keeper's real base point value, or 0
            // for an action/unknown cardId (same convention as
            // r5-human-hunger-vortex's own deck-search options).
            value: ctx.api.getCardBaseValue(instance.cardId),
          }));
          const chosen = await ctx.api.requestChoice(owner, {
            cardId: ctx.cardId,
            prompt: `${owner}'s Mirrorblob can copy the effect of 1 card from either hand -- choose 1.`,
            options,
          });
          target = candidates.find((instance) => instance.instanceId === chosen.id) ?? candidates[0];
        }

        // playCopyOf itself logs a 'copy' entry naming the copied card by
        // NAME (see src/engine/api.ts) -- no need to duplicate that here.
        await ctx.api.playCopyOf(owner, target.cardId);
      },
    },
  },

  strategy: {
    // A flexible tempo play whose real value depends entirely on what's
    // copyable -- flat-rate on "is there anything at all to copy", same
    // shape as r5-human-hunger-vortex's own AIGameView-driven estimate
    // (AIGameView exposes no per-card baseValue lookup for a richer "best
    // available target" estimate).
    playValue: (view: AIGameView) => {
      const ownCandidates = view.state.players[view.self].hand.filter(isCopyable).length;
      const opponentCandidates = view.state.players[view.opponent].hand.filter(isCopyable).length;
      return ownCandidates + opponentCandidates > 0 ? 2 : 0.25;
    },
    // An action is never itself a keep/steal/destroy target.
    stealTargetValue: 0,
    // Resolves which card (from either hand) to copy -- prefer whichever
    // candidate has the highest AI-hint `value` set above, defaulting to
    // the first candidate on a tie (same as r5-human-hunger-vortex's
    // choose).
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
