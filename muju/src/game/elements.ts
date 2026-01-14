import type { Element } from './types';

/**
 * Combat advantage relationships - Dual Triangle System:
 *
 * Triangle 1: Fire → Plant → Water → Fire
 * Triangle 2: Lightning → Metal → Shadow → Lightning
 *
 * Cross-triangle matchups (e.g., Fire vs Lightning) are neutral.
 */

// Which triangle each element belongs to
const TRIANGLE_1: Element[] = ['fire', 'plant', 'water'];
// Triangle 2 elements are those not in Triangle 1

// Advantage mapping within each triangle
const ADVANTAGE_MAP: Record<Element, Element> = {
  // Triangle 1
  fire: 'plant',
  plant: 'water',
  water: 'fire',
  // Triangle 2
  lightning: 'metal',
  metal: 'shadow',
  shadow: 'lightning',
};

/**
 * Check if attacker has elemental advantage over defender
 */
export function hasAdvantage(attacker: Element, defender: Element): boolean {
  // Same element is never advantaged
  if (attacker === defender) {
    return false;
  }

  // Check if attacker beats defender in the advantage map
  return ADVANTAGE_MAP[attacker] === defender;
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
 * Get the element that this element has advantage over
 */
export function getAdvantageTarget(element: Element): Element {
  return ADVANTAGE_MAP[element];
}

/**
 * Get all elements that this element has advantage over (always just one in this system)
 */
export function getAdvantageTargets(element: Element): Element[] {
  return [ADVANTAGE_MAP[element]];
}

/**
 * Get the element that has advantage over this element
 */
export function getWeakness(element: Element): Element {
  // Find the element whose target is this element
  return (Object.entries(ADVANTAGE_MAP) as [Element, Element][])
    .find(([_, target]) => target === element)![0];
}

/**
 * Get all elements that have advantage over this element (always just one in this system)
 */
export function getWeaknesses(element: Element): Element[] {
  return [getWeakness(element)];
}

/**
 * Check if two elements are in the same triangle
 * Triangle 1: Fire, Plant, Water
 * Triangle 2: Lightning, Metal, Shadow
 */
export function inSameTriangle(a: Element, b: Element): boolean {
  const aInTriangle1 = TRIANGLE_1.includes(a);
  const bInTriangle1 = TRIANGLE_1.includes(b);

  return aInTriangle1 === bInTriangle1;
}

/**
 * Get the paired element (same position in the other triangle)
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
 * Check if two elements are paired (same position in their respective triangles)
 */
export function arePaired(a: Element, b: Element): boolean {
  return getPairedElement(a) === b;
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
