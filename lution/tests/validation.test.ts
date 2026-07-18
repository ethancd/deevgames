import { describe, it, expect } from 'vitest';
import {
  checkNumeralRule,
  checkDuplicates,
  normalizeText,
  validateNewCard,
  checkEffectLength,
  checkNameLength,
  checkEnglishRule,
  checkRepeatedSubeffect,
  checkDeixisRule,
  normalizeClause,
  splitClauses,
} from '../shared/validation';
import type { CardDef } from '../shared/types';

function starter(overrides: Partial<CardDef> = {}): CardDef {
  return {
    id: 'starter-example',
    name: 'Example Starter',
    effectText: 'Keeper. Worth 1 point(s) while in play.',
    creatorId: 'starter',
    createdInRound: 0,
    destroyed: false,
    implemented: true,
    ...overrides,
  };
}

describe('checkNumeralRule', () => {
  it('rejects multi-digit runs', () => {
    expect(checkNumeralRule('Worth 10 points.')).toHaveLength(1);
  });

  it('accepts the numeral 1', () => {
    expect(checkNumeralRule('Worth 1 point.')).toHaveLength(0);
  });

  it('accepts repeated separate "1" digit runs', () => {
    expect(checkNumeralRule('Draw 1, then 1 more.')).toHaveLength(0);
  });

  it('rejects a decimal whose fractional run is not "1"', () => {
    expect(checkNumeralRule('Worth 1.5 points.')).toHaveLength(1);
  });

  it('rejects spelled-out number words like "two"', () => {
    expect(checkNumeralRule('Draw two cards.')).toHaveLength(1);
  });

  it('accepts "once"', () => {
    expect(checkNumeralRule('Trigger once per turn.')).toHaveLength(0);
  });

  it('accepts "one" and "a"/"an"', () => {
    expect(checkNumeralRule('Draw one card, or take a bean, or an apple.')).toHaveLength(0);
  });

  it('rejects "double", "both", "dozen", and other banned words', () => {
    expect(checkNumeralRule('Double your score.')).toHaveLength(1);
    expect(checkNumeralRule('Both players draw.')).toHaveLength(1);
    expect(checkNumeralRule('Gain a dozen coins.')).toHaveLength(1);
  });

  it('is case-insensitive and word-boundary safe', () => {
    expect(checkNumeralRule('TWICE the value')).toHaveLength(1);
    // "pair" should not falsely match inside "repair"
    expect(checkNumeralRule('Repair the golem.')).toHaveLength(0);
  });

  it('flags multiple violations in one text', () => {
    expect(checkNumeralRule('Draw 2 cards, twice.').length).toBeGreaterThanOrEqual(2);
  });
});

describe('normalizeText', () => {
  it('casefolds, collapses whitespace, and strips trailing punctuation', () => {
    expect(normalizeText('  Hello   World!!  ')).toBe('hello world');
    expect(normalizeText('Worth 1 point(s) while in play.')).toBe(
      'worth 1 point(s) while in play'
    );
  });
});

describe('checkDuplicates', () => {
  const registry: CardDef[] = [
    starter({ id: 'a', name: 'Pocket Nebula', effectText: 'Keeper. Worth 1 point(s) while in play.' }),
    starter({ id: 'b', name: 'Destroyed Thing', effectText: 'Keeper. A destroyed effect.', destroyed: true }),
  ];

  it('flags an exact (normalized) name duplicate', () => {
    const result = checkDuplicates({ name: 'pocket nebula ', effectText: 'Something new.' }, registry);
    expect(result.nameDuplicateOf?.id).toBe('a');
  });

  it('flags an exact (normalized) effect text duplicate', () => {
    const result = checkDuplicates(
      { name: 'Totally New Name', effectText: 'Keeper. Worth 1 point(s) while in play' },
      registry
    );
    expect(result.effectDuplicateOf?.id).toBe('a');
  });

  it('still matches against destroyed rows', () => {
    const result = checkDuplicates({ name: 'Destroyed Thing', effectText: 'Something new.' }, registry);
    expect(result.nameDuplicateOf?.id).toBe('b');
  });

  it('reports no duplicate for genuinely new text', () => {
    const result = checkDuplicates({ name: 'Brand New', effectText: 'Totally fresh effect.' }, registry);
    expect(result.nameDuplicateOf).toBeUndefined();
    expect(result.effectDuplicateOf).toBeUndefined();
  });
});

describe('checkEffectLength', () => {
  it('accepts effect text of exactly 280 characters', () => {
    expect(checkEffectLength('a'.repeat(280))).toHaveLength(0);
  });

  it('rejects effect text of 281 characters, naming the limit and the length', () => {
    const violations = checkEffectLength('a'.repeat(281));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('281');
    expect(violations[0]).toContain('280');
  });
});

describe('checkNameLength', () => {
  it('accepts a name of exactly 32 characters', () => {
    expect(checkNameLength('a'.repeat(32))).toHaveLength(0);
  });

  it('rejects a name of 33 characters, naming the limit and the length', () => {
    const violations = checkNameLength('a'.repeat(33));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('33');
    expect(violations[0]).toContain('32');
  });
});

describe('checkEnglishRule', () => {
  it('rejects a Cyrillic word', () => {
    expect(checkEnglishRule('Draw 1 card, then say привет.')).toEqual([
      'card text must be written in English',
    ]);
  });

  it('rejects a CJK phrase', () => {
    expect(checkEnglishRule('Worth 1 point while in play. 你好世界')).toEqual([
      'card text must be written in English',
    ]);
  });

  it('rejects an emoji', () => {
    expect(checkEnglishRule('Worth 1 point 🎉 while in play.')).toEqual([
      'card text must be written in English',
    ]);
  });

  it('accepts accented Latin, en-dash, curly quotes, and the ellipsis', () => {
    // Actively proves the allowlist admits accented Latin + en-dash: this must
    // return NO violation.
    expect(
      checkEnglishRule('Piñata déjà-vu – naïve café')
    ).toHaveLength(0);
    expect(
      checkEnglishRule('Worth 1 point… “quoted” and ‘curly’.')
    ).toHaveLength(0);
  });

  it('does not flag accented Latin when used as a full card effect', () => {
    const result = validateNewCard(
      {
        name: 'Café Naïve',
        effectText: 'Keeper. Worth 1 point while in play. Piñata déjà-vu – naïve café.',
      },
      []
    );
    expect(
      result.violations.some((v) => v === 'card text must be written in English')
    ).toBe(false);
  });
});

describe('clause splitting and normalization', () => {
  it('splits on sentence boundaries, commas, and then-connectives', () => {
    expect(splitClauses('draw 1 card, then draw 1 card, then draw 1 card')).toEqual([
      'draw 1 card',
      'draw 1 card',
      'draw 1 card',
    ]);
  });

  it('strips a leading connective word and trailing punctuation', () => {
    expect(normalizeClause('  Then Draw 1 Card.  ')).toBe('draw 1 card');
    expect(normalizeClause('Also gain 1 bean,')).toBe('gain 1 bean');
  });
});

describe('checkRepeatedSubeffect', () => {
  it('flags an exact repeated subeffect (draw, then draw)', () => {
    expect(
      checkRepeatedSubeffect('When you play this card, draw 1 card, then draw 1 card.')
    ).toEqual(['a card may not repeat the same subeffect']);
  });

  it('emits exactly one violation even when a subeffect repeats three times', () => {
    expect(
      checkRepeatedSubeffect('Draw 1 card, then draw 1 card, then draw 1 card.')
    ).toHaveLength(1);
  });

  it('does not flag distinct subeffects (draw, then opponent discards)', () => {
    expect(
      checkRepeatedSubeffect(
        'When you play this card, draw 1 card, then your opponent discards 1 card from their hand.'
      )
    ).toHaveLength(0);
  });

  it('does not flag a repeat whose normalized clause is under 10 characters', () => {
    // "end turn" normalizes to 8 chars -- below the threshold, so no violation.
    expect(checkRepeatedSubeffect('End turn; end turn.')).toHaveLength(0);
  });
});

describe('checkDeixisRule (rule 13: no deixis outside the inner game)', () => {
  it('flags "created" (creator identity)', () => {
    expect(checkDeixisRule('Worth 1 point for each card you created.').length).toBeGreaterThan(0);
  });

  it('flags "creator" (creator identity)', () => {
    expect(checkDeixisRule('The creator of this card draws 1 card.').length).toBeGreaterThan(0);
  });

  it('flags "round" (round reference)', () => {
    expect(checkDeixisRule('Score 1 point per round that has passed.').length).toBeGreaterThan(0);
  });

  it('flags "Claude" (real-world proper name)', () => {
    expect(checkDeixisRule('Claude discards 1 card.').length).toBeGreaterThan(0);
  });

  it('does NOT flag the bare word "match" used as an in-game verb', () => {
    expect(
      checkDeixisRule('If the names of your keepers match, gain 1 point.')
    ).toHaveLength(0);
  });

  it('flags outer-game "match" phrases but not the bare word', () => {
    expect(checkDeixisRule('Worth 1 point per match.').length).toBeGreaterThan(0);
    expect(checkDeixisRule('You win the match immediately.').length).toBeGreaterThan(0);
    expect(checkDeixisRule('Keeper. Matching pairs score 1 point.')).toHaveLength(0);
  });

  it('leaves clean in-game text alone', () => {
    expect(
      checkDeixisRule('When you play this card, your opponent discards 1 card.')
    ).toHaveLength(0);
  });

  it('flags "designer"/"designed"/"design" and "inner game"/"outer game" phrases', () => {
    expect(checkDeixisRule('The designer of this keeper gains 1 point.').length).toBeGreaterThan(0);
    expect(checkDeixisRule('Cards designed this round score 1 more.').length).toBeGreaterThan(0);
    expect(checkDeixisRule('This only works inside the inner game.').length).toBeGreaterThan(0);
  });

  it('flags real-world time words (weekday/month/today/o\'clock) case-sensitively for calendar terms', () => {
    expect(checkDeixisRule('This keeper is worth 1 point every Monday.').length).toBeGreaterThan(0);
    expect(checkDeixisRule('Worth 1 point today only.').length).toBeGreaterThan(0);
    expect(checkDeixisRule('Active only in May.').length).toBeGreaterThan(0);
    // Modal "may" (lowercase) must NOT be flagged -- only the capitalized month.
    expect(checkDeixisRule('You may draw 1 card.')).toHaveLength(0);
  });

  it('validateNewCard rejects a card whose effect text violates the deixis rule', () => {
    const result = validateNewCard(
      { name: 'Ghost Author', effectText: 'Worth 1 point for each card you created.' },
      []
    );
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v) => v.includes('outside the inner game'))
    ).toBe(true);
  });
});

describe('pre-existing registered cards are not retroactively broken', () => {
  // Exact name/effectText from data/cards.json -- documents that the two cards
  // already in the registry do not trip any of the new meta rules, including
  // rule 13 (deixis).
  const recount = {
    name: 'Recount',
    effectText:
      'When you play this card, draw 1 card, then your opponent discards 1 card from their hand.',
  };
  const recursiveRefundClause = {
    name: 'Recursive Refund Clause',
    effectText:
      "Keeper. Worth 1 point while in play. Whenever an opponent's card effect would destroy this keeper, return it to your hand instead of sending it to the discard pile.",
  };

  for (const card of [recount, recursiveRefundClause]) {
    it(`"${card.name}" trips none of the new rules`, () => {
      expect(checkEnglishRule(`${card.name} ${card.effectText}`)).toHaveLength(0);
      expect(checkEffectLength(card.effectText)).toHaveLength(0);
      expect(checkRepeatedSubeffect(card.effectText)).toHaveLength(0);
      expect(checkDeixisRule(`${card.name} ${card.effectText}`)).toHaveLength(0);
      // And it passes validateNewCard cleanly against an empty registry.
      expect(validateNewCard(card, []).ok).toBe(true);
    });
  }
});

describe('validateNewCard', () => {
  const registry: CardDef[] = [starter()];

  it('accepts a clean, non-duplicate card', () => {
    const result = validateNewCard(
      { name: 'Freshly Minted Idea', effectText: 'Keeper. Worth 1 point(s) while in play.' },
      []
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('rejects on numeral violation', () => {
    const result = validateNewCard({ name: 'Two Timer', effectText: 'Draw two cards.' }, []);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('rejects on duplicate name against the registry', () => {
    const result = validateNewCard(
      { name: registry[0].name, effectText: 'A brand new effect text.' },
      registry
    );
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('Name duplicates'))).toBe(true);
  });

  it('combines multiple violations', () => {
    const result = validateNewCard({ name: registry[0].name, effectText: 'Draw 2 cards.' }, registry);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects on the name-length rule (>32 chars)', () => {
    const result = validateNewCard(
      { name: 'a'.repeat(33), effectText: 'Keeper. Worth 1 point while in play.' },
      []
    );
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('the limit is 32'))).toBe(true);
  });

  it('rejects on the effect-length rule (>280 chars)', () => {
    const result = validateNewCard(
      { name: 'Long Winded', effectText: `Keeper. ${'a'.repeat(280)}` },
      []
    );
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes('280'))).toBe(true);
  });

  it('rejects on the English rule (non-Latin script)', () => {
    const result = validateNewCard(
      { name: 'Пример', effectText: 'Worth 1 point while in play.' },
      []
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toContain('card text must be written in English');
  });

  it('rejects on the repeated-subeffect rule', () => {
    const result = validateNewCard(
      { name: 'Double Draw', effectText: 'When you play this card, draw 1 card, then draw 1 card.' },
      []
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toContain('a card may not repeat the same subeffect');
  });
});
