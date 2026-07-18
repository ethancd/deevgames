import { describe, it, expect } from 'vitest';
import { createTestGame, testCardDef, testKeeperEffect } from '../helpers';
import { compileComposition } from '../../src/engine/compileComposition';
import cardsData from '../../data/cards.json';
import type { AIGameView } from '../../src/engine/types';

const r2ClaudeTheMarginalUtilityMagnateRow = (
  cardsData as Array<{ id: string; composition?: unknown }>
).find((c) => c.id === 'r2-claude-the-marginal-utility-magnate')!;
const cardEffect = compileComposition(
  'r2-claude-the-marginal-utility-magnate',
  r2ClaudeTheMarginalUtilityMagnateRow.composition as any
);

describe('r2-claude-the-marginal-utility-magnate (The Marginal Utility Magnate)', () => {
  it('is worth 1 point when it is the only keeper in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-marginal-utility-magnate'] },
    });

    expect(await game.score('human')).toBe(0);

    const result = await game.play('r2-claude-the-marginal-utility-magnate');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r2-claude-the-marginal-utility-magnate',
    ]);
    expect(await game.score('human')).toBe(1);
  });

  it('does NOT bonus off another keeper worth exactly 1 point', async () => {
    const def = testCardDef('test-keeper-one');
    const effect = testKeeperEffect('test-keeper-one', 1);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-marginal-utility-magnate', 'test-keeper-one'] },
    });

    await game.play('r2-claude-the-marginal-utility-magnate');
    await game.play('test-keeper-one');

    // Magnate: 1 (own) + 0 (the other keeper is only worth 1, not MORE than
    // 1). Other keeper: 1. Total: 2.
    expect(await game.score('human')).toBe(2);
  });

  it('bonuses 1 point for each other keeper worth strictly more than 1 point', async () => {
    const defs = [testCardDef('test-keeper-two'), testCardDef('test-keeper-three')];
    const effects = [testKeeperEffect('test-keeper-two', 2), testKeeperEffect('test-keeper-three', 3)];
    const game = createTestGame({
      extraRegistry: defs,
      extraEffects: effects,
      decks: { human: [], claude: [] },
      hands: {
        human: ['r2-claude-the-marginal-utility-magnate', 'test-keeper-two', 'test-keeper-three'],
      },
    });

    await game.play('r2-claude-the-marginal-utility-magnate');
    await game.play('test-keeper-two');
    await game.play('test-keeper-three');

    // Magnate: 1 (own) + 1 (test-keeper-two, worth 2) + 1 (test-keeper-three,
    // worth 3) = 3. Others: 2 + 3 = 5. Total: 8.
    expect(await game.score('human')).toBe(8);
  });

  it("does NOT count the OPPONENT's keepers, only ones the owner controls", async () => {
    const def = testCardDef('test-keeper-opp');
    const effect = testKeeperEffect('test-keeper-opp', 5);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-marginal-utility-magnate'], claude: [] },
    });

    game.state().players.claude.inPlay.push({ instanceId: 'synth-opp', cardId: 'test-keeper-opp' });

    await game.play('r2-claude-the-marginal-utility-magnate');

    // Only the owner's own board counts -- claude's 5-point keeper doesn't
    // bonus human's Magnate.
    expect(await game.score('human')).toBe(1);
    expect(await game.score('claude')).toBe(5);
  });

  it('does not count itself among the "other keepers" it checks', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-marginal-utility-magnate'] },
    });

    await game.play('r2-claude-the-marginal-utility-magnate');
    // Only 1 point: it never counts its own (dynamic) value against itself.
    expect(await game.score('human')).toBe(1);
  });

  it('treats a frozen keeper as worth only its override value, not its original baseValue', async () => {
    const def = testCardDef('test-keeper-frozen');
    const effect = testKeeperEffect('test-keeper-frozen', 4);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-marginal-utility-magnate', 'test-keeper-frozen'] },
    });

    await game.play('r2-claude-the-marginal-utility-magnate');
    await game.play('test-keeper-frozen');
    expect(await game.score('human')).toBe(1 + 1 + 4); // Magnate bonuses off the 4-point keeper.

    const frozenInstanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-keeper-frozen'
    )!.instanceId;
    game.api.setScoreOverride(frozenInstanceId, 1);

    // Frozen down to 1 point -- no longer "worth more than 1", so the
    // Magnate stops bonusing off it.
    expect(await game.score('human')).toBe(1 + 1);
  });

  it('drops the bonus when a qualifying keeper leaves play', async () => {
    const def = testCardDef('test-keeper-leaves');
    const effect = testKeeperEffect('test-keeper-leaves', 2);
    const game = createTestGame({
      extraRegistry: [def],
      extraEffects: [effect],
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-marginal-utility-magnate', 'test-keeper-leaves'] },
    });

    await game.play('r2-claude-the-marginal-utility-magnate');
    await game.play('test-keeper-leaves');
    expect(await game.score('human')).toBe(1 + 1 + 2);

    const instanceId = game.state().players.human.inPlay.find(
      (i) => i.cardId === 'test-keeper-leaves'
    )!.instanceId;
    await game.api.destroyKeeper('human', instanceId);

    expect(await game.score('human')).toBe(1);
  });

  it('playValue/stealTargetValue scale with the excess value on the owner\'s board', () => {
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
          inPlay: [],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
      },
      effectState: {},
    };
    const view = {
      self: 'human',
      opponent: 'claude',
      score: (p: string) => (p === 'human' ? 2 : 0),
      state: baseState,
    } as unknown as AIGameView;

    const inHandInstance = { instanceId: 'still-in-hand', cardId: cardEffect.cardId };
    // Not yet in play: owner's board has 1 keeper worth 2 total -> 1 excess
    // point over the flat "1 per keeper" baseline -> 1 + 1 = 2.
    expect((cardEffect.strategy!.playValue as Function)(view, inHandInstance)).toBe(2);

    const emptyBoardView = {
      ...view,
      score: () => 0,
      state: { ...baseState, players: { ...baseState.players, human: { ...baseState.players.human, inPlay: [] } } },
    } as unknown as AIGameView;
    const inHandOnEmptyBoard = { instanceId: 'still-in-hand-2', cardId: cardEffect.cardId };
    expect((cardEffect.strategy!.playValue as Function)(emptyBoardView, inHandOnEmptyBoard)).toBe(1);
  });
});
