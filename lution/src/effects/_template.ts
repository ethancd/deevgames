// TEMPLATE — reference CardEffect module. Copy this file to
// src/effects/<your-card-id>.ts and fill in the blanks. Files starting with
// "_" are excluded from effect discovery, so this file itself is never
// loaded as a real card (see src/engine/effectsLoader.ts).
//
// The structural test (tests/structural.test.ts) enforces:
//   - the filename (minus .ts) matches this module's default export's
//     cardId, AND
//   - that cardId matches an `id` in data/cards.json with
//     implemented: true, destroyed: false.

import type { CardEffect } from '../engine/types';

const cardEffect: CardEffect = {
  // Must exactly match this file's name (without .ts) and the card's `id`
  // in data/cards.json.
  cardId: 'template-example-card',

  // 'keeper' cards go into play and stay there, scoring baseValue every
  // checkpoint (via modifyScore folding) until they leave play. 'action'
  // cards resolve their onPlay hook once and are immediately discarded.
  cardType: 'keeper',

  // Points this card is worth while in play (keepers), or 0 for most
  // actions (an action's onPlay hook is where its real effect lives).
  baseValue: 1,

  // === hooks ===
  // Every hook is optional. A card can declare at most one HookSpec per
  // hook name; put multiple concerns behind one handler function if needed.
  // Unknown hook names are fine too — api.emit('anything') from another
  // card's handler will reach a matching hook here with zero engine
  // changes required.
  hooks: {
    // Fires once, for the card's own resolution, while an ACTION card is
    // still sitting in hand (scope: 'inHand') — see resolvePlay() in
    // src/engine/engine.ts for the exact sequencing. Return
    // `{ cancel: true }` to bounce this card back to hand instead of
    // resolving + discarding it (used e.g. by a counter-effect elsewhere in
    // the codebase reacting to someone ELSE's onPlay with side: 'opponent').
    onPlay: {
      scope: 'inHand',
      side: 'owner',
      priority: 0,
      handler: async (ctx) => {
        // ctx.api    — the EngineAPI: the only mutation surface.
        // ctx.event  — { name, activePlayer, payload }.
        // ctx.cardId — this card's id (redundant with cardEffect.cardId but
        //              handy when one handler function is shared).
        // ctx.instance — the CardInstance that's resolving.
        // ctx.owner  — the PlayerId who owns this instance.
        await ctx.api.draw(ctx.owner, 1);
        // Return nothing (or {}) to let resolution continue normally.
      },
    },

    // Fires whenever a Keeper enters play — either played normally
    // (src/engine/api.ts moveToPlay) or moved there by changeController
    // (e.g. a steal-style effect).
    onEnterPlay: {
      scope: 'inPlay',
      side: 'owner',
      handler: (ctx) => {
        ctx.api.log({ type: 'flavor', message: `${ctx.owner}'s ${ctx.cardId} settles into play.` });
      },
    },

    // Fires when a Keeper leaves play (destroyKeeper, moveToDiscard from
    // 'inPlay', or changeController's source side), BEFORE onDiscard.
    onLeavePlay: {
      scope: 'inPlay',
      handler: (_ctx) => {
        // e.g. clean up a setFlag() this card set while it was in play.
      },
    },

    // Fires after ANY card (this one or another) is discarded — hand or
    // play, cancelled action or not.
    onDiscard: {
      scope: 'always',
      handler: (_ctx) => {},
    },

    // Fires on a keeper right before destroyKeeper() would send it to the
    // discard pile, BEFORE any zone mutation. Return `{ cancel: true }` to
    // abort the destroy entirely — onLeavePlay/onDiscard will NOT fire in
    // that case. The handler is expected to relocate the card itself if it
    // wants to save it from destruction (e.g. `await ctx.api.moveToHand(
    // ctx.instance.instanceId)`), rather than leaving it in inPlay.
    onBeforeDestroy: {
      scope: 'inPlay',
      handler: (_ctx) => {
        // return { cancel: true }; // e.g. after moving the card to hand
      },
    },

    // Fires once per turn for the active player's own cards (side:
    // 'owner', the default) at the very start of their turn, before the
    // draw phase.
    onTurnStart: {
      handler: (_ctx) => {},
    },

    // Fires once per turn, after the play phase resolves, before the
    // active player changes.
    onTurnEnd: {
      handler: (_ctx) => {},
    },

    // Dispatched at the start of every play phase, filtered by `side` as
    // normal. Declare `side: 'opponent'` so this only fires on the OTHER
    // player's turn (i.e. this card interrupts its owner's opponent).
    // Return `{ cancel: true }` to skip the active player's play phase
    // entirely this turn.
    interruptOpponentTurn: {
      scope: 'inPlay',
      side: 'opponent',
      priority: 10, // higher runs first among competing interrupts
      handler: (_ctx) => {
        return undefined; // don't actually interrupt; this is just a demo
      },
    },

    // Folded into EngineAPI.score() for whichever player is currently
    // being scored (event.activePlayer = the scored player, NOT
    // necessarily "whose turn it is"). `side: 'owner'` (default) means
    // this card only adjusts its own owner's score; `side: 'opponent'`
    // lets a card reduce/boost the OTHER player's score instead — e.g. a
    // curse. event.payload is a mutable `{ score: number }` accumulator;
    // mutate it in place.
    modifyScore: {
      scope: 'inPlay',
      handler: (ctx) => {
        const payload = ctx.event.payload as { score: number } | undefined;
        if (payload) payload.score += 0; // no-op example
      },
    },
  },

  // === strategy (AI hints) ===
  // Everything here is optional; sensible defaults live in
  // src/ai/defaults.ts (baseValue || 1).
  strategy: {
    // Used by chooseCardToPlay's argmax. Can be a flat number or a
    // function of the current view for context-sensitive valuation.
    playValue: 1,

    // Used when this card is evaluated as a keep/steal/destroy target
    // during design-round resolution (M3+).
    stealTargetValue: 1,

    // Optional override for the keep/steal EV comparison in
    // src/ai/player.ts specific to THIS card. Return undefined to defer to
    // the default EV calculation.
    keepOrStealAdvice: (_view) => undefined,

    // Resolves a requestChoice() call whose ChoiceSpec.cardId is this
    // card's id. Falls back to seeded-random (src/ai/player.ts
    // answerChoice) if omitted.
    //
    // REQUIRED when calling api.requestChoice from a hook: every option
    // shown to the human MUST carry a human-readable `label` -- for card
    // targets, the card's NAME via api.getCardName(cardId). Never surface
    // raw instance ids ("inst-12") to the player.
    choose: (_view, options) => options[0],
  },
};

export default cardEffect;
