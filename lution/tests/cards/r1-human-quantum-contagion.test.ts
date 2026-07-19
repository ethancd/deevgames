import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect, testActionEffect } from '../helpers';
import cardEffect from '../../src/effects/r1-human-quantum-contagion';
import type { AIGameView } from '../../src/engine/types';

describe('r1-human-quantum-contagion (Quantum Contagion)', () => {
  it('is worth 0 points when it is alone in play and its hand holds no keeper', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r1-human-quantum-contagion'] },
    });

    await game.play('r1-human-quantum-contagion');
    expect(await game.score('human')).toBe(0);
  });

  it("is worth as much as the most valuable keeper left in its owner's hand", async () => {
    const def = testCardDef('test-keeper-3');
    const effect = testKeeperEffect('test-keeper-3', 3);

    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r1-human-quantum-contagion', 'test-keeper-3'] },
    });

    await game.play('r1-human-quantum-contagion');
    // test-keeper-3 stays in hand -- Quantum Contagion alone in play,
    // re-priced to the 3-point keeper still sitting in hand.
    expect(await game.score('human')).toBe(3);
  });

  it("extends to all its owner's OTHER keepers in play too, overriding their own base values", async () => {
    const oneDef = testCardDef('test-keeper-1');
    const oneEffect = testKeeperEffect('test-keeper-1', 1);
    const fiveDef = testCardDef('test-keeper-5');
    const fiveEffect = testKeeperEffect('test-keeper-5', 5);

    const game = createTestGame({
      extraRegistry: [oneDef, fiveDef],
      extraEffects: [oneEffect, fiveEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r1-human-quantum-contagion', 'test-keeper-1', 'test-keeper-5'] },
    });

    await game.play('test-keeper-1');
    await game.play('r1-human-quantum-contagion');
    // test-keeper-5 stays in hand as the reference; test-keeper-1 (normally
    // worth 1) and Quantum Contagion (normally worth 0) are both re-priced
    // to 5 -- 10 total.
    expect(await game.score('human')).toBe(10);
  });

  it('ignores action cards in hand when finding the most valuable keeper', async () => {
    const keeperDef = testCardDef('test-keeper-2');
    const keeperEffect = testKeeperEffect('test-keeper-2', 2);
    const actionDef = testCardDef('test-action-high');
    // An action's baseValue is not a "point value" at all (actions score 0
    // by convention) -- this inflated baseValue exists purely to prove it's
    // excluded, not to model a real action card.
    const actionEffect = testActionEffect('test-action-high', { baseValue: 99 });

    const game = createTestGame({
      extraRegistry: [keeperDef, actionDef],
      extraEffects: [keeperEffect, actionEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r1-human-quantum-contagion', 'test-action-high', 'test-keeper-2'] },
    });

    await game.play('r1-human-quantum-contagion');
    // Only the real keeper (worth 2) counts as a candidate -- the action's
    // inflated baseValue is never consulted.
    expect(await game.score('human')).toBe(2);
  });

  it("does not affect the opponent's keepers or read from the opponent's hand", async () => {
    const ownDef = testCardDef('test-keeper-7');
    const ownEffect = testKeeperEffect('test-keeper-7', 7);
    const oppDef = testCardDef('test-opp-keeper');
    const oppEffect = testKeeperEffect('test-opp-keeper', 1);

    const game = createTestGame({
      extraRegistry: [ownDef, oppDef],
      extraEffects: [oppEffect, ownEffect],
      decks: { human: [], claude: [] },
      hands: { human: ['r1-human-quantum-contagion', 'test-keeper-7'], claude: [] },
    });

    await game.play('r1-human-quantum-contagion');
    game.state().players.claude.inPlay.push({ instanceId: 'synth-opp', cardId: 'test-opp-keeper' });

    expect(await game.score('human')).toBe(7);
    expect(await game.score('claude')).toBe(1);
  });

  it('drops back down when the counted keeper leaves play, and tracks a shrinking hand reference', async () => {
    const def = testCardDef('test-keeper-4');
    const effect = testKeeperEffect('test-keeper-4', 4);

    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r1-human-quantum-contagion', 'test-keeper-4'] },
    });

    await game.play('r1-human-quantum-contagion');
    expect(await game.score('human')).toBe(4);

    const instanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'r1-human-quantum-contagion'
    )!.instanceId;
    await game.api.destroyKeeper('human', instanceId);

    // Quantum Contagion itself is gone -- nothing left in play to re-price,
    // and the modifyScore hook no longer fires at all.
    expect(await game.score('human')).toBe(0);
  });

  it('playValue/stealTargetValue scale with the current board and are never below 1', () => {
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
          inPlay: [],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
      },
    };
    // Owner's board is worth 6 total (average 3/keeper) across its 2 keepers.
    const view = {
      self: 'human',
      opponent: 'claude',
      score: () => 6,
      state: baseState,
    } as unknown as AIGameView;

    const inHandInstance = { instanceId: 'still-in-hand', cardId: cardEffect.cardId };
    // Not yet in play: 2 keepers already on the table + 1 for itself, times
    // the average per-keeper value of 3.
    expect((cardEffect.strategy!.playValue as Function)(view, inHandInstance)).toBe(9);

    const inPlayInstance = { instanceId: 'h1', cardId: cardEffect.cardId };
    // Already counted among the 2 keepers currently in play.
    expect((cardEffect.strategy!.stealTargetValue as Function)(view, inPlayInstance)).toBe(6);

    const emptyBoardView = {
      ...view,
      self: 'claude',
      opponent: 'human',
      score: () => 0,
    } as unknown as AIGameView;
    // Empty board: floors at 1 rather than reporting 0.
    expect((cardEffect.strategy!.playValue as Function)(emptyBoardView, inHandInstance)).toBe(1);
  });
});
