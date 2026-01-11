import type { Element } from './types';

/**
 * Combat advantage relationships:
 * Triangle 1: Fire → Plant → Water → Fire
 * Triangle 2: Lightning → Metal → Wind → Lightning
 *
 * Cross-triangle matchups are neutral.
 */

// Maps each element to the element it has advantage over
const ADVANTAGE_MAP: Record<Element, Element> = {
  fire: 'plant',
  plant: 'water',
  water: 'fire',
  lightning: 'metal',
  metal: 'wind',
  wind: 'lightning',
};

/**
 * Check if attacker has elemental advantage over defender
 */
export function hasAdvantage(attacker: Element, defender: Element): boolean {
  return ADVANTAGE_MAP[attacker] === defender;
}

/**
 * Check if defender has elemental advantage over attacker (attacker is disadvantaged)
 */
export function hasDisadvantage(attacker: Element, defender: Element): boolean {
  return ADVANTAGE_MAP[defender] === attacker;
}

/**
 * Get combat bonuses for an attack
 * Returns +1 attack and +1 defense if attacker has advantage
 */
export function getCombatBonus(
  attackerElement: Element,
  defenderElement: Element
): { attackBonus: number; defenseBonus: number } {
  if (hasAdvantage(attackerElement, defenderElement)) {
    return { attackBonus: 1, defenseBonus: 1 };
  }
  return { attackBonus: 0, defenseBonus: 0 };
}

/**
 * Get the element that this element has advantage over
 */
export function getAdvantageTarget(element: Element): Element {
  return ADVANTAGE_MAP[element];
}

/**
 * Get the element that has advantage over this element
 */
export function getWeakness(element: Element): Element {
  const entries = Object.entries(ADVANTAGE_MAP) as [Element, Element][];
  const weakness = entries.find(([_, target]) => target === element);
  return weakness![0];
}

/**
 * Check if two elements are in the same triangle
 */
export function inSameTriangle(a: Element, b: Element): boolean {
  const triangle1: Element[] = ['fire', 'plant', 'water'];
  const triangle2: Element[] = ['lightning', 'metal', 'wind'];

  const aInT1 = triangle1.includes(a);
  const bInT1 = triangle1.includes(b);

  return aInT1 === bInT1;
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
  wind: {
    name: 'Wind',
    language: 'Hawaiian/Māori',
    region: 'Oceania',
    color: '#22D3EE',
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
