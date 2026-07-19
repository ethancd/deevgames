// The Adiabatic Escrow Vault (r7-claude-the-adiabatic-escrow-vault) --
// designed by: claude
//
// Effect text: "Keeper. Worth 1 point while in play. Your keepers can't be
// frozen."
//
// "Can't be frozen" refers to the ONE existing freeze primitive that
// targets a keeper's score: EngineAPI.setScoreOverride (used today by
// r1-human-bone-chilling-breeze and r4-human-subzero-serpent to flatten a
// keeper's contribution to a flat point value -- see either file's header
// comment). There is no separate "frozen" flag on a keeper instance; being
// frozen just means having an active score override. So "your keepers
// can't be frozen" needed a new, minimal, purely additive engine primitive:
// EngineAPI.grantKeeperFreezeImmunity/revokeKeeperFreezeImmunity/
// isKeeperFreezeImmune (see src/engine/types.ts), which setScoreOverride
// itself now consults for the TARGET instance's current owner before
// applying -- so both existing freeze cards automatically respect this
// immunity without either of them needing to know this card exists.
//
// Immunity is tracked as a per-player REFERENCE COUNT (not a boolean), so
// it composes correctly if more than one copy of this card (or a future
// card with the same ability) is in play at once: grant on enter, revoke on
// leave, and immunity only actually lifts once the count returns to 0.

import type { CardEffect } from '../engine/types';

const cardEffect: CardEffect = {
  cardId: 'r7-claude-the-adiabatic-escrow-vault',
  cardType: 'keeper',
  baseValue: 1,

  hooks: {
    // IMPORTANT: dispatchHooks (src/engine/hooks.ts) broadcasts onEnterPlay
    // to EVERY card currently sitting in the zone with a matching hook, not
    // just the specific instance that triggered the event -- so this fires
    // again for an ALREADY-in-play vault whenever the owner plays ANY other
    // keeper afterward. Must guard on the event actually being about THIS
    // instance, or the immunity refcount inflates every time another keeper
    // enters play while the vault is already down (verified against
    // r7-claude-the-adiabatic-escrow-vault.test.ts's "leave play" case,
    // which fails without this guard: playing a second keeper after the
    // vault re-fires grant, so a single destroy no longer brings the count
    // back to 0).
    onEnterPlay: {
      scope: 'inPlay',
      side: 'owner',
      handler: (ctx) => {
        const payload = ctx.event.payload as { instanceId?: string } | undefined;
        if (payload?.instanceId !== ctx.instance.instanceId) return;
        ctx.api.grantKeeperFreezeImmunity(ctx.owner);
        ctx.api.log({
          player: ctx.owner,
          type: 'flavor',
          message: `${ctx.owner}'s The Adiabatic Escrow Vault seals every keeper on their side against the cold.`,
        });
      },
    },

    // Same broadcast caveat as onEnterPlay above, mirrored for the leaving
    // side: only release the immunity share this instance is holding when
    // THIS instance is the one actually leaving play, not whenever some
    // other keeper happens to leave while the vault is still down.
    onLeavePlay: {
      scope: 'inPlay',
      handler: (ctx) => {
        const payload = ctx.event.payload as { instanceId?: string } | undefined;
        if (payload?.instanceId !== ctx.instance.instanceId) return;
        ctx.api.revokeKeeperFreezeImmunity(ctx.owner);
      },
    },
  },

  strategy: {
    // A vanilla 1-point keeper on its own, but it also protects the REST of
    // the owner's board from every existing freeze effect -- worth a modest
    // premium over a plain 1-point keeper whenever the owner already has
    // (or expects to build) other keepers worth protecting.
    playValue: (view) => {
      const ownKeeperCount = view.state.players[view.self].inPlay.length;
      return 1 + Math.min(2, ownKeeperCount * 0.5);
    },
    // As a steal/destroy target it's still just a 1-point keeper on its
    // own board-value merits; its immunity effect isn't something a would
    // -be thief inherits any differently than any other keeper's ability,
    // so no special-casing here.
    stealTargetValue: 1,
  },
};

export default cardEffect;
