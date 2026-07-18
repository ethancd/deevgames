import { GrowthStage, Layer, Plant, ResourceType, SeedType, TileType } from './types'

export interface StageReq {
  water: number
  crystal: number
  sunlight: number
}

const STAGES: GrowthStage[] = [
  GrowthStage.SEED,
  GrowthStage.SPROUT,
  GrowthStage.SAPLING,
  GrowthStage.MATURE,
]

export function nextStage(stage: GrowthStage): GrowthStage | null {
  const i = STAGES.indexOf(stage)
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null
}

const GROWTH_REQS: Record<SeedType, Record<GrowthStage, StageReq>> = {
  [SeedType.WATER_LILY]: {
    [GrowthStage.SEED]:    { water: 0, crystal: 0, sunlight: 2 },
    [GrowthStage.SPROUT]:  { water: 0, crystal: 0, sunlight: 3 },
    [GrowthStage.SAPLING]: { water: 0, crystal: 0, sunlight: 4 },
    [GrowthStage.MATURE]:  { water: 0, crystal: 0, sunlight: 0 },
  },
  [SeedType.SUNFLOWER]: {
    [GrowthStage.SEED]:    { water: 2, crystal: 0, sunlight: 0 },
    [GrowthStage.SPROUT]:  { water: 3, crystal: 0, sunlight: 0 },
    [GrowthStage.SAPLING]: { water: 4, crystal: 0, sunlight: 0 },
    [GrowthStage.MATURE]:  { water: 0, crystal: 0, sunlight: 0 },
  },
  [SeedType.LIFELEAF]: {
    [GrowthStage.SEED]:    { water: 2, crystal: 0, sunlight: 1 },
    [GrowthStage.SPROUT]:  { water: 3, crystal: 0, sunlight: 2 },
    [GrowthStage.SAPLING]: { water: 5, crystal: 0, sunlight: 3 },
    [GrowthStage.MATURE]:  { water: 0, crystal: 0, sunlight: 0 },
  },
  [SeedType.DEWBELL]: {
    [GrowthStage.SEED]:    { water: 2, crystal: 0, sunlight: 1 },
    [GrowthStage.SPROUT]:  { water: 3, crystal: 0, sunlight: 1 },
    [GrowthStage.SAPLING]: { water: 5, crystal: 0, sunlight: 2 },
    [GrowthStage.MATURE]:  { water: 0, crystal: 0, sunlight: 0 },
  },
  [SeedType.LICHEN]: {
    [GrowthStage.SEED]:    { water: 2, crystal: 0, sunlight: 0 },
    [GrowthStage.SPROUT]:  { water: 3, crystal: 0, sunlight: 0 },
    [GrowthStage.SAPLING]: { water: 4, crystal: 0, sunlight: 0 },
    [GrowthStage.MATURE]:  { water: 0, crystal: 0, sunlight: 0 },
  },
  [SeedType.ROOTWEAVE]: {
    [GrowthStage.SEED]:    { water: 2, crystal: 0, sunlight: 1 },
    [GrowthStage.SPROUT]:  { water: 2, crystal: 1, sunlight: 1 },
    [GrowthStage.SAPLING]: { water: 3, crystal: 2, sunlight: 2 },
    [GrowthStage.MATURE]:  { water: 0, crystal: 0, sunlight: 0 },
  },
  [SeedType.GLIMSTONE]: {
    [GrowthStage.SEED]:    { water: 2, crystal: 0, sunlight: 1 },
    [GrowthStage.SPROUT]:  { water: 2, crystal: 1, sunlight: 1 },
    [GrowthStage.SAPLING]: { water: 3, crystal: 2, sunlight: 2 },
    [GrowthStage.MATURE]:  { water: 0, crystal: 0, sunlight: 0 },
  },
}

export function getStageReq(seed: SeedType, stage: GrowthStage): StageReq {
  return GROWTH_REQS[seed][stage]
}

const SEED_LAYERS: Record<SeedType, Layer> = {
  [SeedType.WATER_LILY]: Layer.SURFACE,
  [SeedType.SUNFLOWER]: Layer.SURFACE,
  [SeedType.LIFELEAF]: Layer.SURFACE,
  [SeedType.DEWBELL]: Layer.SURFACE,
  [SeedType.LICHEN]: Layer.UNDERGROUND,
  [SeedType.ROOTWEAVE]: Layer.UNDERGROUND,
  [SeedType.GLIMSTONE]: Layer.UNDERGROUND,
}

export function seedLayer(seed: SeedType): Layer {
  return SEED_LAYERS[seed]
}

export function crystalTypeForSeed(seed: SeedType): 'crystalRed' | 'crystalBlue' {
  if (seed === SeedType.ROOTWEAVE || seed === SeedType.GLIMSTONE) return 'crystalRed'
  return 'crystalBlue'
}

export const SEED_DISPLAY: Record<SeedType, { name: string; emoji: string }> = {
  [SeedType.WATER_LILY]: { name: 'Water Lily', emoji: '🪷' },
  [SeedType.SUNFLOWER]:  { name: 'Sunflower', emoji: '🌻' },
  [SeedType.LIFELEAF]:   { name: 'Lifeleaf',  emoji: '🍃' },
  [SeedType.DEWBELL]:    { name: 'Dewbell',   emoji: '🔔' },
  [SeedType.LICHEN]:     { name: 'Lichen',    emoji: '🪨' },
  [SeedType.ROOTWEAVE]:  { name: 'Rootweave', emoji: '🌿' },
  [SeedType.GLIMSTONE]:  { name: 'Glimstone', emoji: '💎' },
}

export const STAGE_DISPLAY: Record<GrowthStage, string> = {
  [GrowthStage.SEED]: 'Seed',
  [GrowthStage.SPROUT]: 'Sprout',
  [GrowthStage.SAPLING]: 'Sapling',
  [GrowthStage.MATURE]: 'Mature',
}

export interface TransmuteRecipe {
  input1: ResourceType | null
  input2: ResourceType | null
  output: ResourceType
}

const TRANSMUTE_RECIPES: Record<SeedType, TransmuteRecipe> = {
  [SeedType.WATER_LILY]: {
    input1: null,
    input2: null,
    output: ResourceType.WATER,
  },
  [SeedType.SUNFLOWER]: {
    input1: null,
    input2: null,
    output: ResourceType.SUNLIGHT,
  },
  [SeedType.LIFELEAF]: {
    input1: ResourceType.WATER,
    input2: ResourceType.SUNLIGHT,
    output: ResourceType.LIFE_ESSENCE,
  },
  [SeedType.DEWBELL]: {
    input1: ResourceType.CRYSTAL_RED,
    input2: ResourceType.CRYSTAL_BLUE,
    output: ResourceType.MUSIC_NOTES,
  },
  [SeedType.LICHEN]: {
    input1: null,
    input2: null,
    output: ResourceType.CRYSTAL_RED,
  },
  [SeedType.ROOTWEAVE]: {
    input1: ResourceType.WATER,
    input2: ResourceType.CRYSTAL_RED,
    output: ResourceType.LIFE_ESSENCE,
  },
  [SeedType.GLIMSTONE]: {
    input1: ResourceType.LIFE_ESSENCE,
    input2: ResourceType.SUNLIGHT,
    output: ResourceType.CRYSTAL_GREEN,
  },
}

export function getTransmuteRecipe(seed: SeedType): TransmuteRecipe {
  return TRANSMUTE_RECIPES[seed]
}

export function isSourcePlant(seed: SeedType): boolean {
  const recipe = TRANSMUTE_RECIPES[seed]
  return recipe.input1 === null && recipe.input2 === null
}

export function getPlantOutput(plant: Plant, tileType: TileType): ResourceType {
  if (plant.seedType === SeedType.LICHEN) {
    return tileType === TileType.CRYSTAL_BLUE ? ResourceType.CRYSTAL_BLUE : ResourceType.CRYSTAL_RED
  }
  return TRANSMUTE_RECIPES[plant.seedType].output
}
