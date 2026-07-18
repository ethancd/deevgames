// Non-blocking implement job feature, AI half: chooseCardToPlay must filter
// locked cards out of consideration entirely (a hand of only locked cards
// passes, exactly like an empty hand), and steal-pick valuation for a locked
// (or module-less) card must fall back to a modest default instead of
// crashing.

import { describe, it, expect } from 'vitest';
import { chooseCardToPlay } from '../../src/ai/player';
import { resolveStealTargetValueSafe, LOCKED_CARD_STEAL_VALUE } from '../../src/ai/defaults';
import { registerEffects } from '../../src/engine/effectsLoader';
import { computeBaseScore } from '../../src/engine/engine';
import type { AIGameView, CardEffect } from '../../src/engine/types';
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

function viewFor(state: InnerGameState, effects: ReadonlyMap<string, CardEffect>): AIGameView {
  return {
    self: 'human',
    opponent: 'claude',
    state,
    score: (p) => computeBaseScore(state, effects, p),
  };
}

describe('chooseCardToPlay: locked-card filtering', () => {
  it('passes when the hand is made up entirely of locked cards, even though real effects exist for them', () => {
    const effects = registerEffects([
      { cardId: 'locked-a', cardType: 'keeper', baseValue: 5 },
      { cardId: 'locked-b', cardType: 'keeper', baseValue: 9 },
    ]);
    const state = baseState({
      players: {
        human: {
          id: 'human',
          drawPile: [],
          hand: [
            { instanceId: 'i1', cardId: 'locked-a' },
            { instanceId: 'i2', cardId: 'locked-b' },
          ],
          inPlay: [],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
        claude: { id: 'claude', drawPile: [], hand: [], inPlay: [], discard: [], skipNextDraw: false, extraTurns: 0 },
      },
    });

    const chosen = chooseCardToPlay(viewFor(state, effects), effects, 10, () => true);
    expect(chosen).toBeNull();
  });

  it('still picks the best UNlocked card when the hand is a mix of locked and unlocked', () => {
    const effects = registerEffects([
      { cardId: 'locked-high', cardType: 'keeper', baseValue: 9 },
      { cardId: 'unlocked-low', cardType: 'keeper', baseValue: 2 },
    ]);
    const state = baseState({
      players: {
        human: {
          id: 'human',
          drawPile: [],
          hand: [
            { instanceId: 'i1', cardId: 'locked-high' },
            { instanceId: 'i2', cardId: 'unlocked-low' },
          ],
          inPlay: [],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
        claude: { id: 'claude', drawPile: [], hand: [], inPlay: [], discard: [], skipNextDraw: false, extraTurns: 0 },
      },
    });

    const chosen = chooseCardToPlay(viewFor(state, effects), effects, 10, (cardId) => cardId === 'locked-high');
    expect(chosen?.cardId).toBe('unlocked-low');
  });

  it('defaults to nothing-locked when isLocked is omitted, unchanged from before this feature', () => {
    const effects = registerEffects([{ cardId: 'plain', cardType: 'keeper', baseValue: 3 }]);
    const state = baseState({
      players: {
        human: {
          id: 'human',
          drawPile: [],
          hand: [{ instanceId: 'i1', cardId: 'plain' }],
          inPlay: [],
          discard: [],
          skipNextDraw: false,
          extraTurns: 0,
        },
        claude: { id: 'claude', drawPile: [], hand: [], inPlay: [], discard: [], skipNextDraw: false, extraTurns: 0 },
      },
    });
    expect(chooseCardToPlay(viewFor(state, effects), effects)?.cardId).toBe('plain');
  });
});

describe('resolveStealTargetValueSafe: locked-card steal valuation', () => {
  const instance = { instanceId: 'inst-1', cardId: 'some-card' };
  const view = viewFor(baseState(), registerEffects([]));

  it('returns the modest default for a locked card even when its effect module IS already loaded', () => {
    const effect: CardEffect = { cardId: 'some-card', cardType: 'keeper', baseValue: 99 };
    expect(resolveStealTargetValueSafe(effect, true, view, instance)).toBe(LOCKED_CARD_STEAL_VALUE);
  });

  it('returns the modest default without crashing when the effect module is missing entirely', () => {
    expect(resolveStealTargetValueSafe(undefined, false, view, instance)).toBe(LOCKED_CARD_STEAL_VALUE);
    expect(resolveStealTargetValueSafe(undefined, true, view, instance)).toBe(LOCKED_CARD_STEAL_VALUE);
  });

  it('delegates to the real stealTargetValue hint for an unlocked card with a loaded effect', () => {
    const effect: CardEffect = {
      cardId: 'some-card',
      cardType: 'keeper',
      baseValue: 4,
      strategy: { stealTargetValue: 7 },
    };
    expect(resolveStealTargetValueSafe(effect, false, view, instance)).toBe(7);
  });
});
