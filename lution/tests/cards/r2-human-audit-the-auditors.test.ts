import { describe, it, expect } from 'vitest';
import { createTestGame } from '../helpers';

describe('r2-human-audit-the-auditors (Audit the Auditors)', () => {
  it("discards exactly 1 card from the opponent's hand, leaving the rest untouched", async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: {
        human: ['r2-human-audit-the-auditors'],
        claude: ['starter-pocket-nebula', 'starter-humble-lemma'],
      },
    });

    const result = await game.play('r2-human-audit-the-auditors');
    expect(result).toEqual({ passed: false, cancelled: false });

    const claudeState = game.state().players.claude;
    expect(claudeState.hand).toHaveLength(1);
    expect(claudeState.discard).toHaveLength(1);
    // The discarded card is one of the two originally-held cards, and the
    // remaining hand card is the other one.
    const remaining = claudeState.hand[0].cardId;
    const discarded = claudeState.discard[0].cardId;
    expect(['starter-pocket-nebula', 'starter-humble-lemma']).toContain(remaining);
    expect(['starter-pocket-nebula', 'starter-humble-lemma']).toContain(discarded);
    expect(remaining).not.toBe(discarded);

    // The action itself resolves and discards from hand as usual.
    expect(game.state().players.human.hand).toHaveLength(0);
    expect(game.state().players.human.discard.map((i) => i.cardId)).toEqual([
      'r2-human-audit-the-auditors',
    ]);
  });

  it("is a no-op discard (but still resolves + discards itself) when the opponent's hand is empty", async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: { human: ['r2-human-audit-the-auditors'], claude: [] },
    });

    const result = await game.play('r2-human-audit-the-auditors');
    expect(result).toEqual({ passed: false, cancelled: false });
    expect(game.state().players.claude.hand).toHaveLength(0);
    expect(game.state().players.claude.discard).toHaveLength(0);
  });

  it("logs a flavor message naming every card seen in the opponent's hand", async () => {
    const game = createTestGame({
      decks: { human: [], claude: [] },
      hands: {
        human: ['r2-human-audit-the-auditors'],
        claude: ['starter-pocket-nebula', 'starter-humble-lemma'],
      },
    });

    await game.play('r2-human-audit-the-auditors');

    const entry = game.state().log.find((e) => e.type === 'flavor' && e.message.includes('Audit the Auditors'));
    expect(entry).toBeDefined();
    expect(entry?.message).toContain('starter-pocket-nebula');
    expect(entry?.message).toContain('starter-humble-lemma');
  });

  it('discards a genuinely random card across seeds (not always the same index)', async () => {
    const discardedIds = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const game = createTestGame({
        seed,
        decks: { human: [], claude: [] },
        hands: {
          human: ['r2-human-audit-the-auditors'],
          claude: ['starter-pocket-nebula', 'starter-humble-lemma'],
        },
      });
      await game.play('r2-human-audit-the-auditors');
      discardedIds.add(game.state().players.claude.discard[0].cardId);
    }
    // Across enough seeds, both cards should show up as the discarded one.
    expect(discardedIds.size).toBe(2);
  });
});
