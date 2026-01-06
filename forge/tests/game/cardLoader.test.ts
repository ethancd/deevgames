import { describe, it, expect } from 'vitest';
import { parseSymbols, loadCards } from '../../src/game/cardLoader';

describe('parseSymbols', () => {
  it('should parse free cost', () => {
    expect(parseSymbols('free')).toEqual({
      mars: 0,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 0,
    });
  });

  it('should parse empty string as free', () => {
    expect(parseSymbols('')).toEqual({
      mars: 0,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 0,
    });
  });

  it('should parse single symbol', () => {
    expect(parseSymbols('♂')).toEqual({
      mars: 1,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 0,
    });
  });

  it('should parse multiple same symbols', () => {
    expect(parseSymbols('♂♂')).toEqual({
      mars: 2,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 0,
    });
  });

  it('should parse mixed symbols', () => {
    expect(parseSymbols('♂♀')).toEqual({
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
      any: 0,
    });
  });

  it('should parse all symbol types', () => {
    expect(parseSymbols('♂♀☿☽')).toEqual({
      mars: 1,
      venus: 1,
      mercury: 1,
      moon: 1,
      any: 0,
    });
  });

  it('should parse any symbols', () => {
    expect(parseSymbols('any')).toEqual({
      mars: 0,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 1,
    });
  });

  it('should parse multiple any symbols', () => {
    expect(parseSymbols('any any')).toEqual({
      mars: 0,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 2,
    });
  });

  it('should parse digit notation', () => {
    expect(parseSymbols('♂☽1')).toEqual({
      mars: 1,
      venus: 0,
      mercury: 0,
      moon: 1,
      any: 1,
    });
  });

  it('should parse mixed symbols with digit', () => {
    expect(parseSymbols('♂♀1')).toEqual({
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
      any: 1,
    });
  });

  it('should parse complex costs', () => {
    expect(parseSymbols('♂♂♀♀')).toEqual({
      mars: 2,
      venus: 2,
      mercury: 0,
      moon: 0,
      any: 0,
    });
  });

  it('should parse four any symbols', () => {
    expect(parseSymbols('any any any any')).toEqual({
      mars: 0,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 4,
    });
  });
});

describe('loadCards', () => {
  it('should load all 82 cards', () => {
    const cards = loadCards();
    expect(cards).toHaveLength(82);
  });

  it('should assign unique IDs to cards', () => {
    const cards = loadCards();
    const ids = new Set(cards.map(c => c.id));
    expect(ids.size).toBe(82);
  });

  it('should parse symbol costs for all cards', () => {
    const cards = loadCards();
    cards.forEach(card => {
      expect(card.parsedCost).toBeDefined();
      expect(typeof card.parsedCost.mars).toBe('number');
      expect(typeof card.parsedCost.venus).toBe('number');
      expect(typeof card.parsedCost.mercury).toBe('number');
      expect(typeof card.parsedCost.moon).toBe('number');
      expect(typeof card.parsedCost.any).toBe('number');
    });
  });

  it('should correctly parse specific cards', () => {
    const cards = loadCards();

    // Hidden Cache (free)
    const hiddenCache = cards.find(c => c.name === 'Hidden Cache');
    expect(hiddenCache?.parsedCost).toEqual({
      mars: 0,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 0,
    });

    // Crimson Agent (♂♀)
    const crimsonAgent = cards.find(c => c.name === 'Crimson Agent');
    expect(crimsonAgent?.parsedCost).toEqual({
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
      any: 0,
    });

    // Carrion Caller (♂♀1)
    const carrionCaller = cards.find(c => c.name === 'Carrion Caller');
    expect(carrionCaller?.parsedCost).toEqual({
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
      any: 1,
    });

    // Grand Arsenal (any any any any)
    const grandArsenal = cards.find(c => c.name === 'Grand Arsenal');
    expect(grandArsenal?.parsedCost).toEqual({
      mars: 0,
      venus: 0,
      mercury: 0,
      moon: 0,
      any: 4,
    });
  });

  it('should set empty conditionalVP to empty string', () => {
    const cards = loadCards();
    cards.forEach(card => {
      expect(typeof card.conditionalVP).toBe('string');
    });
  });
});
