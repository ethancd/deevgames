import { describe, it, expect } from 'vitest';
import { formatNextCardsEntry } from '../../server/nextCards';
import type { CardDef, RoundRecord } from '../../shared/types';

function card(id: string, name: string, creatorId: CardDef['creatorId']): CardDef {
  return {
    id,
    name,
    effectText: 'Keeper. Worth 1 point(s) while in play.',
    creatorId,
    createdInRound: 1,
    destroyed: false,
    implemented: false,
  };
}

describe('formatNextCardsEntry', () => {
  const registry: CardDef[] = [
    card('r1-human-idea', 'The Idea', 'human'),
    card('r1-claude-idea', "Claude's Idea", 'claude'),
    card('r1-human-old', 'Old Human Card', 'human'),
    card('r1-claude-old', 'Old Claude Card', 'claude'),
  ];

  it('includes the round number, both designs by name, winner, and both steal picks when the loser and winner each take the offered design', () => {
    const record: RoundRecord = {
      round: 1,
      designs: { human: 'r1-human-idea', claude: 'r1-claude-idea' },
      winner: 'human',
      loser: 'claude',
      decision: 'steal',
      loserPick: { source: 'design', cardId: 'r1-human-idea', outcome: 'taken' },
      winnerPick: { source: 'design', cardId: 'r1-claude-idea', outcome: 'taken' },
      destroyed: [],
      timestamp: '2026-07-02T00:00:00.000Z',
    };

    const entry = formatNextCardsEntry(record, registry);

    expect(entry).toContain('Round 1');
    expect(entry).toContain('The Idea');
    expect(entry).toContain("Claude's Idea");
    expect(entry).toContain('human');
    expect(entry).toContain('steal');
    expect(entry).toContain('took');
    expect(entry).toContain('Step 1');
    expect(entry).toContain('Step 2');
  });

  it('describes a destroyed (creator-execution) pick distinctly from a taken one, and lists it under destroyed', () => {
    const record: RoundRecord = {
      round: 3,
      designs: { human: 'r1-human-idea', claude: 'r1-claude-idea' },
      winner: 'claude',
      loser: 'human',
      decision: 'steal',
      loserPick: { source: 'design', cardId: 'r1-claude-idea', outcome: 'taken' },
      winnerPick: { source: 'existing', cardId: 'r1-human-old', outcome: 'destroyed' },
      destroyed: ['r1-human-old'],
      timestamp: '2026-07-02T00:00:00.000Z',
    };

    const entry = formatNextCardsEntry(record, registry);
    expect(entry).toContain('destroyed');
    expect(entry).toContain('Old Human Card');
  });

  it('lists the spurned design of an "existing" pick under destroyed, even when the existing pick itself is taken', () => {
    const record: RoundRecord = {
      round: 5,
      designs: { human: 'r1-human-idea', claude: 'r1-claude-idea' },
      winner: 'claude',
      loser: 'human',
      decision: 'steal',
      loserPick: { source: 'existing', cardId: 'r1-claude-old', outcome: 'taken' },
      winnerPick: { source: 'design', cardId: 'r1-human-idea', outcome: 'taken' },
      destroyed: ['r1-claude-idea'],
      timestamp: '2026-07-02T00:00:00.000Z',
    };

    const entry = formatNextCardsEntry(record, registry);
    expect(entry).toContain('Destroyed this round');
    expect(entry).toContain("Claude's Idea");
  });

  it('describes a keep decision with no picks, each player keeping their own design', () => {
    const record: RoundRecord = {
      round: 6,
      designs: { human: 'r1-human-idea', claude: 'r1-claude-idea' },
      winner: 'human',
      loser: 'claude',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
      destroyed: [],
      timestamp: '2026-07-02T00:00:00.000Z',
    };

    const entry = formatNextCardsEntry(record, registry);
    expect(entry).toContain('Round 6');
    expect(entry).toContain('keep');
    expect(entry).toContain('own new design');
    // A keep resolution never mentions moving/taking/destroying cards.
    expect(entry).not.toContain('took');
    expect(entry).not.toContain('destroyed');
  });

  it('handles a null design (voided by the identical-simultaneous-designs rule) without throwing', () => {
    const record: RoundRecord = {
      round: 2,
      designs: { human: null, claude: 'r1-claude-idea' },
      winner: 'claude',
      loser: 'human',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
      destroyed: [],
      timestamp: '2026-07-02T00:00:00.000Z',
    };

    const entry = formatNextCardsEntry(record, registry);
    expect(entry).toContain('Round 2');
  });

  it('falls back to the raw card id when a design references an id missing from the registry', () => {
    const record: RoundRecord = {
      round: 4,
      designs: { human: 'unknown-id', claude: 'r1-claude-idea' },
      winner: 'human',
      loser: 'claude',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
      destroyed: [],
      timestamp: '2026-07-02T00:00:00.000Z',
    };

    const entry = formatNextCardsEntry(record, registry);
    expect(entry).toContain('unknown-id');
  });
});
