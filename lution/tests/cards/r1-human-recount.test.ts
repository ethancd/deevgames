import { describe, it, expect } from 'vitest';
import { createTestGame } from '../helpers';
import cardEffect from '../../src/effects/r1-human-recount';
import type { AIGameView } from '../../src/engine/types';

describe('r1-human-recount (Recount)', () => {
  it('draws 1 card for the player, then the opponent discards 1 chosen card from their hand', async () => {
    const game = createTestGame({
      decks: {
        human: ['starter-pocket-nebula'],
        claude: [],
      },
      hands: {
        human: ['r1-human-recount'],
        claude: ['starter-quantum-duckling', 'starter-lint-elemental'],
      },
      // No scripted choice queued: the test helper's default responder
      // falls back to the first offered option, i.e. claude's first hand
      // card (starter-quantum-duckling).
    });

    const keepTargetId = game.state().players.claude.hand[1].instanceId;
    const discardTargetId = game.state().players.claude.hand[0].instanceId;

    const result = await game.play('r1-human-recount');
    expect(result).toEqual({ passed: false, cancelled: false });

    // Drew 1 card into human's hand.
    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['starter-pocket-nebula']);
    expect(game.state().players.human.drawPile).toHaveLength(0);

    // The card itself resolved and was discarded.
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual(['r1-human-recount']);

    // Opponent discarded exactly the (first-offered) chosen card, keeping the other.
    expect(game.state().players.claude.hand.map((i) => i.instanceId)).toEqual([keepTargetId]);
    expect(game.state().players.claude.discard.map((i) => i.instanceId)).toEqual([discardTargetId]);
  });

  it('is a no-op for the discard step when the opponent has an empty hand', async () => {
    const game = createTestGame({
      decks: {
        human: ['starter-pocket-nebula'],
        claude: [],
      },
      hands: {
        human: ['r1-human-recount'],
        claude: [],
      },
    });

    const result = await game.play('r1-human-recount');
    expect(result).toEqual({ passed: false, cancelled: false });

    expect(game.state().players.human.hand.map((i) => i.cardId)).toEqual(['starter-pocket-nebula']);
    expect(game.state().players.claude.hand).toHaveLength(0);
    expect(game.state().players.claude.discard).toHaveLength(0);
  });

  it("choose() prefers discarding a duplicate-in-hand card over the opponent's only unique card", () => {
    const options = [
      { id: 'a', cardId: 'starter-quantum-duckling' },
      { id: 'b', cardId: 'starter-lint-elemental' },
    ];
    const view = {
      self: 'claude',
      opponent: 'human',
      score: () => 0,
      state: {
        players: {
          claude: {
            id: 'claude',
            drawPile: [],
            hand: [
              { instanceId: 'a', cardId: 'starter-quantum-duckling' },
              { instanceId: 'b', cardId: 'starter-lint-elemental' },
              { instanceId: 'c', cardId: 'starter-lint-elemental' },
            ],
            inPlay: [],
            discard: [],
            skipNextDraw: false,
            extraTurns: 0,
          },
          human: {
            id: 'human',
            drawPile: [],
            hand: [],
            inPlay: [],
            discard: [],
            skipNextDraw: false,
            extraTurns: 0,
          },
        },
      },
    } as unknown as AIGameView;

    const chosen = cardEffect.strategy!.choose!(view, options);
    expect(chosen.id).toBe('b');
  });
});
