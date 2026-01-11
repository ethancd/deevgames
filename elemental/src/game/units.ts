import type { UnitDefinition, Element } from './types';

// All 24 unit definitions from the canonical spreadsheet
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
    speed: 1,
    mining: 1,
    cost: 1,
    buildTime: 1,
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
    cost: 3,
    buildTime: 1,
  },
  {
    id: 'fire_3',
    name: 'Kagari',
    element: 'fire',
    tier: 3,
    archetype: 'rush',
    attack: 4,
    defense: 2,
    speed: 2,
    mining: 1,
    cost: 6,
    buildTime: 2,
  },
  {
    id: 'fire_4',
    name: 'Gokamoka',
    element: 'fire',
    tier: 4,
    archetype: 'rush',
    attack: 6,
    defense: 3,
    speed: 3,
    mining: 1,
    cost: 10,
    buildTime: 2,
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
    speed: 2,
    mining: 1,
    cost: 1,
    buildTime: 1,
  },
  {
    id: 'lightning_2',
    name: 'Umeme',
    element: 'lightning',
    tier: 2,
    archetype: 'rush',
    attack: 2,
    defense: 1,
    speed: 3,
    mining: 1,
    cost: 3,
    buildTime: 1,
  },
  {
    id: 'lightning_3',
    name: 'Kimubunga',
    element: 'lightning',
    tier: 3,
    archetype: 'rush',
    attack: 2,
    defense: 1,
    speed: 4,
    mining: 1,
    cost: 6,
    buildTime: 2,
  },
  {
    id: 'lightning_4',
    name: 'Dhorubakali',
    element: 'lightning',
    tier: 4,
    archetype: 'rush',
    attack: 3,
    defense: 1,
    speed: 5,
    mining: 1,
    cost: 10,
    buildTime: 2,
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
    mining: 1,
    cost: 2,
    buildTime: 1,
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
    cost: 4,
    buildTime: 2,
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
    cost: 10,
    buildTime: 2,
  },
  {
    id: 'water_4',
    name: 'Hafkafstormur',
    element: 'water',
    tier: 4,
    archetype: 'balanced',
    attack: 4,
    defense: 5,
    speed: 3,
    mining: 3,
    cost: 15,
    buildTime: 3,
  },

  // Wind (Balanced) - Hawaiian/Māori
  {
    id: 'wind_1',
    name: 'Hau',
    element: 'wind',
    tier: 1,
    archetype: 'balanced',
    attack: 2,
    defense: 1,
    speed: 2,
    mining: 1,
    cost: 2,
    buildTime: 1,
  },
  {
    id: 'wind_2',
    name: 'Moni',
    element: 'wind',
    tier: 2,
    archetype: 'balanced',
    attack: 3,
    defense: 2,
    speed: 2,
    mining: 1,
    cost: 4,
    buildTime: 2,
  },
  {
    id: 'wind_3',
    name: 'Tawhiri',
    element: 'wind',
    tier: 3,
    archetype: 'balanced',
    attack: 4,
    defense: 2,
    speed: 3,
    mining: 2,
    cost: 10,
    buildTime: 2,
  },
  {
    id: 'wind_4',
    name: 'Awhatamangi',
    element: 'wind',
    tier: 4,
    archetype: 'balanced',
    attack: 4,
    defense: 3,
    speed: 4,
    mining: 2,
    cost: 15,
    buildTime: 3,
  },

  // Plant (Expand) - Quechua/Nahuatl
  {
    id: 'plant_1',
    name: 'Muju',
    element: 'plant',
    tier: 1,
    archetype: 'expand',
    attack: 1,
    defense: 3,
    speed: 1,
    mining: 2,
    cost: 3,
    buildTime: 2,
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
    mining: 3,
    cost: 6,
    buildTime: 2,
  },
  {
    id: 'plant_3',
    name: 'Sachakuna',
    element: 'plant',
    tier: 3,
    archetype: 'expand',
    attack: 1,
    defense: 4,
    speed: 1,
    mining: 4,
    cost: 12,
    buildTime: 3,
  },
  {
    id: 'plant_4',
    name: 'Cuauhtlimallki',
    element: 'plant',
    tier: 4,
    archetype: 'expand',
    attack: 2,
    defense: 5,
    speed: 1,
    mining: 5,
    cost: 20,
    buildTime: 3,
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
    cost: 3,
    buildTime: 2,
  },
  {
    id: 'metal_2',
    name: 'Mazaska',
    element: 'metal',
    tier: 2,
    archetype: 'expand',
    attack: 2,
    defense: 4,
    speed: 1,
    mining: 2,
    cost: 6,
    buildTime: 2,
  },
  {
    id: 'metal_3',
    name: 'Tankasila',
    element: 'metal',
    tier: 3,
    archetype: 'expand',
    attack: 2,
    defense: 6,
    speed: 1,
    mining: 3,
    cost: 12,
    buildTime: 3,
  },
  {
    id: 'metal_4',
    name: 'Wakanwicasa',
    element: 'metal',
    tier: 4,
    archetype: 'expand',
    attack: 2,
    defense: 8,
    speed: 1,
    mining: 4,
    cost: 20,
    buildTime: 3,
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
 * Returns null if already at tier 4
 */
export function getNextTierDefinition(
  currentDefId: string
): UnitDefinition | null {
  const current = getUnitDefinition(currentDefId);
  if (current.tier === 4) return null;

  const nextTier = (current.tier + 1) as 1 | 2 | 3 | 4;
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
