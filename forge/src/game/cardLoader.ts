import type { Card, SymbolCost } from './types';
import cardsData from '../../cards.json';

export function parseSymbols(symbolStr: string): SymbolCost {
  if (symbolStr === "free" || symbolStr === "") {
    return { mars: 0, venus: 0, mercury: 0, moon: 0, any: 0 };
  }

  // Count specific symbols
  const mars = (symbolStr.match(/♂/g) || []).length;
  const venus = (symbolStr.match(/♀/g) || []).length;
  const mercury = (symbolStr.match(/☿/g) || []).length;
  const moon = (symbolStr.match(/☽/g) || []).length;

  // Count "any" keyword occurrences
  let any = (symbolStr.toLowerCase().match(/\bany\b/g) || []).length;

  // Handle digit notation (e.g., "♂☽1" means mars + moon + 1 any)
  const digitMatch = symbolStr.match(/\d+/);
  if (digitMatch) {
    any += parseInt(digitMatch[0]);
  }

  return { mars, venus, mercury, moon, any };
}

export function loadCards(): Card[] {
  return cardsData.map((cardData, index) => {
    const parsedCost = parseSymbols(cardData.symbols);

    return {
      id: `card-${index}`,
      name: cardData.name,
      faction: cardData.faction as Card['faction'],
      cost: cardData.cost,
      symbols: cardData.symbols,
      baseVP: cardData.baseVP,
      conditionalVP: cardData.conditionalVP || "",
      game3Effect: cardData.game3Effect,
      parsedCost,
    };
  });
}

export function shuffleCards(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
