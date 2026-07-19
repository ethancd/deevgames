import { describe, it, expect, beforeEach } from 'vitest'
import { World } from '../../src/sim/World'
import {
  Layer, TileType, SeedType, GrowthStage, ResourceType,
  WORLD_COLS, WORLD_ROWS, DIG_MAX_DEPTH, posKey,
} from '../../src/sim/types'

let world: World

beforeEach(() => {
  world = new World()
})

describe('World constructor', () => {
  it('creates default state with correct dimensions', () => {
    expect(world.state.surface.length).toBe(WORLD_ROWS)
    expect(world.state.surface[0].length).toBe(WORLD_COLS)
    expect(world.state.underground.length).toBe(WORLD_ROWS)
    expect(world.state.underground[0].length).toBe(WORLD_COLS)
  })

  it('starts player at (6,6) on surface', () => {
    expect(world.state.playerPos).toEqual({ col: 6, row: 6 })
    expect(world.state.playerLayer).toBe(Layer.SURFACE)
  })

  it('starts with empty inventory and no carried item', () => {
    expect(world.state.inventory.water).toBe(0)
    expect(world.state.inventory.crystalRed).toBe(0)
    expect(world.state.carriedItem).toBeNull()
  })

  it('starts with no plants, leylines, or unlocks', () => {
    expect(Object.keys(world.state.plants)).toHaveLength(0)
    expect(world.state.leylines).toHaveLength(0)
    expect(world.state.unlocks.leyline).toBe(false)
  })

  it('surface has water tiles at (2-4, 2-4)', () => {
    for (let r = 2; r <= 4; r++) {
      for (let c = 2; c <= 4; c++) {
        expect(world.state.surface[r][c]).toBe(TileType.WATER)
      }
    }
  })

  it('borders are stone', () => {
    for (let c = 0; c < WORLD_COLS; c++) {
      expect(world.state.surface[0][c]).toBe(TileType.STONE)
      expect(world.state.surface[WORLD_ROWS - 1][c]).toBe(TileType.STONE)
    }
    for (let r = 0; r < WORLD_ROWS; r++) {
      expect(world.state.surface[r][0]).toBe(TileType.STONE)
      expect(world.state.surface[r][WORLD_COLS - 1]).toBe(TileType.STONE)
    }
  })

  it('underground has crystal veins', () => {
    for (let r = 5; r <= 8; r++) {
      expect(world.state.underground[r][3]).toBe(TileType.CRYSTAL_RED)
      expect(world.state.underground[r][4]).toBe(TileType.CRYSTAL_RED)
    }
    for (let r = 9; r <= 12; r++) {
      expect(world.state.underground[r][19]).toBe(TileType.CRYSTAL_BLUE)
      expect(world.state.underground[r][20]).toBe(TileType.CRYSTAL_BLUE)
    }
  })

  it('magic tree at surface (6,16)', () => {
    expect(world.state.surface[6][16]).toBe(TileType.MAGIC_TREE)
  })

  it('moldering log at underground (10,12)', () => {
    expect(world.state.underground[10][12]).toBe(TileType.MOLDERING_LOG)
  })

  it('portal defaults to (12,4) level 0', () => {
    expect(world.state.portal.pos).toEqual({ col: 12, row: 4 })
    expect(world.state.portal.level).toBe(0)
  })
})

describe('World constructor with saved state', () => {
  it('restores from saved state', () => {
    world.state.playerPos = { col: 10, row: 10 }
    world.state.playerLayer = Layer.UNDERGROUND
    const saved = structuredClone(world.state)
    const restored = new World(saved)
    expect(restored.state.playerPos).toEqual({ col: 10, row: 10 })
    expect(restored.state.playerLayer).toBe(Layer.UNDERGROUND)
  })

  it('migrates missing carriedItem to null', () => {
    const saved = structuredClone(world.state)
    delete (saved as any).carriedItem
    const restored = new World(saved)
    expect(restored.state.carriedItem).toBeNull()
  })

  it('migrates missing treeBuffer and treePurchases', () => {
    const saved = structuredClone(world.state)
    delete (saved as any).treeBuffer
    delete (saved as any).treePurchases
    const restored = new World(saved)
    expect(restored.state.treeBuffer).toEqual({})
    expect(restored.state.treePurchases).toEqual({})
  })

  it('ensures special tiles exist in restored state', () => {
    const saved = structuredClone(world.state)
    saved.surface[6][16] = TileType.GRASS
    saved.underground[10][12] = TileType.DIRT
    const restored = new World(saved)
    expect(restored.state.surface[6][16]).toBe(TileType.MAGIC_TREE)
    expect(restored.state.underground[10][12]).toBe(TileType.MOLDERING_LOG)
  })

  it('restores nextLeylineId from existing leylines', () => {
    world.addLeyline([{ col: 5, row: 5 }, { col: 6, row: 5 }], Layer.SURFACE)
    world.addLeyline([{ col: 7, row: 5 }, { col: 8, row: 5 }], Layer.SURFACE)
    const saved = structuredClone(world.state)
    const restored = new World(saved)
    // Adding a new leyline should not collide with existing IDs
    const newLey = restored.addLeyline([{ col: 9, row: 5 }, { col: 10, row: 5 }], Layer.SURFACE)
    expect(newLey.id).toBe('ley_2')
  })
})

describe('movePlayer', () => {
  it('updates player position', () => {
    world.movePlayer({ col: 10, row: 8 })
    expect(world.state.playerPos).toEqual({ col: 10, row: 8 })
  })
})

describe('switchLayer', () => {
  it('toggles from surface to underground', () => {
    expect(world.state.playerLayer).toBe(Layer.SURFACE)
    const result = world.switchLayer()
    expect(result).toBe(Layer.UNDERGROUND)
    expect(world.state.playerLayer).toBe(Layer.UNDERGROUND)
  })

  it('toggles back from underground to surface', () => {
    world.switchLayer()
    const result = world.switchLayer()
    expect(result).toBe(Layer.SURFACE)
    expect(world.state.playerLayer).toBe(Layer.SURFACE)
  })
})

describe('currentGrid', () => {
  it('returns surface grid when on surface', () => {
    expect(world.currentGrid).toBe(world.state.surface)
  })

  it('returns underground grid when underground', () => {
    world.switchLayer()
    expect(world.currentGrid).toBe(world.state.underground)
  })
})

describe('dig', () => {
  it('increments depth on diggable surface tile', () => {
    const pos = { col: 6, row: 6 }
    // The default map has grass at (6,6)
    expect(world.state.surface[6][6]).toBe(TileType.GRASS)
    const result = world.dig(pos)
    expect(result.type).toBe('dug')
    if (result.type === 'dug') expect(result.depth).toBe(1)
    expect(world.getDigDepth(pos)).toBe(1)
  })

  it('creates hole after DIG_MAX_DEPTH digs on surface', () => {
    const pos = { col: 6, row: 6 }
    for (let i = 0; i < DIG_MAX_DEPTH - 1; i++) {
      const result = world.dig(pos)
      expect(result.type).toBe('dug')
    }
    const final = world.dig(pos)
    expect(final.type).toBe('hole_created')
    expect(world.state.surface[6][6]).toBe(TileType.HOLE)
    expect(world.state.underground[6][6]).toBe(TileType.HOLE)
  })

  it('returns already_hole for existing hole', () => {
    const pos = { col: 6, row: 6 }
    for (let i = 0; i < DIG_MAX_DEPTH; i++) world.dig(pos)
    expect(world.dig(pos).type).toBe('already_hole')
  })

  it('returns not_diggable for stone', () => {
    const pos = { col: 0, row: 0 }
    expect(world.dig(pos).type).toBe('not_diggable')
  })

  it('returns not_diggable for water', () => {
    const pos = { col: 2, row: 2 }
    expect(world.state.surface[2][2]).toBe(TileType.WATER)
    expect(world.dig(pos).type).toBe('not_diggable')
  })

  it('can dig path tiles on surface', () => {
    const pos = { col: 5, row: 8 }
    expect(world.state.surface[8][5]).toBe(TileType.PATH)
    const result = world.dig(pos)
    expect(result.type).toBe('dug')
  })

  it('underground digging: only dirt is diggable', () => {
    world.switchLayer()
    // dirt tile
    const dirtPos = { col: 1, row: 1 }
    expect(world.state.underground[1][1]).toBe(TileType.DIRT)
    expect(world.dig(dirtPos).type).toBe('dug')
    // stone tile
    const stonePos = { col: 0, row: 0 }
    expect(world.dig(stonePos).type).toBe('not_diggable')
    // crystal tile
    const crystalPos = { col: 3, row: 5 }
    expect(world.state.underground[5][3]).toBe(TileType.CRYSTAL_RED)
    expect(world.dig(crystalPos).type).toBe('not_diggable')
  })

  it('underground digging: hits bedrock at max depth', () => {
    world.switchLayer()
    const pos = { col: 1, row: 1 }
    for (let i = 0; i < DIG_MAX_DEPTH - 1; i++) world.dig(pos)
    const final = world.dig(pos)
    expect(final.type).toBe('bedrock_hit')
    expect(world.state.underground[1][1]).toBe(TileType.STONE)
  })

  it('returns not_diggable when a plant exists at the position', () => {
    const pos = { col: 6, row: 6 }
    // Dig once to make it plantable
    world.dig(pos)
    world.plantSeed(pos, SeedType.SUNFLOWER)
    expect(world.dig(pos).type).toBe('not_diggable')
  })
})

describe('pickUp', () => {
  it('picks up water from water tile', () => {
    const pos = { col: 2, row: 2 }
    const result = world.pickUp(pos)
    expect(result.type).toBe('picked_up')
    if (result.type === 'picked_up') {
      expect(result.item).toEqual({ type: 'resource', resource: ResourceType.WATER })
    }
    expect(world.state.carriedItem).toEqual({ type: 'resource', resource: ResourceType.WATER })
  })

  it('picks up crystal red from underground crystal tiles', () => {
    world.switchLayer()
    const pos = { col: 3, row: 5 }
    const result = world.pickUp(pos)
    expect(result.type).toBe('picked_up')
    if (result.type === 'picked_up') {
      expect(result.item.type).toBe('resource')
      if (result.item.type === 'resource') {
        expect(result.item.resource).toBe(ResourceType.CRYSTAL_RED)
      }
    }
  })

  it('picks up crystal blue from underground crystal tiles', () => {
    world.switchLayer()
    const pos = { col: 19, row: 9 }
    const result = world.pickUp(pos)
    expect(result.type).toBe('picked_up')
    if (result.type === 'picked_up' && result.item.type === 'resource') {
      expect(result.item.resource).toBe(ResourceType.CRYSTAL_BLUE)
    }
  })

  it('picks up life essence from moldering log', () => {
    world.switchLayer()
    const pos = { col: 12, row: 10 }
    expect(world.state.underground[10][12]).toBe(TileType.MOLDERING_LOG)
    const result = world.pickUp(pos)
    expect(result.type).toBe('picked_up')
    if (result.type === 'picked_up' && result.item.type === 'resource') {
      expect(result.item.resource).toBe(ResourceType.LIFE_ESSENCE)
    }
  })

  it('returns hands_full when already carrying an item', () => {
    world.pickUp({ col: 2, row: 2 })
    const result = world.pickUp({ col: 2, row: 3 })
    expect(result.type).toBe('hands_full')
  })

  it('returns nothing_here for grass', () => {
    const result = world.pickUp({ col: 6, row: 6 })
    expect(result.type).toBe('nothing_here')
  })

  it('returns nothing_here for stone', () => {
    const result = world.pickUp({ col: 0, row: 0 })
    expect(result.type).toBe('nothing_here')
  })
})

describe('pickUpSunlight', () => {
  it('picks up sunlight resource', () => {
    const result = world.pickUpSunlight()
    expect(result.type).toBe('picked_up')
    if (result.type === 'picked_up' && result.item.type === 'resource') {
      expect(result.item.resource).toBe(ResourceType.SUNLIGHT)
    }
  })

  it('returns hands_full when carrying', () => {
    world.pickUp({ col: 2, row: 2 })
    expect(world.pickUpSunlight().type).toBe('hands_full')
  })
})

describe('dropItem', () => {
  it('drops carried item and returns it', () => {
    world.pickUp({ col: 2, row: 2 })
    expect(world.state.carriedItem).not.toBeNull()
    const dropped = world.dropItem()
    expect(dropped).not.toBeNull()
    expect(dropped!.type).toBe('resource')
    expect(world.state.carriedItem).toBeNull()
  })

  it('returns null when nothing is carried', () => {
    expect(world.dropItem()).toBeNull()
  })

  it('discards the item (does not add to inventory)', () => {
    world.pickUp({ col: 2, row: 2 })
    world.dropItem()
    expect(world.state.inventory.water).toBe(0)
    expect(world.state.carriedItem).toBeNull()
  })
})

describe('plantSeed', () => {
  it('plants a sunflower in a dug surface tile', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos) // depth = 1
    const result = world.plantSeed(pos, SeedType.SUNFLOWER)
    expect(result.type).toBe('planted')
    if (result.type === 'planted') {
      expect(result.plant.seedType).toBe(SeedType.SUNFLOWER)
      expect(result.plant.stage).toBe(GrowthStage.SEED)
      expect(result.plant.layer).toBe(Layer.SURFACE)
    }
  })

  it('water lily must be on water tile', () => {
    const waterPos = { col: 2, row: 2 }
    const result = world.plantSeed(waterPos, SeedType.WATER_LILY)
    expect(result.type).toBe('planted')
  })

  it('water lily on non-water returns not_plantable', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos)
    const result = world.plantSeed(pos, SeedType.WATER_LILY)
    expect(result.type).toBe('not_plantable')
  })

  it('lichen must be on crystal tile underground', () => {
    world.switchLayer()
    const pos = { col: 3, row: 5 }
    expect(world.state.underground[5][3]).toBe(TileType.CRYSTAL_RED)
    const result = world.plantSeed(pos, SeedType.LICHEN)
    expect(result.type).toBe('planted')
  })

  it('returns wrong_layer when planting surface seed underground', () => {
    world.switchLayer()
    const pos = { col: 1, row: 1 }
    world.dig(pos)
    const result = world.plantSeed(pos, SeedType.SUNFLOWER)
    expect(result.type).toBe('wrong_layer')
  })

  it('returns wrong_layer when planting underground seed on surface', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos)
    const result = world.plantSeed(pos, SeedType.LICHEN)
    expect(result.type).toBe('wrong_layer')
  })

  it('returns not_plantable on un-dug tile (depth 0)', () => {
    const pos = { col: 6, row: 6 }
    const result = world.plantSeed(pos, SeedType.SUNFLOWER)
    expect(result.type).toBe('not_plantable')
  })

  it('returns not_plantable at max depth (hole)', () => {
    const pos = { col: 6, row: 6 }
    for (let i = 0; i < DIG_MAX_DEPTH; i++) world.dig(pos)
    const result = world.plantSeed(pos, SeedType.SUNFLOWER)
    expect(result.type).toBe('not_plantable')
  })

  it('returns not_plantable if plant already exists there', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos)
    world.plantSeed(pos, SeedType.SUNFLOWER)
    const result = world.plantSeed(pos, SeedType.LIFELEAF)
    expect(result.type).toBe('not_plantable')
  })

  it('getPlantAt returns planted plant', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos)
    world.plantSeed(pos, SeedType.SUNFLOWER)
    const plant = world.getPlantAt(pos)
    expect(plant).toBeDefined()
    expect(plant!.seedType).toBe(SeedType.SUNFLOWER)
  })
})

describe('deliverToPlant', () => {
  let plantPos: { col: number; row: number }

  beforeEach(() => {
    plantPos = { col: 6, row: 6 }
    world.dig(plantPos)
    world.plantSeed(plantPos, SeedType.SUNFLOWER)
  })

  it('delivers water to a sunflower (which needs water)', () => {
    world.pickUp({ col: 2, row: 2 }) // pick up water
    const result = world.deliverToPlant(plantPos)
    expect(result.type).toBe('delivered')
    expect(world.state.carriedItem).toBeNull()
  })

  it('returns hands_empty when not carrying anything', () => {
    const result = world.deliverToPlant(plantPos)
    expect(result.type).toBe('hands_empty')
  })

  it('returns no_plant when no plant at position', () => {
    world.pickUp({ col: 2, row: 2 })
    const result = world.deliverToPlant({ col: 7, row: 7 })
    expect(result.type).toBe('no_plant')
  })

  it('returns not_needed when resource is not needed', () => {
    world.pickUpSunlight()
    // sunflower only needs water, not sunlight
    const result = world.deliverToPlant(plantPos)
    expect(result.type).toBe('not_needed')
  })

  it('plant advances stage when all requirements met', () => {
    // Sunflower seed needs 2 water
    world.pickUp({ col: 2, row: 2 })
    world.deliverToPlant(plantPos)
    world.pickUp({ col: 2, row: 2 })
    const result = world.deliverToPlant(plantPos)
    expect(result.type).toBe('delivered')
    if (result.type === 'delivered') {
      expect(result.advanced).toBe(true)
      expect(result.plant.stage).toBe(GrowthStage.SPROUT)
    }
  })

  it('delivering a seed plants it', () => {
    // Make a plantable position
    const pos2 = { col: 7, row: 7 }
    world.dig(pos2)
    world.state.carriedItem = { type: 'seed', seed: SeedType.LIFELEAF }
    const result = world.deliverToPlant(pos2)
    expect(result.type).toBe('planted')
    if (result.type === 'planted') {
      expect(result.plant.seedType).toBe(SeedType.LIFELEAF)
    }
    expect(world.state.carriedItem).toBeNull()
  })

  it('delivering a seed to wrong layer returns wrong_type', () => {
    const pos2 = { col: 7, row: 7 }
    world.dig(pos2)
    world.state.carriedItem = { type: 'seed', seed: SeedType.LICHEN }
    const result = world.deliverToPlant(pos2)
    expect(result.type).toBe('wrong_type')
  })
})

describe('feedPlantResource', () => {
  it('feeds water to a plant that needs it', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos)
    world.plantSeed(pos, SeedType.SUNFLOWER)
    const result = world.feedPlantResource(pos, Layer.SURFACE, ResourceType.WATER)
    expect(result.type).toBe('fed')
    if (result.type === 'fed') {
      expect(result.advanced).toBe(false) // needs 2 water, only fed 1
      expect(result.plant.waterFed).toBe(1)
    }
  })

  it('returns no_plant when no plant exists', () => {
    const result = world.feedPlantResource({ col: 10, row: 10 }, Layer.SURFACE, ResourceType.WATER)
    expect(result.type).toBe('no_plant')
  })

  it('returns fully_grown for mature plant', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos)
    world.plantSeed(pos, SeedType.SUNFLOWER)
    const plant = world.getPlantAt(pos)!
    plant.stage = GrowthStage.MATURE
    const result = world.feedPlantResource(pos, Layer.SURFACE, ResourceType.WATER)
    expect(result.type).toBe('fully_grown')
  })

  it('returns not_needed when resource already full', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos)
    world.plantSeed(pos, SeedType.SUNFLOWER)
    // Sunflower seed stage needs 2 water, fill it
    world.feedPlantResource(pos, Layer.SURFACE, ResourceType.WATER)
    world.feedPlantResource(pos, Layer.SURFACE, ResourceType.WATER)
    // Now it advanced to sprout; but let's test with sunlight (not needed for sunflower)
    const result = world.feedPlantResource(pos, Layer.SURFACE, ResourceType.SUNLIGHT)
    expect(result.type).toBe('not_needed')
  })

  it('respects crystal type for seed', () => {
    world.switchLayer()
    const pos = { col: 1, row: 1 }
    world.dig(pos)
    world.plantSeed(pos, SeedType.ROOTWEAVE)
    // Rootweave SEED needs water=2, crystal=0, sunlight=1 (no crystal at this stage)
    // Advance to SPROUT which needs water=2, crystal=1, sunlight=1
    const plant = world.getPlantAt(pos, Layer.UNDERGROUND)!
    plant.stage = GrowthStage.SPROUT
    plant.waterFed = 0
    plant.crystalFed = 0
    plant.sunlightFed = 0
    // rootweave uses red crystal - blue should be rejected
    const result = world.feedPlantResource(pos, Layer.UNDERGROUND, ResourceType.CRYSTAL_BLUE)
    expect(result.type).toBe('not_needed')
    // red crystal should be accepted
    const result2 = world.feedPlantResource(pos, Layer.UNDERGROUND, ResourceType.CRYSTAL_RED)
    expect(result2.type).toBe('fed')
  })

  it('advances through all stages to mature', () => {
    const pos = { col: 2, row: 2 }
    world.plantSeed(pos, SeedType.WATER_LILY) // needs only sunlight: 2, 3, 4

    // SEED: 2 sunlight
    world.feedPlantResource(pos, Layer.SURFACE, ResourceType.SUNLIGHT)
    world.feedPlantResource(pos, Layer.SURFACE, ResourceType.SUNLIGHT)
    expect(world.getPlantAt(pos)!.stage).toBe(GrowthStage.SPROUT)

    // SPROUT: 3 sunlight
    for (let i = 0; i < 3; i++)
      world.feedPlantResource(pos, Layer.SURFACE, ResourceType.SUNLIGHT)
    expect(world.getPlantAt(pos)!.stage).toBe(GrowthStage.SAPLING)

    // SAPLING: 4 sunlight
    for (let i = 0; i < 4; i++)
      world.feedPlantResource(pos, Layer.SURFACE, ResourceType.SUNLIGHT)
    expect(world.getPlantAt(pos)!.stage).toBe(GrowthStage.MATURE)
  })
})

describe('addLeyline / removeLeylineAt / getLeylines', () => {
  it('adds a leyline with unique ID', () => {
    const path = [{ col: 5, row: 5 }, { col: 6, row: 5 }, { col: 7, row: 5 }]
    const ley = world.addLeyline(path, Layer.SURFACE)
    expect(ley.id).toBe('ley_0')
    expect(ley.path).toHaveLength(3)
    expect(ley.layer).toBe(Layer.SURFACE)
    expect(world.state.leylines).toHaveLength(1)
  })

  it('generates incrementing IDs', () => {
    const ley1 = world.addLeyline([{ col: 5, row: 5 }, { col: 6, row: 5 }], Layer.SURFACE)
    const ley2 = world.addLeyline([{ col: 7, row: 5 }, { col: 8, row: 5 }], Layer.SURFACE)
    expect(ley1.id).toBe('ley_0')
    expect(ley2.id).toBe('ley_1')
  })

  it('copies path coordinates (no aliasing)', () => {
    const path = [{ col: 5, row: 5 }, { col: 6, row: 5 }]
    const ley = world.addLeyline(path, Layer.SURFACE)
    path[0].col = 99
    expect(ley.path[0].col).toBe(5)
  })

  it('removes leyline by start position and layer', () => {
    world.addLeyline([{ col: 5, row: 5 }, { col: 6, row: 5 }], Layer.SURFACE)
    const removed = world.removeLeylineAt({ col: 5, row: 5 }, Layer.SURFACE)
    expect(removed).toBe('ley_0')
    expect(world.state.leylines).toHaveLength(0)
  })

  it('returns null when no leyline found to remove', () => {
    const removed = world.removeLeylineAt({ col: 5, row: 5 }, Layer.SURFACE)
    expect(removed).toBeNull()
  })

  it('getLeylines filters by layer', () => {
    world.addLeyline([{ col: 5, row: 5 }, { col: 6, row: 5 }], Layer.SURFACE)
    world.addLeyline([{ col: 1, row: 1 }, { col: 2, row: 1 }], Layer.UNDERGROUND)
    expect(world.getLeylines(Layer.SURFACE)).toHaveLength(1)
    expect(world.getLeylines(Layer.UNDERGROUND)).toHaveLength(1)
  })
})

describe('digUpLeyline', () => {
  it('splits a leyline when a middle tile is dug', () => {
    const path = [
      { col: 3, row: 5 }, { col: 4, row: 5 }, { col: 5, row: 5 },
      { col: 6, row: 5 }, { col: 7, row: 5 },
    ]
    world.addLeyline(path, Layer.SURFACE)
    const result = world.digUpLeyline({ col: 5, row: 5 }, Layer.SURFACE)
    expect(result.removed).toHaveLength(1)
    expect(result.removed[0]).toBe('ley_0')
    // Should create 2 new leylines: tiles 0-1 and tiles 3-4
    expect(result.created).toHaveLength(2)
    // First half: col 3-4
    expect(result.created[0].path).toHaveLength(2)
    expect(result.created[0].path[0].col).toBe(3)
    // Second half: col 6-7
    expect(result.created[1].path).toHaveLength(2)
    expect(result.created[1].path[0].col).toBe(6)
  })

  it('does not create fragments shorter than 2 tiles', () => {
    const path = [
      { col: 3, row: 5 }, { col: 4, row: 5 }, { col: 5, row: 5 },
    ]
    world.addLeyline(path, Layer.SURFACE)
    // Dig the second tile (index 1) - left fragment has only 1 tile, right fragment has 1 tile
    const result = world.digUpLeyline({ col: 4, row: 5 }, Layer.SURFACE)
    expect(result.removed).toHaveLength(1)
    expect(result.created).toHaveLength(0)
  })

  it('returns empty when no leyline at position', () => {
    const result = world.digUpLeyline({ col: 5, row: 5 }, Layer.SURFACE)
    expect(result.removed).toHaveLength(0)
    expect(result.created).toHaveLength(0)
  })
})

describe('checkUnlocks', () => {
  it('unlocks leyline when mature water lily and sunflower exist', () => {
    const wlPos = { col: 2, row: 2 }
    const sfPos = { col: 6, row: 6 }
    world.plantSeed(wlPos, SeedType.WATER_LILY)
    world.dig(sfPos)
    world.plantSeed(sfPos, SeedType.SUNFLOWER)

    world.getPlantAt(wlPos)!.stage = GrowthStage.MATURE
    world.getPlantAt(sfPos)!.stage = GrowthStage.MATURE

    const result = world.checkUnlocks()
    expect(result.leylineJustUnlocked).toBe(true)
    expect(world.state.unlocks.leyline).toBe(true)
  })

  it('does not unlock without both mature plants', () => {
    const wlPos = { col: 2, row: 2 }
    world.plantSeed(wlPos, SeedType.WATER_LILY)
    world.getPlantAt(wlPos)!.stage = GrowthStage.MATURE
    // Only water lily, no sunflower
    const result = world.checkUnlocks()
    expect(result.leylineJustUnlocked).toBe(false)
  })

  it('returns false if already unlocked', () => {
    world.state.unlocks.leyline = true
    const result = world.checkUnlocks()
    expect(result.leylineJustUnlocked).toBe(false)
  })
})

describe('feedPortal', () => {
  it('accepts green crystal', () => {
    expect(world.feedPortal(ResourceType.CRYSTAL_GREEN)).toBe(true)
    expect(world.state.portal.greenCrystalFed).toBe(1)
  })

  it('accepts music notes', () => {
    expect(world.feedPortal(ResourceType.MUSIC_NOTES)).toBe(true)
    expect(world.state.portal.musicNotesFed).toBe(1)
  })

  it('rejects other resource types', () => {
    expect(world.feedPortal(ResourceType.WATER)).toBe(false)
    expect(world.feedPortal(ResourceType.SUNLIGHT)).toBe(false)
    expect(world.feedPortal(ResourceType.CRYSTAL_RED)).toBe(false)
  })

  it('levels up portal when both resources reach threshold', () => {
    // Level 1 threshold is 10 (10^1)
    for (let i = 0; i < 10; i++) {
      world.feedPortal(ResourceType.CRYSTAL_GREEN)
      world.feedPortal(ResourceType.MUSIC_NOTES)
    }
    expect(world.state.portal.level).toBe(1)
  })
})

describe('portalProgress', () => {
  it('reports progress toward next level', () => {
    const p = world.portalProgress()
    expect(p.level).toBe(0)
    expect(p.greenFed).toBe(0)
    expect(p.musicFed).toBe(0)
    expect(p.nextThreshold).toBe(10) // 10^1
  })

  it('reports partial progress', () => {
    for (let i = 0; i < 5; i++) {
      world.feedPortal(ResourceType.CRYSTAL_GREEN)
      world.feedPortal(ResourceType.MUSIC_NOTES)
    }
    const p = world.portalProgress()
    expect(p.level).toBe(0)
    expect(p.greenFed).toBe(5)
    expect(p.musicFed).toBe(5)
  })
})

describe('feedTree / deliverToTree / buyTreeSeed', () => {
  it('feedTree accumulates resources in buffer', () => {
    world.feedTree(ResourceType.WATER)
    world.feedTree(ResourceType.WATER)
    world.feedTree(ResourceType.SUNLIGHT)
    expect(world.state.treeBuffer[ResourceType.WATER]).toBe(2)
    expect(world.state.treeBuffer[ResourceType.SUNLIGHT]).toBe(1)
  })

  it('deliverToTree feeds carried resource to tree', () => {
    world.pickUp({ col: 2, row: 2 }) // water
    const result = world.deliverToTree()
    expect(result).toBe(true)
    expect(world.state.carriedItem).toBeNull()
    expect(world.state.treeBuffer[ResourceType.WATER]).toBe(1)
  })

  it('deliverToTree returns false when not carrying a resource', () => {
    expect(world.deliverToTree()).toBe(false)
  })

  it('deliverToTree returns false when carrying a seed', () => {
    world.state.carriedItem = { type: 'seed', seed: SeedType.SUNFLOWER }
    expect(world.deliverToTree()).toBe(false)
  })

  it('sunflower seed costs 1 sunlight', () => {
    const cost = world.getTreeSeedCost(SeedType.SUNFLOWER)
    expect(cost.resource).toBe(ResourceType.SUNLIGHT)
    expect(cost.amount).toBe(1)
  })

  it('water lily seed costs 1 water', () => {
    const cost = world.getTreeSeedCost(SeedType.WATER_LILY)
    expect(cost.resource).toBe(ResourceType.WATER)
    expect(cost.amount).toBe(1)
  })

  it('seed costs follow tier ladders with life essence', () => {
    const cost1 = world.getTreeSeedCost(SeedType.LIFELEAF)
    expect(cost1.resource).toBe(ResourceType.LIFE_ESSENCE)
    expect(cost1.amount).toBe(2)

    world.state.treePurchases[SeedType.LIFELEAF] = 1
    expect(world.getTreeSeedCost(SeedType.LIFELEAF).amount).toBe(5)

    world.state.treePurchases[SeedType.LIFELEAF] = 2
    expect(world.getTreeSeedCost(SeedType.LIFELEAF).amount).toBe(10)

    // Tier 1 lichen costs life essence too
    expect(world.getTreeSeedCost(SeedType.LICHEN).resource).toBe(ResourceType.LIFE_ESSENCE)
    expect(world.getTreeSeedCost(SeedType.LICHEN).amount).toBe(1)

    // Tier 3 dewbell starts at 10
    expect(world.getTreeSeedCost(SeedType.DEWBELL).amount).toBe(10)
  })

  it('buyTreeSeed succeeds when affordable', () => {
    world.state.treeBuffer[ResourceType.SUNLIGHT] = 5
    const result = world.buyTreeSeed(SeedType.SUNFLOWER)
    expect(result.type).toBe('bought')
    if (result.type === 'bought') expect(result.seed).toBe(SeedType.SUNFLOWER)
    expect(world.state.carriedItem).toEqual({ type: 'seed', seed: SeedType.SUNFLOWER })
    expect(world.state.treeBuffer[ResourceType.SUNLIGHT]).toBe(4)
    expect(world.state.treePurchases[SeedType.SUNFLOWER]).toBe(1)
  })

  it('buyTreeSeed fails when cannot afford', () => {
    const result = world.buyTreeSeed(SeedType.SUNFLOWER)
    expect(result.type).toBe('cant_afford')
  })

  it('buyTreeSeed fails when hands full', () => {
    world.state.treeBuffer[ResourceType.SUNLIGHT] = 5
    world.pickUp({ col: 2, row: 2 }) // carry water
    const result = world.buyTreeSeed(SeedType.SUNFLOWER)
    expect(result.type).toBe('hands_full')
  })

  it('canAffordTreeSeed checks buffer correctly', () => {
    expect(world.canAffordTreeSeed(SeedType.SUNFLOWER)).toBe(false)
    world.state.treeBuffer[ResourceType.SUNLIGHT] = 1
    expect(world.canAffordTreeSeed(SeedType.SUNFLOWER)).toBe(true)
  })
})

describe('getPlantAt / getPlantsForLayer', () => {
  it('getPlantAt returns undefined when no plant', () => {
    expect(world.getPlantAt({ col: 5, row: 5 })).toBeUndefined()
  })

  it('getPlantAt uses current layer by default', () => {
    const pos = { col: 2, row: 2 }
    world.plantSeed(pos, SeedType.WATER_LILY)
    expect(world.getPlantAt(pos)).toBeDefined()
    world.switchLayer()
    expect(world.getPlantAt(pos)).toBeUndefined()
  })

  it('getPlantAt accepts explicit layer parameter', () => {
    const pos = { col: 2, row: 2 }
    world.plantSeed(pos, SeedType.WATER_LILY)
    world.switchLayer()
    // Even though we're underground, specifying SURFACE finds the plant
    expect(world.getPlantAt(pos, Layer.SURFACE)).toBeDefined()
  })

  it('getPlantsForLayer returns plants for specified layer', () => {
    world.plantSeed({ col: 2, row: 2 }, SeedType.WATER_LILY)
    world.dig({ col: 6, row: 6 })
    world.plantSeed({ col: 6, row: 6 }, SeedType.SUNFLOWER)
    expect(world.getPlantsForLayer(Layer.SURFACE)).toHaveLength(2)
    expect(world.getPlantsForLayer(Layer.UNDERGROUND)).toHaveLength(0)
  })
})

describe('getTile', () => {
  it('returns tile type for valid positions', () => {
    expect(world.getTile(Layer.SURFACE, { col: 2, row: 2 })).toBe(TileType.WATER)
    expect(world.getTile(Layer.SURFACE, { col: 0, row: 0 })).toBe(TileType.STONE)
  })

  it('returns STONE for out-of-bounds positions', () => {
    expect(world.getTile(Layer.SURFACE, { col: -1, row: 0 })).toBe(TileType.STONE)
    expect(world.getTile(Layer.SURFACE, { col: 0, row: -1 })).toBe(TileType.STONE)
    expect(world.getTile(Layer.SURFACE, { col: WORLD_COLS, row: 0 })).toBe(TileType.STONE)
  })
})

describe('carry-one-thing mechanics', () => {
  it('cannot pick up when already carrying', () => {
    world.pickUp({ col: 2, row: 2 }) // water
    expect(world.pickUp({ col: 2, row: 3 }).type).toBe('hands_full')
    expect(world.pickUpSunlight().type).toBe('hands_full')
  })

  it('dropping frees hands to pick up again', () => {
    world.pickUp({ col: 2, row: 2 })
    world.dropItem()
    const result = world.pickUp({ col: 2, row: 2 })
    expect(result.type).toBe('picked_up')
  })

  it('delivering to plant frees hands', () => {
    const pos = { col: 6, row: 6 }
    world.dig(pos)
    world.plantSeed(pos, SeedType.SUNFLOWER)
    world.pickUp({ col: 2, row: 2 }) // water
    world.deliverToPlant(pos)
    expect(world.state.carriedItem).toBeNull()
    // Can pick up again
    const result = world.pickUp({ col: 2, row: 2 })
    expect(result.type).toBe('picked_up')
  })

  it('cannot buy seed when hands full', () => {
    world.state.treeBuffer[ResourceType.SUNLIGHT] = 10
    world.pickUp({ col: 2, row: 2 })
    expect(world.buyTreeSeed(SeedType.SUNFLOWER).type).toBe('hands_full')
  })
})
