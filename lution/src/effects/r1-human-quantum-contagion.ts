// Quantum Contagion (r1-human-quantum-contagion) -- designed by: human
//
// Effect text: "Keeper. This keeper and all your other keepers are worth as
// much as the most valuable keeper in your hand."
//
// This is a blanket OVERRIDE of every keeper the owner controls (this
// instance included), not an additive bonus like Crystalline Vampire/
// Omnistroem the Uniter -- so it can't be expressed via a `scoreDelta`
// ValueExpr (shared/atoms.ts's `max`/`min` only fold a literal ARRAY of
// ValueExprs, and `count()` only counts selector matches; there is no atom
// for "the worth of whichever candidate a selector's maxValue pick would
// resolve to," let alone "the sum of every OTHER keeper's worth reset to
// that value"). Reaching feature parity would need at least two new
// ValueExpr primitives (a selector-driven "worth of the max/min pick" AND a
// selector-driven "sum of worths"), which is more than approach 2's "one
// small missing primitive" budget -- so this is a bespoke module, matching
// the same call every other "worth is computed from other cards" card in
// this codebase already made (Crystalline Vampire, Omnistroem the Uniter,
// Frost Pact are all bespoke, none composed).
//
// "The most valuable keeper in your hand" reads as the highest registered
// baseValue among the owner's HAND cards whose cardType is 'keeper' (action
// cards in hand don't count, matching Frost Pact's own "there isn't a base
// value" treatment of actions -- except here, with nothing to fall back to,
// an action card in hand simply isn't a candidate at all, rather than
// contributing a flat placeholder). If the owner's hand holds no keeper at
// all, "the most valuable keeper in your hand" doesn't exist -- read as 0,
// the same "nothing to reference -> 0" convention Crystalline Vampire uses
// when nothing on the board is frozen. That 0 applies as a genuine
// OVERRIDE (this card and every other keeper the owner controls really do
// become worth 0 in that case), not merely "no bonus," since the effect
// text describes a blanket equivalence, not an addition.
//
// Implemented as a single modifyScore hook on Quantum Contagion's own
// instance: score()'s payload is one running total for the whole player
// (src/engine/api.ts), so a delta of (target worth - current worth) summed
// across every one of the owner's in-play keepers (Quantum Contagion
// included) correctly re-prices the WHOLE side of the board without
// needing to reach into any other card's own hooks. This intentionally
// overrides even a keeper some OTHER effect has already frozen (e.g. an
// opposing Subzero-Serpent-style setScoreOverride) -- "worth as much as"
// is a blanket claim about what the owner's keepers are worth, and
// `current` below already reads whatever value (overridden or base) that
// keeper currently contributes, so the delta still lands it exactly on the
// shared target value.

import type { CardInstance, PlayerId } from '../../shared/types';
import type { AIGameView, CardEffect, EngineAPI } from '../engine/types';

// The highest registered baseValue among the owner's hand KEEPERS, or 0 if
// the hand holds none (see file header).
function mostValuableHandKeeper(api: EngineAPI, owner: PlayerId): number {
  let best = 0;
  for (const instance of api.getPlayer(owner).hand) {
    if (api.getCardType(instance.cardId) === 'keeper') {
      best = Math.max(best, api.getCardBaseValue(instance.cardId));
    }
  }
  return best;
}

const cardEffect: CardEffect = {
  cardId: 'r1-human-quantum-contagion',
  cardType: 'keeper',
  // Entirely dynamic -- see file header. 0 keeps score()'s flat base-value
  // sum from double-counting once modifyScore's delta lands (same
  // convention as every other purely-dynamic keeper in this codebase).
  baseValue: 0,

  hooks: {
    modifyScore: {
      scope: 'inPlay',
      handler: (ctx) => {
        const payload = ctx.event.payload as { score: number } | undefined;
        if (!payload) return;

        const target = mostValuableHandKeeper(ctx.api, ctx.owner);
        let delta = 0;
        for (const instance of ctx.api.getPlayer(ctx.owner).inPlay) {
          if (ctx.api.getCardType(instance.cardId) !== 'keeper') continue;
          const current = ctx.api.getScoreOverride(instance.instanceId) ?? ctx.api.getCardBaseValue(instance.cardId);
          delta += target - current;
        }
        payload.score += delta;
      },
    },
  },

  strategy: {
    // AIGameView exposes no per-card baseValue lookup (see
    // src/engine/compileComposition.ts's own estimateSelectorWorth doc
    // comment), so "the most valuable keeper in hand" can't be read
    // directly here -- this instead approximates it using the owner's
    // current average per-keeper board value (view.score/count), the same
    // fallback compileComposition's derived heuristics use. Scales with how
    // many keepers the owner already controls (more keepers to re-price ==
    // more potential upside), floored at 1 so it's never valued at 0
    // pre-play.
    playValue: (view: AIGameView, instance: CardInstance) => {
      const inPlay = view.state.players[view.self].inPlay;
      const alreadyInPlay = inPlay.some((i) => i.instanceId === instance.instanceId);
      const keeperCount = alreadyInPlay ? inPlay.length : inPlay.length + 1;
      const average = inPlay.length > 0 ? view.score(view.self) / inPlay.length : 1;
      return Math.max(1, keeperCount * average);
    },
    stealTargetValue: (view: AIGameView, instance: CardInstance) => {
      const inPlay = view.state.players[view.self].inPlay;
      const alreadyInPlay = inPlay.some((i) => i.instanceId === instance.instanceId);
      const keeperCount = alreadyInPlay ? inPlay.length : inPlay.length + 1;
      const average = inPlay.length > 0 ? view.score(view.self) / inPlay.length : 1;
      return Math.max(1, keeperCount * average);
    },
  },
};

export default cardEffect;
