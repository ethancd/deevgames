// Crystalline Vampire (r2-human-crystalline-vampire) -- designed by: human
//
// Effect text: "Keeper. Worth 1 point for each frozen card in the game."
//
// "Frozen" is the same concept r1-human-bone-chilling-breeze introduced:
// EngineAPI.setScoreOverride flattens an instance's score contribution to a
// fixed value, and getScoreOverride(instanceId) !== undefined is exactly
// "this instance is currently frozen." "In the game" is read as the current
// board -- every keeper currently in play on either side of the table (both
// players' inPlay zones), matching how r1-human-bone-chilling-breeze itself
// only ever freezes keepers that are in play. This card's own value is
// entirely dynamic (there's no separate flat baseline in the card text), so
// baseValue is 0 and modifyScore supplies the whole contribution, the same
// pattern used by r2-human-omnistr-m-the-uniter.

import type { PlayerId } from '../../shared/types';
import type { AIGameView, CardEffect } from '../engine/types';

const PLAYERS: PlayerId[] = ['human', 'claude'];

function countFrozenInPlay(getScoreOverride: (instanceId: string) => number | undefined, getPlayer: (id: PlayerId) => { inPlay: { instanceId: string }[] }): number {
  let count = 0;
  for (const player of PLAYERS) {
    for (const instance of getPlayer(player).inPlay) {
      if (getScoreOverride(instance.instanceId) !== undefined) count += 1;
    }
  }
  return count;
}

// Strategy-only helper: AIGameView has no live EngineAPI, so "frozen" is
// read directly off the raw effectState snapshot using the same
// `__scoreOverride__:<instanceId>` key format EngineAPI.setScoreOverride
// writes under (see src/engine/api.ts's SCORE_OVERRIDE_PREFIX) -- the same
// kind of direct effectState read r1-claude-the-snowballing-interest-trust's
// stealTargetValue already relies on for its own bonus key.
function countFrozenFromView(view: AIGameView): number {
  let count = 0;
  for (const player of PLAYERS) {
    for (const instance of view.state.players[player].inPlay) {
      if (view.state.effectState[`__scoreOverride__:${instance.instanceId}`] !== undefined) count += 1;
    }
  }
  return count;
}

const cardEffect: CardEffect = {
  cardId: 'r2-human-crystalline-vampire',
  cardType: 'keeper',
  // Entirely dynamic -- see file header. 0 keeps score()'s flat base-value
  // sum from double-counting on top of modifyScore's frozen-count total.
  baseValue: 0,

  hooks: {
    // Folded into EngineAPI.score() for the owner (side: 'owner' default)
    // whenever this instance is in play. Worth 1 point per currently-frozen
    // keeper anywhere on the board, including this instance itself if some
    // OTHER effect ever freezes it (though while frozen, this very hook is
    // suppressed by the dispatcher -- see src/engine/hooks.ts -- so that
    // case never actually fires).
    modifyScore: {
      scope: 'inPlay',
      handler: (ctx) => {
        const payload = ctx.event.payload as { score: number } | undefined;
        if (!payload) return;
        payload.score += countFrozenInPlay(ctx.api.getScoreOverride, ctx.api.getPlayer);
      },
    },
  },

  strategy: {
    // Worthless on an unfrozen board, and scales 1-for-1 with however many
    // keepers are currently frozen -- prioritize playing it once something
    // has actually frozen the table (e.g. after an opposing
    // Bone-Chilling-Breeze-style effect), otherwise treat it like a
    // low-value placeholder keeper.
    playValue: (view) => Math.max(1, countFrozenFromView(view)),
    stealTargetValue: (view) => Math.max(1, countFrozenFromView(view)),
  },
};

export default cardEffect;
