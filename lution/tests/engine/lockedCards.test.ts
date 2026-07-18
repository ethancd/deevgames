// Non-blocking implement job feature: a card is "locked" whenever its
// registry entry has implemented === false && destroyed === false. Locked
// cards can be drawn/held/discarded like any other card -- the engine never
// needs an effect module for zone movement -- but resolvePlay must reject
// playing one, and the lock status is read DYNAMICALLY (not snapshotted at
// game creation) so an in-session unlock takes effect immediately.

import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';
import { resolvePlay } from '../../src/engine/engine';

describe('locked cards', () => {
  it('a locked card is drawable and discardable, but a play attempt is rejected', async () => {
    const def = testCardDef('locked-keeper');
    const effect = testKeeperEffect('locked-keeper', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['locked-keeper'] },
      isLocked: (cardId) => cardId === 'locked-keeper',
    });

    // Holdable: it's already sitting in hand from game creation without
    // crashing.
    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['locked-keeper']);

    const instanceId = game.state().players.human.hand[0].instanceId;

    // Not playable while locked.
    await expect(resolvePlay(game.runtime, 'human', instanceId)).rejects.toThrow(/locked/i);
    // The rejected play must not have moved the card anywhere.
    expect(game.state().players.human.hand).toHaveLength(1);
    expect(game.state().players.human.inPlay).toHaveLength(0);

    // Discardable: moveToDiscard doesn't consult isLocked at all (a hand
    // discard triggered by another card's effect, or the player's own
    // choice to bin it, isn't "playing" the card).
    await game.api.moveToDiscard('human', instanceId, 'hand');
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['locked-keeper']);
  });

  it('an instance becomes playable the moment isLocked flips to false for its cardId', async () => {
    let locked = true;
    const def = testCardDef('flip-keeper');
    const effect = testKeeperEffect('flip-keeper', 2);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['flip-keeper'] },
      isLocked: (cardId) => locked && cardId === 'flip-keeper',
    });
    const instanceId = game.state().players.human.hand[0].instanceId;

    await expect(resolvePlay(game.runtime, 'human', instanceId)).rejects.toThrow(/locked/i);
    expect(game.state().players.human.inPlay).toHaveLength(0);

    // Unlock (job succeeds) -- the SAME instance, no runtime surgery needed.
    locked = false;

    const result = await resolvePlay(game.runtime, 'human', instanceId);
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['flip-keeper']);
  });

  it('a deck holding a module-less locked card id does not crash game creation or drawing', async () => {
    // Deliberately NO extraEffects entry for 'ghost-card' -- simulates a
    // freshly-adopted card whose effect module hasn't been written to disk
    // yet (the implement job is still running in the background).
    const game = createTestGame({
      decks: { human: ['ghost-card'], claude: [] },
      hands: { human: [] },
      isLocked: (cardId) => cardId === 'ghost-card',
    });

    const drawn = await game.api.draw('human', 1);
    expect(drawn.map((i) => i.cardId)).toEqual(['ghost-card']);
    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['ghost-card']);

    // Scoring/base-value lookups must also stay undefined-safe for it.
    expect(game.api.getCardBaseValue('ghost-card')).toBe(0);
    await expect(game.score('human')).resolves.toBe(0);

    const instanceId = game.state().players.human.hand[0].instanceId;
    await expect(resolvePlay(game.runtime, 'human', instanceId)).rejects.toThrow(/locked/i);
  });

  it('defaults to unlocked (isLocked omitted) so every existing caller is unaffected', async () => {
    const def = testCardDef('default-unlocked-keeper');
    const effect = testKeeperEffect('default-unlocked-keeper', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['default-unlocked-keeper'] },
    });
    const instanceId = game.state().players.human.hand[0].instanceId;
    const result = await resolvePlay(game.runtime, 'human', instanceId);
    expect(result).toEqual({ passed: false, cancelled: false });
  });
});
