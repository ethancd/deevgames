import { describe, it, expect } from 'vitest';
import { createTestGame, testActionEffect, testCardDef, testKeeperEffect } from '../helpers';
import cardEffect from '../../src/effects/r6-human-mirrorblob';

describe('r6-human-mirrorblob (Mirrorblob)', () => {
  it("with exactly 1 other candidate in the OWNER's own hand, copies it without requesting a choice (a keeper enters the owner's play, and the original stays in hand)", async () => {
    const def = testCardDef('test-mirror-own-keeper');
    const effect = testKeeperEffect('test-mirror-own-keeper', 3);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r6-human-mirrorblob', 'test-mirror-own-keeper'], claude: [] },
    });
    const originalInstanceId = game.state().players.human.hand[1].instanceId;

    const result = await game.play('r6-human-mirrorblob');

    expect(result).toEqual({ passed: false, cancelled: false });
    // The original card is untouched, still sitting in hand.
    expect(game.state().players.human.hand.map((i) => i.instanceId)).toEqual([originalInstanceId]);
    // A brand-new, independent copy is what actually entered play.
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-mirror-own-keeper']);
    expect(game.state().players.human.inPlay[0].instanceId).not.toBe(originalInstanceId);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['r6-human-mirrorblob']);
    expect(await game.score('human')).toBe(3);
  });

  it("copies an action from the OPPONENT's hand, resolving it AS the owner and leaving the opponent's original completely untouched", async () => {
    let onPlayOwner: string | undefined;
    const def = testCardDef('test-mirror-opp-action');
    const effect = testActionEffect('test-mirror-opp-action', {
      hooks: {
        onPlay: {
          scope: 'inHand',
          handler: (ctx) => {
            onPlayOwner = ctx.owner;
          },
        },
      },
    });
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r6-human-mirrorblob'], claude: ['test-mirror-opp-action'] },
    });
    const opponentInstanceId = game.state().players.claude.hand[0].instanceId;

    await game.play('r6-human-mirrorblob');

    expect(onPlayOwner).toBe('human');
    // The opponent's original card never moves.
    expect(game.state().players.claude.hand.map((i) => i.instanceId)).toEqual([opponentInstanceId]);
    expect(game.state().players.claude.discard).toHaveLength(0);
    // The copy resolved and landed in the OWNER's discard, alongside Mirrorblob itself.
    expect(game.state().players.human.inPlay).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual([
      'test-mirror-opp-action',
      'r6-human-mirrorblob',
    ]);
  });

  it('with 2+ candidates across both hands, requests a choice (posed to the owner) and copies only the chosen one', async () => {
    const aDef = testCardDef('test-mirror-choice-a');
    const aEffect = testKeeperEffect('test-mirror-choice-a', 2);
    const bDef = testCardDef('test-mirror-choice-b');
    const bEffect = testKeeperEffect('test-mirror-choice-b', 6);
    // Synthetic instance ids pushed directly into each hand (same convention
    // as the Permafrost Bailiff's own tests) so the scripted choice can name
    // the target's id up front, without depending on dealing order.
    const game = createTestGame({
      extraRegistry: [aDef, bDef],
      extraEffects: [aEffect, bEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r6-human-mirrorblob'], claude: [] },
      choices: { human: [{ id: 'synth-mirror-choice-b' }] },
    });
    game.state().players.human.hand.push({ instanceId: 'synth-mirror-choice-a', cardId: 'test-mirror-choice-a' });
    game.state().players.claude.hand.push({ instanceId: 'synth-mirror-choice-b', cardId: 'test-mirror-choice-b' });

    await game.play('r6-human-mirrorblob');

    // Only the chosen candidate (the opponent's keeper) was copied.
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-mirror-choice-b']);
    expect(await game.score('human')).toBe(6);
    // The opponent's original stays put; the unchosen own-hand card stays put too.
    expect(game.state().players.claude.hand.map((i) => i.instanceId)).toEqual(['synth-mirror-choice-b']);
    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['test-mirror-choice-a']);
  });

  it('is a no-op (no crash) and logs a flavor message when neither hand has any other card to copy', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r6-human-mirrorblob'], claude: [] },
    });

    await expect(game.play('r6-human-mirrorblob')).resolves.toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['r6-human-mirrorblob']);
    expect(
      game.state().log.some((e) => e.type === 'flavor' && e.message.includes('Mirrorblob'))
    ).toBe(true);
  });

  it('requestChoice options are labeled with card NAMES, and no raw instance ids ever appear in the log', async () => {
    const aDef = testCardDef('test-mirror-label-a', { name: 'Label Mirror Card A' });
    const aEffect = testKeeperEffect('test-mirror-label-a', 1);
    const bDef = testCardDef('test-mirror-label-b', { name: 'Label Mirror Card B' });
    const bEffect = testKeeperEffect('test-mirror-label-b', 1);
    const game = createTestGame({
      extraRegistry: [aDef, bDef],
      extraEffects: [aEffect, bEffect],
      decks: { human: [], claude: [] },
      hands: {
        human: ['r6-human-mirrorblob', 'test-mirror-label-a'],
        claude: ['test-mirror-label-b'],
      },
    });

    await game.play('r6-human-mirrorblob');

    const labelLogs = game.state().log.filter((entry) => entry.message.includes('Label Mirror Card'));
    expect(labelLogs.length).toBeGreaterThan(0);
    for (const entry of game.state().log) {
      expect(entry.message).not.toMatch(/inst-\d+/);
      expect(entry.message).not.toMatch(/copy-\d+/);
    }
  });

  it('leaves a chosen cardId with no registered effect module logged and dropped instead of erroring', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r6-human-mirrorblob'], claude: ['totally-unregistered-mirror-card'] },
    });

    await expect(game.play('r6-human-mirrorblob')).resolves.toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['r6-human-mirrorblob']);
    expect(game.state().players.claude.hand.map((i) => i.cardId)).toEqual(['totally-unregistered-mirror-card']);
  });

  it('never offers another Mirrorblob as a copy target (self-copying would recurse without bound) -- an unrelated keeper is offered instead, without a choice', async () => {
    const def = testCardDef('test-mirror-alongside-keeper');
    const effect = testKeeperEffect('test-mirror-alongside-keeper', 5);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: {
        human: ['r6-human-mirrorblob', 'test-mirror-alongside-keeper'],
        claude: [],
      },
    });
    // A SECOND Mirrorblob sitting in the opponent's hand must never be
    // offered as a copy target -- only the unrelated keeper is a valid
    // candidate, so no choice is even requested.
    game.state().players.claude.hand.push({ instanceId: 'synth-mirror-sibling', cardId: 'r6-human-mirrorblob' });

    await expect(game.play('r6-human-mirrorblob')).resolves.toEqual({ passed: false, cancelled: false });

    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual(['test-mirror-alongside-keeper']);
    expect(await game.score('human')).toBe(5);
    // The sibling Mirrorblob is completely untouched.
    expect(game.state().players.claude.hand.map((i) => i.instanceId)).toEqual(['synth-mirror-sibling']);
  });

  it('strategy.choose prefers the HIGHEST-value candidate', () => {
    const view = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {} as never,
      score: () => 0,
    };
    const options = [
      { id: 'a', label: 'A', value: 0 },
      { id: 'b', label: 'B', value: 5 },
      { id: 'c', label: 'C', value: 2 },
    ];
    const chosen = cardEffect.strategy?.choose?.(view, options);
    expect(chosen?.id).toBe('b');
  });

  it('strategy.playValue drops to a low value once there is nothing at all left to copy', () => {
    const instance = { instanceId: 'self-inst', cardId: cardEffect.cardId };
    const emptyView = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {
        players: {
          human: { hand: [instance] },
          claude: { hand: [] },
        },
      } as never,
      score: () => 0,
    };
    const nonEmptyView = {
      self: 'human' as const,
      opponent: 'claude' as const,
      state: {
        players: {
          human: { hand: [instance] },
          claude: { hand: [{ instanceId: 'x', cardId: 'test-mirror-choice-a' }] },
        },
      } as never,
      score: () => 0,
    };
    const playValue = cardEffect.strategy?.playValue;
    const emptyResolved = typeof playValue === 'function' ? playValue(emptyView, instance) : playValue;
    const nonEmptyResolved = typeof playValue === 'function' ? playValue(nonEmptyView, instance) : playValue;
    expect(emptyResolved).toBeLessThan(nonEmptyResolved as number);
  });
});
