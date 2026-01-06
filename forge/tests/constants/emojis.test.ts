import { describe, it, expect } from 'vitest';
import {
  FACTION_EMOJIS,
  SYMBOL_EMOJIS,
  VP_CONDITION_EMOJIS,
  emojifyConditionalVP,
  formatSymbolCost
} from '../../src/constants/emojis';

describe('Emoji Constants', () => {
  it('should have all 7 faction emojis', () => {
    expect(Object.keys(FACTION_EMOJIS)).toHaveLength(7);
    expect(FACTION_EMOJIS['Crimson Covenant']).toBe('🩸');
    expect(FACTION_EMOJIS['Iron Tide']).toBe('⚙️');
    expect(FACTION_EMOJIS['Void Legion']).toBe('🌀');
    expect(FACTION_EMOJIS['Silk Network']).toBe('🕸️');
    expect(FACTION_EMOJIS['Dream Garden']).toBe('🪷');
    expect(FACTION_EMOJIS['Ghost Protocol']).toBe('👤');
    expect(FACTION_EMOJIS['General']).toBe('📦');
  });

  it('should use circumpunct for any', () => {
    expect(SYMBOL_EMOJIS['any']).toBe('☉');
  });

  it('should use target emoji for opponent', () => {
    expect(VP_CONDITION_EMOJIS['opponent']).toBe('🎯');
  });
});

describe('emojifyConditionalVP', () => {
  it('should convert faction-specific VPs', () => {
    expect(emojifyConditionalVP('+1 per Crimson Covenant card')).toBe('1★ x 🩸');
    expect(emojifyConditionalVP('+1 per Iron Tide card')).toBe('1★ x ⚙️');
    expect(emojifyConditionalVP('+1 per Void Legion card')).toBe('1★ x 🌀');
    expect(emojifyConditionalVP('+1 per Silk Network card')).toBe('1★ x 🕸️');
    expect(emojifyConditionalVP('+1 per Dream Garden card')).toBe('1★ x 🪷');
    expect(emojifyConditionalVP('+1 per Ghost Protocol card')).toBe('1★ x 👤');
  });

  it('should convert counter-bidding VPs', () => {
    expect(emojifyConditionalVP('+3 if you won a card by counter-bidding')).toBe('3★ if ⚔️');
    expect(emojifyConditionalVP('+2 per card you won by counter-bidding')).toBe('2★ x ⚔️');
  });

  it('should convert burn-related VPs', () => {
    expect(emojifyConditionalVP('+3 if you have burned 3+ cards')).toBe('3★ if 3+🔥');
    expect(emojifyConditionalVP('+1 per card you burned this game')).toBe('1★ x 🔥');
  });

  it('should convert diversity VPs', () => {
    expect(emojifyConditionalVP('+1 per faction represented')).toBe('1★ x 🌈');
    expect(emojifyConditionalVP('+2 per faction with 2+ cards')).toBe('2★ x 🌈');
    expect(emojifyConditionalVP('+4 if cards from 4+ factions')).toBe('4★ if 4+🌈');
  });

  it('should convert unspent symbol VPs', () => {
    expect(emojifyConditionalVP('+4 if you have 1 of each symbol unspent')).toBe('4★ if 1ea💎');
    expect(emojifyConditionalVP('+8 if you have 2 of each symbol unspent')).toBe('8★ if 2ea💎');
  });

  it('should convert ruins VPs', () => {
    expect(emojifyConditionalVP('+1 per ruins space in grid')).toBe('1★ x 🏚️');
  });

  it('should convert opponent comparison VPs', () => {
    expect(emojifyConditionalVP('+2 per card fewer than opponent')).toBe('2★ x ↓🎯');
  });

  it('should convert timing VPs', () => {
    expect(emojifyConditionalVP('+3 if this is your 5+ card')).toBe('3★ if 5+⏰');
  });

  it('should convert grid count VPs', () => {
    expect(emojifyConditionalVP('+3 if ≤12 cards remain face up in grid')).toBe('3★ if ≤12⊞');
  });

  it('should convert generic faction VPs', () => {
    expect(emojifyConditionalVP('+2 if you have another card of this faction')).toBe('2★ if +1🏴');
  });

  it('should handle empty strings', () => {
    expect(emojifyConditionalVP('')).toBe('');
  });

  it('should return original for unmatched patterns', () => {
    const unknown = '+5 for some unknown condition';
    expect(emojifyConditionalVP(unknown)).toBe(unknown);
  });
});

describe('formatSymbolCost', () => {
  it('should replace "any" with circumpunct', () => {
    expect(formatSymbolCost('any')).toBe('☉');
    expect(formatSymbolCost('any any')).toBe('☉ ☉');
    expect(formatSymbolCost('♂any')).toBe('♂☉');
  });

  it('should handle "free" cost', () => {
    expect(formatSymbolCost('free')).toBe('Free');
    expect(formatSymbolCost('')).toBe('Free');
  });

  it('should preserve other symbols', () => {
    expect(formatSymbolCost('♂♀')).toBe('♂♀');
    expect(formatSymbolCost('♂☿☽')).toBe('♂☿☽');
  });

  it('should handle mixed any and specific symbols', () => {
    expect(formatSymbolCost('♂☿any')).toBe('♂☿☉');
    expect(formatSymbolCost('any any ♀')).toBe('☉ ☉ ♀');
  });
});
