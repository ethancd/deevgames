import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';
import cardEffect from '../../src/effects/r2-human-crystalline-vampire';
import type { AIGameView } from '../../src/engine/types';

describe('r2-human-crystalline-vampire (Crystalline Vampire)', () => {
  it('is worth 0 points when nothing on the board is frozen', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-crystalline-vampire'] },
    });

    const result = await game.play('r2-human-crystalline-vampire');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r2-human-crystalline-vampire',
    ]);
    expect(await game.score('human')).toBe(0);
  });

  it('is worth 1 point per frozen keeper on ITS OWNER\'S side of the board', async () => {
    // Frozen to the SAME value it's already worth (1), so freezing it
    // doesn't change ITS OWN contribution to score() -- isolating the
    // Vampire's own bonus, which is what this test is actually about.
    const def = testCardDef('test-keeper-frozen-own');
    const effect = testKeeperEffect('test-keeper-frozen-own', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-crystalline-vampire', 'test-keeper-frozen-own'] },
    });

    await game.play('r2-human-crystalline-vampire');
    await game.play('test-keeper-frozen-own');
    // Nothing frozen yet: Vampire contributes 0, the other keeper its flat 1.
    expect(await game.score('human')).toBe(1);

    const instanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-keeper-frozen-own'
    )!.instanceId;
    game.api.setScoreOverride(instanceId, 1);

    // 1 frozen keeper in the game: Vampire now contributes 1, plus the
    // other keeper's still-1-point (now overridden, but same value) worth.
    expect(await game.score('human')).toBe(2);
  });

  it("counts frozen keepers on the OPPONENT's side of the board too", async () => {
    const def = testCardDef('test-keeper-frozen-opp');
    const effect = testKeeperEffect('test-keeper-frozen-opp', 5);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-crystalline-vampire'], claude: [] },
    });

    await game.play('r2-human-crystalline-vampire');
    game.state().players.claude.inPlay.push({ instanceId: 'synth-frozen', cardId: 'test-keeper-frozen-opp' });
    game.api.setScoreOverride('synth-frozen', 1);

    // "In the game" counts every frozen keeper on the board, not just the
    // owner's own side.
    expect(await game.score('human')).toBe(1);
  });

  it('scales with multiple frozen keepers across both boards', async () => {
    // Each frozen to the same value it's already worth (1), so this test
    // isolates the Vampire's own scaling bonus rather than mixing in
    // changes to the frozen keepers' own contributions.
    const defs = [testCardDef('test-frozen-a'), testCardDef('test-frozen-b'), testCardDef('test-frozen-c')];
    const effects = [
      testKeeperEffect('test-frozen-a', 1),
      testKeeperEffect('test-frozen-b', 1),
      testKeeperEffect('test-frozen-c', 1),
    ];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-crystalline-vampire', 'test-frozen-a', 'test-frozen-b'], claude: [] },
    });

    await game.play('r2-human-crystalline-vampire');
    await game.play('test-frozen-a');
    await game.play('test-frozen-b');
    game.state().players.claude.inPlay.push({ instanceId: 'synth-c', cardId: 'test-frozen-c' });

    const aId = game.state().players.human.inPlay.find((i) => i.cardId === 'test-frozen-a')!.instanceId;
    const bId = game.state().players.human.inPlay.find((i) => i.cardId === 'test-frozen-b')!.instanceId;
    game.api.setScoreOverride(aId, 1);
    game.api.setScoreOverride(bId, 1);
    game.api.setScoreOverride('synth-c', 1);

    // 3 frozen keepers in the game -- Vampire contributes 3, plus the 2
    // frozen keepers on human's own side each still worth their flat 1.
    expect(await game.score('human')).toBe(5);
  });

  it('drops back down when a frozen keeper is unfrozen (score override cleared)', async () => {
    // Frozen to the same value it's already worth (1), isolating the
    // Vampire's own bonus from any change in the frozen keeper's own
    // contribution.
    const def = testCardDef('test-thaw');
    const effect = testKeeperEffect('test-thaw', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-crystalline-vampire', 'test-thaw'] },
    });

    await game.play('r2-human-crystalline-vampire');
    await game.play('test-thaw');
    expect(await game.score('human')).toBe(1); // Vampire 0 + thaw's flat 1.

    const instanceId = game.state().players.human.inPlay.find((i) => i.cardId === 'test-thaw')!.instanceId;
    game.api.setScoreOverride(instanceId, 1);
    expect(await game.score('human')).toBe(2); // Vampire 1 (1 frozen) + thaw's still-1-point override.

    game.api.clearScoreOverride(instanceId);
    // Unfrozen: Vampire back to 0 (nothing frozen), thaw back to its flat 1.
    expect(await game.score('human')).toBe(1);
  });

  it('playValue/stealTargetValue reflect the current frozen count on the board, with a floor of 1', () => {
    const baseState = {
      players: {
        human: {
          id: 'human',
          drawPile: [],
          hand: [],
          inPlay: [{ instanceId: 'h1', cardId: 'starter-dragon-hoard-index' }],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
        claude: {
          id: 'claude',
          drawPile: [],
          hand: [],
          inPlay: [{ instanceId: 'c1', cardId: 'starter-quantum-duckling' }],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
      },
      effectState: {
        '__scoreOverride__:h1': 1,
        '__scoreOverride__:c1': 1,
      },
    };
    const view = {
      self: 'human',
      opponent: 'claude',
      score: () => 0,
      state: baseState,
    } as unknown as AIGameView;

    const instance = { instanceId: 'still-in-hand', cardId: cardEffect.cardId };
    expect((cardEffect.strategy!.playValue as Function)(view, instance)).toBe(2);
    expect((cardEffect.strategy!.stealTargetValue as Function)(view, instance)).toBe(2);

    const noFreezeView = { ...view, state: { ...baseState, effectState: {} } } as unknown as AIGameView;
    // Floors at 1 even with nothing frozen, so it's never valued at 0.
    expect((cardEffect.strategy!.playValue as Function)(noFreezeView, instance)).toBe(1);
  });
});
