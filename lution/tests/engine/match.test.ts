import { describe, it, expect } from 'vitest';
import { createMatchState, playOneInnerGame, playMatchToCompletion } from '../../src/engine/match';
import { loadAllEffects, registerEffects } from '../../src/engine/effectsLoader';
import { createDefaultControllers } from '../../src/ai/player';
import { createRng } from '../../src/engine/rng';
import { testCardDef, testKeeperEffect } from '../helpers';
import cardsJson from '../../data/cards.json';
import type { CardDef, CardId, PlayerId } from '../../shared/types';

const registryList = cardsJson as CardDef[];
const starterRegistry = new Map<CardId, CardDef>(registryList.map((c) => [c.id, c]));
const starterEffects = loadAllEffects();
const starterDecks: Record<PlayerId, CardId[]> = {
  human: registryList.filter((c) => c.startingOwner === 'human').map((c) => c.id),
  claude: registryList.filter((c) => c.startingOwner === 'claude').map((c) => c.id),
};

function starterControllers(seed: number) {
  return createDefaultControllers(starterEffects, {
    human: createRng(seed + 1000),
    claude: createRng(seed + 2000),
  });
}

describe('golden known-answer game (regression canary)', () => {
  // Correction to the plan's original known-answer claim: "first player
  // always wins on their 6th play" is WRONG. With a 3-card starting hand
  // plus one draw per turn, only 9 of that player's own 10 deck cards have
  // been SEEN by their 6th play; if the unseen card happens to be the
  // 3-point keeper, the best 6 cards seen sum to only 8, not 10. The real
  // invariant (verified by the bound tests below across many seeds): the
  // greedy-AI winner crosses WIN_POINTS on their 6th OR 7th play, and who
  // wins is seed-dependent. This fixed seed pins down one concrete instance
  // of the 7th-play case so the exact winner/turn-count/scores are a
  // regression canary, not just an existence proof.
  it('seed=5: claude wins on their 7th play (global turn 13), final scores human=9 claude=11', async () => {
    const match = createMatchState({ matchId: 'canary', decks: starterDecks, matchSeed: 5 });
    const controllers = starterControllers(5);

    const runtime = await playOneInnerGame({
      match,
      registry: starterRegistry,
      effects: starterEffects,
      controllers,
    });

    expect(runtime.state.result).toEqual({ outcome: 'win', winner: 'claude' });
    expect(runtime.state.turnNumber).toBe(13);
    expect(runtime.state.turnsTaken.claude).toBe(7);
    expect(await runtime.api.score('human')).toBe(9);
    expect(await runtime.api.score('claude')).toBe(11);
  });
});

describe('bound tests across many seeds (the general invariant behind the canary)', () => {
  it('every inner game ends, the winning score is >= WIN_POINTS, and total turns stay <= 15', async () => {
    for (let seed = 1; seed <= 80; seed++) {
      const match = createMatchState({ matchId: `bound-${seed}`, decks: starterDecks, matchSeed: seed });
      const controllers = starterControllers(seed);
      const runtime = await playOneInnerGame({
        match,
        registry: starterRegistry,
        effects: starterEffects,
        controllers,
      });

      expect(runtime.state.result, `seed=${seed} never reached a result`).not.toBeNull();
      expect(runtime.state.turnNumber, `seed=${seed} exceeded the turn bound`).toBeLessThanOrEqual(15);

      const humanScore = await runtime.api.score('human');
      const claudeScore = await runtime.api.score('claude');
      const result = runtime.state.result!;
      if (result.outcome === 'draw') {
        expect(humanScore, `seed=${seed} draw but human < 10`).toBeGreaterThanOrEqual(10);
        expect(claudeScore, `seed=${seed} draw but claude < 10`).toBeGreaterThanOrEqual(10);
      } else {
        const winnerScore = result.winner === 'human' ? humanScore : claudeScore;
        expect(winnerScore, `seed=${seed} winner scored < 10`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('at least one seed in range resolves on the winner\'s 6th play and at least one on the 7th (both branches of the corrected invariant are real)', async () => {
    const winnerPlayCounts = new Set<number>();
    for (let seed = 1; seed <= 80; seed++) {
      const match = createMatchState({ matchId: `branch-${seed}`, decks: starterDecks, matchSeed: seed });
      const controllers = starterControllers(seed);
      const runtime = await playOneInnerGame({
        match,
        registry: starterRegistry,
        effects: starterEffects,
        controllers,
      });
      const result = runtime.state.result;
      if (result && result.outcome === 'win') {
        winnerPlayCounts.add(runtime.state.turnsTaken[result.winner]);
      }
    }
    expect(winnerPlayCounts.has(6)).toBe(true);
    expect(winnerPlayCounts.has(7)).toBe(true);
  });
});

describe('outer match loop: first-player rules', () => {
  it('after a decisive inner game, the LOSER goes first next, the round advances, and onDesignRound fires (match not yet over)', async () => {
    const winnerDef = testCardDef('test-match-winner-keeper');
    const winnerEffect = testKeeperEffect('test-match-winner-keeper', 10);
    const registry = new Map<CardId, CardDef>([...starterRegistry, [winnerDef.id, winnerDef]]);
    const effects = new Map(starterEffects);
    for (const [id, effect] of registerEffects([winnerEffect])) effects.set(id, effect);

    const decks: Record<PlayerId, CardId[]> = { human: ['test-match-winner-keeper'], claude: [] };
    const match = createMatchState({ matchId: 'loser-first', decks, matchSeed: 3 });
    const controllers = createDefaultControllers(effects, { human: createRng(11), claude: createRng(22) });

    let designRoundCalls = 0;
    await playOneInnerGame({
      match,
      registry,
      effects,
      controllers,
      matchWins: 10, // plenty of headroom; this single win must not end the match
      onDesignRound: async () => {
        designRoundCalls += 1;
      },
    });

    expect(match.innerWins.human).toBe(1);
    expect(match.round).toBe(1);
    expect(match.nextFirstPlayer).toBe('claude'); // the loser
    expect(match.phase).toBe('playing');
    expect(designRoundCalls).toBe(1);
  });

  it('onDesignRound does NOT fire after the match-deciding final inner game', async () => {
    const winnerDef = testCardDef('test-match-final-keeper');
    const winnerEffect = testKeeperEffect('test-match-final-keeper', 10);
    const registry = new Map<CardId, CardDef>([...starterRegistry, [winnerDef.id, winnerDef]]);
    const effects = new Map(starterEffects);
    for (const [id, effect] of registerEffects([winnerEffect])) effects.set(id, effect);

    const decks: Record<PlayerId, CardId[]> = { human: ['test-match-final-keeper'], claude: [] };
    const match = createMatchState({ matchId: 'match-over', decks, matchSeed: 4 });
    const controllers = createDefaultControllers(effects, { human: createRng(31), claude: createRng(42) });

    let designRoundCalls = 0;
    await playOneInnerGame({
      match,
      registry,
      effects,
      controllers,
      matchWins: 1, // this single decisive win ends the match
      onDesignRound: async () => {
        designRoundCalls += 1;
      },
    });

    expect(match.phase).toBe('match-over');
    expect(match.winner).toBe('human');
    expect(designRoundCalls).toBe(0);
  });

  it('a draw replays with the SAME first player, no round advance, and no design round', async () => {
    // A "bomb" keeper whose modifyScore hook (side: 'any') adds +10 to
    // WHICHEVER player is currently being scored, regardless of who owns
    // it — so the instant human plays it, both players simultaneously read
    // >= WIN_POINTS at the very next checkpoint. Deterministic regardless
    // of seed/shuffle since each deck holds exactly one card.
    const bombDef = testCardDef('test-draw-bomb-keeper');
    const bombEffect = testKeeperEffect('test-draw-bomb-keeper', 0, {
      hooks: {
        modifyScore: {
          side: 'any',
          handler: (ctx) => {
            const payload = ctx.event.payload as { score: number };
            payload.score += 10;
          },
        },
      },
    });
    const registry = new Map<CardId, CardDef>([...starterRegistry, [bombDef.id, bombDef]]);
    const effects = new Map(starterEffects);
    for (const [id, effect] of registerEffects([bombEffect])) effects.set(id, effect);

    const decks: Record<PlayerId, CardId[]> = { human: ['test-draw-bomb-keeper'], claude: [] };
    const match = createMatchState({ matchId: 'draw-replay', decks, matchSeed: 9 });
    const controllers = createDefaultControllers(effects, { human: createRng(51), claude: createRng(62) });

    const firstPlayerBefore = match.nextFirstPlayer;
    let designRoundCalls = 0;
    const onDesignRound = async () => {
      designRoundCalls += 1;
    };

    const first = await playOneInnerGame({ match, registry, effects, controllers, onDesignRound });
    expect(first.state.result).toEqual({ outcome: 'draw' });
    expect(match.nextFirstPlayer).toBe(firstPlayerBefore);
    expect(match.round).toBe(0);
    expect(match.phase).toBe('playing');
    expect(designRoundCalls).toBe(0);

    // Immediate replay: same first player again, still a draw, still no
    // round advance / design round.
    const second = await playOneInnerGame({ match, registry, effects, controllers, onDesignRound });
    expect(second.state.result).toEqual({ outcome: 'draw' });
    expect(match.nextFirstPlayer).toBe(firstPlayerBefore);
    expect(match.round).toBe(0);
    expect(designRoundCalls).toBe(0);
  });

  it("game 1's first player is chosen by the seeded match RNG (deterministic per matchSeed)", () => {
    const a = createMatchState({ matchId: 'x', decks: starterDecks, matchSeed: 123 });
    const b = createMatchState({ matchId: 'y', decks: starterDecks, matchSeed: 123 });
    expect(a.nextFirstPlayer).toBe(b.nextFirstPlayer);
  });
});

describe('playMatchToCompletion', () => {
  it('runs to match-over using a decisive-only synthetic deck, incrementing innerWins each game', async () => {
    const winnerDef = testCardDef('test-full-match-keeper');
    const winnerEffect = testKeeperEffect('test-full-match-keeper', 10);
    const registry = new Map<CardId, CardDef>([...starterRegistry, [winnerDef.id, winnerDef]]);
    const effects = new Map(starterEffects);
    for (const [id, effect] of registerEffects([winnerEffect])) effects.set(id, effect);

    const decks: Record<PlayerId, CardId[]> = { human: ['test-full-match-keeper'], claude: [] };
    const match = createMatchState({ matchId: 'full-match', decks, matchSeed: 77 });
    const controllers = createDefaultControllers(effects, { human: createRng(1), claude: createRng(2) });

    const finished = await playMatchToCompletion({
      match,
      registry,
      effects,
      controllers,
      matchWins: 3,
      maxInnerGames: 20,
    });

    expect(finished.phase).toBe('match-over');
    expect(finished.winner).toBe('human');
    expect(finished.innerWins.human).toBe(3);
  });
});
