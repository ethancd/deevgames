import { describe, it, expect } from 'vitest';
import { createTestGame } from '../helpers';

describe('r2-claude-the-audit-trail (The Audit Trail)', () => {
  it('is a keeper worth 1 point while in play', async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r2-claude-the-audit-trail'] },
    });

    expect(await game.score('human')).toBe(0);

    const result = await game.play('r2-claude-the-audit-trail');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.human.inPlay.map((i) => i.cardId)).toEqual([
      'r2-claude-the-audit-trail',
    ]);
    expect(await game.score('human')).toBe(1);
  });

  it("does NOT draw at the start of the opponent's turn when the opponent has fewer or equal keepers in play", async () => {
    const game = createTestGame({
      decks: { human: ['starter-pocket-nebula'], claude: [] },
      hands: { human: ['r2-claude-the-audit-trail'], claude: [] },
      firstPlayer: 'human',
    });

    // Human plays The Audit Trail (1 keeper); hand is now empty.
    await game.play('r2-claude-the-audit-trail');

    // Human's own turn: onTurnStart doesn't fire (side: 'opponent', and
    // human owns the card), draws its normal 1 card, then passes.
    await game.runTurn({ playInstanceId: null });
    expect(game.state().players.human.drawPile).toHaveLength(0);
    expect(game.state().players.human.hand).toHaveLength(1);

    const drawPileBefore = game.state().players.human.drawPile.length;
    const handBefore = game.state().players.human.hand.length;

    // Claude's turn starts: claude has 0 keepers, human has 1 -- claude does
    // NOT have more keepers than human, so the hook does not fire.
    await game.runTurn({ playInstanceId: null });

    expect(game.state().players.human.drawPile.length).toBe(drawPileBefore);
    expect(game.state().players.human.hand.length).toBe(handBefore);
  });

  it("draws exactly 1 card for its owner at the start of the opponent's turn when the opponent has strictly more keepers in play", async () => {
    const game = createTestGame({
      decks: { human: ['starter-pocket-nebula', 'starter-pocket-nebula'], claude: [] },
      hands: { human: ['r2-claude-the-audit-trail'], claude: [] },
      firstPlayer: 'human',
    });

    await game.play('r2-claude-the-audit-trail');

    // Directly seed claude's board with 2 keepers (bypassing normal play) so
    // claude has strictly more keepers in play (2) than human (1) once
    // claude's turn starts.
    game.state().players.claude.inPlay.push(
      { instanceId: 'synthetic-1', cardId: 'test-only-synthetic-keeper-1' },
      { instanceId: 'synthetic-2', cardId: 'test-only-synthetic-keeper-2' }
    );

    // Human's own turn: draws 1 of its 2 remaining deck cards, then passes.
    await game.runTurn({ playInstanceId: null });
    expect(game.state().players.human.drawPile).toHaveLength(1);
    expect(game.state().players.human.hand).toHaveLength(1);

    const drawPileBefore = game.state().players.human.drawPile.length;
    const handBefore = game.state().players.human.hand.length;

    // Claude's turn starts: claude has 2 keepers, human has 1 -- strictly
    // more, so the hook fires and draws human 1 card before claude's own
    // draw phase runs.
    await game.runTurn({ playInstanceId: null });

    expect(game.state().players.human.drawPile.length).toBe(drawPileBefore - 1);
    expect(game.state().players.human.hand.length).toBe(handBefore + 1);
    expect(
      game.state().log.some((e) => e.type === 'flavor' && e.message.includes('Audit Trail'))
    ).toBe(true);
  });
});
