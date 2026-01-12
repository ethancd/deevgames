import type { Element } from './types';

/**
 * Combat advantage relationships - Double-Thick Triangle:
 *
 * Fire & Lightning → Plant & Metal → Water & Shadow → Fire & Lightning
 *
 * Each element has advantage over TWO elements (paired opponents),
 * and is weak to TWO elements (paired counters).
 */

// Element pairs that share advantages
type ElementPair = 'fire-lightning' | 'plant-metal' | 'water-shadow';

const ELEMENT_TO_PAIR: Record<Element, ElementPair> = {
  fire: 'fire-lightning',
  lightning: 'fire-lightning',
  plant: 'plant-metal',
  metal: 'plant-metal',
  water: 'water-shadow',
  shadow: 'water-shadow',
};

// Which pair beats which pair
const PAIR_ADVANTAGE: Record<ElementPair, ElementPair> = {
  'fire-lightning': 'plant-metal',   // Fire & Lightning beat Plant & Metal
  'plant-metal': 'water-shadow',     // Plant & Metal beat Water & Shadow
  'water-shadow': 'fire-lightning',  // Water & Shadow beat Fire & Lightning
};

/**
 * Check if attacker has elemental advantage over defender
 */
export function hasAdvantage(attacker: Element, defender: Element): boolean {
  const attackerPair = ELEMENT_TO_PAIR[attacker];
  const defenderPair = ELEMENT_TO_PAIR[defender];

  // Elements in the same pair are neutral to each other
  if (attackerPair === defenderPair) {
    return false;
  }

  return PAIR_ADVANTAGE[attackerPair] === defenderPair;
}

/**
 * Check if defender has elemental advantage over attacker (attacker is disadvantaged)
 */
export function hasDisadvantage(attacker: Element, defender: Element): boolean {
  return hasAdvantage(defender, attacker);
}

/**
 * Get combat modifier for an attack
 * - Advantage: +1 attack
 * - Disadvantage: -1 attack
 * - Neutral: 0
 *
 * Defense is never modified by elements.
 */
export function getAttackModifier(
  attackerElement: Element,
  defenderElement: Element
): number {
  if (hasAdvantage(attackerElement, defenderElement)) {
    return 1;
  }
  if (hasDisadvantage(attackerElement, defenderElement)) {
    return -1;
  }
  return 0;
}

/**
 * Get all elements that this element has advantage over
 */
export function getAdvantageTargets(element: Element): Element[] {
  const myPair = ELEMENT_TO_PAIR[element];
  const weakPair = PAIR_ADVANTAGE[myPair];

  return (Object.entries(ELEMENT_TO_PAIR) as [Element, ElementPair][])
    .filter(([_, pair]) => pair === weakPair)
    .map(([el]) => el);
}

/**
 * Get all elements that have advantage over this element
 */
export function getWeaknesses(element: Element): Element[] {
  const myPair = ELEMENT_TO_PAIR[element];

  // Find which pair beats my pair
  const strongPair = (Object.entries(PAIR_ADVANTAGE) as [ElementPair, ElementPair][])
    .find(([_, weakPair]) => weakPair === myPair)?.[0];

  if (!strongPair) return [];

  return (Object.entries(ELEMENT_TO_PAIR) as [Element, ElementPair][])
    .filter(([_, pair]) => pair === strongPair)
    .map(([el]) => el);
}

/**
 * Get the paired element (shares advantages/weaknesses)
 */
export function getPairedElement(element: Element): Element {
  const pairMap: Record<Element, Element> = {
    fire: 'lightning',
    lightning: 'fire',
    plant: 'metal',
    metal: 'plant',
    water: 'shadow',
    shadow: 'water',
  };
  return pairMap[element];
}

/**
 * Check if two elements are paired (share advantages/weaknesses)
 */
export function arePaired(a: Element, b: Element): boolean {
  return ELEMENT_TO_PAIR[a] === ELEMENT_TO_PAIR[b];
}

/**
 * Element display info
 */
export const ELEMENT_INFO: Record<
  Element,
  { name: string; language: string; region: string; color: string }
> = {
  fire: {
    name: 'Fire',
    language: 'Japanese',
    region: 'Asia',
    color: '#EF4444',
  },
  lightning: {
    name: 'Lightning',
    language: 'Swahili',
    region: 'Africa',
    color: '#EAB308',
  },
  water: {
    name: 'Water',
    language: 'Norse',
    region: 'Europe',
    color: '#3B82F6',
  },
  shadow: {
    name: 'Shadow',
    language: 'Turkish/Slavic',
    region: 'Eurasia',
    color: '#7C3AED',
  },
  plant: {
    name: 'Plant',
    language: 'Quechua/Nahuatl',
    region: 'South America',
    color: '#22C55E',
  },
  metal: {
    name: 'Metal',
    language: 'Lakota',
    region: 'North America',
    color: '#6B7280',
  },
};
