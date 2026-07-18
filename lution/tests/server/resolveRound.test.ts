import { describe, it, expect } from 'vitest';
import { resolveRound } from '../../server/resolveRound';
import type { CardDef, MatchState, RoundPick } from '../../shared/types';

function card(overrides: Partial<CardDef> & Pick<CardDef, 'id' | 'creatorId'>): CardDef {
  return {
    name: overrides.id,
    effectText: 'Keeper. Worth 1 point(s) while in play.',
    createdInRound: 1,
    destroyed: false,
    implemented: false,
    ...overrides,
  };
}

function match(overrides: Partial<MatchState> = {}): MatchState {
  return {
    matchId: 'match-1',
    createdAt: new Date(0).toISOString(),
    decks: { human: [], claude: [] },
    innerWins: { human: 1, claude: 0 },
    round: 2,
    nextFirstPlayer: 'claude',
    matchSeed: 1,
    currentInnerGame: null,
    roundHistory: [],
    phase: 'design',
    winner: null,
    ...overrides,
  };
}

describe('resolveRound: keep', () => {
  it('each player adds their OWN design to their OWN deck and nothing else moves', () => {
    const registry: CardDef[] = [
      card({ id: 'r2-human-fresh', creatorId: 'human' }),
      card({ id: 'r2-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({ decks: { human: ['starter-a'], claude: ['starter-b'] } });

    const result = resolveRound({
      match: m,
      registry,
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'human',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
    });

    expect(result.match.decks.human).toEqual(['starter-a', 'r2-human-fresh']);
    expect(result.match.decks.claude).toEqual(['starter-b', 'r2-claude-fresh']);
    expect(result.record.winner).toBe('human');
    expect(result.record.loser).toBe('claude');
    expect(result.record.decision).toBe('keep');
    expect(result.record.loserPick).toBeNull();
    expect(result.record.winnerPick).toBeNull();
    expect(result.record.destroyed).toEqual([]);
    expect(result.registry).toEqual(registry);
  });

  it('throws if a loserPick is supplied', () => {
    const registry: CardDef[] = [
      card({ id: 'r2-human-fresh', creatorId: 'human' }),
      card({ id: 'r2-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({ decks: { human: [], claude: [] } });

    expect(() =>
      resolveRound({
        match: m,
        registry,
        round: 2,
        designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
        winner: 'human',
        decision: 'keep',
        loserPick: { source: 'design', cardId: 'r2-claude-fresh', outcome: 'taken' },
        winnerPick: null,
      })
    ).toThrow(/keep resolution must not carry/);
  });

  it('throws if a winnerPick is supplied', () => {
    const registry: CardDef[] = [
      card({ id: 'r2-human-fresh', creatorId: 'human' }),
      card({ id: 'r2-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({ decks: { human: [], claude: [] } });

    expect(() =>
      resolveRound({
        match: m,
        registry,
        round: 2,
        designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
        winner: 'human',
        decision: 'keep',
        loserPick: null,
        winnerPick: { source: 'design', cardId: 'r2-human-fresh', outcome: 'taken' },
      })
    ).toThrow(/keep resolution must not carry/);
  });
});

describe('resolveRound: steal, both picks take the offered design', () => {
  it('moves the winner design to the loser and the loser design to the winner; nothing destroyed', () => {
    const registry: CardDef[] = [
      card({ id: 'r2-human-fresh', creatorId: 'human' }),
      card({ id: 'r2-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({ decks: { human: ['starter-a'], claude: ['starter-b'] } });

    const result = resolveRound({
      match: m,
      registry,
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'claude',
      decision: 'steal',
      loserPick: { source: 'design', cardId: 'r2-claude-fresh', outcome: 'taken' },
      winnerPick: { source: 'design', cardId: 'r2-human-fresh', outcome: 'taken' },
    });

    // Loser (human) took the winner's (claude's) design.
    expect(result.match.decks.human).toEqual(['starter-a', 'r2-claude-fresh']);
    // Winner (claude) counter-raided the loser's (human's) design right back.
    expect(result.match.decks.claude).toEqual(['starter-b', 'r2-human-fresh']);
    expect(result.record.destroyed).toEqual([]);
    expect(result.registry).toEqual(registry);
  });
});

describe('resolveRound: steal, loser picks an existing winner-deck card', () => {
  it('MOVES it (loser did not create it) and DESTROYS the spurned winner design', () => {
    const registry: CardDef[] = [
      card({ id: 'old-winner-card', creatorId: 'claude' }), // the LOSER (human) didn't create this
      card({ id: 'r3-human-fresh', creatorId: 'human' }),
      card({ id: 'r3-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({
      round: 3,
      decks: { human: [], claude: ['old-winner-card'] },
    });

    const result = resolveRound({
      match: m,
      registry,
      round: 3,
      designs: { human: 'r3-human-fresh', claude: 'r3-claude-fresh' },
      winner: 'claude',
      decision: 'steal',
      loserPick: { source: 'existing', cardId: 'old-winner-card', outcome: 'taken' },
      winnerPick: { source: 'design', cardId: 'r3-human-fresh', outcome: 'taken' },
    });

    // Loser (human) gained the existing card, moved out of winner's deck.
    expect(result.match.decks.human).toContain('old-winner-card');
    expect(result.match.decks.claude).not.toContain('old-winner-card');
    // The spurned winner design never entered any deck and is destroyed.
    expect(result.match.decks.human).not.toContain('r3-claude-fresh');
    expect(result.match.decks.claude).not.toContain('r3-claude-fresh');
    expect(result.registry.find((c) => c.id === 'r3-claude-fresh')?.destroyed).toBe(true);
    expect(result.record.destroyed).toEqual(['r3-claude-fresh']);
    // Winner still counter-raided the loser's design.
    expect(result.match.decks.claude).toContain('r3-human-fresh');
  });

  it('EXECUTES it (loser originally created it) instead of taking it, and still destroys the spurned winner design', () => {
    const registry: CardDef[] = [
      card({ id: 'human-old-card', creatorId: 'human' }), // the LOSER (human) created this
      card({ id: 'r5-human-fresh', creatorId: 'human' }),
      card({ id: 'r5-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({
      round: 5,
      decks: { human: [], claude: ['human-old-card'] },
    });

    const result = resolveRound({
      match: m,
      registry,
      round: 5,
      designs: { human: 'r5-human-fresh', claude: 'r5-claude-fresh' },
      winner: 'claude',
      decision: 'steal',
      loserPick: { source: 'existing', cardId: 'human-old-card', outcome: 'destroyed' },
      winnerPick: { source: 'design', cardId: 'r5-human-fresh', outcome: 'taken' },
    });

    // Executed: gone from claude's deck, never appears in human's either.
    expect(result.match.decks.claude).not.toContain('human-old-card');
    expect(result.match.decks.human).not.toContain('human-old-card');
    expect(result.registry.find((c) => c.id === 'human-old-card')?.destroyed).toBe(true);
    // The spurned winner design is ALSO destroyed.
    expect(result.registry.find((c) => c.id === 'r5-claude-fresh')?.destroyed).toBe(true);
    expect(result.record.destroyed.sort()).toEqual(['human-old-card', 'r5-claude-fresh'].sort());
  });
});

describe('resolveRound: steal, winner counter-raids an existing loser-deck card', () => {
  it('MOVES it (winner did not create it) and DESTROYS the spurned loser design', () => {
    const registry: CardDef[] = [
      card({ id: 'old-loser-card', creatorId: 'human' }), // the WINNER (claude) didn't create this
      card({ id: 'r7-human-fresh', creatorId: 'human' }),
      card({ id: 'r7-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({
      round: 7,
      decks: { human: ['old-loser-card'], claude: [] },
    });

    const result = resolveRound({
      match: m,
      registry,
      round: 7,
      designs: { human: 'r7-human-fresh', claude: 'r7-claude-fresh' },
      winner: 'claude',
      decision: 'steal',
      loserPick: { source: 'design', cardId: 'r7-claude-fresh', outcome: 'taken' },
      winnerPick: { source: 'existing', cardId: 'old-loser-card', outcome: 'taken' },
    });

    expect(result.match.decks.claude).toContain('old-loser-card');
    expect(result.match.decks.human).not.toContain('old-loser-card');
    // The spurned loser design never entered any deck.
    expect(result.match.decks.human).not.toContain('r7-human-fresh');
    expect(result.match.decks.claude).not.toContain('r7-human-fresh');
    expect(result.registry.find((c) => c.id === 'r7-human-fresh')?.destroyed).toBe(true);
    expect(result.record.destroyed).toEqual(['r7-human-fresh']);
  });

  it('EXECUTES it (winner originally created it) instead of taking it, and still destroys the spurned loser design', () => {
    const registry: CardDef[] = [
      card({ id: 'claude-old-card', creatorId: 'claude' }), // the WINNER (claude) created this
      card({ id: 'r9-human-fresh', creatorId: 'human' }),
      card({ id: 'r9-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({
      round: 9,
      // human (the loser this round) holds a copy of a card claude created
      // long ago (e.g. stolen from claude in an earlier round).
      decks: { human: ['claude-old-card'], claude: [] },
    });

    const result = resolveRound({
      match: m,
      registry,
      round: 9,
      designs: { human: 'r9-human-fresh', claude: 'r9-claude-fresh' },
      winner: 'claude',
      decision: 'steal',
      loserPick: { source: 'design', cardId: 'r9-claude-fresh', outcome: 'taken' },
      winnerPick: { source: 'existing', cardId: 'claude-old-card', outcome: 'destroyed' },
    });

    expect(result.match.decks.human).not.toContain('claude-old-card');
    expect(result.match.decks.claude).not.toContain('claude-old-card');
    expect(result.registry.find((c) => c.id === 'claude-old-card')?.destroyed).toBe(true);
    expect(result.registry.find((c) => c.id === 'r9-human-fresh')?.destroyed).toBe(true);
    expect(result.record.destroyed.sort()).toEqual(['claude-old-card', 'r9-human-fresh'].sort());
  });
});

describe('resolveRound: the maximum-carnage case (four cards leave the game in one steal)', () => {
  it('both picks execute a creator-owned existing card AND both offered designs are spurned', () => {
    const registry: CardDef[] = [
      card({ id: 'human-old-card', creatorId: 'human' }), // sits in claude's (winner's) deck
      card({ id: 'claude-old-card', creatorId: 'claude' }), // sits in human's (loser's) deck
      card({ id: 'r11-human-fresh', creatorId: 'human' }),
      card({ id: 'r11-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({
      round: 11,
      decks: { human: ['claude-old-card'], claude: ['human-old-card'] },
    });

    const result = resolveRound({
      match: m,
      registry,
      round: 11,
      designs: { human: 'r11-human-fresh', claude: 'r11-claude-fresh' },
      winner: 'claude',
      decision: 'steal',
      // Loser (human) executes their own old card sitting in claude's deck
      // (pure denial), spurning claude's fresh design in the process.
      loserPick: { source: 'existing', cardId: 'human-old-card', outcome: 'destroyed' },
      // Winner (claude) executes their own old card sitting in human's deck,
      // spurning human's fresh design in the process.
      winnerPick: { source: 'existing', cardId: 'claude-old-card', outcome: 'destroyed' },
    });

    expect(result.match.decks.human).toEqual([]);
    expect(result.match.decks.claude).toEqual([]);
    expect(result.record.destroyed.sort()).toEqual(
      ['human-old-card', 'claude-old-card', 'r11-human-fresh', 'r11-claude-fresh'].sort()
    );
    for (const id of result.record.destroyed) {
      expect(result.registry.find((c) => c.id === id)?.destroyed).toBe(true);
    }
  });
});

describe('resolveRound: the "I Win" raid (how the KEEP fortress falls)', () => {
  // Scenario: in an EARLIER round, the human designed a busted "I Win" card
  // and chose KEEP -- perfectly safe, it entered their deck untouched. Many
  // rounds later, the human is the loser again (for an unrelated matchup)
  // and -- tempted by Claude's new design -- chooses STEAL. Claude's
  // mandatory counter-raid can now reach "I Win" directly: Claude never
  // created it, so picking it MOVES it into Claude's deck. The fortress only
  // ever protected the round in which a card was designed, never a promise
  // that the deck itself was untouchable forever.
  it('lets the winner counter-raid an old KEEP-protected card once its owner later chooses to steal', () => {
    const registry: CardDef[] = [
      card({ id: 'r1-human-i-win', creatorId: 'human', createdInRound: 1 }),
      card({ id: 'r12-human-fresh', creatorId: 'human', createdInRound: 12 }),
      card({ id: 'r12-claude-fresh', creatorId: 'claude', createdInRound: 12 }),
    ];
    const m = match({
      round: 12,
      // "I Win" has sat safely in the human's deck since round 1.
      decks: { human: ['r1-human-i-win'], claude: [] },
    });

    const result = resolveRound({
      match: m,
      registry,
      round: 12,
      designs: { human: 'r12-human-fresh', claude: 'r12-claude-fresh' },
      winner: 'claude',
      decision: 'steal',
      loserPick: { source: 'design', cardId: 'r12-claude-fresh', outcome: 'taken' },
      // Claude ignores the human's brand-new design and snipes "I Win"
      // straight out of their deck instead.
      winnerPick: { source: 'existing', cardId: 'r1-human-i-win', outcome: 'taken' },
    });

    expect(result.match.decks.claude).toContain('r1-human-i-win');
    expect(result.match.decks.human).not.toContain('r1-human-i-win');
    // The human's fresh design was spurned and destroyed as collateral.
    expect(result.record.destroyed).toEqual(['r12-human-fresh']);
  });
});

describe('resolveRound: legality / validation', () => {
  // Fixture cards, deliberately over-provisioned so each test below can pick
  // an unambiguous, non-overlapping target without tripping an unrelated
  // guard first:
  //   - 'old-loser-card' (creatorId human) sits in the LOSER's own deck.
  //   - 'old-winner-card' (creatorId claude) sits in the WINNER's own deck.
  //   - 'winner-deck-by-human' (creatorId human) sits in the winner's deck
  //     -- a legal loserPick 'existing' target the loser did NOT create.
  //   - 'loser-deck-by-claude' (creatorId claude) sits in the loser's deck
  //     -- a legal winnerPick 'existing' target the winner DID create.
  //   - 'unregistered-orphan' has a registry row but sits in neither deck.
  const registry: CardDef[] = [
    card({ id: 'old-loser-card', creatorId: 'human' }),
    card({ id: 'old-winner-card', creatorId: 'claude' }),
    card({ id: 'winner-deck-by-human', creatorId: 'human' }),
    card({ id: 'loser-deck-by-claude', creatorId: 'claude' }),
    card({ id: 'unregistered-orphan', creatorId: 'human' }),
    card({ id: 'neutral-in-winner-deck', creatorId: 'claude' }),
    card({ id: 'r5-human-fresh', creatorId: 'human' }),
    card({ id: 'r5-claude-fresh', creatorId: 'claude' }),
  ];

  function baseArgs(overrides: {
    loserPick?: RoundPick | null;
    winnerPick?: RoundPick | null;
    decks?: MatchState['decks'];
  }) {
    // NOTE: use 'in' rather than '??' below -- an explicitly-passed `null`
    // (testing the "must carry both picks" guard) must NOT fall back to the
    // default, which '??' would otherwise do since null is nullish.
    const loserPick: RoundPick | null = 'loserPick' in overrides
      ? (overrides.loserPick as RoundPick | null)
      : { source: 'design', cardId: 'r5-claude-fresh', outcome: 'taken' };
    const winnerPick: RoundPick | null = 'winnerPick' in overrides
      ? (overrides.winnerPick as RoundPick | null)
      : { source: 'design', cardId: 'r5-human-fresh', outcome: 'taken' };
    return {
      match: match({
        round: 5,
        decks: overrides.decks ?? {
          human: ['old-loser-card'],
          claude: ['old-winner-card', 'winner-deck-by-human'],
        },
      }),
      registry,
      round: 5,
      designs: { human: 'r5-human-fresh', claude: 'r5-claude-fresh' } as Record<string, string | null>,
      winner: 'claude' as const,
      decision: 'steal' as const,
      loserPick,
      winnerPick,
    };
  }

  it('throws if loserPick is null under steal', () => {
    expect(() => resolveRound(baseArgs({ loserPick: null }))).toThrow(/must carry both/);
  });

  it('throws if winnerPick is null under steal', () => {
    expect(() => resolveRound(baseArgs({ winnerPick: null }))).toThrow(/must carry both/);
  });

  it('rejects the loser picking from their OWN deck', () => {
    expect(() =>
      resolveRound(
        baseArgs({ loserPick: { source: 'existing', cardId: 'old-loser-card', outcome: 'taken' } })
      )
    ).toThrow(/loser's OWN deck/);
  });

  it('rejects the winner picking from their OWN deck', () => {
    expect(() =>
      resolveRound(
        baseArgs({ winnerPick: { source: 'existing', cardId: 'old-winner-card', outcome: 'taken' } })
      )
    ).toThrow(/winner's OWN deck/);
  });

  it('rejects a loserPick "existing" target not actually in the winner\'s deck', () => {
    expect(() =>
      resolveRound(
        baseArgs({ loserPick: { source: 'existing', cardId: 'unregistered-orphan', outcome: 'taken' } })
      )
    ).toThrow(/not in the offering deck/);
  });

  it('rejects a winnerPick "existing" target not actually in the loser\'s deck', () => {
    expect(() =>
      resolveRound(
        baseArgs({ winnerPick: { source: 'existing', cardId: 'unregistered-orphan', outcome: 'taken' } })
      )
    ).toThrow(/not in the offering deck/);
  });

  it('rejects a pick target with no registry entry', () => {
    expect(() =>
      resolveRound(
        baseArgs({ loserPick: { source: 'existing', cardId: 'ghost-card', outcome: 'taken' } })
      )
    ).toThrow(/no registry entry/);
  });

  it('rejects a "design"-source pick that does not reference the offered design', () => {
    expect(() =>
      resolveRound(
        baseArgs({ loserPick: { source: 'design', cardId: 'old-winner-card', outcome: 'taken' } })
      )
    ).toThrow(/must reference the offered design/);
  });

  it('rejects a loserPick claiming "taken" when it should be "destroyed" (loser created it)', () => {
    // 'winner-deck-by-human' sits in the winner's deck but the LOSER (human)
    // created it -- picking it must destroy, not take.
    expect(() =>
      resolveRound(
        baseArgs({ loserPick: { source: 'existing', cardId: 'winner-deck-by-human', outcome: 'taken' } })
      )
    ).toThrow(/should be "destroyed"/);
  });

  it('rejects a winnerPick claiming "taken" when it should be "destroyed" (winner created it)', () => {
    // 'loser-deck-by-claude' sits in the loser's deck but the WINNER
    // (claude) created it -- picking it must destroy, not take.
    expect(() =>
      resolveRound(
        baseArgs({
          decks: { human: ['loser-deck-by-claude'], claude: [] },
          winnerPick: { source: 'existing', cardId: 'loser-deck-by-claude', outcome: 'taken' },
        })
      )
    ).toThrow(/should be "destroyed"/);
  });

  it('rejects the winner picking the exact card the loser just took in step 1', () => {
    // 'neutral-in-winner-deck' (creatorId claude, i.e. NOT the loser) starts
    // in the winner's deck; the loser legitimately takes it in step 1, which
    // moves it into the loser's deck. The winner may not immediately grab it
    // straight back as their step-2 counter-raid pick.
    expect(() =>
      resolveRound(
        baseArgs({
          decks: { human: [], claude: ['neutral-in-winner-deck'] },
          loserPick: { source: 'existing', cardId: 'neutral-in-winner-deck', outcome: 'taken' },
          winnerPick: { source: 'existing', cardId: 'neutral-in-winner-deck', outcome: 'taken' },
        })
      )
    ).toThrow(/just taken in step 1/);
  });
});

describe('resolveRound: global invariants', () => {
  it('enforces the GLOBAL uniqueness invariant across both decks (not just per-deck)', () => {
    const registry: CardDef[] = [
      card({ id: 'r2-human-fresh', creatorId: 'human' }),
      card({ id: 'r2-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({ decks: { human: ['shared'], claude: ['shared'] } });

    expect(() =>
      resolveRound({
        match: m,
        registry,
        round: 2,
        designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
        winner: 'human',
        decision: 'keep',
        loserPick: null,
        winnerPick: null,
      })
    ).toThrow(/global uniqueness invariant/);
  });

  it('never lets a card id appear in more than one deck across both, end to end (steal move)', () => {
    const registry: CardDef[] = [
      card({ id: 'old-loser-card', creatorId: 'human' }),
      card({ id: 'r2-human-fresh', creatorId: 'human' }),
      card({ id: 'r2-claude-fresh', creatorId: 'claude' }),
    ];
    const m = match({ decks: { human: ['old-loser-card'], claude: ['starter-b'] } });

    const result = resolveRound({
      match: m,
      registry,
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'claude',
      decision: 'steal',
      loserPick: { source: 'design', cardId: 'r2-claude-fresh', outcome: 'taken' },
      winnerPick: { source: 'existing', cardId: 'old-loser-card', outcome: 'taken' },
    });

    const all = [...result.match.decks.human, ...result.match.decks.claude];
    expect(new Set(all).size).toBe(all.length);
  });

  it('appends the resolved round to roundHistory without disturbing prior entries', () => {
    const registry: CardDef[] = [
      card({ id: 'r2-human-fresh', creatorId: 'human' }),
      card({ id: 'r2-claude-fresh', creatorId: 'claude' }),
    ];
    const priorRecord = {
      round: 1,
      designs: { human: null, claude: null },
      winner: 'human' as const,
      loser: 'claude' as const,
      decision: 'keep' as const,
      loserPick: null,
      winnerPick: null,
      destroyed: [],
      timestamp: new Date(0).toISOString(),
    };
    const m = match({ decks: { human: [], claude: [] }, roundHistory: [priorRecord] });

    const result = resolveRound({
      match: m,
      registry,
      round: 2,
      designs: { human: 'r2-human-fresh', claude: 'r2-claude-fresh' },
      winner: 'human',
      decision: 'keep',
      loserPick: null,
      winnerPick: null,
    });

    expect(result.match.roundHistory).toHaveLength(2);
    expect(result.match.roundHistory[0]).toEqual(priorRecord);
    expect(result.match.roundHistory[1].round).toBe(2);
  });
});
