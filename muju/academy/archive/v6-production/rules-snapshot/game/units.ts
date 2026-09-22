import type { UnitDefinition, Element } from './types';

// All 18 unit definitions — v2.3: 3/4/5 purchases and universal 4/8 promotions.
// See docs/BALANCE-2026-09-11.md for the approved stats and map adjustments.
export const UNIT_DEFINITIONS: UnitDefinition[] = [
  // Fire (Rush) - Japanese
  {
    id: 'fire_1',
    name: 'Hi',
    element: 'fire',
    tier: 1,
    archetype: 'rush',
    attack: 2,
    defense: 1,
    speed: 2,
    mining: 1,
    cost: 3,
  },
  {
    id: 'fire_2',
    name: 'Hono',
    element: 'fire',
    tier: 2,
    archetype: 'rush',
    attack: 3,
    defense: 1,
    speed: 2,
    mining: 1,
    cost: 7,
  },
  {
    id: 'fire_3',
    name: 'Kagari',
    element: 'fire',
    tier: 3,
    archetype: 'rush',
    attack: 4,
    defense: 2,
    speed: 3,
    mining: 1,
    cost: 15,
  },

  // Lightning (Rush) - Swahili
  {
    id: 'lightning_1',
    name: 'Radi',
    element: 'lightning',
    tier: 1,
    archetype: 'rush',
    attack: 1,
    defense: 1,
    speed: 3,
    mining: 0,
    cost: 3,
  },
  {
    id: 'lightning_2',
    name: 'Umeme',
    element: 'lightning',
    tier: 2,
    archetype: 'rush',
    attack: 2,
    defense: 1,
    speed: 4,
    mining: 0,
    cost: 7,
  },
  {
    id: 'lightning_3',
    name: 'Kimubunga',
    element: 'lightning',
    tier: 3,
    archetype: 'rush',
    attack: 3,
    defense: 1,
    speed: 5,
    mining: 0,
    cost: 15,
  },

  // Water (Balanced) - Norse
  {
    id: 'water_1',
    name: 'Sjor',
    element: 'water',
    tier: 1,
    archetype: 'balanced',
    attack: 2,
    defense: 2,
    speed: 1,
    mining: 2,
    cost: 4,
  },
  {
    id: 'water_2',
    name: 'Straumr',
    element: 'water',
    tier: 2,
    archetype: 'balanced',
    attack: 2,
    defense: 3,
    speed: 1,
    mining: 2,
    cost: 8,
  },
  {
    id: 'water_3',
    name: 'Aegirinn',
    element: 'water',
    tier: 3,
    archetype: 'balanced',
    attack: 3,
    defense: 4,
    speed: 2,
    mining: 3,
    cost: 16,
  },

  // Shadow (Balanced) - Turkish/Slavic (formerly Wind)
  {
    id: 'shadow_1',
    name: 'Göl',
    element: 'shadow',
    tier: 1,
    archetype: 'balanced',
    attack: 2,
    defense: 2,
    speed: 2,
    mining: 0,
    cost: 4,
  },
  {
    id: 'shadow_2',
    name: 'Gölge',
    element: 'shadow',
    tier: 2,
    archetype: 'balanced',
    attack: 3,
    defense: 2,
    speed: 2,
    mining: 1,
    cost: 8,
  },
  {
    id: 'shadow_3',
    name: 'Karanlık',
    element: 'shadow',
    tier: 3,
    archetype: 'balanced',
    attack: 4,
    defense: 2,
    speed: 3,
    mining: 2,
    cost: 16,
  },

  // Plant (Expand) - Quechua/Nahuatl
  {
    id: 'plant_1',
    name: 'Muju',
    element: 'plant',
    tier: 1,
    archetype: 'expand',
    attack: 0,
    defense: 3,
    speed: 1,
    mining: 3,
    cost: 5,
  },
  {
    id: 'plant_2',
    name: 'Sachita',
    element: 'plant',
    tier: 2,
    archetype: 'expand',
    attack: 1,
    defense: 3,
    speed: 1,
    mining: 4,
    cost: 9,
  },
  {
    id: 'plant_3',
    name: 'Sachakuna',
    element: 'plant',
    tier: 3,
    archetype: 'expand',
    attack: 2,
    defense: 4,
    speed: 1,
    mining: 5,
    cost: 17,
  },

  // Metal (Expand) - Lakota
  {
    id: 'metal_1',
    name: 'Inyan',
    element: 'metal',
    tier: 1,
    archetype: 'expand',
    attack: 1,
    defense: 3,
    speed: 1,
    mining: 2,
    cost: 5,
  },
  {
    id: 'metal_2',
    name: 'Mazask',
    element: 'metal',
    tier: 2,
    archetype: 'expand',
    attack: 2,
    defense: 4,
    speed: 1,
    mining: 3,
    cost: 9,
  },
  {
    id: 'metal_3',
    name: 'Tanka',
    element: 'metal',
    tier: 3,
    archetype: 'expand',
    attack: 2,
    defense: 5,
    speed: 2,
    mining: 4,
    cost: 17,
  },
];

// Index for fast lookups
const unitDefinitionMap = new Map<string, UnitDefinition>(
  UNIT_DEFINITIONS.map((def) => [def.id, def])
);

/**
 * Get a unit definition by ID
 */
export function getUnitDefinition(id: string): UnitDefinition {
  const def = unitDefinitionMap.get(id);
  if (!def) {
    throw new Error(`Unknown unit definition: ${id}`);
  }
  return def;
}

/**
 * Get all unit definitions for an element
 */
export function getUnitsByElement(element: Element): UnitDefinition[] {
  return UNIT_DEFINITIONS.filter((def) => def.element === element);
}

/**
 * Get the next tier unit definition for promotion
 * Returns null at the end of the element’s catalogue ladder
 */
export function getNextTierDefinition(
  currentDefId: string
): UnitDefinition | null {
  const current = getUnitDefinition(currentDefId);

  const nextTier = current.tier + 1;
  return (
    UNIT_DEFINITIONS.find(
      (def) => def.element === current.element && def.tier === nextTier
    ) ?? null
  );
}

/**
 * Calculate the cost to promote from current unit to next tier
 */
export function getPromotionCost(currentDefId: string): number {
  const current = getUnitDefinition(currentDefId);
  const next = getNextTierDefinition(currentDefId);
  if (!next) return 0;
  return next.cost - current.cost;
}

/**
 * Starting units for each player (by definition ID)
 */
export const STARTING_UNITS = ['fire_1', 'water_1', 'plant_1'] as const;
