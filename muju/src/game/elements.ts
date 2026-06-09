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
 * Injectable advantage graph (balance-lab experiment E7). The shipped game
 * always uses 'double-thick' (the incumbent — design ruling E-1); the lab
 * swaps graphs to compare alternatives that preserve the rush→expand edge.
 *
 * - 'double-thick': the pair cycle above (default).
 * - 'dual-triangle': v1.0's two independent triangles —
 *   fire→plant→water→fire and lightning→metal→shadow→lightning.
 * - 'rush-edge-only': fire/lightning beat plant/metal; everything else neutral.
 * - 'none': no elemental advantages (instrument control; NOT a design
 *   candidate — it violates ruling E-1).
 */
export type ElementGraphName = 'double-thick' | 'dual-triangle' | 'rush-edge-only' | 'none';

let activeGraph: ElementGraphName = 'double-thick';

export function setElementGraph(graph: ElementGraphName): void {
  activeGraph = graph;
}

export function getElementGraph(): ElementGraphName {
  return activeGraph;
}

const DUAL_TRIANGLE: Record<Element, Element> = {
  // attacker -> the single element it beats
  fire: 'plant',
  plant: 'water',
  water: 'fire',
  lightning: 'metal',
  metal: 'shadow',
  shadow: 'lightning',
};

/**
 * Check if attacker has elemental advantage over defender
 */
export function hasAdvantage(attacker: Element, defender: Element): boolean {
  switch (activeGraph) {
    case 'none':
      return false;
    case 'dual-triangle':
      return DUAL_TRIANGLE[attacker] === defender;
    case 'rush-edge-only':
      return ELEMENT_TO_PAIR[attacker] === 'fire-lightning' && ELEMENT_TO_PAIR[defender] === 'plant-metal';
    case 'double-thick': {
      const attackerPair = ELEMENT_TO_PAIR[attacker];
      const defenderPair = ELEMENT_TO_PAIR[defender];
      // Elements in the same pair are neutral to each other
      if (attackerPair === defenderPair) {
        return false;
      }
      return PAIR_ADVANTAGE[attackerPair] === defenderPair;
    }
  }
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

const ALL_ELEMENTS: Element[] = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];

/**
 * Get all elements that this element has advantage over
 * (graph-aware: derived from hasAdvantage so it tracks the active graph)
 */
export function getAdvantageTargets(element: Element): Element[] {
  return ALL_ELEMENTS.filter((other) => hasAdvantage(element, other));
}

/**
 * Get all elements that have advantage over this element
 * (graph-aware: derived from hasAdvantage so it tracks the active graph)
 */
export function getWeaknesses(element: Element): Element[] {
  return ALL_ELEMENTS.filter((other) => hasAdvantage(other, element));
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
