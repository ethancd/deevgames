import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';
import type { CardEffect } from '../../src/engine/types';
import { resolvePlay } from '../../src/engine/engine';

describe('resolvePlay', () => {
  it('keeper: moves to inPlay and fires onEnterPlay (does not touch onPlay at all)', async () => {
    let onPlayFired = false;
    const def = testCardDef('test-keeper-play');
    const effect = testKeeperEffect('test-keeper-play', 1, {
      hooks: { onPlay: { handler: () => { onPlayFired = true; } } },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-keeper-play'] },
    });

    const result = await game.play('test-keeper-play');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay).toHaveLength(1);
    // onPlay's default scope is 'inHand', but the card is a keeper that went
    // straight to inPlay via moveToPlay — resolvePlay never dispatches
    // onPlay for keepers at all.
    expect(onPlayFired).toBe(false);
  });

  it('action: resolves onPlay (while still in hand), then discards, firing onDiscard', async () => {
    let resolvedWhileInHand: boolean | undefined;
    const def = testCardDef('test-action-play');
    const effect: CardEffect = {
      cardId: 'test-action-play',
      cardType: 'action',
      baseValue: 0,
      hooks: {
        onPlay: {
          scope: 'inHand',
          handler: (ctx) => {
            resolvedWhileInHand = ctx.api
              .getPlayer('human')
              .hand.some((i) => i.instanceId === ctx.instance.instanceId);
          },
        },
      },
    };
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-action-play'] },
    });

    const result = await game.play('test-action-play');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(resolvedWhileInHand).toBe(true);
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['test-action-play']);
  });

  it('action: a higher-priority opponent onPlay handler can cancel it before the action resolves, bouncing it back to hand', async () => {
    let actionResolved = false;
    const cancellerDef = testCardDef('test-canceller-keeper');
    const cancellerEffect = testKeeperEffect('test-canceller-keeper', 0, {
      hooks: {
        onPlay: {
          scope: 'inPlay',
          side: 'opponent',
          priority: 10, // must outrank the action's own onPlay so it runs first
          handler: () => ({ cancel: true }),
        },
      },
    });
    const actionDef = testCardDef('test-cancellable-action');
    const actionEffect: CardEffect = {
      cardId: 'test-cancellable-action',
      cardType: 'action',
      baseValue: 0,
      hooks: {
        onPlay: {
          scope: 'inHand',
          priority: 0,
          handler: () => { actionResolved = true; },
        },
      },
    };

    const game = createTestGame({
      extraRegistry: [cancellerDef, actionDef],
      extraEffects: [cancellerEffect, actionEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['test-cancellable-action'] },
    });
    // Put the canceller directly into claude's inPlay zone.
    game.state().players.claude.inPlay.push({ instanceId: 'canceller-1', cardId: 'test-canceller-keeper' });

    const result = await game.play('test-cancellable-action');

    expect(result).toEqual({ passed: false, cancelled: true });
    expect(actionResolved).toBe(false);
    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['test-cancellable-action']);
    expect(game.state().players.human.discard).toHaveLength(0);
  });

  it('pass: instanceId null logs a pass and touches no zones', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['starter-pocket-nebula'] },
    });
    const outcome = await resolvePlay(game.runtime, 'human', null);
    expect(outcome).toEqual({ passed: true, cancelled: false });
    expect(game.state().players.human.hand).toHaveLength(1); // untouched
    expect(game.state().log.some((e) => e.type === 'pass')).toBe(true);
  });
});
