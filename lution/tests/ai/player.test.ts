import { describe, it, expect } from 'vitest';
import {
  answerChoice,
  chooseCardToPlay,
  chooseKeepOrSteal,
  chooseLoserSteal,
  chooseWinnerPick,
} from '../../src/ai/player';
import { registerEffects } from '../../src/engine/effectsLoader';
import { createRng } from '../../src/engine/rng';
import { computeBaseScore, WIN_POINTS } from '../../src/engine/engine';
import type { CardEffect, AIGameView, ChoiceSpec } from '../../src/engine/types';
import type { InnerGameState } from '../../shared/types';

function baseState(overrides: Partial<InnerGameState> = {}): InnerGameState {
  return {
    seed: 1,
    rngState: 1,
    activePlayer: 'human',
    turnNumber: 1,
    turnsTaken: { human: 0, claude: 0 },
    players: {
      human: { id: 'human', drawPile: [], hand: [], inPlay: [], discard: [], skipNextDraw: false, extraTurns: 0 },
      claude: { id: 'claude', drawPile: [], hand: [], inPlay: [], discard: [], skipNextDraw: false, extraTurns: 0 },
    },
    effectState: {},
    log: [],
    result: null,
    ...overrides,
  };
}

function viewFor(state: InnerGameState, effects: ReadonlyMap<string, CardEffect>, self: 'human' | 'claude' = 'human'): AIGameView {
  return {
    self,
    opponent: self === 'human' ? 'claude' : 'human',
    state,
    score: (p) => computeBaseScore(state, effects, p),
  };
}

describe('chooseCardToPlay (greedy argmax)', () => {
  it('picks the highest-value keeper by default (baseValue) ordering', () => {
    const effects = registerEffects([
      { cardId: 'low', cardType: 'keeper', baseValue: 1 },
      { cardId: 'mid', cardType: 'keeper', baseValue: 2 },
      { cardId: 'high', cardType: 'keeper', baseValue: 3 },
    ]);
    const state = baseState({
      players: {
        human: {
          id: 'human',
          drawPile: [],
          hand: [
            { instanceId: 'i1', cardId: 'low' },
            { instanceId: 'i2', cardId: 'high' },
            { instanceId: 'i3', cardId: 'mid' },
          ],
          inPlay: [],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
        claude: { id: 'claude', drawPile: [], hand: [], inPlay: [], discard: [], skipNextDraw: false, extraTurns: 0 },
      },
    });

    const chosen = chooseCardToPlay(viewFor(state, effects), effects);
    expect(chosen?.cardId).toBe('high');
  });

  it('respects a custom strategy.playValue override instead of baseValue', () => {
    const effects = registerEffects([
      { cardId: 'sneaky', cardType: 'keeper', baseValue: 1, strategy: { playValue: 99 } },
      { cardId: 'plain', cardType: 'keeper', baseValue: 5 },
    ]);
    const state = baseState({
      players: {
        human: {
          id: 'human',
          drawPile: [],
          hand: [
            { instanceId: 'i1', cardId: 'plain' },
            { instanceId: 'i2', cardId: 'sneaky' },
          ],
          inPlay: [],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
        claude: { id: 'claude', drawPile: [], hand: [], inPlay: [], discard: [], skipNextDraw: false, extraTurns: 0 },
      },
    });

    expect(chooseCardToPlay(viewFor(state, effects), effects)?.cardId).toBe('sneaky');
  });

  it('win-now override: plays a lower-ranked keeper if it alone crosses winPoints', () => {
    const effects = registerEffects([
      // "flashy" ranks higher by playValue, but playing it does not reach 10
      // (8 already banked + 1 = 9).
      { cardId: 'flashy', cardType: 'keeper', baseValue: 1, strategy: { playValue: 50 } },
      // "closer" ranks lower by playValue, but 8 (already in play) + 2 = 10.
      { cardId: 'closer', cardType: 'keeper', baseValue: 2 },
      { cardId: 'banked', cardType: 'keeper', baseValue: 8 },
    ]);
    const state = baseState({
      players: {
        human: {
          id: 'human',
          drawPile: [],
          hand: [
            { instanceId: 'i1', cardId: 'flashy' },
            { instanceId: 'i2', cardId: 'closer' },
          ],
          inPlay: [{ instanceId: 'banked1', cardId: 'banked' }],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
        claude: { id: 'claude', drawPile: [], hand: [], inPlay: [], discard: [], skipNextDraw: false, extraTurns: 0 },
      },
    });

    const chosen = chooseCardToPlay(viewFor(state, effects), effects, WIN_POINTS);
    expect(chosen?.cardId).toBe('closer');
  });

  it('returns null when the hand is empty', () => {
    const effects = registerEffects([]);
    const state = baseState();
    expect(chooseCardToPlay(viewFor(state, effects), effects)).toBeNull();
  });
});

describe('chooseKeepOrSteal (EV sanity, v3 two-pick model)', () => {
  it('steals when the best step-1 grab clearly beats keeping, even after the guaranteed step-2 loss', () => {
    const decision = chooseKeepOrSteal({
      ownDesignValue: 1,
      winnerDesignValue: 1,
      winnerDeckCandidates: [{ cardId: 'b', value: 20, source: 'existing' }],
      ownDeckCandidates: [],
    });
    // step1 best = 20 (existing). step2: counter-raid picks between
    // ownDesignValue=1 (design) and no other own-deck candidates -> loses
    // just the design (1). EV(steal) = 20 - 1 = 19 > EV(keep) = 1.
    expect(decision).toBe('steal');
  });

  it('keeps when the guaranteed loss of the own design (plus any counter-raid pick) erases the step-1 gain', () => {
    const decision = chooseKeepOrSteal({
      ownDesignValue: 5,
      winnerDesignValue: 1,
      winnerDeckCandidates: [{ cardId: 'b', value: 2 }].map((c) => ({ ...c, source: 'existing' as const })),
      ownDeckCandidates: [],
    });
    // step1 best = 2. step2 loss = ownDesignValue (5, only candidate).
    // EV(steal) = 2 - 5 = -3 < EV(keep) = 5.
    expect(decision).toBe('keep');
  });

  it('accounts for the winner also taking the loser\'s BEST OWN deck card instead of the design', () => {
    const decision = chooseKeepOrSteal({
      ownDesignValue: 1,
      winnerDesignValue: 10,
      winnerDeckCandidates: [],
      // The winner's counter-raid will prefer this over the design (10 > 1),
      // costing the loser BOTH the design and this card.
      ownDeckCandidates: [{ cardId: 'prize', value: 8, source: 'existing' }],
    });
    // step1 best = 10 (the winner's design, only candidate).
    // step2: counter-raid picks 'prize' (8 > ownDesignValue 1) -> loss = 1 + 8 = 9.
    // EV(steal) = 10 - 9 = 1 == EV(keep) = 1 -> not strictly greater -> keep.
    expect(decision).toBe('keep');
  });

  it('pessimistic mode applies a discount that can flip a close call from steal to keep', () => {
    const closeCtx = {
      ownDesignValue: 3,
      winnerDesignValue: 6.5,
      winnerDeckCandidates: [],
      ownDeckCandidates: [],
    };
    // step1 best = 6.5 (design, only candidate). step2 loss = ownDesignValue
    // (3, only candidate). EV(steal) raw = 6.5 - 3 = 3.5 > EV(keep) = 3.
    expect(chooseKeepOrSteal({ ...closeCtx, pessimistic: false })).toBe('steal');
    // With the discount: 3.5 - 1 = 2.5 < 3 -> keep.
    expect(chooseKeepOrSteal({ ...closeCtx, pessimistic: true })).toBe('keep');
  });
});

describe('chooseLoserSteal (step 1: forced pick from the winner design/deck)', () => {
  it('maximizes: picks the highest-value candidate among the design and existing cards', () => {
    const result = chooseLoserSteal({
      candidates: [
        { cardId: 'winner-design', value: 1, source: 'design' },
        { cardId: 'b', value: 4, source: 'existing' },
      ],
    });
    expect(result).toEqual({ cardId: 'b', source: 'existing', outcome: 'taken', value: 4 });
  });

  it('destroys (denial) instead of taking when the loser originally created the existing candidate', () => {
    const result = chooseLoserSteal({
      candidates: [
        { cardId: 'winner-design', value: 1, source: 'design' },
        { cardId: 'c', value: 10, source: 'existing', createdByPicker: true },
      ],
    });
    expect(result).toEqual({ cardId: 'c', source: 'existing', outcome: 'destroyed', value: 10 });
  });

  it('ties favor the design over an existing candidate', () => {
    const result = chooseLoserSteal({
      candidates: [
        { cardId: 'winner-design', value: 3, source: 'design' },
        { cardId: 'a', value: 3, source: 'existing' },
      ],
    });
    expect(result.source).toBe('design');
  });

  it('takes the design when it is the only candidate', () => {
    const result = chooseLoserSteal({ candidates: [{ cardId: 'winner-design', value: 1, source: 'design' }] });
    expect(result).toEqual({ cardId: 'winner-design', source: 'design', outcome: 'taken', value: 1 });
  });
});

describe('chooseWinnerPick (step 2: forced counter-raid pick, exclusion is the caller\'s job)', () => {
  it('maximizes: picks the highest-value candidate among the design and existing cards', () => {
    const result = chooseWinnerPick({
      candidates: [
        { cardId: 'loser-design', value: 2, source: 'design' },
        { cardId: 'b', value: 4, source: 'existing' },
      ],
    });
    expect(result).toEqual({ cardId: 'b', source: 'existing', outcome: 'taken', value: 4 });
  });

  it('destroys instead of taking when the winner originally created the picked card', () => {
    const result = chooseWinnerPick({
      candidates: [
        { cardId: 'loser-design', value: 1, source: 'design' },
        { cardId: 'c', value: 10, source: 'existing', createdByPicker: true },
      ],
    });
    expect(result).toEqual({ cardId: 'c', source: 'existing', outcome: 'destroyed', value: 10 });
  });

  it('ties favor the design over any existing candidate', () => {
    const result = chooseWinnerPick({
      candidates: [
        { cardId: 'loser-design', value: 3, source: 'design' },
        { cardId: 'a', value: 3, source: 'existing' },
      ],
    });
    expect(result.source).toBe('design');
  });

  it('ties among existing candidates favor the lowest cardId, deterministically', () => {
    const result = chooseWinnerPick({
      candidates: [
        { cardId: 'zeta', value: 5, source: 'existing' },
        { cardId: 'alpha', value: 5, source: 'existing' },
      ],
    });
    expect(result.cardId).toBe('alpha');
  });

  it('throws if given no candidates at all (a steal pick always has at least the design)', () => {
    expect(() => chooseWinnerPick({ candidates: [] })).toThrow(/no candidates/);
  });
});

describe('answerChoice', () => {
  it("delegates to the source card's strategy.choose when present", () => {
    const effects = registerEffects([
      {
        cardId: 'chooser',
        cardType: 'action',
        baseValue: 0,
        strategy: { choose: (_view, options) => options[1] },
      },
    ]);
    const spec: ChoiceSpec<unknown> = {
      cardId: 'chooser',
      prompt: 'pick one',
      options: [{ id: 'a' }, { id: 'b' }],
    };
    const state = baseState();
    const rng = createRng(1);
    const result = answerChoice(spec, viewFor(state, effects), effects, rng);
    expect(result).toEqual({ id: 'b' });
  });

  it('falls back to seeded-random when no strategy.choose is defined', () => {
    const effects = registerEffects([{ cardId: 'plain', cardType: 'action', baseValue: 0 }]);
    const spec: ChoiceSpec<unknown> = {
      cardId: 'plain',
      prompt: 'pick one',
      options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    };
    const state = baseState();
    const a = answerChoice(spec, viewFor(state, effects), effects, createRng(7));
    const b = answerChoice(spec, viewFor(state, effects), effects, createRng(7));
    // Deterministic given the same seed.
    expect(a).toEqual(b);
    expect(spec.options).toContainEqual(a);
  });
});
