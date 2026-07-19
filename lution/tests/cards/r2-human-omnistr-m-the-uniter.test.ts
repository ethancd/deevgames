import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';
import cardEffect from '../../src/effects/r2-human-omnistr-m-the-uniter';
import type { AIGameView } from '../../src/engine/types';

describe('r2-human-omnistr-m-the-uniter (Omnistroem the Uniter)', () => {
  it('is worth 1 point when it is the only keeper in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-omnistr-m-the-uniter'] },
    });

    expect(await game.score('human')).toBe(0);

    await game.play('r2-human-omnistr-m-the-uniter');
    expect(await game.score('human')).toBe(1);
  });

  it("counts the owner's OTHER keepers too", async () => {
    const otherDef = testCardDef('test-other-keeper');
    const otherEffect = testKeeperEffect('test-other-keeper', 1);

    const game = createTestGame({
      extraRegistry: [otherDef],
      extraEffects: [otherEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-omnistr-m-the-uniter', 'test-other-keeper'] },
    });

    await game.play('r2-human-omnistr-m-the-uniter');
    await game.play('test-other-keeper');

    // 2 keepers in play total: Omnistroem is worth 2, the other keeper is
    // worth its own flat 1 -- 3 total.
    expect(await game.score('human')).toBe(3);
  });

  it("counts the OPPONENT's keepers in play too, not just the owner's", async () => {
    const otherDef = testCardDef('test-other-keeper');
    const otherEffect = testKeeperEffect('test-other-keeper', 1);

    const game = createTestGame({
      extraRegistry: [otherDef],
      extraEffects: [otherEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-omnistr-m-the-uniter'], claude: ['test-other-keeper'] },
      firstPlayer: 'human',
    });

    await game.play('r2-human-omnistr-m-the-uniter');
    // Advance to claude's turn to play their keeper.
    await game.runTurn({ playInstanceId: null });
    await game.play('test-other-keeper');

    // 2 keepers total in play (Omnistroem + claude's keeper) -- Omnistroem
    // is worth 2 points to its owner (human); claude's keeper is worth 1 to
    // claude.
    expect(await game.score('human')).toBe(2);
    expect(await game.score('claude')).toBe(1);
  });

  it('drops back down when a counted keeper leaves play', async () => {
    const otherDef = testCardDef('test-other-keeper');
    const otherEffect = testKeeperEffect('test-other-keeper', 1);

    const game = createTestGame({
      extraRegistry: [otherDef],
      extraEffects: [otherEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-omnistr-m-the-uniter', 'test-other-keeper'] },
    });

    await game.play('r2-human-omnistr-m-the-uniter');
    await game.play('test-other-keeper');
    expect(await game.score('human')).toBe(3);

    const otherInstanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-other-keeper'
    )!.instanceId;
    await game.api.destroyKeeper('human', otherInstanceId);

    // Back down to 1 keeper in play (Omnistroem itself), worth 1.
    expect(await game.score('human')).toBe(1);
  });

  it('playValue/stealTargetValue estimate the post-play total keeper count', () => {
    const baseState = {
      players: {
        human: {
          id: 'human',
          drawPile: [],
          hand: [],
          inPlay: [
            { instanceId: 'h1', cardId: 'starter-pocket-nebula' },
            { instanceId: 'h2', cardId: 'starter-lint-elemental' },
          ],
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
    };
    const view = {
      self: 'human',
      opponent: 'claude',
      score: () => 0,
      state: baseState,
    } as unknown as AIGameView;

    const inHandInstance = { instanceId: 'still-in-hand', cardId: cardEffect.cardId };
    // Not yet in play: 3 keepers already on the table + 1 for itself once played.
    expect((cardEffect.strategy!.playValue as Function)(view, inHandInstance)).toBe(4);

    const inPlayInstance = { instanceId: 'h1', cardId: cardEffect.cardId };
    // Already counted among the 3 keepers currently in play.
    expect((cardEffect.strategy!.stealTargetValue as Function)(view, inPlayInstance)).toBe(3);
  });
});
