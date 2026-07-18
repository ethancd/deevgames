import { describe, it, expect } from 'vitest'
import {
  getStageReq, nextStage, seedLayer, crystalTypeForSeed,
  getTransmuteRecipe, isSourcePlant, getPlantOutput,
} from '../../src/sim/PlantConfig'
import {
  GrowthStage, Layer, Plant, ResourceType, SeedType, TileType,
} from '../../src/sim/types'

function makePlant(seed: SeedType, stage: GrowthStage = GrowthStage.MATURE): Plant {
  return {
    pos: { col: 5, row: 5 },
    layer: Layer.SURFACE,
    seedType: seed,
    stage,
    waterFed: 0, crystalFed: 0, sunlightFed: 0,
    transmuteInput1: 0, transmuteInput2: 0,
  }
}

describe('seedLayer', () => {
  it('surface plants: water lily, sunflower, lifeleaf, dewbell', () => {
    expect(seedLayer(SeedType.WATER_LILY)).toBe(Layer.SURFACE)
    expect(seedLayer(SeedType.SUNFLOWER)).toBe(Layer.SURFACE)
    expect(seedLayer(SeedType.LIFELEAF)).toBe(Layer.SURFACE)
    expect(seedLayer(SeedType.DEWBELL)).toBe(Layer.SURFACE)
  })

  it('underground plants: lichen, rootweave, glimstone', () => {
    expect(seedLayer(SeedType.LICHEN)).toBe(Layer.UNDERGROUND)
    expect(seedLayer(SeedType.ROOTWEAVE)).toBe(Layer.UNDERGROUND)
    expect(seedLayer(SeedType.GLIMSTONE)).toBe(Layer.UNDERGROUND)
  })
})

describe('nextStage', () => {
  it('advances through growth stages correctly', () => {
    expect(nextStage(GrowthStage.SEED)).toBe(GrowthStage.SPROUT)
    expect(nextStage(GrowthStage.SPROUT)).toBe(GrowthStage.SAPLING)
    expect(nextStage(GrowthStage.SAPLING)).toBe(GrowthStage.MATURE)
  })

  it('returns null for mature (final stage)', () => {
    expect(nextStage(GrowthStage.MATURE)).toBeNull()
  })
})

describe('getStageReq', () => {
  it('water lily needs only sunlight', () => {
    const seed = SeedType.WATER_LILY
    expect(getStageReq(seed, GrowthStage.SEED)).toEqual({ water: 0, crystal: 0, sunlight: 2 })
    expect(getStageReq(seed, GrowthStage.SPROUT)).toEqual({ water: 0, crystal: 0, sunlight: 3 })
    expect(getStageReq(seed, GrowthStage.SAPLING)).toEqual({ water: 0, crystal: 0, sunlight: 4 })
    expect(getStageReq(seed, GrowthStage.MATURE)).toEqual({ water: 0, crystal: 0, sunlight: 0 })
  })

  it('sunflower needs only water', () => {
    const seed = SeedType.SUNFLOWER
    expect(getStageReq(seed, GrowthStage.SEED)).toEqual({ water: 2, crystal: 0, sunlight: 0 })
    expect(getStageReq(seed, GrowthStage.SPROUT)).toEqual({ water: 3, crystal: 0, sunlight: 0 })
    expect(getStageReq(seed, GrowthStage.SAPLING)).toEqual({ water: 4, crystal: 0, sunlight: 0 })
  })

  it('lifeleaf needs water and sunlight', () => {
    const req = getStageReq(SeedType.LIFELEAF, GrowthStage.SEED)
    expect(req.water).toBe(2)
    expect(req.sunlight).toBe(1)
    expect(req.crystal).toBe(0)
  })

  it('rootweave needs water, crystal, and sunlight at later stages', () => {
    const sprout = getStageReq(SeedType.ROOTWEAVE, GrowthStage.SPROUT)
    expect(sprout.water).toBe(2)
    expect(sprout.crystal).toBe(1)
    expect(sprout.sunlight).toBe(1)
  })

  it('all seed types have requirements defined for all stages', () => {
    const seeds = Object.values(SeedType)
    const stages = [GrowthStage.SEED, GrowthStage.SPROUT, GrowthStage.SAPLING, GrowthStage.MATURE]
    for (const seed of seeds) {
      for (const stage of stages) {
        const req = getStageReq(seed, stage)
        expect(req).toBeDefined()
        expect(typeof req.water).toBe('number')
        expect(typeof req.crystal).toBe('number')
        expect(typeof req.sunlight).toBe('number')
      }
    }
  })
})

describe('crystalTypeForSeed', () => {
  it('rootweave and glimstone use red crystals', () => {
    expect(crystalTypeForSeed(SeedType.ROOTWEAVE)).toBe('crystalRed')
    expect(crystalTypeForSeed(SeedType.GLIMSTONE)).toBe('crystalRed')
  })

  it('all other seeds use blue crystals', () => {
    expect(crystalTypeForSeed(SeedType.WATER_LILY)).toBe('crystalBlue')
    expect(crystalTypeForSeed(SeedType.SUNFLOWER)).toBe('crystalBlue')
    expect(crystalTypeForSeed(SeedType.LIFELEAF)).toBe('crystalBlue')
    expect(crystalTypeForSeed(SeedType.DEWBELL)).toBe('crystalBlue')
    expect(crystalTypeForSeed(SeedType.LICHEN)).toBe('crystalBlue')
  })
})

describe('getTransmuteRecipe', () => {
  it('water lily is a source plant (outputs water, no inputs)', () => {
    const r = getTransmuteRecipe(SeedType.WATER_LILY)
    expect(r.input1).toBeNull()
    expect(r.input2).toBeNull()
    expect(r.output).toBe(ResourceType.WATER)
  })

  it('sunflower is a source plant (outputs sunlight, no inputs)', () => {
    const r = getTransmuteRecipe(SeedType.SUNFLOWER)
    expect(r.input1).toBeNull()
    expect(r.input2).toBeNull()
    expect(r.output).toBe(ResourceType.SUNLIGHT)
  })

  it('lichen is a source plant (outputs crystal red, no inputs)', () => {
    const r = getTransmuteRecipe(SeedType.LICHEN)
    expect(r.input1).toBeNull()
    expect(r.input2).toBeNull()
    expect(r.output).toBe(ResourceType.CRYSTAL_RED)
  })

  it('lifeleaf transmutes water + sunlight into life essence', () => {
    const r = getTransmuteRecipe(SeedType.LIFELEAF)
    expect(r.input1).toBe(ResourceType.WATER)
    expect(r.input2).toBe(ResourceType.SUNLIGHT)
    expect(r.output).toBe(ResourceType.LIFE_ESSENCE)
  })

  it('dewbell transmutes crystal red + crystal blue into music notes', () => {
    const r = getTransmuteRecipe(SeedType.DEWBELL)
    expect(r.input1).toBe(ResourceType.CRYSTAL_RED)
    expect(r.input2).toBe(ResourceType.CRYSTAL_BLUE)
    expect(r.output).toBe(ResourceType.MUSIC_NOTES)
  })

  it('rootweave transmutes water + crystal red into life essence', () => {
    const r = getTransmuteRecipe(SeedType.ROOTWEAVE)
    expect(r.input1).toBe(ResourceType.WATER)
    expect(r.input2).toBe(ResourceType.CRYSTAL_RED)
    expect(r.output).toBe(ResourceType.LIFE_ESSENCE)
  })

  it('glimstone transmutes life essence + sunlight into crystal green', () => {
    const r = getTransmuteRecipe(SeedType.GLIMSTONE)
    expect(r.input1).toBe(ResourceType.LIFE_ESSENCE)
    expect(r.input2).toBe(ResourceType.SUNLIGHT)
    expect(r.output).toBe(ResourceType.CRYSTAL_GREEN)
  })
})

describe('isSourcePlant', () => {
  it('water lily, sunflower, lichen are source plants', () => {
    expect(isSourcePlant(SeedType.WATER_LILY)).toBe(true)
    expect(isSourcePlant(SeedType.SUNFLOWER)).toBe(true)
    expect(isSourcePlant(SeedType.LICHEN)).toBe(true)
  })

  it('transmuter plants are not source plants', () => {
    expect(isSourcePlant(SeedType.LIFELEAF)).toBe(false)
    expect(isSourcePlant(SeedType.DEWBELL)).toBe(false)
    expect(isSourcePlant(SeedType.ROOTWEAVE)).toBe(false)
    expect(isSourcePlant(SeedType.GLIMSTONE)).toBe(false)
  })
})

describe('getPlantOutput', () => {
  it('water lily outputs water', () => {
    expect(getPlantOutput(makePlant(SeedType.WATER_LILY), TileType.GRASS)).toBe(ResourceType.WATER)
  })

  it('sunflower outputs sunlight', () => {
    expect(getPlantOutput(makePlant(SeedType.SUNFLOWER), TileType.GRASS)).toBe(ResourceType.SUNLIGHT)
  })

  it('lichen on red crystal outputs crystal red', () => {
    expect(getPlantOutput(makePlant(SeedType.LICHEN), TileType.CRYSTAL_RED)).toBe(ResourceType.CRYSTAL_RED)
  })

  it('lichen on blue crystal outputs crystal blue', () => {
    expect(getPlantOutput(makePlant(SeedType.LICHEN), TileType.CRYSTAL_BLUE)).toBe(ResourceType.CRYSTAL_BLUE)
  })

  it('lichen on non-crystal tile defaults to crystal red', () => {
    expect(getPlantOutput(makePlant(SeedType.LICHEN), TileType.DIRT)).toBe(ResourceType.CRYSTAL_RED)
  })

  it('lifeleaf outputs life essence', () => {
    expect(getPlantOutput(makePlant(SeedType.LIFELEAF), TileType.GRASS)).toBe(ResourceType.LIFE_ESSENCE)
  })

  it('dewbell outputs music notes', () => {
    expect(getPlantOutput(makePlant(SeedType.DEWBELL), TileType.GRASS)).toBe(ResourceType.MUSIC_NOTES)
  })

  it('glimstone outputs crystal green', () => {
    expect(getPlantOutput(makePlant(SeedType.GLIMSTONE), TileType.DIRT)).toBe(ResourceType.CRYSTAL_GREEN)
  })
})
